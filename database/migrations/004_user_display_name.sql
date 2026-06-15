BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(200);

UPDATE users
SET full_name = username
WHERE full_name IS NULL OR btrim(full_name) = '';

ALTER TABLE users
    ALTER COLUMN full_name SET NOT NULL;

COMMIT;
