import type { CourseRow } from '@/app/types/backendTypes';

/**
 * ─── DbCourse ───────────────────────────────────────────────────────────────
 * The course catalog row as returned by GET /api/courses.
 *
 * Extends the backend `Courses` table (see backendTypes.ts → CourseRow) with the
 * department fields the catalog joins in from Course_Departments → Departments
 * for display and filtering. Field names match the DB columns exactly.
 * ────────────────────────────────────────────────────────────────────────────
 */
export interface DbCourse extends CourseRow {
  /** Joined from Course_Departments → Departments. Optional for service courses. */
  department_id?: number;
  department_name?: string;
}
