from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


TermType = Literal["fall", "spring"]
DayKey = Literal["Mon", "Tue", "Wed", "Thu", "Fri"]
ConstraintType = Literal[
    "instructor_unavailable",
    "course_fixed",
    "course_blocked",
]
UserRole = Literal[
    "admin",
    "dept_chair",
    "coordinator",
    "instructor",
    "secretary",
    "viewer",
]


class Account(BaseModel):
    user_id: int
    username: str
    full_name: str
    role: UserRole
    department_id: int | None = None
    department_name: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    account: Account
    token: str


class Room(BaseModel):
    roomCode: str
    capacity: int
    type: Literal["derslik", "amfi", "laboratuvar"]
    block: str
    floor: int


class ReservationWrite(BaseModel):
    roomCode: str
    date: date
    timeSlots: list[str] = Field(min_length=1)
    courseCode: str | None = None
    instructorName: str | None = None
    description: str | None = None


class Reservation(BaseModel):
    id: str
    roomCode: str
    date: date
    timeSlots: list[str]
    userId: str
    userName: str
    userRole: str
    createdAt: datetime
    roomCapacity: int
    roomType: Literal["derslik", "amfi", "laboratuvar"]
    courseCode: str | None = None
    instructorName: str | None = None
    description: str | None = None


class CommonScheduleWrite(BaseModel):
    key: str
    courses: list[dict[str, Any]]


class DepartmentScheduleWrite(CommonScheduleWrite):
    department: str


class ScheduleArchive(BaseModel):
    archive_id: int
    period_key: str
    term: TermType
    schedules: dict[str, list[dict[str, Any]]]
    created_by: str | None = None
    created_at: datetime


class LinkedGroupsWrite(BaseModel):
    key: str
    groups: list["LinkedCourseGroup"]


class AlgorithmInput(BaseModel):
    course_id: int
    course_code: str
    course_name: str
    weekly_hours: int = Field(ge=0)
    t_hour: int = Field(default=0, ge=0)
    l_hour: int = Field(default=0, ge=0)
    course_semester: int = Field(ge=1, le=10)
    section_count: int = Field(ge=1)
    instructor_full_name: str = "anonim"
    is_online: bool = False
    is_service: bool = False
    is_common: bool = False
    course_type_id: int = 1
    expected_student: int = 0
    department_codes: list[str] = Field(default_factory=list)
    section_instructors: list[str] = Field(default_factory=list)


class TimeConstraint(BaseModel):
    id: str | None = None
    type: ConstraintType
    target: str
    day: DayKey
    hour: int = Field(ge=0, le=23)


class LinkedCourseGroup(BaseModel):
    id: str
    courseCodes: list[str] = Field(min_length=2)


class ConstraintSettings(BaseModel):
    activeDays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    daytimeSlots: list[int] = Field(default_factory=lambda: list(range(8)))
    onlineSlots: list[int] = Field(default_factory=lambda: [8, 9, 10, 11])
    lunchSlots: list[int] = Field(default_factory=lambda: [3])
    enforceLunchBreak: bool = False
    timeMap: dict[str, str] = Field(default_factory=lambda: {
        "0": "09:00-10:00",
        "1": "10:00-11:00",
        "2": "11:00-12:00",
        "3": "12:00-13:00",
        "4": "13:00-14:00",
        "5": "14:00-15:00",
        "6": "15:00-16:00",
        "7": "16:00-17:00",
        "8": "18:00-19:00",
        "9": "19:00-20:00",
        "10": "20:00-21:00",
        "11": "21:00-22:00",
    })
    maxSolveTimeSeconds: float = Field(default=60, gt=0)
    maxConsecutiveHours: int = Field(default=5, gt=0)
    weightAdjacentOverlap: int = Field(default=8, ge=0)
    weightStudentGap: int = Field(default=0, ge=0)
    weightLunch: int = Field(default=2, ge=0)
    weightInstructorBalance: int = Field(default=1, ge=0)
    excludedCoursePrefixes: list[str] = Field(default_factory=lambda: ["GSB"])


DEFAULT_RULES = {
    "instructorClash": True,
    "semesterClash": True,
    "roomClash": True,
    "consecutiveLimit": True,
    "onlineExemption": True,
    "weeklyHours": True,
}


class ConstraintBundle(BaseModel):
    periodKey: str
    department: str = "HAVUZ"
    settings: ConstraintSettings = Field(default_factory=ConstraintSettings)
    systemRules: dict[str, bool] = Field(default_factory=lambda: DEFAULT_RULES.copy())
    constraints: list[TimeConstraint] = Field(default_factory=list)
    linkedGroups: list[LinkedCourseGroup] = Field(default_factory=list)
    splits: dict[str, list[str]] = Field(default_factory=dict)

    @field_validator("periodKey")
    @classmethod
    def validate_period_key(cls, value: str) -> str:
        year, separator, term = value.partition("|")
        if separator != "|" or term not in ("fall", "spring"):
            raise ValueError("periodKey must look like 2025-2026|fall")
        years = year.split("-")
        if len(years) != 2 or any(len(part) != 4 or not part.isdigit() for part in years):
            raise ValueError("periodKey must look like 2025-2026|fall")
        return value


class ScheduledCourse(BaseModel):
    id: str
    name: str
    code: str
    lecturer: str
    lecturerId: str
    department: str
    classLevel: str
    room: str = "TBA"
    day: DayKey
    startTime: str
    endTime: str
    studentsEnrolled: int = 0
    totalCapacity: int = 0
    colorIndex: int = 0
    type: Literal["Lecture", "Lab", "Seminar", "Tutorial"] = "Lecture"
    hasConflict: bool = False
    conflictReason: str | None = None
    isPinned: bool = False
    isLocked: bool = False
    courseSemester: int | None = None
    sectionNumber: int | None = None
    totalSections: int | None = None
    audienceDepartments: list[str] = Field(default_factory=list)
    coScheduleGroup: str = ""


class SchedulerRunRequest(BaseModel):
    courses: list[AlgorithmInput]
    term: TermType
    period_key: str
    department: str = "HAVUZ"
    locked_sessions: list[ScheduledCourse] = Field(default_factory=list)


class ScheduleWarning(BaseModel):
    id: str
    severity: Literal["error", "warning"]
    message: str
    courses: list[str]


class ScheduleStats(BaseModel):
    executionTime: float
    totalPlaced: int
    totalTasks: int
    conflictCount: int
    warnings: list[ScheduleWarning]
    lecturerHours: dict[str, int]
    uniqueLecturers: list[str]
    roomsUsed: int
    totalRooms: int


class SchedulerResult(BaseModel):
    courses: list[ScheduledCourse]
    stats: ScheduleStats


class UniversitySchedulerRunRequest(BaseModel):
    term: TermType
    courses: list[AlgorithmInput] = Field(default_factory=list)
    common_rows: list["CommonWorkbookRow"] = Field(default_factory=list)
    view_department: str = "BİL"
    common_only: bool = False
    selected_course_codes: list[str] = Field(default_factory=list)
    selection_department: str = ""
    locked_common_courses: list[ScheduledCourse] = Field(default_factory=list)


class CommonWorkbookRow(BaseModel):
    course_code: str
    course_name: str = ""
    section: int = Field(default=1, ge=1)
    credit: int = Field(default=0, ge=0)
    t_hour: int = Field(default=0, ge=0)
    l_hour: int = Field(default=0, ge=0)
    capacity: int = Field(default=0, ge=0)
    enrolled: int = Field(default=0, ge=0)
    instructor: str = "anonim"


class UniversitySchedulerResult(SchedulerResult):
    commonCourses: list[ScheduledCourse]
    departmentSchedules: dict[str, list[ScheduledCourse]]
    generatedDepartments: list[str]
