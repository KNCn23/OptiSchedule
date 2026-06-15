CREATE TABLE IF NOT EXISTS classroom_reservations (
    reservation_id BIGSERIAL PRIMARY KEY,
    classroom_id INTEGER NOT NULL REFERENCES classrooms(classroom_id),
    reservation_date DATE NOT NULL,
    time_slots TEXT[] NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(user_id),
    course_code VARCHAR(50),
    instructor_name VARCHAR(200),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT classroom_reservations_slots_not_empty
        CHECK (cardinality(time_slots) > 0)
);

CREATE INDEX IF NOT EXISTS idx_classroom_reservations_lookup
    ON classroom_reservations(classroom_id, reservation_date);

CREATE INDEX IF NOT EXISTS idx_classroom_reservations_user
    ON classroom_reservations(created_by, reservation_date);
