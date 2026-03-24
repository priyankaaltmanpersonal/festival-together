from pydantic import BaseModel, Field

from app.schemas.common import ScreenshotPayload


class PersonalImportRequest(BaseModel):
    screenshot_count: int = Field(ge=1, le=30)
    screenshots: list[ScreenshotPayload] = Field(default_factory=list)


class MemberSetUpdateRequest(BaseModel):
    preference: str | None = None
    attendance: str | None = None


class CompleteSetupRequest(BaseModel):
    confirm: bool = True


class PersonalSet(BaseModel):
    canonical_set_id: str
    artist_name: str
    stage_name: str
    start_time_pt: str
    end_time_pt: str
    day_index: int
    preference: str
    attendance: str
    source_confidence: float


class PersonalReviewResponse(BaseModel):
    parse_job_id: str | None = None
    parsed_count: int
    failed_count: int
    sets: list[PersonalSet]
