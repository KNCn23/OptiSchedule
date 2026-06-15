from __future__ import annotations

from datetime import date
import re

from fastapi import HTTPException

from .db import connection
from .models import Account, Reservation, ReservationWrite, Room


ROOM_TYPE_MAP = {
    "derslik": "derslik",
    "amfi": "amfi",
    "laboratuvar": "laboratuvar",
}
DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _room_type(value: str) -> str:
    return ROOM_TYPE_MAP.get(value.strip().lower(), "derslik")


def _block_and_floor(name: str) -> tuple[str, int]:
    match = re.match(r"([A-Za-zÇĞİÖŞÜçğıöşü]+)[- ]?(\d)", name.strip())
    if not match:
        return (name[:1].upper() or "-", 0)
    return match.group(1).upper(), int(match.group(2))


def list_rooms() -> list[Room]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.classroom_name, c.lecture_capacity,
                       ct.classroom_type_name
                FROM classrooms c
                JOIN classroom_types ct
                  ON ct.classroom_type_id = c.classroom_type_id
                ORDER BY c.classroom_name
                """
            )
            rows = cur.fetchall()
    result: list[Room] = []
    for name, capacity, type_name in rows:
        block, floor = _block_and_floor(name)
        result.append(
            Room(
                roomCode=name,
                capacity=capacity,
                type=_room_type(type_name),
                block=block,
                floor=floor,
            )
        )
    return result


def _scheduled_busy_rooms(
    reservation_date: date,
    time_slots: list[str],
) -> set[str]:
    day = DAY_KEYS[reservation_date.weekday()]
    term = "spring" if reservation_date.month <= 8 else "fall"
    requested = {
        int(slot.split(":", 1)[0])
        for slot in time_slots
        if re.match(r"^\d{2}:\d{2}", slot)
    }
    if not requested:
        return set()

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT course
                FROM academic_periods ap
                JOIN published_schedule_documents psd
                  ON psd.period_id = ap.period_id
                CROSS JOIN LATERAL jsonb_array_elements(psd.courses) AS course
                WHERE ap.year_label = '0000-0000'
                  AND ap.term = %s
                  AND course->>'day' = %s
                  AND COALESCE(course->>'room', '') NOT IN ('', 'TBA')
                """,
                (term, day),
            )
            rows = cur.fetchall()

    busy: set[str] = set()
    for (course,) in rows:
        try:
            start = int(str(course["startTime"]).split(":", 1)[0])
            end = int(str(course["endTime"]).split(":", 1)[0])
        except (KeyError, TypeError, ValueError):
            continue
        if any(start <= hour < end for hour in requested):
            busy.add(str(course["room"]))
    return busy


def list_reservations(user_id: int | None = None) -> list[Reservation]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.reservation_id, c.classroom_name, r.reservation_date,
                       r.time_slots, u.user_id, u.username, roles.role_name,
                       r.created_at, c.lecture_capacity,
                       ct.classroom_type_name, r.course_code,
                       r.instructor_name, r.description
                FROM classroom_reservations r
                JOIN classrooms c ON c.classroom_id = r.classroom_id
                JOIN classroom_types ct
                  ON ct.classroom_type_id = c.classroom_type_id
                JOIN users u ON u.user_id = r.created_by
                JOIN roles ON roles.role_id = u.role_id
                WHERE (%s IS NULL OR u.user_id = %s)
                ORDER BY r.created_at DESC
                """,
                (user_id, user_id),
            )
            rows = cur.fetchall()
    return [
        Reservation(
            id=str(row[0]),
            roomCode=row[1],
            date=row[2],
            timeSlots=list(row[3]),
            userId=str(row[4]),
            userName=row[5],
            userRole=row[6],
            createdAt=row[7],
            roomCapacity=row[8],
            roomType=_room_type(row[9]),
            courseCode=row[10],
            instructorName=row[11],
            description=row[12],
        )
        for row in rows
    ]


def room_availability(
    reservation_date: date,
    time_slots: list[str],
    room_type: str,
    min_capacity: int,
) -> list[dict]:
    rooms = list_rooms()
    busy_scheduled = _scheduled_busy_rooms(reservation_date, time_slots)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT c.classroom_name
                FROM classroom_reservations r
                JOIN classrooms c ON c.classroom_id = r.classroom_id
                WHERE r.reservation_date = %s
                  AND r.time_slots && %s::text[]
                """,
                (reservation_date, time_slots),
            )
            busy_reserved = {row[0] for row in cur.fetchall()}

    return [
        {
            **room.model_dump(),
            "isAvailable": (
                room.roomCode not in busy_scheduled
                and room.roomCode not in busy_reserved
            ),
        }
        for room in rooms
        if room.capacity >= min_capacity
        and (room_type == "all" or room.type == room_type)
    ]


def create_reservation(
    body: ReservationWrite,
    account: Account,
) -> Reservation:
    time_slots = sorted(set(body.timeSlots))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.classroom_id, c.classroom_name, c.lecture_capacity,
                       ct.classroom_type_name
                FROM classrooms c
                JOIN classroom_types ct
                  ON ct.classroom_type_id = c.classroom_type_id
                WHERE c.classroom_name = %s
                """,
                (body.roomCode,),
            )
            room = cur.fetchone()
            if not room:
                raise HTTPException(status_code=404, detail="Derslik bulunamadı.")

            cur.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                (f"{body.roomCode}|{body.date.isoformat()}",),
            )
            cur.execute(
                """
                SELECT 1
                FROM classroom_reservations
                WHERE classroom_id = %s
                  AND reservation_date = %s
                  AND time_slots && %s::text[]
                LIMIT 1
                """,
                (room[0], body.date, time_slots),
            )
            if cur.fetchone() or body.roomCode in _scheduled_busy_rooms(
                body.date,
                time_slots,
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Bu derslik seçilen tarih ve saatte dolu.",
                )

            cur.execute(
                """
                INSERT INTO classroom_reservations(
                    classroom_id, reservation_date, time_slots, created_by,
                    course_code, instructor_name, description
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING reservation_id, created_at
                """,
                (
                    room[0],
                    body.date,
                    time_slots,
                    account.user_id,
                    body.courseCode,
                    body.instructorName,
                    body.description,
                ),
            )
            reservation_id, created_at = cur.fetchone()

    return Reservation(
        id=str(reservation_id),
        roomCode=room[1],
        date=body.date,
        timeSlots=time_slots,
        userId=str(account.user_id),
        userName=account.full_name,
        userRole=account.role,
        createdAt=created_at,
        roomCapacity=room[2],
        roomType=_room_type(room[3]),
        courseCode=body.courseCode,
        instructorName=body.instructorName,
        description=body.description,
    )


def delete_reservation(reservation_id: int, account: Account) -> bool:
    with connection() as conn:
        with conn.cursor() as cur:
            if account.role in ("admin", "dept_chair"):
                cur.execute(
                    "DELETE FROM classroom_reservations WHERE reservation_id = %s",
                    (reservation_id,),
                )
            else:
                cur.execute(
                    """
                    DELETE FROM classroom_reservations
                    WHERE reservation_id = %s AND created_by = %s
                    """,
                    (reservation_id, account.user_id),
                )
            return cur.rowcount > 0
