import os
from pathlib import Path
from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings, _get_base_dir
from app.database import init_db
from app.routers import auth, seats
from app.csrf import CSRFTokenMiddleware
from app.ratelimit import GeneralRateLimitMiddleware, RedisClient

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url=None,
)

if os.getenv("SERVE_STATIC", "").lower() == "true":
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    _frontend_dir = os.path.join(_get_base_dir(), "..", "frontend")
    _frontend_dir = os.path.normpath(os.path.abspath(_frontend_dir))

    if os.path.isdir(_frontend_dir):
        app.mount("/css", StaticFiles(directory=os.path.join(_frontend_dir, "css")), name="css")
        app.mount("/js", StaticFiles(directory=os.path.join(_frontend_dir, "js")), name="js")

        @app.get("/login.html")
        async def _serve_login():
            return FileResponse(os.path.join(_frontend_dir, "login.html"))

        @app.get("/student.html")
        async def _serve_student():
            return FileResponse(os.path.join(_frontend_dir, "student.html"))

        @app.get("/teacher.html")
        async def _serve_teacher():
            return FileResponse(os.path.join(_frontend_dir, "teacher.html"))

        @app.get("/student-manage.html")
        async def _serve_student_manage():
            return FileResponse(os.path.join(_frontend_dir, "student-manage.html"))

        @app.middleware("http")
        async def _local_security_headers(request, call_next):
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
)

app.add_middleware(GeneralRateLimitMiddleware)

app.add_middleware(CSRFTokenMiddleware)

app.include_router(auth.router)
app.include_router(seats.router)


@app.on_event("startup")
async def startup_event():
    data_dir = os.path.join(_get_base_dir(), "data")
    os.makedirs(data_dir, exist_ok=True)
    init_db()
    await RedisClient.connect(settings.REDIS_URL)


@app.get("/api/")
def api_root():
    return {"status": "ok"}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/api/docs"}