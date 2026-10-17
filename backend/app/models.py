from sqlalchemy import Column, Integer, String, Boolean, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    student_id = Column(String(50), nullable=True)
    total_score = Column(Float, default=0.0)
    rank = Column(Integer, nullable=True)
    assigned = Column(Boolean, default=False)
    seat_id = Column(Integer, nullable=True)
    selection_method = Column(String(50), nullable=True)
    round_id = Column(Integer, nullable=True)
    password_hash = Column(String(255), nullable=True)
    password_updated_at = Column(DateTime, nullable=True)
    gender = Column(String(4), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    wishes = relationship("Wish", back_populates="student", cascade="all, delete-orphan")
    invitations_sent = relationship("Invitation", foreign_keys="Invitation.from_student_id", cascade="all, delete-orphan")
    invitations_received = relationship("Invitation", foreign_keys="Invitation.to_student_id", cascade="all, delete-orphan")


class Seat(Base):
    __tablename__ = "seats"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(20), nullable=False)
    seat_type = Column(String(20), nullable=False, default="group")
    group_idx = Column(Integer, nullable=True)
    row = Column(Integer, nullable=True)
    col = Column(Integer, nullable=True)
    is_occupied = Column(Boolean, default=False)
    is_disabled = Column(Boolean, default=False)
    occupant_name = Column(String(50), nullable=True)
    occupant_id = Column(Integer, nullable=True)


class Wish(Base):
    __tablename__ = "wishes"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    student_name = Column(String(50), nullable=False)
    seat_id = Column(Integer, nullable=False)
    priority = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("Student", back_populates="wishes")


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, index=True)
    from_student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    to_student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    from_student_name = Column(String(50), nullable=False)
    to_student_name = Column(String(50), nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)


class SeatState(Base):
    __tablename__ = "seat_state"

    id = Column(Integer, primary_key=True, index=True)
    current_index = Column(Integer, default=0)
    global_show_names = Column(Boolean, default=False)
    companion_quota = Column(Integer, default=0)
    gender_display = Column(Boolean, default=False)
    forbidden_rules = Column(JSON, default=list)
    mirror_h = Column(Boolean, default=False)
    mirror_v = Column(Boolean, default=False)
    student_list_collapsed = Column(Boolean, default=False)
    completed_collapsed = Column(Boolean, default=False)
    groups_count = Column(Integer, default=4)
    rows_per_group = Column(Integer, default=7)
    cols_per_group = Column(Integer, default=2)
    has_pairs = Column(Boolean, default=True)
    data_encrypted = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class OperationHistory(Base):
    __tablename__ = "operation_history"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String(500), nullable=False)
    state_snapshot = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TeacherPassword(Base):
    __tablename__ = "teacher_password"

    id = Column(Integer, primary_key=True, default=1)
    password_hash = Column(String(255), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SelectionRound(Base):
    __tablename__ = "selection_rounds"

    id = Column(Integer, primary_key=True, index=True)
    round_number = Column(Integer, unique=True, nullable=False)
    name = Column(String(100), nullable=False, default="")
    status = Column(String(20), nullable=False, default="active")
    no_wish_lock_date = Column(String(50), nullable=True)
    class_change_date = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    backup_path = Column(String(500), nullable=True)