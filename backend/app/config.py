import base64
import os
import sys
import stat
from functools import lru_cache

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_ENCRYPTION_KEY_FILE = os.path.join(_DATA_DIR, ".encryption_key")
_SECRET_KEY_FILE = os.path.join(_DATA_DIR, ".secret_key")


def _secure_file_perms(filepath: str):
    try:
        os.chmod(filepath, stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        pass


def _resolve_secret_key() -> str:
    env_key = os.getenv("SECRET_KEY")
    if env_key:
        return env_key
    key = base64.b64encode(os.urandom(32)).decode("ascii")
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_SECRET_KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    _secure_file_perms(_SECRET_KEY_FILE)
    return key


def _resolve_encryption_key() -> str:
    if os.path.exists(_ENCRYPTION_KEY_FILE):
        with open(_ENCRYPTION_KEY_FILE, "r", encoding="utf-8") as f:
            file_key = f.read().strip()
            if file_key:
                return file_key
    env_key = os.getenv("ENCRYPTION_KEY")
    key = env_key if env_key else base64.b64encode(os.urandom(32)).decode("ascii")
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_ENCRYPTION_KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    _secure_file_perms(_ENCRYPTION_KEY_FILE)
    print(f"加密密钥已持久化至 {_ENCRYPTION_KEY_FILE}")
    return key


class Settings:
    def __init__(self):
        self.APP_NAME = "班级选座系统"
        self.APP_VERSION = "5.0"
        self.DEBUG = os.getenv("DEBUG", "false").lower() == "true"

        self.SECRET_KEY = _resolve_secret_key()

        self.ALGORITHM = "HS256"
        self.ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
        self.BCRYPT_ROUNDS = 12
        self.PBKDF2_ITERATIONS = 600000

        self.DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/seat_system.db")

        self.ENCRYPTION_KEY = _resolve_encryption_key()

        cors_env = os.getenv("CORS_ORIGINS", "http://localhost:8480")
        self.CORS_ORIGINS = [o.strip() for o in cors_env.split(",") if o.strip()]

        self.COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"

        self.LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "10"))
        self.LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "300"))
        self.LOGIN_LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "900"))

        self.MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))

        self.REDIS_URL = os.getenv("REDIS_URL", "")

        self.TRUSTED_PROXY_CIDRS: list[str] = [
            c.strip() for c in os.getenv("TRUSTED_PROXY_CIDRS", "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16").split(",") if c.strip()
        ]

        self.TEACHER_INIT_PASSWORD = os.getenv("TEACHER_INIT_PASSWORD", "")


@lru_cache()
def get_settings() -> Settings:
    return Settings()