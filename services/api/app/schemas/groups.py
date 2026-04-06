from typing import List
from pydantic import BaseModel, Field


class FestivalDay(BaseModel):
    day_index: int
    label: str = Field(min_length=1, max_length=20)
    date: str | None = None  # e.g. "4/11"


_DEFAULT_FESTIVAL_DAYS = [
    FestivalDay(day_index=1, label="Friday"),
    FestivalDay(day_index=2, label="Saturday"),
    FestivalDay(day_index=3, label="Sunday"),
]


class GroupCreateRequest(BaseModel):
    group_name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=60)
    chip_color: str | None = None
    festival_days: list[FestivalDay] | None = None  # defaults to Fri/Sat/Sun if omitted


class GroupUpdateRequest(BaseModel):
    group_name: str | None = Field(default=None, min_length=1, max_length=100)
    icon_url: str | None = None


class JoinInviteRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    leave_current_group: bool = False
    chip_color: str | None = None


class LeaveGroupRequest(BaseModel):
    confirm: bool = False


class MemberUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    chip_color: str | None = None


class DeleteMemberRequest(BaseModel):
    confirm: bool = False


class GroupSummary(BaseModel):
    id: str
    name: str
    icon_url: str | None = None
    invite_code: str
    founder_member_id: str
    festival_days: List[FestivalDay] = []


class MemberSummary(BaseModel):
    id: str
    group_id: str
    display_name: str
    chip_color: str | None = None
    role: str
    setup_status: str


class SessionSummary(BaseModel):
    token: str


class GroupCreateResponse(BaseModel):
    group: GroupSummary
    member: MemberSummary
    session: SessionSummary


class InvitePreviewResponse(BaseModel):
    group_id: str
    group_name: str
    group_icon_url: str | None = None
    available_chip_colors: list[str]
