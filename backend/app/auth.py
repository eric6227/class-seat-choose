from datetime import datetime, timezone, timedelta
from typing import Optional
from jwt.exceptions import InvalidTokenError as JWTError
import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import get_db
from app.models import TeacherPassword, Student, SystemConfig
from app.token_blacklist import is_blacklisted
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
import os
import secrets
import uuid

settings = get_settings()
security = HTTPBearer(auto_error=False)

TOKEN_COOKIE_NAME = "seat_token"


def set_token_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key=TOKEN_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/api",
    )


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600000,
    )
    dk = kdf.derive(password.encode())
    return salt.hex() + ':' + dk.hex()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        salt_hex, dk_hex = hashed_password.split(':')
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=600000,
        )
        kdf.verify(plain_password.encode(), expected)
        return True
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        jti = payload.get("jti")
        if jti and is_blacklisted(jti):
            return None
        return payload
    except JWTError:
        return None


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> dict:
    token = request.cookies.get(TOKEN_COOKIE_NAME)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证令牌")
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌无效或已过期")

    role = payload.get("role")
    if role not in ("teacher", "student"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无效的角色")

    result = {"role": role, "sub": payload.get("sub")}
    if role == "student":
        student = db.query(Student).filter(Student.name == payload.get("sub")).first()
        if not student:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="学生不存在")
        token_iat = payload.get("iat")
        if token_iat is not None and student.password_updated_at is not None:
            from datetime import timezone as _dt_tz
            pwd_changed_ts = int(student.password_updated_at.replace(tzinfo=_dt_tz.utc).timestamp())
            if int(token_iat) < pwd_changed_ts:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码已变更，请重新登录")
        result["student_name"] = payload.get("sub")
        result["student_id"] = student.id
    return result


def require_role(*roles: str):
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
        return current_user
    return role_checker


def check_teacher_setup(db: Session) -> bool:
    teacher = db.query(TeacherPassword).first()
    return teacher is not None


def get_or_create_teacher(db: Session, password: str) -> TeacherPassword:
    existing = db.query(TeacherPassword).first()
    if existing:
        existing.password_hash = hash_password(password)
        existing.updated_at = datetime.now(timezone.utc)
    else:
        existing = TeacherPassword(password_hash=hash_password(password))
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return existing


def verify_teacher_password(db: Session, password: str) -> bool:
    teacher = db.query(TeacherPassword).first()
    if not teacher:
        return False
    return verify_password(password, teacher.password_hash)


def get_system_config(db: Session, key: str) -> Optional[str]:
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return config.value if config else None


def set_system_config(db: Session, key: str, value: str):
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if config:
        config.value = value
    else:
        config = SystemConfig(key=key, value=value)
        db.add(config)
    db.commit()


def _name_to_full_pinyin(name: str) -> str:
    try:
        from pypinyin import lazy_pinyin, Style
        return "".join(lazy_pinyin(name, style=Style.NORMAL)).lower().replace(" ", "")
    except Exception:
        return ""


def match_student_by_pinyin(input_pinyin: str, db: Session) -> Optional[Student]:
    normalized_input = input_pinyin.strip().lower().replace(" ", "")
    if not normalized_input:
        return None

    students = db.query(Student).all()
    for s in students:
        py = _name_to_full_pinyin(s.name)
        if py and py == normalized_input:
            return s
        if normalized_input == s.name:
            return s
    return None