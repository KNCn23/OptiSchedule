# OptiSched Database Extensions

The existing university schema remains the source for courses, sections,
instructors, departments, and classrooms.

`migrations/001_scheduler_constraints.sql` adds period-scoped scheduler
configuration and constraints without dropping or rewriting existing tables.

Apply it with:

```bash
psql "$DATABASE_URL" -f database/migrations/001_scheduler_constraints.sql
```

The migration stores:

- calendar and slot configuration
- solver timeout and soft-constraint weights
- default rule toggles
- instructor unavailable slots
- fixed and blocked course slots
- course split preferences
- period-wide linked course groups
- common and department schedules as JSONB documents

`department_code = 'HAVUZ'` represents the shared/common schedule scope.
The existing normalized `schedules` tables remain untouched.
