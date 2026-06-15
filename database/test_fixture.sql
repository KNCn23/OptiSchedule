CREATE TABLE IF NOT EXISTS courses (
    course_id BIGINT PRIMARY KEY,
    course_code VARCHAR(32) UNIQUE NOT NULL,
    course_name VARCHAR(160) NOT NULL,
    weekly_hours INTEGER NOT NULL,
    course_semester INTEGER NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    is_service BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS instructors (
    instructor_id BIGINT PRIMARY KEY,
    full_name VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
    section_id BIGINT PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(course_id),
    section_number INTEGER NOT NULL,
    instructor_id BIGINT REFERENCES instructors(instructor_id)
);

CREATE TABLE IF NOT EXISTS classrooms (
    classroom_id BIGINT PRIMARY KEY,
    classroom_name VARCHAR(32) NOT NULL,
    lecture_capacity INTEGER NOT NULL
);

INSERT INTO instructors(instructor_id, full_name)
VALUES (1, 'Instructor A'), (2, 'Instructor B')
ON CONFLICT (instructor_id) DO NOTHING;

INSERT INTO courses(
    course_id, course_code, course_name, weekly_hours,
    course_semester, is_online, is_service
)
VALUES
    (1, 'BIL101', 'Programming I', 2, 1, FALSE, FALSE),
    (2, 'CSE101', 'Computer Programming I', 2, 1, FALSE, FALSE)
ON CONFLICT (course_id) DO NOTHING;

INSERT INTO sections(section_id, course_id, section_number, instructor_id)
VALUES (1, 1, 1, 1), (2, 2, 1, 2)
ON CONFLICT (section_id) DO NOTHING;

INSERT INTO classrooms(classroom_id, classroom_name, lecture_capacity)
VALUES (1, 'F101', 60)
ON CONFLICT (classroom_id) DO NOTHING;
