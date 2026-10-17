import os
import json
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone
from typing import Optional
from app.config import get_settings

settings = get_settings()

AUDIT_LOG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "audit.log"
)

MAX_LOG_SIZE = 5 * 1024 * 1024
BACKUP_COUNT = 3

_logger = None

_CONTROL_CHARS = dict.fromkeys(range(32))
_CONTROL_CHARS.pop(ord("\t"), None)

for _cp in range(0x202A, 0x202E + 1):
    _CONTROL_CHARS[_cp] = None

for _cp in range(0x200B, 0x200F + 1):
    _CONTROL_CHARS[_cp] = None

_CONTROL_CHARS[0x2028] = None
_CONTROL_CHARS[0x2029] = None


def _sanitize_log_string(value: str) -> str:
    if not isinstance(value, str):
        return value
    return value.translate(_CONTROL_CHARS)


def _sanitize_log_value(value):
    if isinstance(value, str):
        return _sanitize_log_string(value)
    if isinstance(value, dict):
        return {k: _sanitize_log_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_log_value(item) for item in value]
    return value


def _ensure_dir():
    os.makedirs(os.path.dirname(AUDIT_LOG_PATH), exist_ok=True)


def _get_logger():
    global _logger
    if _logger is not None:
        return _logger

    _ensure_dir()

    _logger = logging.getLogger("audit")
    _logger.setLevel(logging.INFO)
    _logger.propagate = False

    handler = RotatingFileHandler(
        AUDIT_LOG_PATH,
        maxBytes=MAX_LOG_SIZE,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(handler)

    try:
        os.chmod(AUDIT_LOG_PATH, 0o600)
    except Exception:
        pass

    return _logger


def log_action(
    action: str,
    user_role: str,
    user_identity: str,
    detail: Optional[dict] = None,
    ip: Optional[str] = None
):
    _ensure_dir()
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": _sanitize_log_string(action),
        "user_role": _sanitize_log_string(user_role),
        "user_identity": _sanitize_log_string(user_identity),
        "detail": _sanitize_log_value(detail) if detail else {},
        "ip": _sanitize_log_string(ip) if ip else None,
    }
    logger = _get_logger()
    logger.info(json.dumps(entry, ensure_ascii=False))
    try:
        os.chmod(AUDIT_LOG_PATH, 0o600)
    except Exception:
        pass