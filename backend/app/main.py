from __future__ import annotations

from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg2 import Error as DatabaseError

from .auth import authenticate, create_access_token, current_account, optional_account
from .constraint_repository import get_constraint_bundle, save_constraint_bundle
from .course_repository import create_algorithm_input, list_algorithm_inputs, list_courses
from .models import (
    Account,
    AlgorithmInput,
    CommonScheduleWrite,
    ConstraintBundle,
    DepartmentScheduleWrite,
    LinkedCourseGroup,
    LinkedGroupsWrite,
    LoginRequest,
    LoginResponse,
    Reservation,
    ReservationWrite,
    Room,
    ScheduleArchive,
    SchedulerResult,
    SchedulerRunRequest,
    UniversitySchedulerResult,
    UniversitySchedulerRunRequest,
)
from .reservation_repository import (
    create_reservation,
    delete_reservation,
    list_reservations,
    list_rooms,
    room_availability,
)
from .schedule_repository import (
    archive_schedules,
    delete_schedules,
    get_department_schedules,
    get_linked_groups,
    get_schedule,
    list_schedule_archives,
    save_schedule,
)
from .scheduler_adapter import (
    enrich_algorithm_inputs,
    linkable_algorithm_inputs,
    run_scheduler,
    run_university_scheduler,
)
from .settings import settings


app = FastAPI(title="OptiSched API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DatabaseError)
async def database_error_handler(_, exc: DatabaseError):
    return JSONResponse(
        status_code=503,
        content={"message": f"Database error: {exc}"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
def login(request: LoginRequest):
    account = authenticate(request.username, request.password)
    if account is None:
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya parola hatalı.")
    return LoginResponse(account=account, token=create_access_token(account))


@app.get("/api/auth/me", response_model=Account)
def me(account: Account = Depends(current_account)):
    return account


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout():
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/courses")
def courses():
    return list_courses()


@app.get("/api/rooms", response_model=list[Room])
def rooms():
    return list_rooms()


@app.get("/api/rooms/availability")
def rooms_availability(
    date_: date = Query(alias="date"),
    timeSlots: str = "",
    roomType: str = "all",
    minCapacity: int = 0,
):
    slots = [slot for slot in timeSlots.split(",") if slot]
    return room_availability(date_, slots, roomType, minCapacity)


@app.get("/api/reservations", response_model=list[Reservation])
def reservations(
    userId: int | None = None,
    _: Account = Depends(current_account),
):
    return list_reservations(userId)


@app.post("/api/reservations", response_model=Reservation)
def add_reservation(
    body: ReservationWrite,
    account: Account = Depends(current_account),
):
    return create_reservation(body, account)


@app.delete("/api/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_reservation(
    reservation_id: int,
    account: Account = Depends(current_account),
):
    if not delete_reservation(reservation_id, account):
        raise HTTPException(status_code=404, detail="Rezervasyon bulunamadı.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/scheduler/inputs")
def scheduler_inputs(
    term: str = Query(default="spring", pattern="^(fall|spring)$"),
    department: str = "BİL",
):
    return enrich_algorithm_inputs(
        list_algorithm_inputs(),
        term,
        department,
    )


@app.get("/api/scheduler/linkable-inputs")
def scheduler_linkable_inputs(
    term: str = Query(default="spring", pattern="^(fall|spring)$"),
):
    return linkable_algorithm_inputs(list_algorithm_inputs(), term)


@app.post("/api/scheduler/inputs", response_model=AlgorithmInput)
def add_scheduler_input(
    item: AlgorithmInput,
    _: Account = Depends(current_account),
):
    return create_algorithm_input(item)


@app.get("/api/scheduler/common")
def common_schedule(key: str):
    return get_schedule(key, "HAVUZ")


@app.put("/api/scheduler/common", status_code=status.HTTP_204_NO_CONTENT)
def update_common_schedule(
    body: CommonScheduleWrite,
    account: Account = Depends(current_account),
):
    save_schedule(body.key, "HAVUZ", body.courses, account.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/scheduler/dept")
def department_schedules(key: str):
    return get_department_schedules(key)


@app.put("/api/scheduler/dept", status_code=status.HTTP_204_NO_CONTENT)
def update_department_schedule(
    body: DepartmentScheduleWrite,
    account: Account = Depends(current_account),
):
    save_schedule(body.key, body.department, body.courses, account.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/api/scheduler/published", status_code=status.HTTP_204_NO_CONTENT)
def remove_published_schedules(
    key: str,
    account: Account = Depends(current_account),
):
    if account.role not in ("admin", "dept_chair"):
        raise HTTPException(
            status_code=403,
            detail="Yayınlanmış programları silme yetkiniz bulunmuyor.",
        )
    delete_schedules(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/scheduler/archives", response_model=list[ScheduleArchive])
def schedule_archives(
    _: Account = Depends(current_account),
):
    return list_schedule_archives()


@app.post("/api/scheduler/archives", response_model=ScheduleArchive)
def create_schedule_archive(
    key: str,
    account: Account = Depends(current_account),
):
    try:
        return archive_schedules(key, account.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/scheduler/linked", response_model=list[LinkedCourseGroup])
def linked_groups(key: str):
    return get_linked_groups(key)


@app.put("/api/scheduler/linked", status_code=status.HTTP_204_NO_CONTENT)
def update_linked_groups(
    body: LinkedGroupsWrite,
    _: Account = Depends(current_account),
):
    _validate_linked_groups(body.key, body.groups)
    bundle = get_constraint_bundle(body.key, "HAVUZ")
    bundle.linkedGroups = body.groups
    save_constraint_bundle(bundle)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/scheduler/constraint-bundle", response_model=ConstraintBundle)
def constraint_bundle(
    period_key: str = Query(alias="periodKey"),
    department: str = "HAVUZ",
):
    return get_constraint_bundle(period_key, department)


@app.put("/api/scheduler/constraint-bundle", response_model=ConstraintBundle)
def update_constraint_bundle(bundle: ConstraintBundle):
    _validate_linked_groups(bundle.periodKey, bundle.linkedGroups)
    return save_constraint_bundle(bundle)


def _validate_linked_groups(
    period_key: str,
    groups: list[LinkedCourseGroup],
) -> None:
    term = period_key.split("|", 1)[1]
    linkable = {
        course.course_code.upper(): course
        for course in linkable_algorithm_inputs(list_algorithm_inputs(), term)
    }
    missing = sorted({
        code.upper()
        for group in groups
        for code in group.courseCodes
        if code.upper() not in linkable
    })
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Ortak yürütülecek dersler seçili dönemin Excel dosyalarında "
                f"bulunamadı: {', '.join(missing)}"
            ),
        )
    for group in groups:
        courses = [linkable[code.upper()] for code in group.courseCodes]
        if len({course.section_count for course in courses}) > 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ortak yürütülecek derslerin şube sayıları aynı olmalıdır: "
                    f"{', '.join(group.courseCodes)}"
                ),
            )
        if len({course.weekly_hours for course in courses}) > 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ortak yürütülecek derslerin haftalık saatleri aynı olmalıdır: "
                    f"{', '.join(group.courseCodes)}"
                ),
            )


@app.post("/api/scheduler/run", response_model=SchedulerResult)
def scheduler_run(request: SchedulerRunRequest):
    return run_scheduler(request)


@app.post("/api/scheduler/run-university", response_model=UniversitySchedulerResult)
def scheduler_run_university(
    request: UniversitySchedulerRunRequest,
    account: Account | None = Depends(optional_account),
):
    result = run_university_scheduler(request)
    period_key = f"0000-0000|{request.term}"
    updated_by = account.user_id if account else None
    save_schedule(
        period_key,
        "HAVUZ",
        [course.model_dump() for course in result.commonCourses],
        updated_by,
    )
    for department, courses in result.departmentSchedules.items():
        save_schedule(
            period_key,
            department,
            [course.model_dump() for course in courses],
            updated_by,
        )
    return result
