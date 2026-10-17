import asyncio
import json
import os
import time
import ipaddress
import threading
import secrets
from collections import defaultdict
from fastapi import HTTPException, status, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import get_settings

settings = get_settings()

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_RATELIMIT_DUMP_FILE = os.path.join(_DATA_DIR, ".ratelimit_state.json")

_RATE_LIMIT_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
    return 0
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, math.ceil(window * 2))
return 1
"""


def _parse_cidrs(cidrs: list[str]) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    result = []
    for cidr in cidrs:
        try:
            result.append(ipaddress.ip_network(cidr.strip()))
        except ValueError:
            pass
    return result


_trusted_cidrs = _parse_cidrs(settings.TRUSTED_PROXY_CIDRS)


def _is_trusted_proxy(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str.strip())
    except ValueError:
        return False
    return any(addr in net for net in _trusted_cidrs)


def _get_client_ip(request: Request) -> str:
    if settings.TRUSTED_PROXY_CIDRS:
        if x_real_ip := request.headers.get("X-Real-IP"):
            x_real_ip = x_real_ip.strip()
            if x_real_ip:
                client_host = request.client.host if request.client else None
                if client_host and _is_trusted_proxy(client_host):
                    return x_real_ip
        if x_forwarded_for := request.headers.get("X-Forwarded-For"):
            client_host = request.client.host if request.client else None
            if client_host and _is_trusted_proxy(client_host):
                return x_forwarded_for.split(",")[0].strip()

    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class RedisClient:
    _redis = None
    _available = False
    _script = None

    @classmethod
    async def connect(cls, redis_url: str):
        if not redis_url:
            cls._available = False
            return
        try:
            import redis.asyncio as aioredis
            cls._redis = aioredis.from_url(redis_url, decode_responses=True)
            await cls._redis.ping()
            cls._script = cls._redis.register_script(_RATE_LIMIT_LUA)
            cls._available = True
        except Exception:
            cls._available = False
            cls._redis = None

    @classmethod
    @property
    def available(cls) -> bool:
        return cls._available and cls._redis is not None

    @classmethod
    async def check_rate_limit(cls, key: str, max_requests: int, window: int) -> bool | None:
        if not cls.available:
            return None
        try:
            now = time.time()
            member = f"{now}:{secrets.token_hex(4)}"
            result = await cls._script(
                keys=[f"ratelimit:{key}"],
                args=[now, window, max_requests, member],
            )
            return bool(result)
        except Exception:
            return None

    @classmethod
    async def record_event(cls, key: str, window: int):
        if not cls.available:
            return
        try:
            now = time.time()
            member = f"{now}:{secrets.token_hex(4)}"
            redis_key = f"ratelimit:{key}"
            await cls._redis.zadd(redis_key, {member: now})
            await cls._redis.expire(redis_key, window * 2)
        except Exception:
            pass

    @classmethod
    async def get_count(cls, key: str, window: int) -> int | None:
        if not cls.available:
            return None
        try:
            now = time.time()
            redis_key = f"ratelimit:{key}"
            await cls._redis.zremrangebyscore(redis_key, 0, now - window)
            return await cls._redis.zcard(redis_key)
        except Exception:
            return None

    @classmethod
    async def reset_key(cls, key: str):
        if not cls.available:
            return
        try:
            await cls._redis.delete(f"ratelimit:{key}")
        except Exception:
            pass

    @classmethod
    async def close(cls):
        if cls._redis:
            try:
                await cls._redis.close()
            except Exception:
                pass
        cls._available = False
        cls._redis = None


class LoginRateLimiter:
    def __init__(self):
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._load_state()

    def _load_state(self):
        try:
            if os.path.exists(_RATELIMIT_DUMP_FILE):
                with open(_RATELIMIT_DUMP_FILE, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                now = time.monotonic()
                for key, stamps in raw.items():
                    valid = [t for t in stamps if now - t < settings.LOGIN_WINDOW_SECONDS * 2]
                    if valid:
                        self._attempts[key] = valid
        except Exception:
            pass

    async def _dump_state(self):
        try:
            os.makedirs(_DATA_DIR, exist_ok=True)
            async with self._lock:
                data = dict(self._attempts)
            with open(_RATELIMIT_DUMP_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception:
            pass

    def _prune(self, key: str, now: float):
        cutoff = now - settings.LOGIN_WINDOW_SECONDS
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]

    def _check_memory(self, key: str):
        now = time.monotonic()
        self._prune(key, now)
        if len(self._attempts[key]) >= settings.LOGIN_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"登录尝试过于频繁，请在 {settings.LOGIN_WINDOW_SECONDS // 60} 分钟后重试"
            )

    async def check(self, key: str):
        if RedisClient.available:
            result = await RedisClient.check_rate_limit(
                f"login:{key}",
                settings.LOGIN_MAX_ATTEMPTS,
                settings.LOGIN_WINDOW_SECONDS,
            )
            if result is True:
                return
            if result is False:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"登录尝试过于频繁，请在 {settings.LOGIN_WINDOW_SECONDS // 60} 分钟后重试"
                )

        async with self._lock:
            self._check_memory(key)

    async def record_failure(self, key: str):
        if RedisClient.available:
            await RedisClient.record_event(
                f"login:{key}",
                settings.LOGIN_WINDOW_SECONDS,
            )
            return

        async with self._lock:
            self._attempts[key].append(time.monotonic())
        await self._dump_state()

    async def reset(self, key: str):
        if RedisClient.available:
            await RedisClient.reset_key(f"login:{key}")
            return

        async with self._lock:
            self._attempts.pop(key, None)
        await self._dump_state()

    async def get_failure_count(self, key: str) -> int:
        if RedisClient.available:
            count = await RedisClient.get_count(
                f"login:{key}",
                settings.LOGIN_WINDOW_SECONDS,
            )
            if count is not None:
                return count

        now = time.monotonic()
        async with self._lock:
            self._prune(key, now)
            return len(self._attempts[key])


login_rate_limiter = LoginRateLimiter()


async def login_failure_delay(key: str):
    failure_count = await login_rate_limiter.get_failure_count(key)
    if failure_count > 0:
        delay = min(2 ** (failure_count - 1), 60)
        await asyncio.sleep(delay)


UPLOAD_RATE_LIMIT = int(os.getenv("UPLOAD_RATE_LIMIT", "5"))
UPLOAD_RATE_WINDOW = int(os.getenv("UPLOAD_RATE_WINDOW", "60"))


class FileUploadRateLimiter:
    def __init__(self):
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float):
        cutoff = now - UPLOAD_RATE_WINDOW
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]

    def _check_memory(self, key: str):
        now = time.monotonic()
        self._prune(key, now)
        self._attempts[key].append(now)
        if len(self._attempts[key]) > UPLOAD_RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"文件上传过于频繁，每分钟最多 {UPLOAD_RATE_LIMIT} 次，请稍后重试"
            )

    def check(self, key: str):
        with self._lock:
            self._check_memory(key)


file_upload_rate_limiter = FileUploadRateLimiter()

API_RATE_LIMIT = int(os.getenv("API_RATE_LIMIT", "200"))
API_RATE_WINDOW = int(os.getenv("API_RATE_WINDOW", "60"))


class GeneralRateLimitMiddleware(BaseHTTPMiddleware):
    EXEMPT_PATHS = {"/api/health", "/api/docs", "/api/openapi.json"}

    def __init__(self, app, *args, **kwargs):
        super().__init__(app, *args, **kwargs)
        self._memory_requests: dict[str, list[float]] = defaultdict(list)
        self._memory_lock = threading.Lock()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in self.EXEMPT_PATHS or path.startswith("/api/docs"):
            return await call_next(request)

        client_ip = _get_client_ip(request)

        if RedisClient.available:
            result = await RedisClient.check_rate_limit(
                f"api:{client_ip}",
                API_RATE_LIMIT,
                API_RATE_WINDOW,
            )
            if result is True:
                return await call_next(request)
            if result is False:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后重试"},
                )

        now = time.monotonic()
        cutoff = now - API_RATE_WINDOW

        with self._memory_lock:
            requests_list = self._memory_requests[client_ip]
            self._memory_requests[client_ip] = [t for t in requests_list if t > cutoff]

            if len(self._memory_requests[client_ip]) >= API_RATE_LIMIT:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后重试"},
                )

            self._memory_requests[client_ip].append(now)

        return await call_next(request)