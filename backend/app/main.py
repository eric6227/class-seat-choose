import os
from pathlib import Path
from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
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
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
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