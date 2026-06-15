/**
 * ─── Backend DB-mirror types ────────────────────────────────────────────────
 * 1:1 mirror of the PostgreSQL schema in the backend repo
 * (KNCn23/OptiSchedule → 5may_db_nobugs.sql). Field names match the DB columns
 * EXACTLY so the API can serialize rows without renaming.
 *
 * These are the canonical contract. The app-facing types (DbCourse,
 * AlgorithmInput, Account) below/elsewhere are built from these.
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ── Lookup tables ─────────────────────────────────────────────────────────── */

/** Roles table: admin | dept_chair | instructor | secretary | viewer */
export interface Role {
  role_id: number;
  role_name: string;
}

/** Course_Types: Zorunlu, Teknik Seçmeli, Sosyal Seçmeli, ... */
export interface CourseTypeRef {
  course_type_id: number;
  course_type_name: string;
}

/** Classroom_Types: Derslik, Amfi, Laboratuvar */
export interface ClassroomTypeRef {
  classroom_type_id: number;
  classroom_type_name: string;
}

/* ── Core entities ─────────────────────────────────────────────────────────── */

export interface Department {
  department_id: number;
  department_name: string;
}

export interface Instructor {
  instructor_id: number;
  title: string | null;
  full_name: string;
  is_external: boolean;
}

export interface Classroom {
  classroom_id: number;
  classroom_name: string;
  classroom_type_id: number;
  lecture_capacity: number;
  exam_capacity: number | null;
  has_projector: boolean | null;
  has_tiered_base: boolean | null;
  has_lectern: boolean | null;
  computer_amount: number | null;
  class_name: string | null;
}

/** Courses table (mirrors columns incl. the ALTER-added t_hour / l_hour). */
export interface CourseRow {
  course_id: number;
  course_code: string;
  course_name: string;
  course_type_id: number;
  course_semester: number | null;
  expected_student: number | null;
  is_online: boolean;
  is_service: boolean;
  weekly_hours: number;
  t_hour: number;
  l_hour: number;
}

export interface Section {
  section_id: number;
  course_id: number;
  section_number: number;
  instructor_id: number | null;
  capacity: number;
}

/** Schedules table — the scheduler's persisted output (one row per placed block). */
export interface DbSchedule {
  schedule_id: number;
  section_id: number;
  classroom_id: number | null;
  day_of_week: string; // 'Monday' … 'Friday'
  start_time: string;  // 'HH:MM:SS'
  end_time: string;    // 'HH:MM:SS'
}

/** Users table (password_hash intentionally excluded from the frontend type). */
export interface DbUser {
  user_id: number;
  username: string;
  role_id: number;
  department_id: number | null;
}

/* ── Junctions ─────────────────────────────────────────────────────────────── */

export interface CourseDepartment {
  course_id: number;
  department_id: number;
}

export interface SectionDepartment {
  section_id: number;
  department_id: number;
}

export interface InstructorDepartment {
  instructor_id: number;
  department_id: number;
}

export interface ClassroomDepartment {
  classroom_id: number;
  department_id: number;
}
