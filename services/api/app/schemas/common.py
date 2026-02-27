from pydantic import BaseModel


class ErrorEnvelope(BaseModel):
    error: str
    message: str
