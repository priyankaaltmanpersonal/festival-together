from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.canonical import router as canonical_router
from app.api.groups import router as groups_router
from app.api.meta import router as meta_router
from app.api.personal import router as personal_router
from app.api.schedule import router as schedule_router
from app.core.config import settings
from app.core.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield

app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)


@app.middleware("http")
async def request_id_logger(request: Request, call_next):
    # Placeholder middleware for request logging and trace IDs.
    response = await call_next(request)
    response.headers["x-app-env"] = settings.app_env
    return response


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"error": "bad_request", "message": str(exc)})


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }


app.include_router(meta_router, prefix=settings.api_prefix)
app.include_router(groups_router, prefix=settings.api_prefix)
app.include_router(canonical_router, prefix=settings.api_prefix)
app.include_router(personal_router, prefix=settings.api_prefix)
app.include_router(schedule_router, prefix=settings.api_prefix)
