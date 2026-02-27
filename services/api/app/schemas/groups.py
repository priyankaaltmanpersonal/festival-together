from pydantic import BaseModel, Field


class GroupCreateRequest(BaseModel):
    group_name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=60)


class GroupUpdateRequest(BaseModel):
    group_name: str | None = Field(default=None, min_length=1, max_length=100)
    icon_url: str | None = None


class JoinInviteRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    leave_current_group: bool = False


class LeaveGroupRequest(BaseModel):
    confirm: bool = False


class GroupSummary(BaseModel):
    id: str
    name: str
    icon_url: str | None = None
    invite_code: str
    founder_member_id: str


class MemberSummary(BaseModel):
    id: str
    group_id: str
    display_name: str
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
