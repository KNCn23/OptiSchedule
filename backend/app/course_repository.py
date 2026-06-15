from __future__ import annotations

from .db import connection
from .models import AlgorithmInput

DEPARTMENT_CODES = {
    "Bilgisayar Mühendisliği": "BİL",
    "Elektrik-Elektronik Mühendisliği": "EEM",
    "Endüstri Mühendisliği": "END",
    "Civil Engineering": "CE",
    "Biyomedikal Mühendisliği": "BME",
    "Makine Mühendisliği": "MAK",
    "Yapay Zeka Mühendisliği": "AI",
    "Computer Science and Engineering": "CSE",
    "Biomedical Engineering": "BENG",
    "Electrical and Electronics Engineering": "EEE",
    "Industrial Engineering": "IND",
    "Mechanical Engineering": "ME",
}


def list_algorithm_inputs() -> list[AlgorithmInput]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.course_id, c.course_code, c.course_name, c.weekly_hours,
                       COALESCE(c.t_hour, 0), COALESCE(c.l_hour, 0),
                       c.course_semester, c.is_online, c.is_service, c.is_common,
                       c.course_type_id, COALESCE(c.expected_student, 0),
                       GREATEST(COUNT(DISTINCT s.section_id), 1)::int AS section_count,
                       COALESCE(
                           MAX(i.full_name) FILTER (WHERE i.full_name IS NOT NULL),
                           'anonim'
                       ) AS instructor_full_name,
                       COALESCE(
                           array_agg(DISTINCT d.department_name)
                               FILTER (WHERE d.department_name IS NOT NULL),
                           ARRAY[]::varchar[]
                       ) AS department_names,
                       COALESCE(
                           array_agg(DISTINCT i.full_name)
                               FILTER (WHERE i.full_name IS NOT NULL),
                           ARRAY[]::varchar[]
                       ) AS section_instructors
                FROM courses c
                LEFT JOIN sections s ON s.course_id = c.course_id
                LEFT JOIN instructors i ON i.instructor_id = s.instructor_id
                LEFT JOIN course_departments cd ON cd.course_id = c.course_id
                LEFT JOIN departments d ON d.department_id = cd.department_id
                WHERE c.course_semester IS NOT NULL
                GROUP BY c.course_id
                ORDER BY c.course_code
                """
            )
            return [
                AlgorithmInput(
                    course_id=row[0],
                    course_code=row[1],
                    course_name=row[2],
                    weekly_hours=row[3],
                    t_hour=row[4],
                    l_hour=row[5],
                    course_semester=row[6],
                    is_online=row[7],
                    is_service=row[8],
                    is_common=row[9],
                    course_type_id=row[10],
                    expected_student=row[11],
                    section_count=row[12],
                    instructor_full_name=row[13],
                    department_codes=[
                        DEPARTMENT_CODES[name]
                        for name in row[14]
                        if name in DEPARTMENT_CODES
                    ],
                    section_instructors=list(row[15]),
                )
                for row in cur.fetchall()
            ]


def classroom_count() -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM classrooms")
            return int(cur.fetchone()[0])


def classroom_capacities() -> list[int]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT lecture_capacity
                FROM classrooms
                WHERE lecture_capacity > 0
                ORDER BY lecture_capacity
                """
            )
            return [int(row[0]) for row in cur.fetchall()]


def list_courses() -> list[dict]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.course_id, c.course_code, c.course_name, c.course_type_id,
                       c.course_semester, c.expected_student, c.is_online,
                       c.is_service, c.weekly_hours, c.t_hour, c.l_hour,
                       d.department_id, d.department_name
                FROM courses c
                LEFT JOIN course_departments cd ON cd.course_id = c.course_id
                LEFT JOIN departments d ON d.department_id = cd.department_id
                ORDER BY c.course_code, d.department_name
                """
            )
            columns = [item[0] for item in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]


def create_algorithm_input(item: AlgorithmInput) -> AlgorithmInput:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO courses(
                    course_code, course_name, course_type_id, course_semester,
                    expected_student, is_online, is_service, is_common,
                    weekly_hours, t_hour, l_hour
                )
                VALUES (%s, %s, 1, %s, 0, %s, %s, FALSE, %s, %s, %s)
                ON CONFLICT (course_code)
                DO UPDATE SET course_name = EXCLUDED.course_name,
                              course_semester = EXCLUDED.course_semester,
                              is_online = EXCLUDED.is_online,
                              is_service = EXCLUDED.is_service,
                              weekly_hours = EXCLUDED.weekly_hours,
                              t_hour = EXCLUDED.t_hour,
                              l_hour = EXCLUDED.l_hour
                RETURNING course_id
                """,
                (
                    item.course_code,
                    item.course_name,
                    item.course_semester,
                    item.is_online,
                    item.is_service,
                    item.t_hour + item.l_hour if item.t_hour + item.l_hour > 0 else item.weekly_hours,
                    item.t_hour if item.t_hour + item.l_hour > 0 else item.weekly_hours,
                    item.l_hour,
                ),
            )
            course_id = int(cur.fetchone()[0])
    return item.model_copy(update={"course_id": course_id})
