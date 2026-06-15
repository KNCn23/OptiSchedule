BEGIN;

ALTER TABLE scheduler_constraint_sets
    ADD COLUMN IF NOT EXISTS enforce_lunch_break BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
