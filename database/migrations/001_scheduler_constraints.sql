BEGIN;

CREATE TABLE IF NOT EXISTS academic_periods (
    period_id      BIGSERIAL PRIMARY KEY,
    year_label     VARCHAR(9) NOT NULL,
    term           VARCHAR(6) NOT NULL CHECK (term IN ('fall', 'spring')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (year_label, term)
);

CREATE TABLE IF NOT EXISTS scheduler_constraint_sets (
    constraint_set_id            BIGSERIAL PRIMARY KEY,
    period_id                    BIGINT NOT NULL REFERENCES academic_periods(period_id) ON DELETE CASCADE,
    department_code              VARCHAR(20) NOT NULL DEFAULT 'HAVUZ',
    active_days                  SMALLINT[] NOT NULL DEFAULT ARRAY[0,1,2,3,4]::SMALLINT[],
    daytime_slots                SMALLINT[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6,7]::SMALLINT[],
    online_slots                 SMALLINT[] NOT NULL DEFAULT ARRAY[8,9,10,11]::SMALLINT[],
    lunch_slots                  SMALLINT[] NOT NULL DEFAULT ARRAY[3]::SMALLINT[],
    time_map                     JSONB NOT NULL DEFAULT '{
      "0":"09:00-10:00","1":"10:00-11:00","2":"11:00-12:00","3":"12:00-13:00",
      "4":"13:00-14:00","5":"14:00-15:00","6":"15:00-16:00","7":"16:00-17:00",
      "8":"18:00-19:00","9":"19:00-20:00","10":"20:00-21:00","11":"21:00-22:00"
    }'::JSONB,
    max_solve_time_seconds        NUMERIC(8,2) NOT NULL DEFAULT 60,
    max_consecutive_hours         SMALLINT NOT NULL DEFAULT 5 CHECK (max_consecutive_hours > 0),
    weight_adjacent_overlap       INTEGER NOT NULL DEFAULT 8 CHECK (weight_adjacent_overlap >= 0),
    weight_student_gap            INTEGER NOT NULL DEFAULT 0 CHECK (weight_student_gap >= 0),
    weight_lunch                  INTEGER NOT NULL DEFAULT 2 CHECK (weight_lunch >= 0),
    weight_instructor_balance     INTEGER NOT NULL DEFAULT 1 CHECK (weight_instructor_balance >= 0),
    excluded_course_prefixes      TEXT[] NOT NULL DEFAULT ARRAY['GSB']::TEXT[],
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (period_id, department_code)
);

CREATE TABLE IF NOT EXISTS scheduler_system_rules (
    constraint_set_id BIGINT NOT NULL REFERENCES scheduler_constraint_sets(constraint_set_id) ON DELETE CASCADE,
    rule_key          VARCHAR(40) NOT NULL CHECK (rule_key IN (
        'instructorClash', 'semesterClash', 'roomClash',
        'consecutiveLimit', 'onlineExemption', 'weeklyHours'
    )),
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (constraint_set_id, rule_key)
);

CREATE TABLE IF NOT EXISTS scheduler_time_constraints (
    constraint_id    BIGSERIAL PRIMARY KEY,
    constraint_set_id BIGINT NOT NULL REFERENCES scheduler_constraint_sets(constraint_set_id) ON DELETE CASCADE,
    constraint_type  VARCHAR(32) NOT NULL CHECK (constraint_type IN (
        'instructor_unavailable', 'course_fixed', 'course_blocked'
    )),
    target           VARCHAR(160) NOT NULL,
    day_key          VARCHAR(3) NOT NULL CHECK (day_key IN ('Mon','Tue','Wed','Thu','Fri')),
    hour             SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
    UNIQUE (constraint_set_id, constraint_type, target, day_key, hour)
);

CREATE TABLE IF NOT EXISTS scheduler_course_split_preferences (
    constraint_set_id BIGINT NOT NULL REFERENCES scheduler_constraint_sets(constraint_set_id) ON DELETE CASCADE,
    course_code       VARCHAR(32) NOT NULL,
    split_pattern     VARCHAR(32) NOT NULL,
    preference_order  SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (constraint_set_id, course_code, split_pattern)
);

CREATE TABLE IF NOT EXISTS linked_course_groups (
    group_id      UUID PRIMARY KEY,
    period_id     BIGINT NOT NULL REFERENCES academic_periods(period_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linked_group_courses (
    group_id      UUID NOT NULL REFERENCES linked_course_groups(group_id) ON DELETE CASCADE,
    course_code   VARCHAR(32) NOT NULL,
    PRIMARY KEY (group_id, course_code)
);

CREATE TABLE IF NOT EXISTS published_schedule_documents (
    document_id      BIGSERIAL PRIMARY KEY,
    period_id        BIGINT NOT NULL REFERENCES academic_periods(period_id) ON DELETE CASCADE,
    department_code  VARCHAR(20) NOT NULL,
    courses          JSONB NOT NULL DEFAULT '[]'::JSONB,
    updated_by       BIGINT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (period_id, department_code)
);

CREATE INDEX IF NOT EXISTS idx_constraint_sets_period_department
    ON scheduler_constraint_sets(period_id, department_code);
CREATE INDEX IF NOT EXISTS idx_time_constraints_set_target
    ON scheduler_time_constraints(constraint_set_id, target);
CREATE INDEX IF NOT EXISTS idx_linked_groups_period
    ON linked_course_groups(period_id);
CREATE INDEX IF NOT EXISTS idx_published_schedules_period
    ON published_schedule_documents(period_id);

CREATE OR REPLACE FUNCTION touch_scheduler_constraint_set()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_scheduler_constraint_set ON scheduler_constraint_sets;
CREATE TRIGGER trg_touch_scheduler_constraint_set
BEFORE UPDATE ON scheduler_constraint_sets
FOR EACH ROW EXECUTE FUNCTION touch_scheduler_constraint_set();

COMMIT;
