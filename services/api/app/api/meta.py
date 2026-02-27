from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["meta"])


@router.get("/meta/version")
def version() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "environment": settings.app_env,
        "version": settings.app_version,
    }
