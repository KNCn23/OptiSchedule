from __future__ import annotations

import re
import sys
import time
import uuid
import unicodedata
from collections import Counter, defaultdict
from dataclasses import replace
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from algorithm.shared.optisched_core import (
    OptiSchedSolver,
    SchedulerConfig,
    compress_schedule_blocks,
    validate_global_instructor,
    validate_schedule,
)

from .constraint_repository import get_constraint_bundle
from .course_filters import is_graduation_project
from .course_repository import classroom_capacities, classroom_count, list_algorithm_inputs
from .models import (
    AlgorithmInput,
    CommonWorkbookRow,
    ConstraintBundle,
    ScheduleStats,
    ScheduledCourse,
    SchedulerResult,
    SchedulerRunRequest,
    UniversitySchedulerResult,
    UniversitySchedulerRunRequest,
)


DAY_TO_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4}
INDEX_TO_DAY = {value: key for key, value in DAY_TO_INDEX.items()}
DEPARTMENT_CODES = [
    "BİL", "EEM", "END", "CE", "BME", "MAK",
    "AI", "CSE", "BENG", "EEE", "IND", "ME",
]


def _term_data_directory(term: str) -> tuple[Path, str]:
    root = PROJECT_ROOT / "real_deal_database"
    if term == "spring":
        return root / "BAHAR", "BAHAR"
    fall_directory = next(
        path for path in root.iterdir()
        if path.is_dir() and path.name.startswith("G") and path.name.endswith("Z")
    )
    return fall_directory, "GUZ"


def _int_value(value: object) -> int:
    parsed = pd.to_numeric(value, errors="coerce")
    return int(parsed) if pd.notna(parsed) else 0


def _semester_from_code(code: str, term: str) -> int:
    year = int(next(iter(re.findall(r"\d", code)), "1"))
    return min(8, year * 2 - (1 if term == "fall" else 0))


def _section_sync_group(
    code: str,
    name: str,
    section: int,
    section_count: int,
) -> str:
    if section_count < 5:
        return ""
    searchable = unicodedata.normalize("NFKD", f"{code} {name}")
    searchable = "".join(char for char in searchable if not unicodedata.combining(char))
    searchable = searchable.upper().replace("İ", "I")
    if not any(token in searchable for token in ("KIMYA", "CHEM", "FIZ", "PHYS", "MAT", "MATH", "LAB")):
        return ""
    first_group_size = (section_count + 1) // 2
    group_number = 1 if section <= first_group_size else 2
    return f"{code}:G{group_number}"


def _workbook_frame(
    path: Path,
    department: str,
    metadata: dict[str, AlgorithmInput],
    term: str,
    allowed_codes: set[str] | None = None,
    split_patterns: dict[str, list[str]] | None = None,
) -> pd.DataFrame:
    source = pd.read_excel(path)
    return _source_frame(
        source,
        department,
        metadata,
        term,
        allowed_codes,
        split_patterns,
    )


def _source_frame(
    source: pd.DataFrame,
    department: str,
    metadata: dict[str, AlgorithmInput],
    term: str,
    allowed_codes: set[str] | None = None,
    split_patterns: dict[str, list[str]] | None = None,
) -> pd.DataFrame:
    if source.empty:
        return pd.DataFrame()

    source["Ders Kodu"] = source["Ders Kodu"].astype(str).str.strip().str.upper()
    source["Şube"] = pd.to_numeric(source["Şube"], errors="coerce").fillna(1).astype(int)
    section_counts = source.groupby("Ders Kodu")["Şube"].nunique().to_dict()
    rows: list[dict] = []

    for row_index, row in source.iterrows():
        code = str(row["Ders Kodu"]).strip()
        if not code or code == "NAN":
            continue
        if allowed_codes is not None and code not in allowed_codes:
            continue
        if is_graduation_project(row.get("Ders Adı")):
            continue
        info = metadata.get(code)
        audience_departments = info.department_codes if info is not None else []
        section = int(row["Şube"])
        section_count = max(1, int(section_counts.get(code, 1)))
        course_name = str(row.get("Ders Adı", code)).strip()
        theory = _int_value(row.get("t_hour"))
        lab = _int_value(row.get("l_hour"))
        credit = _int_value(row.get("Kredi"))
        total = theory + lab if theory + lab > 0 else credit
        if total <= 0:
            continue
        patterns = (split_patterns or {}).get(code, [])
        split = _parse_split(patterns[0], total) if patterns else _default_split(total)
        semester = (
            info.course_semester
            if department == "HAVUZ" and info is not None
            else _semester_from_code(code, term)
        )
        instructor = str(row.get("Öğretim Görevlisi", "anonim")).strip()
        if not instructor or instructor.lower() == "nan":
            instructor = "anonim"
        enrolled = pd.to_numeric(row.get("Sınıf Mevcudu"), errors="coerce")
        capacity = pd.to_numeric(row.get("Kontenjan"), errors="coerce")
        expected = int(enrolled if pd.notna(enrolled) else capacity if pd.notna(capacity) else 0)
        section_capacity = int(capacity) if pd.notna(capacity) else expected

        for split_index, hours in enumerate(split):
            suffix = f" (P{split_index + 1})" if len(split) > 1 else ""
            solver_code = f"{code}-{section}"
            if len(split) > 1:
                solver_code += f"#P{split_index + 1}"
            rows.append({
                "parent_id": f"{department}:{code}:{section}:{row_index}",
                "base_code": code,
                "name": f"{course_name}-{section}{suffix}",
                "code": solver_code,
                "hours": hours,
                "semester": semester,
                "section": section,
                "total_sections": section_count,
                "instructor": instructor,
                "department_name": department,
                "course_type_id": 4 if department == "HAVUZ" else (info.course_type_id if info else 1),
                "expected_student": expected,
                "capacity": section_capacity,
                "is_service": True if department == "HAVUZ" else (info.is_service if info else False),
                "is_online": info.is_online if info else False,
                "split_index": split_index,
                "audience_departments": ",".join(audience_departments),
                "co_schedule_group": _section_sync_group(
                    code,
                    course_name,
                    section,
                    section_count,
                ),
            })
    return pd.DataFrame(rows)


def enrich_algorithm_inputs(
    courses: list[AlgorithmInput],
    term: str,
    department: str,
) -> list[AlgorithmInput]:
    """Attach the selected department workbook's section instructors to catalog rows."""
    if department not in DEPARTMENT_CODES:
        return courses

    data_directory, suffix = _term_data_directory(term)
    path = data_directory / f"{department}_{suffix}.xlsx"
    if not path.exists():
        return courses

    source = pd.read_excel(path)
    required = {"Ders Kodu", "Şube", "Öğretim Görevlisi"}
    if source.empty or not required.issubset(source.columns):
        return courses

    source = source.copy()
    source["Ders Kodu"] = source["Ders Kodu"].astype(str).str.strip().str.upper()
    source["Şube"] = pd.to_numeric(source["Şube"], errors="coerce").fillna(1).astype(int)
    source = source.sort_values(["Ders Kodu", "Şube"])

    workbook_metadata: dict[str, tuple[int, list[str]]] = {}
    for code, rows in source.groupby("Ders Kodu", sort=False):
        instructors = [
            str(value).strip()
            if pd.notna(value) and str(value).strip()
            else "anonim"
            for value in rows["Öğretim Görevlisi"]
        ]
        workbook_metadata[str(code)] = (
            max(1, int(rows["Şube"].nunique())),
            instructors,
        )

    enriched: list[AlgorithmInput] = []
    for course in courses:
        workbook_entry = workbook_metadata.get(course.course_code.upper())
        if workbook_entry is None:
            enriched.append(course)
            continue
        section_count, instructors = workbook_entry
        enriched.append(course.model_copy(update={
            "section_count": section_count,
            "instructor_full_name": instructors[0] if instructors else "anonim",
            "section_instructors": instructors,
        }))
    return enriched


def linkable_algorithm_inputs(
    courses: list[AlgorithmInput],
    term: str,
) -> list[AlgorithmInput]:
    data_directory, suffix = _term_data_directory(term)
    by_code = {course.course_code.upper(): course for course in courses}
    workbook_rows: dict[str, list[pd.DataFrame]] = defaultdict(list)

    for department in [*DEPARTMENT_CODES, "ORTAK"]:
        path = data_directory / f"{department}_{suffix}.xlsx"
        if not path.exists():
            continue
        source = pd.read_excel(path)
        if source.empty or "Ders Kodu" not in source.columns:
            continue
        source = source.copy()
        source["Ders Kodu"] = source["Ders Kodu"].astype(str).str.strip().str.upper()
        for code, rows in source.groupby("Ders Kodu", sort=False):
            if code and code != "NAN":
                workbook_rows[str(code)].append(rows)

    result: list[AlgorithmInput] = []
    for code, frames in workbook_rows.items():
        course = by_code.get(code)
        if course is None:
            continue
        source = pd.concat(frames, ignore_index=True)
        sections = pd.to_numeric(
            source.get("Şube", pd.Series([1] * len(source))),
            errors="coerce",
        ).fillna(1).astype(int)
        instructors = [
            str(value).strip() if pd.notna(value) and str(value).strip() else "anonim"
            for value in source.get(
                "Öğretim Görevlisi",
                pd.Series(["anonim"] * len(source)),
            )
        ]
        def numeric_column(name: str) -> pd.Series:
            values = (
                source[name]
                if name in source.columns
                else pd.Series([0] * len(source), index=source.index)
            )
            return pd.to_numeric(values, errors="coerce").fillna(0)

        theory = numeric_column("t_hour")
        lab = numeric_column("l_hour")
        credit = numeric_column("Kredi")
        total = int(max((theory + lab).max(), credit.max(), course.weekly_hours))
        result.append(course.model_copy(update={
            "weekly_hours": total,
            "t_hour": int(theory.max()),
            "l_hour": int(lab.max()),
            "section_count": max(1, int(sections.nunique())),
            "instructor_full_name": next(
                (name for name in instructors if name.lower() not in ("anonim", "-", "")),
                "anonim",
            ),
            "section_instructors": instructors,
        }))
    return sorted(result, key=lambda item: item.course_code)


def linkable_course_codes(term: str) -> set[str]:
    return {
        course.course_code
        for course in linkable_algorithm_inputs(list_algorithm_inputs(), term)
    }


def _common_rows_frame(
    rows: list[CommonWorkbookRow],
    metadata: dict[str, AlgorithmInput],
    term: str,
) -> pd.DataFrame:
    source = pd.DataFrame([
        {
            "Ders Kodu": row.course_code,
            "Ders Adı": row.course_name,
            "Şube": row.section,
            "Kredi": row.credit,
            "t_hour": row.t_hour,
            "l_hour": row.l_hour,
            "Kontenjan": row.capacity,
            "Sınıf Mevcudu": row.enrolled,
            "Öğretim Görevlisi": row.instructor,
        }
        for row in rows
    ])
    return _source_frame(source, "HAVUZ", metadata, term)


def _normalize_overloaded_mandatory(
    frame: pd.DataFrame,
    config: SchedulerConfig,
) -> pd.DataFrame:
    result = frame.copy()
    daytime_slots = set(config.timeslots) - set(config.online_timeslots)
    weekly_capacity = len(config.days) * len(daytime_slots)

    for semester in sorted(result["semester"].unique()):
        semester_rows = result[result["semester"] == semester]
        sections = sorted(semester_rows["section"].unique()) or [1]

        def mandatory_load(section: int) -> int:
            rows = result[
                (result["semester"] == semester)
                & (result["course_type_id"] == 1)
                & (
                    (result["section"] == section)
                    | (result["total_sections"] <= 1)
                )
            ]
            return int(rows["hours"].sum())

        def elective_requirement() -> int:
            electives = result[
                (result["semester"] == semester)
                & (result["course_type_id"] != 1)
            ]
            if electives.empty:
                return 0
            return int(electives.groupby("base_code")["hours"].sum().max())

        while (
            max(mandatory_load(int(section)) for section in sections)
            + max(3, 2 * elective_requirement())
            > weekly_capacity
        ):
            candidates = result[
                (result["semester"] == semester)
                & (result["course_type_id"] == 1)
                & (result["total_sections"] <= 1)
                & (result["capacity"] > 0)
                & (result["capacity"] <= 45)
            ]
            if candidates.empty:
                break
            candidate_codes = sorted(
                candidates["base_code"].unique(),
                key=lambda code: (
                    int("".join(re.findall(r"\d", str(code))) or 0),
                    str(code),
                ),
                reverse=True,
            )
            result.loc[result["base_code"] == candidate_codes[0], "course_type_id"] = 2

    return result


def _instructor_slots(
    frame: pd.DataFrame,
    assignments: dict[int, list[tuple]],
    department: str | None = None,
) -> dict[str, set[tuple]]:
    busy: dict[str, set[tuple]] = defaultdict(set)
    for index, slots in assignments.items():
        if (
            department is not None
            and str(frame.loc[index, "department_name"]) != department
        ):
            continue
        instructor = str(frame.loc[index, "instructor"]).strip()
        if instructor.lower() in ("-", "anonim", ""):
            continue
        busy[instructor].update(tuple(slot) for slot in slots)
    return busy


def _parse_split(pattern: str, total_hours: int) -> list[int]:
    values = [int(value) for value in re.findall(r"\d+", pattern)]
    values = [value for value in values if value > 0]
    if values and sum(values) == total_hours:
        return values
    return [total_hours]


def _default_split(total_hours: int) -> list[int]:
    if total_hours == 4:
        return [2, 2]
    if total_hours == 5:
        return [2, 3]
    if total_hours == 6:
        return [3, 3]
    return [total_hours]


def _expand_courses(
    courses: list[AlgorithmInput],
    bundle: ConstraintBundle,
    term: str,
) -> pd.DataFrame:
    rows: list[dict] = []
    excluded = tuple(prefix.upper() for prefix in bundle.settings.excludedCoursePrefixes)
    for input_index, course in enumerate(courses):
        if is_graduation_project(course.course_name):
            continue
        total_hours = (
            course.t_hour + course.l_hour
            if course.t_hour + course.l_hour > 0
            else course.weekly_hours
        )
        if total_hours <= 0:
            continue
        if term == "fall" and course.course_semester % 2 == 0:
            continue
        if term == "spring" and course.course_semester % 2 != 0:
            continue
        if excluded and course.course_code.upper().startswith(excluded):
            continue

        patterns = bundle.splits.get(course.course_code, [])
        split = _parse_split(patterns[0], total_hours) if patterns else _default_split(total_hours)
        for section in range(1, max(1, course.section_count) + 1):
            instructor = (
                course.section_instructors[section - 1]
                if section <= len(course.section_instructors)
                and course.section_instructors[section - 1]
                else course.instructor_full_name
            )
            for split_index, hours in enumerate(split):
                suffix = f" (P{split_index + 1})" if len(split) > 1 else ""
                rows.append(
                    {
                        "parent_id": f"{course.course_id}_{section}",
                        "base_code": course.course_code,
                        "name": f"{course.course_name}-{section}{suffix}",
                        "code": f"{course.course_code}-{section}",
                        "hours": hours,
                        "semester": course.course_semester,
                        "section": section,
                        "total_sections": max(1, course.section_count),
                        "instructor": instructor or "anonim",
                        "department_name": bundle.department,
                        "course_type_id": course.course_type_id,
                        "expected_student": course.expected_student,
                        "is_service": course.is_service,
                        "is_online": course.is_online,
                        "split_index": split_index,
                        "input_index": input_index,
                    }
                )
    return pd.DataFrame(rows)


def _build_config(bundle: ConstraintBundle) -> SchedulerConfig:
    settings = bundle.settings
    all_slots = sorted(set(settings.daytimeSlots + settings.onlineSlots))
    time_map = {int(key): value for key, value in settings.timeMap.items()}
    return SchedulerConfig(
        days=settings.activeDays,
        timeslots=all_slots,
        time_map=time_map,
        online_timeslots=settings.onlineSlots,
        online_time_map={
            slot: time_map[slot]
            for slot in settings.onlineSlots
            if slot in time_map
        },
        lunch_slots=settings.lunchSlots,
        enforce_lunch_break=settings.enforceLunchBreak,
        max_solve_time_seconds=settings.maxSolveTimeSeconds,
        weight_adjacent_overlap=settings.weightAdjacentOverlap,
        weight_student_gap=settings.weightStudentGap,
        weight_lunch=settings.weightLunch if settings.enforceLunchBreak else 0,
        weight_instructor_balance=settings.weightInstructorBalance,
        max_consecutive_hours=settings.maxConsecutiveHours,
        enforce_instructor_clash=bundle.systemRules.get("instructorClash", True),
        enforce_semester_clash=bundle.systemRules.get("semesterClash", True),
        enforce_consecutive_limit=bundle.systemRules.get("consecutiveLimit", True),
        enforce_weekly_hours=bundle.systemRules.get("weeklyHours", True),
    )


def _slot_for_hour(config: SchedulerConfig, hour: int) -> int | None:
    prefix = f"{hour:02d}:"
    for slot, label in config.time_map.items():
        if label.startswith(prefix):
            return slot
    return None


def _solver_constraints(bundle: ConstraintBundle, config: SchedulerConfig) -> list[dict]:
    result = []
    for constraint in bundle.constraints:
        slot = _slot_for_hour(config, constraint.hour)
        day = DAY_TO_INDEX.get(constraint.day)
        if slot is None or day is None:
            continue
        result.append(
            {
                "type": constraint.type,
                "target": constraint.target,
                "day": day,
                "slot": slot,
            }
        )
    return result


def _locked_instructor_busy(request: SchedulerRunRequest, config: SchedulerConfig) -> dict[str, set[tuple]]:
    return _scheduled_instructor_busy(request.locked_sessions, config)


def _scheduled_instructor_busy(
    courses: list[ScheduledCourse],
    config: SchedulerConfig,
) -> dict[str, set[tuple]]:
    busy: dict[str, set[tuple]] = defaultdict(set)
    start_to_slot = {
        label.split("-")[0]: slot
        for slot, label in config.time_map.items()
    }
    for course in courses:
        if course.lecturer.lower() in ("atanmamış", "anonim", "-", ""):
            continue
        day = DAY_TO_INDEX.get(course.day)
        start = start_to_slot.get(course.startTime)
        end_hour = int(course.endTime.split(":")[0])
        if day is None or start is None:
            continue
        start_hour = int(course.startTime.split(":")[0])
        for offset in range(max(1, end_hour - start_hour)):
            busy[course.lecturer].add((day, start + offset))
    return busy


def _scheduled_room_requirements(
    courses: list[ScheduledCourse],
    config: SchedulerConfig,
) -> dict[tuple[int, int], list[int]]:
    requirements: dict[tuple[int, int], list[int]] = defaultdict(list)
    start_to_slot = {
        label.split("-")[0]: slot
        for slot, label in config.time_map.items()
    }
    for course in courses:
        day = DAY_TO_INDEX.get(course.day)
        start = start_to_slot.get(course.startTime)
        if day is None or start is None:
            continue
        duration = max(
            1,
            int(course.endTime.split(":")[0])
            - int(course.startTime.split(":")[0]),
        )
        need = max(0, int(course.studentsEnrolled or 0))
        for offset in range(duration):
            requirements[(day, start + offset)].append(need)
    return requirements


def _frame_room_requirements(
    frame: pd.DataFrame,
    assignments: dict[int, list[tuple]],
) -> dict[tuple[int, int], list[int]]:
    requirements: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, slots in assignments.items():
        if index not in frame.index or bool(frame.loc[index].get("is_online", False)):
            continue
        need = _int_value(frame.loc[index].get("expected_student", 0))
        for day, slot in slots:
            requirements[(int(day), int(slot))].append(max(0, need))
    return requirements


def _merge_room_requirements(
    target: dict[tuple[int, int], list[int]],
    extra: dict[tuple[int, int], list[int]],
) -> None:
    for key, values in extra.items():
        target[key].extend(values)


def _locked_student_busy(request: SchedulerRunRequest, config: SchedulerConfig) -> dict[tuple[int, int], set[tuple]]:
    return _scheduled_student_busy(request.locked_sessions, config)


def _scheduled_student_busy(
    courses: list[ScheduledCourse],
    config: SchedulerConfig,
) -> dict[tuple[int, int], set[tuple]]:
    busy: dict[tuple[int, int], set[tuple]] = defaultdict(set)
    start_to_slot = {label.split("-")[0]: slot for slot, label in config.time_map.items()}
    for course in courses:
        if course.courseSemester is None:
            continue
        day = DAY_TO_INDEX.get(course.day)
        start = start_to_slot.get(course.startTime)
        if day is None or start is None:
            continue
        duration = max(1, int(course.endTime[:2]) - int(course.startTime[:2]))
        section_key = 0 if (course.totalSections or 1) <= 1 else (course.sectionNumber or 1)
        for offset in range(duration):
            busy[(course.courseSemester, section_key)].add((day, start + offset))
    return busy


def _to_frontend_courses(
    schedule: pd.DataFrame,
    department: str,
    config: SchedulerConfig,
) -> list[ScheduledCourse]:
    if schedule.empty:
        return []
    blocks = compress_schedule_blocks(schedule)
    result: list[ScheduledCourse] = []
    for index, row in blocks.iterrows():
        if is_graduation_project(row.get("name")):
            continue
        slots = row.get("slot_indices") or [row["s_idx"]]
        start_slot = int(min(slots))
        end_slot = int(max(slots))
        start_time = config.time_map[start_slot].split("-")[0]
        end_time = config.time_map[end_slot].split("-")[1]
        lecturer = str(row.get("instructor", "anonim"))
        if lecturer.lower() in ("anonim", "-", ""):
            lecturer = "Atanmamış"
        lecturer_slug = re.sub(r"\s+", "-", lecturer.lower())
        name = str(row.get("name", ""))
        course_type = "Lab" if any(word in name.lower() for word in ("lab", "uygulama", "laboratuvar")) else "Lecture"
        semester = int(row.get("semester", 1))
        result.append(
            ScheduledCourse(
                id=f"sched-{uuid.uuid4().hex[:12]}-{index}",
                name=name,
                code=str(row["DersKodu"]).split("#", 1)[0],
                lecturer=lecturer,
                lecturerId=f"lec-{lecturer_slug}",
                department=department,
                classLevel=f"{(semester + 1) // 2}. Sınıf {department}",
                room=str(row.get("Sinif", "TBA")),
                day=INDEX_TO_DAY[int(row["d_idx"])],
                startTime=start_time,
                endTime=end_time,
                studentsEnrolled=int(row.get("expected_student", 0) or 0),
                totalCapacity=0,
                colorIndex=semester % 8,
                type=course_type,
                courseSemester=semester,
                sectionNumber=int(row.get("section", 1)),
                totalSections=int(row.get("total_sections", 1)),
                audienceDepartments=[
                    value
                    for value in str(row.get("audience_departments", "")).split(",")
                    if value
                ],
                coScheduleGroup=str(row.get("co_schedule_group", "") or ""),
            )
        )
    return result


def run_scheduler(request: SchedulerRunRequest) -> SchedulerResult:
    started = time.perf_counter()
    bundle = get_constraint_bundle(request.period_key, request.department)
    config = _build_config(bundle)
    frame = _expand_courses(request.courses, bundle, request.term)

    if frame.empty:
        return SchedulerResult(
            courses=[],
            stats=ScheduleStats(
                executionTime=round(time.perf_counter() - started, 3),
                totalPlaced=0,
                totalTasks=0,
                conflictCount=0,
                warnings=[],
                lecturerHours={},
                uniqueLecturers=[],
                roomsUsed=0,
                totalRooms=classroom_count(),
            ),
        )

    solver = OptiSchedSolver(
        frame,
        config,
        instructor_busy=_locked_instructor_busy(request, config),
        student_busy=_locked_student_busy(request, config),
        time_constraints=_solver_constraints(bundle, config),
        linked_groups=[group.courseCodes for group in bundle.linkedGroups],
        room_capacities=classroom_capacities(),
        room_busy_requirements=_scheduled_room_requirements(
            request.locked_sessions,
            config,
        ),
    )
    solver.build_model()
    schedule = solver.solve()
    report = validate_schedule(
        frame,
        solver.get_index_assignments(),
        check_semester=config.enforce_semester_clash,
        linked_groups=[group.courseCodes for group in bundle.linkedGroups],
    )
    courses = _to_frontend_courses(schedule, request.department, config)
    locked = [course.model_copy(update={"isLocked": True}) for course in request.locked_sessions]
    all_courses = locked + courses

    lecturer_hours: Counter[str] = Counter()
    for course in all_courses:
        if course.lecturer != "Atanmamış":
            duration = int(course.endTime.split(":")[0]) - int(course.startTime.split(":")[0])
            lecturer_hours[course.lecturer] += max(1, duration)

    warnings = [
        {
            "id": f"{violation.rule}-{index}",
            "severity": violation.severity,
            "message": violation.message,
            "courses": violation.courses,
        }
        for index, violation in enumerate(report.violations)
    ]
    if schedule.empty and not frame.empty:
        warnings.append(
            {
                "id": "solver-infeasible",
                "severity": "error",
                "message": "Kayıtlı veritabanı kısıtlarıyla uygun program bulunamadı.",
                "courses": [],
            }
        )

    return SchedulerResult(
        courses=all_courses,
        stats=ScheduleStats(
            executionTime=round(time.perf_counter() - started, 3),
            totalPlaced=len(all_courses),
            totalTasks=len(frame) + len(locked),
            conflictCount=sum(1 for warning in warnings if warning["severity"] == "error"),
            warnings=warnings,
            lecturerHours=dict(lecturer_hours),
            uniqueLecturers=sorted(lecturer_hours),
            roomsUsed=len({course.room for course in all_courses if course.room != "TBA"}),
            totalRooms=classroom_count(),
        ),
    )


def _empty_stats(started: float) -> ScheduleStats:
    return ScheduleStats(
        executionTime=round(time.perf_counter() - started, 3),
        totalPlaced=0,
        totalTasks=0,
        conflictCount=0,
        warnings=[],
        lecturerHours={},
        uniqueLecturers=[],
        roomsUsed=0,
        totalRooms=classroom_count(),
    )


def _departments_for_request(request: UniversitySchedulerRunRequest) -> list[str]:
    """Return only the department explicitly selected for this scheduler run."""
    if request.common_only:
        return []
    target = (request.selection_department or request.view_department).strip().upper()
    return [target] if target in DEPARTMENT_CODES else []


def run_university_scheduler(
    request: UniversitySchedulerRunRequest,
) -> UniversitySchedulerResult:
    """Run the two-phase algorithm for one selected department.

    Phase 1 schedules shared/service courses. Phase 2 solves only the selected
    department with phase-1 assignments pinned. Other department workbooks and
    persisted schedules are never read or changed by this request.
    """
    started = time.perf_counter()
    all_inputs = request.courses or list_algorithm_inputs()
    period_key = f"0000-0000|{request.term}"
    target_department = (
        request.selection_department or request.view_department or "HAVUZ"
    )
    bundle = get_constraint_bundle(period_key, target_department)
    common_bundle = (
        bundle
        if target_department == "HAVUZ"
        else get_constraint_bundle(period_key, "HAVUZ")
    )
    configured = _build_config(bundle)
    config = replace(
        configured,
        max_solve_time_seconds=min(configured.max_solve_time_seconds, 15),
        random_seed=23,
    )
    common_config = replace(config, enforce_semester_clash=False)
    room_capacities = classroom_capacities()
    metadata = {course.course_code: course for course in all_inputs}
    data_directory, suffix = _term_data_directory(request.term)
    common_frame = _common_rows_frame(
        request.common_rows,
        metadata,
        request.term,
    )
    common_schedule = pd.DataFrame()
    common_solver = None
    locked_common = (
        request.locked_common_courses
        if not request.common_only
        else []
    )
    warnings: list[dict] = []

    if common_frame.empty and request.common_only:
        empty_stats = _empty_stats(started)
        return UniversitySchedulerResult(
            courses=[],
            commonCourses=[],
            departmentSchedules={},
            generatedDepartments=[],
            stats=empty_stats.model_copy(update={
                "conflictCount": 1,
                "warnings": [{
                    "id": "common-upload-required",
                    "severity": "error",
                    "message": "Seçilen dönem için ortak ders Excel dosyası yüklenmelidir.",
                    "courses": [],
                }],
            }),
        )

    if not common_frame.empty and not locked_common:
        common_solver = OptiSchedSolver(
            common_frame,
            common_config,
            time_constraints=_solver_constraints(common_bundle, common_config),
            linked_groups=[group.courseCodes for group in common_bundle.linkedGroups],
            room_capacities=room_capacities,
        )
        common_solver.build_model()
        common_schedule = common_solver.solve()
        if common_schedule.empty:
            empty_stats = _empty_stats(started)
            return UniversitySchedulerResult(
                courses=[],
                commonCourses=[],
                departmentSchedules={},
                generatedDepartments=[],
                stats=empty_stats.model_copy(update={
                    "conflictCount": 1,
                    "warnings": [{
                        "id": "common-infeasible",
                        "severity": "error",
                        "message": "Ortak ders aşaması için uygun program bulunamadı.",
                        "courses": [],
                    }],
                }),
            )
        common_report = validate_schedule(
            common_frame,
            common_solver.get_index_assignments(),
            check_semester=False,
            linked_groups=[group.courseCodes for group in common_bundle.linkedGroups],
        )
        warnings.extend(
            {
                "id": f"common-{item.rule}-{index}",
                "severity": item.severity,
                "message": item.message,
                "courses": item.courses,
            }
            for index, item in enumerate(common_report.violations)
        )

    common_courses = (
        [course.model_copy(update={"isLocked": False}) for course in locked_common]
        if locked_common
        else _to_frontend_courses(common_schedule, "HAVUZ", config)
    )
    department_schedules: dict[str, list[ScheduledCourse]] = {}
    instructor_busy = (
        _scheduled_instructor_busy(locked_common, config)
        if locked_common
        else _instructor_slots(
            common_frame,
            common_solver.get_index_assignments() if common_solver else {},
        )
    )
    room_busy_requirements = (
        _scheduled_room_requirements(locked_common, config)
        if locked_common
        else _frame_room_requirements(
            common_frame,
            common_solver.get_index_assignments() if common_solver else {},
        )
    )
    global_frames: list[pd.DataFrame] = (
        [common_schedule.copy()] if not common_schedule.empty else []
    )
    total_tasks = len(locked_common) if locked_common else len(common_frame)

    departments_to_generate = _departments_for_request(request)
    for department in departments_to_generate:
        department_path = data_directory / f"{department}_{suffix}.xlsx"
        if not department_path.exists():
            continue
        allowed_codes = None
        if (
            department == request.selection_department
            and request.selected_course_codes
        ):
            allowed_codes = {
                code.strip().upper()
                for code in request.selected_course_codes
                if code.strip()
            }
        own_frame = _workbook_frame(
            department_path,
            department,
            metadata,
            request.term,
            allowed_codes,
            bundle.splits,
        )
        if own_frame.empty:
            continue
        own_frame = _normalize_overloaded_mandatory(own_frame, config)
        frame = own_frame.reset_index(drop=True)
        total_tasks += len(frame)
        solver = OptiSchedSolver(
            frame,
            config,
            instructor_busy=instructor_busy,
            time_constraints=_solver_constraints(bundle, config),
            linked_groups=[group.courseCodes for group in bundle.linkedGroups],
            room_capacities=room_capacities,
            room_busy_requirements=room_busy_requirements,
        )
        solver.build_model()
        schedule = solver.solve()
        if schedule.empty:
            warnings.append({
                "id": f"{department}-infeasible",
                "severity": "error",
                "message": f"{department} bölümü için uygun program bulunamadı.",
                "courses": [],
            })
            continue

        report = validate_schedule(
            frame,
            solver.get_index_assignments(),
            linked_groups=[group.courseCodes for group in bundle.linkedGroups],
        )
        warnings.extend(
            {
                "id": f"{department}-{item.rule}-{index}",
                "severity": item.severity,
                "message": f"{department}: {item.message}",
                "courses": item.courses,
            }
            for index, item in enumerate(report.violations)
        )

        solved_busy = _instructor_slots(
            frame,
            solver.get_index_assignments(),
            department=department,
        )
        for instructor, slots in solved_busy.items():
            instructor_busy[instructor].update(slots)
        _merge_room_requirements(
            room_busy_requirements,
            _frame_room_requirements(frame, solver.get_index_assignments()),
        )

        schedule = schedule.copy()
        schedule["department_name"] = department
        global_frames.append(schedule)
        department_schedules[department] = _to_frontend_courses(
            schedule,
            department,
            config,
        )

    if global_frames:
        global_schedule = pd.concat(global_frames, ignore_index=True)
        warnings.extend(
            {
                "id": f"global-{item.rule}-{index}",
                "severity": item.severity,
                "message": item.message,
                "courses": item.courses,
            }
            for index, item in enumerate(validate_global_instructor(global_schedule))
        )

    if request.view_department == "HAVUZ":
        view_courses = common_courses
    else:
        view_department = (
            request.view_department
            if request.view_department in department_schedules
            else next(iter(department_schedules), "")
        )
        view_courses = department_schedules.get(view_department, common_courses)
    all_courses = common_courses + [
        course
        for courses in department_schedules.values()
        for course in courses
    ]
    lecturer_hours: Counter[str] = Counter()
    for course in all_courses:
        if course.lecturer != "Atanmamış":
            lecturer_hours[course.lecturer] += max(
                1,
                int(course.endTime[:2]) - int(course.startTime[:2]),
            )

    return UniversitySchedulerResult(
        courses=view_courses,
        commonCourses=common_courses,
        departmentSchedules=department_schedules,
        generatedDepartments=list(department_schedules),
        stats=ScheduleStats(
            executionTime=round(time.perf_counter() - started, 3),
            totalPlaced=len(all_courses),
            totalTasks=total_tasks,
            conflictCount=sum(
                1 for warning in warnings if warning["severity"] == "error"
            ),
            warnings=warnings,
            lecturerHours=dict(lecturer_hours),
            uniqueLecturers=sorted(lecturer_hours),
            roomsUsed=0,
            totalRooms=classroom_count(),
        ),
    )
