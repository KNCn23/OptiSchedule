BEGIN;

-- Some database snapshots already contain older scheduler tables with the
-- same names but a different shape. Preserve those rows and free the canonical
-- names for the backend schema used by this project.
DO $$
BEGIN
    IF to_regclass('public.scheduler_system_rules') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'scheduler_system_rules'
             AND column_name = 'constraint_set_id'
       )
       AND to_regclass('public.scheduler_system_rules_legacy') IS NULL
    THEN
        ALTER TABLE scheduler_system_rules
            RENAME TO scheduler_system_rules_legacy;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS scheduler_system_rules (
    constraint_set_id BIGINT NOT NULL
        REFERENCES scheduler_constraint_sets(constraint_set_id) ON DELETE CASCADE,
    rule_key VARCHAR(40) NOT NULL CHECK (rule_key IN (
        'instructorClash', 'semesterClash', 'roomClash',
        'consecutiveLimit', 'onlineExemption', 'weeklyHours'
    )),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT scheduler_system_rules_current_pkey
        PRIMARY KEY (constraint_set_id, rule_key)
);

DO $$
DECLARE
    group_id_type TEXT;
BEGIN
    SELECT data_type
    INTO group_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'linked_course_groups'
      AND column_name = 'group_id';

    IF group_id_type IS NOT NULL
       AND group_id_type <> 'uuid'
       AND to_regclass('public.linked_course_groups_legacy') IS NULL
    THEN
        IF to_regclass('public.linked_group_courses') IS NOT NULL
           AND to_regclass('public.linked_group_courses_legacy') IS NULL
        THEN
            ALTER TABLE linked_group_courses
                RENAME TO linked_group_courses_legacy;
        END IF;

        ALTER TABLE linked_course_groups
            RENAME TO linked_course_groups_legacy;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS linked_course_groups (
    group_id UUID NOT NULL,
    period_id BIGINT NOT NULL
        REFERENCES academic_periods(period_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT linked_course_groups_current_pkey PRIMARY KEY (group_id)
);

CREATE TABLE IF NOT EXISTS linked_group_courses (
    group_id UUID NOT NULL
        REFERENCES linked_course_groups(group_id) ON DELETE CASCADE,
    course_code VARCHAR(32) NOT NULL,
    CONSTRAINT linked_group_courses_current_pkey
        PRIMARY KEY (group_id, course_code)
);

CREATE INDEX IF NOT EXISTS idx_linked_groups_current_period
    ON linked_course_groups(period_id);

COMMIT;
