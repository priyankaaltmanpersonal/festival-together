from pydantic import BaseModel, Field


class CanonicalImportRequest(BaseModel):
    screenshot_count: int = Field(ge=1, le=30)


class CanonicalSet(BaseModel):
    id: str
    artist_name: str
    stage_name: str
    start_time_pt: str
    end_time_pt: str
    day_index: int
    status: str


class CanonicalReviewResponse(BaseModel):
    parse_job_id: str | None = None
    unresolved_count: int
    sets: list[CanonicalSet]
