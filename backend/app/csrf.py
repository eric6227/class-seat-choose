import secrets
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import get_settings

settings = get_settings()

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

EXCLUDED_PATHS = {"/api/health", "/api/docs", "/api/openapi.json"}


def _generate_csrf_token() -> str:
    return secrets.token_hex(32)


class CSRFTokenMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in EXCLUDED_PATHS or path.startswith("/api/docs"):
            return await call_next(request)

        if request.method in SAFE_METHODS:
            existing = request.cookies.get(CSRF_COOKIE_NAME)
            if not existing:
                token = _generate_csrf_token()
                request.state.csrf_token = token
            else:
                request.state.csrf_token = existing
            response = await call_next(request)
            if hasattr(request.state, "csrf_token") and request.state.csrf_token != existing:
                response.set_cookie(
                    key=CSRF_COOKIE_NAME,
                    value=request.state.csrf_token,
                    httponly=False,
                    secure=settings.COOKIE_SECURE,
                    samesite="strict",
                    path="/",
                )
            return response

        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get(CSRF_HEADER_NAME)

        if not csrf_cookie or not csrf_header:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing"},
            )

        if not secrets.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token mismatch"},
            )

        return await call_next(request)