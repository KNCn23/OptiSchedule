from __future__ import annotations

import uuid

from psycopg2.extras import Json

from .db import connection
from .models import (
    ConstraintBundle,
    ConstraintSettings,
    DEFAULT_RULES,
    LinkedCourseGroup,
    TimeConstraint,
)


def _period_parts(period_key: str) -> tuple[str, str]:
    year_label, term = period_key.split("|", 1)
    return year_label, term


def _ensure_period(cur, period_key: str) -> int:
    year_label, term = _period_parts(period_key)
    cur.execute(
        """
        INSERT INTO academic_periods(year_label, term)
        VALUES (%s, %s)
        ON CONFLICT (year_label, term)
        DO UPDATE SET year_label = EXCLUDED.year_label
        RETURNING period_id
        """,
        (year_label, term),
    )
    return int(cur.fetchone()[0])


def _ensure_set(cur, period_id: int, department: str) -> int:
    cur.execute(
        """
        INSERT INTO scheduler_constraint_sets(period_id, department_code)
        VALUES (%s, %s)
        ON CONFLICT (period_id, department_code)
        DO UPDATE SET department_code = EXCLUDED.department_code
        RETURNING constraint_set_id
        """,
        (period_id, department or "HAVUZ"),
    )
    constraint_set_id = int(cur.fetchone()[0])
    cur.executemany(
        """
        INSERT INTO scheduler_system_rules(constraint_set_id, rule_key, enabled)
        VALUES (%s, %s, %s)
        ON CONFLICT (constraint_set_id, rule_key) DO NOTHING
        """,
        [
            (constraint_set_id, key, enabled)
            for key, enabled in DEFAULT_RULES.items()
        ],
    )
    return constraint_set_id


def get_constraint_bundle(period_key: str, department: str) -> ConstraintBundle:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
            set_id = _ensure_set(cur, period_id, department)

            cur.execute(
                """
                SELECT active_days, daytime_slots, online_slots, lunch_slots,
                       enforce_lunch_break, time_map, max_solve_time_seconds,
                       max_consecutive_hours,
                       weight_adjacent_overlap, weight_student_gap, weight_lunch,
                       weight_instructor_balance, excluded_course_prefixes
                FROM scheduler_constraint_sets
                WHERE constraint_set_id = %s
                """,
                (set_id,),
            )
            row = cur.fetchone()
            settings = ConstraintSettings(
                activeDays=list(row[0]),
                daytimeSlots=list(row[1]),
                onlineSlots=list(row[2]),
                lunchSlots=list(row[3]),
                enforceLunchBreak=bool(row[4]),
                timeMap={str(key): value for key, value in row[5].items()},
                maxSolveTimeSeconds=float(row[6]),
                maxConsecutiveHours=int(row[7]),
                weightAdjacentOverlap=int(row[8]),
                weightStudentGap=int(row[9]),
                weightLunch=int(row[10]),
                weightInstructorBalance=int(row[11]),
                excludedCoursePrefixes=list(row[12]),
            )

            cur.execute(
                "SELECT rule_key, enabled FROM scheduler_system_rules WHERE constraint_set_id = %s",
                (set_id,),
            )
            rules = DEFAULT_RULES.copy()
            rules.update({key: enabled for key, enabled in cur.fetchall()})

            cur.execute(
                """
                SELECT constraint_id, constraint_type, target, day_key, hour
                FROM scheduler_time_constraints
                WHERE constraint_set_id = %s
                ORDER BY constraint_id
                """,
                (set_id,),
            )
            constraints = [
                TimeConstraint(
                    id=str(row[0]),
                    type=row[1],
                    target=row[2],
                    day=row[3],
                    hour=row[4],
                )
                for row in cur.fetchall()
            ]

            cur.execute(
                """
                SELECT course_code, split_pattern
                FROM scheduler_course_split_preferences
                WHERE constraint_set_id = %s
                ORDER BY course_code, preference_order, split_pattern
                """,
                (set_id,),
            )
            splits: dict[str, list[str]] = {}
            for code, pattern in cur.fetchall():
                splits.setdefault(code, []).append(pattern)

            cur.execute(
                """
                SELECT g.group_id, array_agg(c.course_code ORDER BY c.course_code)
                FROM linked_course_groups g
                JOIN linked_group_courses c ON c.group_id = g.group_id
                WHERE g.period_id = %s
                GROUP BY g.group_id
                ORDER BY g.group_id
                """,
                (period_id,),
            )
            linked = [
                LinkedCourseGroup(id=str(group_id), courseCodes=list(codes))
                for group_id, codes in cur.fetchall()
            ]

    return ConstraintBundle(
        periodKey=period_key,
        department=department or "HAVUZ",
        settings=settings,
        systemRules=rules,
        constraints=constraints,
        linkedGroups=linked,
        splits=splits,
    )


def save_constraint_bundle(bundle: ConstraintBundle) -> ConstraintBundle:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, bundle.periodKey)
            set_id = _ensure_set(cur, period_id, bundle.department)
            settings = bundle.settings
            cur.execute(
                """
                UPDATE scheduler_constraint_sets
                SET active_days = %s,
                    daytime_slots = %s,
                    online_slots = %s,
                    lunch_slots = %s,
                    enforce_lunch_break = %s,
                    time_map = %s,
                    max_solve_time_seconds = %s,
                    max_consecutive_hours = %s,
                    weight_adjacent_overlap = %s,
                    weight_student_gap = %s,
                    weight_lunch = %s,
                    weight_instructor_balance = %s,
                    excluded_course_prefixes = %s
                WHERE constraint_set_id = %s
                """,
                (
                    settings.activeDays,
                    settings.daytimeSlots,
                    settings.onlineSlots,
                    settings.lunchSlots,
                    settings.enforceLunchBreak,
                    Json(settings.timeMap),
                    settings.maxSolveTimeSeconds,
                    settings.maxConsecutiveHours,
                    settings.weightAdjacentOverlap,
                    settings.weightStudentGap,
                    settings.weightLunch,
                    settings.weightInstructorBalance,
                    settings.excludedCoursePrefixes,
                    set_id,
                ),
            )

            cur.execute(
                "DELETE FROM scheduler_system_rules WHERE constraint_set_id = %s",
                (set_id,),
            )
            rules = DEFAULT_RULES.copy()
            rules.update(bundle.systemRules)
            cur.executemany(
                """
                INSERT INTO scheduler_system_rules(constraint_set_id, rule_key, enabled)
                VALUES (%s, %s, %s)
                """,
                [(set_id, key, enabled) for key, enabled in rules.items()],
            )

            cur.execute(
                "DELETE FROM scheduler_time_constraints WHERE constraint_set_id = %s",
                (set_id,),
            )
            cur.executemany(
                """
                INSERT INTO scheduler_time_constraints(
                    constraint_set_id, constraint_type, target, day_key, hour
                ) VALUES (%s, %s, %s, %s, %s)
                """,
                [
                    (set_id, item.type, item.target, item.day, item.hour)
                    for item in bundle.constraints
                ],
            )

            cur.execute(
                "DELETE FROM scheduler_course_split_preferences WHERE constraint_set_id = %s",
                (set_id,),
            )
            split_rows = [
                (set_id, course_code, pattern, order)
                for course_code, patterns in bundle.splits.items()
                for order, pattern in enumerate(patterns)
            ]
            if split_rows:
                cur.executemany(
                    """
                    INSERT INTO scheduler_course_split_preferences(
                        constraint_set_id, course_code, split_pattern, preference_order
                    ) VALUES (%s, %s, %s, %s)
                    """,
                    split_rows,
                )

            cur.execute(
                "DELETE FROM linked_course_groups WHERE period_id = %s",
                (period_id,),
            )
            for group in bundle.linkedGroups:
                try:
                    group_id = uuid.UUID(group.id)
                except ValueError:
                    group_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{bundle.periodKey}:{group.id}")
                cur.execute(
                    "INSERT INTO linked_course_groups(group_id, period_id) VALUES (%s, %s)",
                    (str(group_id), period_id),
                )
                cur.executemany(
                    "INSERT INTO linked_group_courses(group_id, course_code) VALUES (%s, %s)",
                    [(str(group_id), code) for code in group.courseCodes],
                )

    return get_constraint_bundle(bundle.periodKey, bundle.department)
