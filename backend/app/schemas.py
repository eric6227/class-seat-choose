from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
import re


def _validate_password_complexity(v: str, field_name: str) -> str:
    if len(v) < 8:
        raise ValueError(f"{field_name}至少8位")
    if not re.search(r'[a-zA-Z]', v):
        raise ValueError(f"{field_name}必须包含字母")
    if not re.search(r'\d', v):
        raise ValueError(f"{field_name}必须包含数字")
    return v


class TeacherLoginRequest(BaseModel):
    password: str = Field(..., min_length=1)


class StudentLoginRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60, description="学生姓名全拼（如 zhangwei）")
    password: str = Field(..., min_length=1)


class StudentRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60, description="学生姓名全拼（如 zhangwei）")
    password: str = Field(..., min_length=1)
    confirm_password: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def name_must_be_valid(cls, v: str) -> str:
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v, "密码")

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("两次输入的密码不一致")
        return v


class SetupTeacherRequest(BaseModel):
    password: str = Field(..., min_length=8)
    setup_token: str = Field(..., min_length=1)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v, "密码")


class SeatAssignRequest(BaseModel):
    seat_id: int
    student_name: Optional[str] = None
    companion_name: Optional[str] = None


class SeatSwapRequest(BaseModel):
    src_seat_id: int
    dst_seat_id: int


class SeatClearRequest(BaseModel):
    seat_id: int


class WishItem(BaseModel):
    seat_id: int
    priority: int = Field(..., ge=1, le=10)


class SaveWishesRequest(BaseModel):
    wishes: List[WishItem] = Field(default_factory=list, max_length=10)


class CompanionRequest(BaseModel):
    target_student_name: str = Field(..., min_length=2, max_length=20)


class InvitationResponse(BaseModel):
    invitation_id: int
    action: str = Field(..., pattern="^(accept|reject)$")


class ImportPriorityRequest(BaseModel):
    names: List[str] = Field(..., min_length=1)

    @field_validator("names")
    @classmethod
    def validate_names(cls, v: List[str]) -> List[str]:
        return [name.strip() for name in v if name.strip()]


class ResetPasswordRequest(BaseModel):
    student_name: str
    new_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return _validate_password_complexity(v, "新密码")
        return v


class ForbiddenRule(BaseModel):
    xName: str
    yName: str


class SeatStateUpdate(BaseModel):
    current_index: Optional[int] = None
    global_show_names: Optional[bool] = None
    companion_quota: Optional[int] = None
    gender_display: Optional[bool] = None
    forbidden_rules: Optional[List[ForbiddenRule]] = None
    mirror_h: Optional[bool] = None
    mirror_v: Optional[bool] = None
    student_list_collapsed: Optional[bool] = None
    completed_collapsed: Optional[bool] = None
    groups_count: Optional[int] = None
    rows_per_group: Optional[int] = None
    cols_per_group: Optional[int] = None
    has_pairs: Optional[bool] = None


class LayoutUpdate(BaseModel):
    groups_count: int = 4
    rows_per_group: int = 7
    cols_per_group: int = 2
    has_pairs: bool = True


class AutoLockRequest(BaseModel):
    quota: int = Field(..., ge=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: Optional[str] = None


class CheckStudentResponse(BaseModel):
    exists: bool
    name: str
    has_password: bool


class MessageResponse(BaseModel):
    success: bool
    message: str


class RoundCreateRequest(BaseModel):
    name: Optional[str] = None
    no_wish_lock_date: Optional[str] = None
    class_change_date: Optional[str] = None


class RoundUpdateRequest(BaseModel):
    name: Optional[str] = None
    no_wish_lock_date: Optional[str] = None
    class_change_date: Optional[str] = None


class DestructiveActionConfirm(BaseModel):
    teacher_password: str = Field(..., min_length=1)


class ExportDataRequest(BaseModel):
    password: Optional[str] = None