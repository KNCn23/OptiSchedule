# OptiSched

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![OR-Tools](https://img.shields.io/badge/OR--Tools-CP--SAT-4285F4?logo=google&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

> **Constraint-programming course scheduler for a 12-department engineering faculty** — an OR-Tools CP-SAT solver, FastAPI backend, React UI and PostgreSQL turning term workbooks into a conflict-free weekly timetable.

Course-timetabling and classroom-reservation system for a university engineering
faculty with 12 departments. It takes the term's course workbooks, instructor
availabilities and room data and builds a conflict-free weekly timetable with an
OR-Tools CP-SAT solver. Everything is editable from a web UI and stored in
PostgreSQL.

## What it does

- **Two-phase scheduling.** The shared/common (`ORTAK`) courses are solved and
  pinned first. Each of the 12 departments is then solved in turn against those
  fixed slots, with every instructor's busy slots carried forward so nobody is
  booked in two places at once. If a lock would make a department infeasible it
  is relaxed automatically, and any leftover clash is reported instead of hidden.
- **Independent validation.** After the solver returns, a separate validator
  re-checks the timetable against the hard constraints, so a solver mistake
  can't pass silently.
- **Editable constraints.** A constraint wizard in the UI controls calendar
  slots, solver weights, rule toggles, instructor availability, fixed/blocked
  slots, course split patterns and linked course groups. The full bundle is
  saved to PostgreSQL before each run, and the solver uses only the persisted
  rules.
- **Classroom reservations and academic views** alongside the scheduler.
- **Offline demo mode** in the frontend when no backend URL is configured.

## Architecture

| Layer | Stack | Notes |
|---|---|---|
| `frontend-files/` | React 18, Vite, TypeScript, Tailwind | Login, admin dashboard + constraint wizard, course catalog, classroom reservation, academic view. Talks to the API through `apiClient.ts`. |
| `backend/` | FastAPI | PostgreSQL is the source of truth. SHA-256 password hashing with HMAC-signed bearer tokens. `scheduler_adapter.py` bridges the API and the solver. |
| `algorithm/shared/optisched_core/` | Python, OR-Tools CP-SAT | Pure solver core: `solver.py`, `config.py`, `validator.py`, `room_allocator.py`, `postprocess.py`, `matrix_export.py`. |
| `database/migrations/` | SQL | Additive, idempotent migrations (`001`–`007`) layered on the existing university schema. Re-runnable. |

Term workbooks live under `real_deal_database/{GÜZ,BAHAR}/`; the shared scope uses
the `HAVUZ`/`ORTAK` department code.

## Tech stack

Python 3.12 · FastAPI · Google OR-Tools (CP-SAT) · PostgreSQL 16 · React 18 ·
Vite · TypeScript · Tailwind CSS

## Getting started

Requirements: Python 3.12, Node.js, PostgreSQL 16.

### 1. Database

Create a database and apply the migrations in order:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/optisched"
for f in database/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Migrations are idempotent and never drop existing university tables.

### 2. Backend

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/optisched"
PYTHONPATH=. uvicorn backend.app.main:app --reload --port 8000
```

API docs are then served at <http://127.0.0.1:8000/docs>.

### 3. Frontend

```bash
cd frontend-files
cp .env.example .env        # VITE_API_BASE_URL defaults to http://127.0.0.1:8000/api
npm install
npm run dev
```

The app runs at <http://localhost:5173>.

## Tests

```bash
PYTHONPATH=. .venv/bin/python -m unittest backend.tests.test_solver_constraints -v
npm --prefix frontend-files run check
```

Database-backed tests need a migrated database:

```bash
RUN_DB_TESTS=1 DATABASE_URL="$DATABASE_URL" PYTHONPATH=. \
  .venv/bin/python -m unittest backend.tests.test_constraint_repository -v
```

## Project layout

```
backend/                            FastAPI app, repositories, auth, scheduler adapter
algorithm/shared/optisched_core/    OR-Tools CP-SAT solver core
algorithm/algorithm_files/          original standalone solver prototype (CLI)
frontend-files/                     React + Vite client
database/migrations/                additive SQL migrations (001-007)
real_deal_database/                 term course workbooks and reference tables
docs/                               documentation
scripts/                            helper scripts
```

## License

Released under the MIT License — see [LICENSE](LICENSE).
