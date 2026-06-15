from __future__ import annotations

from psycopg2.extras import Json

from .constraint_repository import _ensure_period
from .course_filters import without_graduation_projects
from .db import connection
from .models import LinkedCourseGroup, ScheduleArchive


def get_schedule(period_key: str, department: str) -> list[dict]:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
            cur.execute(
                """
                SELECT courses
                FROM published_schedule_documents
                WHERE period_id = %s AND department_code = %s
                """,
                (period_id, department),
            )
            row = cur.fetchone()
    return without_graduation_projects(list(row[0])) if row else []


def save_schedule(
    period_key: str,
    department: str,
    courses: list[dict],
    user_id: int | None,
) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
            cur.execute(
                """
                INSERT INTO published_schedule_documents(
                    period_id, department_code, courses, updated_by
                )
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (period_id, department_code)
                DO UPDATE SET courses = EXCLUDED.courses,
                              updated_by = EXCLUDED.updated_by,
                              updated_at = now()
                """,
                (
                    period_id,
                    department,
                    Json(without_graduation_projects(courses)),
                    user_id,
                ),
            )


def delete_schedules(period_key: str) -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
            cur.execute(
                """
                DELETE FROM published_schedule_documents
                WHERE period_id = %s
                """,
                (period_id,),
            )
            return cur.rowcount


def archive_schedules(period_key: str, user_id: int | None) -> ScheduleArchive:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
            cur.execute(
                """
                SELECT department_code, courses
                FROM published_schedule_documents
                WHERE period_id = %s
                ORDER BY department_code
                """,
                (period_id,),
            )
            schedules = {
                department: without_graduation_projects(list(courses))
                for department, courses in cur.fetchall()
            }
            if not schedules:
                raise ValueError("Arşivlenecek aktif program bulunamadı.")
            cur.execute(
                """
                INSERT INTO schedule_archives(period_id, schedules, created_by)
                VALUES (%s, %s, %s)
                RETURNING archive_id, created_at
                """,
                (period_id, Json(schedules), user_id),
            )
            archive_id, created_at = cur.fetchone()
            username = None
            if user_id is not None:
                cur.execute(
                    "SELECT username FROM users WHERE user_id = %s",
                    (user_id,),
                )
                user_row = cur.fetchone()
                username = user_row[0] if user_row else None
    _, _, term = period_key.partition("|")
    return ScheduleArchive(
        archive_id=archive_id,
        period_key=period_key,
        term=term,
        schedules=schedules,
        created_by=username,
        created_at=created_at,
    )


def list_schedule_archives() -> list[ScheduleArchive]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.archive_id, p.year_label, p.term, a.schedules,
                       u.username, a.created_at
                FROM schedule_archives a
                JOIN academic_periods p ON p.period_id = a.period_id
                LEFT JOIN users u ON u.user_id = a.created_by
                ORDER BY a.created_at DESC
                """
            )
            rows = cur.fetchall()
    return [
        ScheduleArchive(
            archive_id=archive_id,
            period_key=f"{year_label}|{term}",
            term=term,
            schedules={
                department: without_graduation_projects(list(courses))
                for department, courses in dict(schedules).items()
            },
            created_by=username,
            created_at=created_at,
        )
        for archive_id, year_label, term, schedules, username, created_at in rows
    ]


def get_department_schedules(period_key: str) -> dict[str, list[dict]]:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
            cur.execute(
                """
                SELECT department_code, courses
                FROM published_schedule_documents
                WHERE period_id = %s AND department_code <> 'HAVUZ'
                ORDER BY department_code
                """,
                (period_id,),
            )
            rows = cur.fetchall()
    return {
        department: without_graduation_projects(list(courses))
        for department, courses in rows
    }


def get_linked_groups(period_key: str) -> list[LinkedCourseGroup]:
    with connection() as conn:
        with conn.cursor() as cur:
            period_id = _ensure_period(cur, period_key)
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
            rows = cur.fetchall()
    return [
        LinkedCourseGroup(id=str(group_id), courseCodes=list(codes))
        for group_id, codes in rows
    ]
