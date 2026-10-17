import time
import threading


_blacklist: set[str] = set()
_expiry: dict[str, float] = {}

_lock = threading.Lock()

_CLEANUP_INTERVAL = 60
_last_cleanup = time.monotonic()


def _cleanup_expired() -> None:
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < _CLEANUP_INTERVAL:
        return
    with _lock:
        expired = [jti for jti, exp in _expiry.items() if exp <= now]
        for jti in expired:
            _blacklist.discard(jti)
            _expiry.pop(jti, None)
        _last_cleanup = now


def add_to_blacklist(jti: str, exp: float) -> None:
    with _lock:
        _blacklist.add(jti)
        _expiry[jti] = exp


def is_blacklisted(jti: str) -> bool:
    _cleanup_expired()
    with _lock:
        return jti in _blacklist