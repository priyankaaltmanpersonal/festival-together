from pydantic import BaseModel, Field

from app.schemas.common import ScreenshotPayload


class PersonalImportRequest(BaseModel):
    screenshot_count: int = Field(ge=1, le=30)
    screenshots: list[ScreenshotPayload] = Field(default_factory=list)


class MemberSetUpdateRequest(BaseModel):
    preference: str | None = None
    attendance: str | None = None


class AddSetRequest(BaseModel):
    artist_name: str = Field(min_length=1, max_length=200)
    stage_name: str = Field(min_length=1, max_length=200)
    start_time_pt: str = Field(pattern=r"^\d{1,2}:\d{2}$")
    end_time_pt: str = Field(pattern=r"^\d{1,2}:\d{2}$")
    day_index: int = Field(ge=1)


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
