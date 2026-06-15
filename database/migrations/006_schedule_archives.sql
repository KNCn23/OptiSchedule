BEGIN;

CREATE TABLE IF NOT EXISTS schedule_archives (
    archive_id      BIGSERIAL PRIMARY KEY,
    period_id       BIGINT NOT NULL REFERENCES academic_periods(period_id) ON DELETE CASCADE,
    schedules       JSONB NOT NULL,
    created_by      BIGINT REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_archives_period_created
    ON schedule_archives(period_id, created_at DESC);

COMMIT;
