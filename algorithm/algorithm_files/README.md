# OptiSchedule

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Google OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-CP--SAT-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/optimization)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

A constraint programming-based university course scheduler built on Google OR-Tools CP-SAT. Resolves dozens of simultaneous constraints — lecturer conflicts, section overlaps, block durations, room capacities, and online course slots — to produce a conflict-free weekly timetable for an entire university.

---

## How It Works

OptiSchedule uses a **two-phase scheduling** strategy to manage complexity at scale:

```
Phase 1 — Shared Courses
  ① Shared/service courses (from Result_5.csv) → daytime slots, independent CP-SAT model
  ② Online courses (is_online = True)           → evening slots (18:00–22:00), separate model
  Both results saved as fixed_assignments

            ↓ fixed (day, slot) pairs

Phase 2 — Department Schedules
  Each department runs its own CP-SAT model.
  Phase 1 assignments enter as hard constraints;
  remaining courses fill available slots.
  Result → RoomAllocator → Excel export
```

This separation reduces solver complexity dramatically and guarantees cross-department consistency for shared courses.

---

## Constraints

**Hard constraints — never violated:**

| # | Constraint |
|---|-----------|
| 1 | Each course fills exactly its weekly hour count |
| 2 | All slots of a course are on the same day, consecutive |
| 3 | Split parts (e.g., 4h → [2+2]) land on different days |
| 4 | No lecturer teaches two courses at the same time |
| 5 | Mandatory courses in the same semester/section never overlap |
| 6 | Elective courses do not conflict with mandatory courses in the same semester |
| 7 | Phase 1 fixed slots are locked in Phase 2 |
| 8 | Face-to-face courses use daytime slots; online courses use evening slots |
| 9 | No lecturer teaches two courses at the same time **across departments** (departments are solved sequentially, propagating each lecturer's busy slots) |
| 10 | No classroom is double-booked at the same time (room allocation runs **once** over the merged, block-compressed timetable) |

> A single-section mandatory course is taken by **every** section of its
> semester, so it is protected against mandatory courses in all sections
> (constraint #5), not just its own.

**Soft constraint — minimized:**

| # | Constraint |
|---|-----------|
| 1 | Adjacent-semester overlap (e.g., Sem 1 and Sem 3) is minimized where possible |

**Excluded from scheduling:** courses whose code starts with `GSB` (Güzel
Sanatlar common electives) are dropped from both the inputs and the solver
(`EXCLUDED_COURSE_CODE_PREFIXES`).

---

## Self-Validation

After a timetable is produced, OptiSchedule independently re-checks it against
every hard constraint (H1–H8) — it inspects the concrete `(day, slot)`
assignments rather than trusting the model, so it catches modelling bugs,
room-allocation bugs and regressions. Violations are reported as warnings
(and surfaced in the API response: `stats.conflictCount`, `stats.warnings`,
and per-course `hasConflict` / `conflictReason`).

```bash
# Synthetic unit/regression + negative tests (no DB required)
python -m scheduler.self_test

# End-to-end run on the real CSV data via an in-memory SQLite DB
python -m scheduler.integration_test --term spring
```

The `scheduler.validator` module (`optisched.validator` in the standalone
package) exposes `validate_schedule`, `validate_rooms` and
`validate_global_instructor`.

---

## Course Block Splitting

| Total Hours | Split |
|-------------|-------|
| 1, 2, 3 | Single block |
| 4 | [2, 2] |
| 5 | [3, 2] |
| 6 | [3, 3] |

---

## Project Structure

```
OptiSchedule/
├── main.py                   — entry point
├── config.json               — time slots, day map, DB connection
├── Result_5.csv              — shared course code list
│
├── optisched/
│   ├── config.py             — SchedulerConfig dataclass
│   ├── data.py               — DBLoader: PostgreSQL + CSV ingestion
│   ├── model.py              — OptiSchedSolver: CP-SAT model and solver
│   ├── room_allocator.py     — greedy capacity-based room assignment
│   ├── export.py             — formatted Excel export
│   └── menu.py               — interactive terminal UI
│
└── output/                   — generated Excel schedules (gitignored)
```

---

## Setup

**Requirements:**

```bash
pip install ortools pandas openpyxl psycopg2-binary inquirer xlrd
```

**Database:**

OptiSchedule requires a PostgreSQL database with the following tables: `Courses`, `Departments`, `Classrooms`. Import the provided schema:

```bash
psql -U <user> -d <database> -f 5may_db_nobugs.sql
```

**Configuration** — edit `config.json`:

```json
{
    "days": [0, 1, 2, 3, 4],
    "day_map": {"0": "Monday", "1": "Tuesday", "2": "Wednesday", "3": "Thursday", "4": "Friday"},
    "timeslots": [0, 1, 2, 3, 4, 5, 6, 7],
    "online_timeslots": [8, 9, 10, 11],
    "time_map": {
        "0": "09:00-10:00", "1": "10:00-11:00", "2": "11:00-12:00",
        "3": "12:00-13:00", "4": "13:00-14:00", "5": "14:00-15:00",
        "6": "15:00-16:00", "7": "16:00-17:00",
        "8": "18:00-19:00", "9": "19:00-20:00",
        "10": "20:00-21:00", "11": "21:00-22:00"
    },
    "max_solve_time_seconds": 60.0,
    "db_config": {
        "dbname": "optisched",
        "user": "username",
        "password": "password",
        "host": "localhost",
        "port": "5432"
    }
}
```

**Input CSVs:**

- `the_table_that_algorithm.csv` — one row per course section with fields: `course_id`, `course_code`, `course_name`, `section_id`, `weekly_hours`, `capacity`, `instructor_full_name`, `is_online`, `is_service`
- `section_departments.csv` — section-to-department mapping
- `Result_5.csv` — list of course codes treated as shared/service courses

---

## Run

```bash
python main.py
```

Follow the interactive menu:

| Option | Action |
|--------|--------|
| 1 | Schedule shared courses (Phase 1) |
| 2 | Generate department schedules (Phase 2) |
| 3 | Display Phase 1 results in terminal |
| 4 | Export all schedules to Excel |
| 5 | Exit |

> Phase 1 must complete before running Phase 2.

---

## Output

Each department gets an Excel file in `output/` with a list view and a daily pivot grid (rows = time slots, columns = semesters). A shared `Ortak_Dersler_<term>.xlsx` covers all shared and online courses.

---

## License

[MIT](LICENSE)
