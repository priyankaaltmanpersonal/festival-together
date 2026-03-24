from pydantic import BaseModel, Field


class ErrorEnvelope(BaseModel):
    error: str
    message: str


class ScreenshotPayload(BaseModel):
    source_id: str | None = None
    raw_text: str = Field(min_length=1)
