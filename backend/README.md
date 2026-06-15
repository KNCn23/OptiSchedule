# OptiSched Backend

This service makes PostgreSQL the source of truth for scheduler constraints and
runs the shared OR-Tools solver.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
for migration in ../database/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
cp .env.example .env
python run.py
```

## Constraint flow

1. The frontend loads `GET /api/scheduler/constraint-bundle`.
2. The wizard edits its local working copy.
3. Before scheduling, the frontend writes the complete bundle with `PUT`.
4. `POST /api/scheduler/run` reloads that bundle from PostgreSQL.
5. The solver uses only the persisted bundle for calendar settings, rule
   switches, unavailable/fixed/blocked slots, split preferences, and linked
   groups.

This write-then-read flow prevents browser state from silently diverging from
the constraints used by the algorithm.

`POST /api/scheduler/run-university` accepts only the selected term (`fall` or
`spring`) plus the department to display. It schedules the term's common
workbook first, then schedules all engineering department workbooks while
preserving common and cross-department instructor occupancy.

## API surface

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/courses`
- `GET|POST /api/scheduler/inputs`
- `GET|PUT /api/scheduler/common`
- `GET|PUT /api/scheduler/dept`
- `GET|PUT /api/scheduler/linked`
- `GET|PUT /api/scheduler/constraint-bundle`
- `POST /api/scheduler/run`
- `POST /api/scheduler/run-university`

Authentication validates the SHA-256 hashes already stored in `users`. Set a
long `APP_SECRET` outside development; it signs the bearer tokens.
