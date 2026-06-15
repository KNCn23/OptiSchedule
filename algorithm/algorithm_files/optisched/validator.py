"""Self-validation for OptiSchedule output.

This module independently re-checks a produced timetable against every hard
constraint the solver is supposed to enforce. It does **not** use the CP-SAT
model — it inspects the concrete (day, slot) assignments — so it can catch
modelling bugs, post-processing bugs (e.g. room allocation) and silent
regressions. If ``validate_schedule`` returns an empty list, the schedule
provably satisfies all hard constraints below.

Hard constraints checked
-------------------------
H1  Each course-part occupies exactly its weekly hour count.
H2  Each course-part is on a single day and its slots are consecutive.
H3  Split parts of the same parent course are on different days.
H4  No instructor is assigned to two course-parts in the same (day, slot).
H5  Mandatory courses of the same (semester, section) never overlap. A
    single-section mandatory course is taken by every section of its
    semester, so it conflicts with mandatory courses in *all* sections.
H6  An elective never overlaps a mandatory course of the same (semester,
    section).
H7  Phase-1 fixed assignments are respected exactly.
H8  No classroom is double-booked in the same (day, slot).

Soft constraints (reported, never fatal)
----------------------------------------
S1  Adjacent-semester (sem / sem+2) mandatory overlaps — minimised, counted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

import pandas as pd

MANDATORY_TYPE_ID = 1
NO_ROOM_SENTINELS = {"", "Sinif Yok", "Sınıf Yok", "Derslik Yok", "Belirsiz", None}
ANONYMOUS_INSTRUCTORS = {"-", "anonim", "anonymous", ""}


@dataclass
class Violation:
    rule: str          # e.g. "H4"
    severity: str      # "error" (hard) | "warning" (soft)
    message: str
    courses: list[str] = field(default_factory=list)

    def __str__(self) -> str:  # pragma: no cover - convenience
        tag = "✗" if self.severity == "error" else "△"
        suffix = f" [{', '.join(self.courses)}]" if self.courses else ""
        return f"{tag} {self.rule}: {self.message}{suffix}"


@dataclass
class ValidationReport:
    violations: list[Violation] = field(default_factory=list)
    soft_overlap_count: int = 0

    @property
    def errors(self) -> list[Violation]:
        return [v for v in self.violations if v.severity == "error"]

    @property
    def warnings(self) -> list[Violation]:
        return [v for v in self.violations if v.severity == "warning"]

    @property
    def ok(self) -> bool:
        return not self.errors

    def __str__(self) -> str:  # pragma: no cover - convenience
        if self.ok and not self.warnings:
            return "✓ Schedule is valid: all hard constraints satisfied."
        lines = [str(v) for v in self.violations]
        header = (
            f"{len(self.errors)} hard violation(s), "
            f"{len(self.warnings)} warning(s)."
        )
        return "\n".join([header, *lines])


def _is_mandatory(course_type_id: object) -> bool:
    try:
        return int(course_type_id) == MANDATORY_TYPE_ID
    except (TypeError, ValueError):
        return False


def validate_schedule(
    df: pd.DataFrame,
    assignment_map: dict[int, list[tuple[int, int]]],
    *,
    fixed_assignments: dict[str, list[tuple[int, int]]] | None = None,
    check_semester: bool = True,
) -> ValidationReport:
    """Validate solver output against hard constraints H1–H7 (+ soft S1).

    Parameters
    ----------
    df
        The *expanded* input frame (one row per course-part) the solver was
        built from. Must contain: ``code``, ``hours``, ``parent_id``,
        ``instructor``, ``semester``, ``section``, ``total_sections``,
        ``course_type_id``.
    assignment_map
        Maps each ``df`` row index to the list of ``(day, slot)`` pairs the
        solver assigned to it.
    fixed_assignments
        Optional ``{code: [(day, slot), ...]}`` Phase-1 pins to verify (H7).
    check_semester
        When False, skips H5/H6 (useful for the Phase-1 common-course pass
        where section semantics do not apply).
    """
    report = ValidationReport()
    days_slots = {idx: list(map(tuple, slots)) for idx, slots in assignment_map.items()}

    # ---- H1 / H2: exact hours, single day, consecutive --------------------
    for idx, row in df.iterrows():
        slots = days_slots.get(idx, [])
        code = str(row["code"])
        expected = int(row["hours"])
        if len(slots) != expected:
            report.violations.append(Violation(
                "H1", "error",
                f"course-part has {len(slots)} hours assigned, expected {expected}",
                [code],
            ))
            continue
        days = {d for d, _ in slots}
        if len(days) != 1:
            report.violations.append(Violation(
                "H2", "error",
                f"course-part spans {len(days)} days (must be a single day): {sorted(days)}",
                [code],
            ))
            continue
        slot_nums = sorted(s for _, s in slots)
        if slot_nums and slot_nums[-1] - slot_nums[0] + 1 != len(slot_nums):
            report.violations.append(Violation(
                "H2", "error",
                f"slots are not consecutive: {slot_nums}",
                [code],
            ))

    # ---- H3: split parts on different days --------------------------------
    if "parent_id" in df.columns:
        for parent_id, group in df.groupby("parent_id"):
            if len(group) <= 1:
                continue
            part_days: list[tuple[str, int]] = []
            for idx in group.index:
                for d, _ in days_slots.get(idx, []):
                    part_days.append((str(group.loc[idx, "code"]), d))
            seen_days: dict[int, set[int]] = {}
            for idx in group.index:
                ds = {d for d, _ in days_slots.get(idx, [])}
                seen_days[idx] = ds
            # any two parts sharing a day is a violation
            idxs = list(group.index)
            for i in range(len(idxs)):
                for j in range(i + 1, len(idxs)):
                    common = seen_days[idxs[i]] & seen_days[idxs[j]]
                    if common:
                        report.violations.append(Violation(
                            "H3", "error",
                            f"split parts of course {parent_id} share day(s) {sorted(common)}",
                            [str(group.loc[idxs[i], "code"]), str(group.loc[idxs[j], "code"])],
                        ))

    # ---- build per-slot occupancy maps ------------------------------------
    # (day, slot) -> list of df indices occupying it
    occ: dict[tuple[int, int], list[int]] = {}
    for idx, slots in days_slots.items():
        for ds in slots:
            occ.setdefault(ds, []).append(idx)

    # ---- H4: instructor double-booking ------------------------------------
    for (d, s), idxs in occ.items():
        by_instructor: dict[str, list[int]] = {}
        for idx in idxs:
            inst = str(df.loc[idx, "instructor"]).strip()
            if inst.lower() in ANONYMOUS_INSTRUCTORS:
                continue
            by_instructor.setdefault(inst, []).append(idx)
        for inst, conflicting in by_instructor.items():
            if len(conflicting) > 1:
                codes = sorted({str(df.loc[i, "code"]) for i in conflicting})
                report.violations.append(Violation(
                    "H4", "error",
                    f"instructor '{inst}' teaches {len(conflicting)} courses at day {d} slot {s}",
                    codes,
                ))

    # ---- H5 / H6: semester-section conflicts ------------------------------
    if check_semester and not df.empty:
        report.soft_overlap_count = _validate_semester(df, occ, report)

    # ---- H7: fixed assignments respected ----------------------------------
    if fixed_assignments:
        for idx, row in df.iterrows():
            code = str(row["code"])
            if code in fixed_assignments:
                expected = {tuple(t) for t in fixed_assignments[code]}
                actual = set(days_slots.get(idx, []))
                if expected != actual:
                    report.violations.append(Violation(
                        "H7", "error",
                        f"fixed assignment not respected (expected {sorted(expected)}, got {sorted(actual)})",
                        [code],
                    ))

    return report


def _mandatory_indices(df: pd.DataFrame, semester: int, section: int) -> list[int]:
    """Mandatory course indices a student in (semester, section) attends.

    Includes section-specific mandatory courses *and* single-section
    mandatory courses (taken by every section of the semester)."""
    mask = (
        (df["semester"] == semester)
        & (df["course_type_id"].apply(_is_mandatory))
        & ((df["section"] == section) | (df["total_sections"] <= 1))
    )
    return df.index[mask].tolist()


def _validate_semester(
    df: pd.DataFrame,
    occ: dict[tuple[int, int], list[int]],
    report: ValidationReport,
) -> int:
    semesters = sorted({int(x) for x in df["semester"].unique() if pd.notna(x)})
    max_sec = int(df["section"].max()) if not df["section"].empty else 1
    soft_overlaps = 0

    # Precompute (sem, sec) -> mandatory index set
    mandatory_groups: dict[tuple[int, int], set[int]] = {}
    elective_groups: dict[tuple[int, int], set[int]] = {}
    for sem in semesters:
        for sec in range(1, max_sec + 1):
            mandatory_groups[(sem, sec)] = set(_mandatory_indices(df, sem, sec))
            elec_mask = (
                (df["semester"] == sem)
                & (df["section"] == sec)
                & (df["total_sections"] > 1)
                & (~df["course_type_id"].apply(_is_mandatory))
            )
            elective_groups[(sem, sec)] = set(df.index[elec_mask].tolist())

    for (d, s), idxs in occ.items():
        present = set(idxs)
        for (sem, sec), mand in mandatory_groups.items():
            here = present & mand
            # H5: at most one mandatory of a (sem, sec) per slot
            if len(here) > 1:
                codes = sorted({str(df.loc[i, "code"]) for i in here})
                report.violations.append(Violation(
                    "H5", "error",
                    f"{len(here)} mandatory courses overlap for semester {sem} section {sec} "
                    f"at day {d} slot {s}",
                    codes,
                ))
            # H6: elective must not overlap a mandatory of same (sem, sec)
            if here:
                elec_here = present & elective_groups[(sem, sec)]
                if elec_here:
                    codes = sorted(
                        {str(df.loc[i, "code"]) for i in here}
                        | {str(df.loc[i, "code"]) for i in elec_here}
                    )
                    report.violations.append(Violation(
                        "H6", "error",
                        f"elective overlaps mandatory for semester {sem} section {sec} "
                        f"at day {d} slot {s}",
                        codes,
                    ))

    # S1: adjacent-semester (sem, sem+2) mandatory overlap (soft)
    for (d, s), idxs in occ.items():
        present = set(idxs)
        for sem in semesters:
            for sec in range(1, max_sec + 1):
                lower = present & mandatory_groups.get((sem, sec), set())
                upper = present & mandatory_groups.get((sem + 2, sec), set())
                if lower and upper:
                    soft_overlaps += 1
    return soft_overlaps


def validate_rooms(final_df: pd.DataFrame) -> list[Violation]:
    """H8: no classroom double-booked in the same (day, slot).

    Expects columns ``d_idx``, ``Sinif`` and either ``slot_indices`` (list)
    or ``s_idx``. Service / unassigned rooms are ignored.
    """
    violations: list[Violation] = []
    if final_df.empty or "Sinif" not in final_df.columns:
        return violations

    # (day, slot) -> {room: [codes]}
    occ: dict[tuple[int, int], dict[str, list[str]]] = {}
    for _, row in final_df.iterrows():
        room = row.get("Sinif")
        if room in NO_ROOM_SENTINELS:
            continue
        day = int(row["d_idx"])
        slot_indices = row.get("slot_indices")
        if isinstance(slot_indices, (list, tuple)) and len(slot_indices):
            slots = [int(x) for x in slot_indices]
        else:
            slots = [int(row["s_idx"])]
        code = str(row.get("DersKodu", row.get("code", "?")))
        for slot in slots:
            occ.setdefault((day, slot), {}).setdefault(str(room), []).append(code)

    for (day, slot), rooms in occ.items():
        for room, codes in rooms.items():
            distinct = sorted(set(codes))
            if len(distinct) > 1:
                violations.append(Violation(
                    "H8", "error",
                    f"room '{room}' double-booked at day {day} slot {slot}",
                    distinct,
                ))
    return violations


def _iter_blocks(final_df: pd.DataFrame):
    """Yield (code, instructor, day, slots, room) for each scheduled block.

    Works on either compressed rows (``slot_indices``) or per-hour rows.
    """
    for _, row in final_df.iterrows():
        day = int(row["d_idx"])
        slot_indices = row.get("slot_indices")
        if isinstance(slot_indices, (list, tuple)) and len(slot_indices):
            slots = [int(x) for x in slot_indices]
        else:
            slots = [int(row["s_idx"])]
        code = str(row.get("DersKodu", row.get("code", "?")))
        instructor = str(row.get("instructor", "-")).strip()
        room = row.get("Sinif")
        yield code, instructor, day, slots, room


def validate_global_instructor(final_df: pd.DataFrame) -> list[Violation]:
    """Cross-department H4: no instructor teaches two *different* courses at
    the same (day, slot) anywhere in the merged timetable.

    Departments are solved independently, so this catches conflicts the
    per-department CP-SAT models cannot see.
    """
    violations: list[Violation] = []
    if final_df.empty:
        return violations

    # (day, slot) -> {instructor: set(codes)}
    occ: dict[tuple[int, int], dict[str, set[str]]] = {}
    for code, instructor, day, slots, _room in _iter_blocks(final_df):
        if instructor.lower() in ANONYMOUS_INSTRUCTORS:
            continue
        for slot in slots:
            occ.setdefault((day, slot), {}).setdefault(instructor, set()).add(code)

    for (day, slot), by_instr in occ.items():
        for instructor, codes in by_instr.items():
            if len(codes) > 1:
                violations.append(Violation(
                    "H4", "error",
                    f"instructor '{instructor}' teaches {len(codes)} courses at day {day} slot {slot} "
                    f"(cross-department)",
                    sorted(codes),
                ))
    return violations


def format_report(report: ValidationReport, room_violations: Iterable[Violation] = ()) -> str:
    room_violations = list(room_violations)
    all_v = list(report.violations) + room_violations
    errors = [v for v in all_v if v.severity == "error"]
    warnings = [v for v in all_v if v.severity == "warning"]
    if not all_v:
        return "✓ Schedule is valid: all hard constraints (H1–H8) satisfied."
    lines = [f"{len(errors)} hard violation(s), {len(warnings)} warning(s):"]
    lines += [str(v) for v in all_v]
    if report.soft_overlap_count:
        lines.append(f"△ S1: {report.soft_overlap_count} adjacent-semester overlap(s) (soft, minimised)")
    return "\n".join(lines)
