from pydantic import BaseModel, Field

from app.schemas.common import ScreenshotPayload


class CanonicalImportRequest(BaseModel):
    screenshot_count: int = Field(ge=1, le=30)
    screenshots: list[ScreenshotPayload] = Field(default_factory=list)


class CanonicalSet(BaseModel):
    id: str
    artist_name: str
    stage_name: str
    start_time_pt: str
    end_time_pt: str
    day_index: int
    status: str
    source_confidence: float


class CanonicalReviewResponse(BaseModel):
    parse_job_id: str | None = None
    unresolved_count: int
    sets: list[CanonicalSet]
