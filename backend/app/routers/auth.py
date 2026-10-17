from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app import schemas, auth, models
from app.ratelimit import login_rate_limiter, login_failure_delay, _get_client_ip
from app.token_blacklist import add_to_blacklist
from app.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _get_client_key(request: Request, suffix: str) -> str:
    ip = _get_client_ip(request)
    return f"{ip}:{suffix}"


@router.get("/check-setup")
def check_setup(db: Session = Depends(get_db)):
    is_setup = auth.check_teacher_setup(db)
    return {"is_setup": is_setup}


@router.post("/setup", response_model=schemas.MessageResponse)
def setup_teacher(req: schemas.SetupTeacherRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    if not settings.TEACHER_INIT_PASSWORD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理员未配置初始化令牌，请联系管理员")
    if req.setup_token != settings.TEACHER_INIT_PASSWORD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="初始化令牌错误")
    if auth.check_teacher_setup(db):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="教师密码已设置")
    auth.get_or_create_teacher(db, req.password)
    return {"success": True, "message": "教师密码设置成功"}


def _token_response(token: str, role: str, username: str | None = None) -> JSONResponse:
    resp = JSONResponse(content={
        "access_token": token,
        "token_type": "bearer",
        "role": role,
        "username": username,
    })
    auth.set_token_cookie(resp, token)
    return resp


@router.post("/teacher/login")
async def teacher_login(req: schemas.TeacherLoginRequest, request: Request, db: Session = Depends(get_db)):
    client_key = _get_client_key(request, "teacher_login")

    await login_rate_limiter.check(client_key)

    if not auth.verify_teacher_password(db, req.password):
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="密码错误")

    await login_rate_limiter.reset(client_key)
    token = auth.create_access_token({"sub": "teacher", "role": "teacher"})
    return _token_response(token, "teacher")


@router.post("/student/login")
async def student_login(req: schemas.StudentLoginRequest, request: Request, db: Session = Depends(get_db)):
    client_key = _get_client_key(request, f"student_login_{req.name}")

    await login_rate_limiter.check(client_key)

    student = auth.match_student_by_pinyin(req.name, db)
    if not student:
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="用户名或密码错误")

    if not student.password_hash:
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="用户名或密码错误")

    if not auth.verify_password(req.password, student.password_hash):
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="用户名或密码错误")

    await login_rate_limiter.reset(client_key)
    token = auth.create_access_token({"sub": student.name, "role": "student"})
    return _token_response(token, "student", student.name)


@router.post("/student/register")
async def student_register(req: schemas.StudentRegisterRequest, request: Request, db: Session = Depends(get_db)):
    client_key = _get_client_key(request, f"student_register_{req.name}")

    await login_rate_limiter.check(client_key)

    if req.password != req.confirm_password:
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="两次密码不一致")

    student = auth.match_student_by_pinyin(req.name, db)
    if not student:
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="用户名或密码错误")
    if student.password_hash:
        await login_failure_delay(client_key)
        await login_rate_limiter.record_failure(client_key)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该学生已设置密码，请直接登录")

    await login_rate_limiter.reset(client_key)

    student.password_hash = auth.hash_password(req.password)
    student.password_updated_at = datetime.now(timezone.utc)
    db.commit()

    token = auth.create_access_token({"sub": student.name, "role": "student"})
    return _token_response(token, "student", student.name)


@router.get("/check-student/{name}", response_model=schemas.CheckStudentResponse)
async def check_student(name: str):
    return {"exists": True, "name": name, "has_password": True}


@router.get("/me")
def get_me(current_user: dict = Depends(auth.get_current_user)):
    return current_user


@router.post("/logout")
def logout(request: Request):
    token = request.cookies.get(auth.TOKEN_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if token:
        payload = auth.decode_access_token(token)
        if payload:
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                add_to_blacklist(jti, float(exp))
    resp = JSONResponse(content={"success": True, "message": "已登出"})
    resp.delete_cookie(key=auth.TOKEN_COOKIE_NAME, path="/api")
    return resp