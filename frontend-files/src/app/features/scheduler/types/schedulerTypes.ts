/**
 * ─── Scheduler contract ─────────────────────────────────────────────────────
 * Shared between SchedulerContext / WeeklyGrid / StatusPanel and the backend
 * /api/scheduler endpoints. Backend mirrors these shapes 1:1.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Course } from '@/app/data/mockData';

/** Academic term selector. `fall` = odd semesters, `spring` = even semesters. */
export type TermType = 'fall' | 'spring';

/**
 * One course offering as fed into the scheduler. Field names mirror the backend
 * Courses + Sections columns (5may_db_nobugs.sql). `section_count` is the number
 * of parallel section rows the backend should create for this course (the admin
 * edits it via CourseManagementModal); the rest map 1:1 to DB columns.
 */
export interface AlgorithmInput {
  /** Courses.course_id */
  course_id: number;
  /** Courses.course_code, e.g. "BİL110". */
  course_code: string;
  /** Courses.course_name. */
  course_name: string;
  /** Courses.weekly_hours — total weekly hours. */
  weekly_hours: number;
  /** Theory and laboratory hours; scheduling total is their sum when present. */
  t_hour?: number;
  l_hour?: number;
  /** Courses.course_semester (1–8). */
  course_semester: number;
  /** Number of parallel sections (şube) → how many Sections rows to create. */
  section_count: number;
  /** Instructors.full_name. Use `"anonim"` for TBA / pool. */
  instructor_full_name: string;
  /** Courses.is_online */
  is_online: boolean;
  /** Courses.is_service */
  is_service: boolean;
  /** Courses.is_common: scheduled in phase 1 (pool). */
  is_common?: boolean;
  course_type_id?: number;
  expected_student?: number;
  /** Department codes joined through Course_Departments. */
  department_codes?: string[];
  /** Instructor per section, ordered by section number. */
  section_instructors?: string[];
}

export interface CommonWorkbookRow {
  course_code: string;
  course_name: string;
  section: number;
  credit: number;
  t_hour: number;
  l_hour: number;
  capacity: number;
  enrolled: number;
  instructor: string;
}

/** Single warning/conflict surfaced by the scheduler. */
export interface ScheduleWarning {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  /** Course ids involved in this warning. */
  courses: string[];
}

/** Aggregate statistics returned alongside the placed schedule. */
export interface ScheduleStats {
  /** Wall-clock time the backend took to compute, in seconds. */
  executionTime: number;
  totalPlaced: number;
  totalTasks: number;
  conflictCount: number;
  warnings: ScheduleWarning[];
  /** Per-lecturer total teaching hours in the week. */
  lecturerHours: Record<string, number>;
  /** Unique lecturer names that appear in the schedule (sorted). */
  uniqueLecturers: string[];
  /** Distinct rooms occupied by the schedule. */
  roomsUsed: number;
  /** Total rooms available in the building (for the X/Y display). */
  totalRooms: number;
}

/** A group of courses that must be scheduled at the same day/time slot. */
export interface LinkedCourseGroup {
  id: string;
  courseCodes: string[];
}

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
export type ConstraintType = 'instructor_unavailable' | 'course_fixed' | 'course_blocked';

export interface SchedulerConstraint {
  id: string;
  type: ConstraintType;
  /** instructor_full_name for instructor constraints, course_code for course constraints. */
  target: string;
  day: DayOfWeek;
  hour: number;
}

export interface ConstraintSettings {
  activeDays: number[];
  daytimeSlots: number[];
  onlineSlots: number[];
  lunchSlots: number[];
  enforceLunchBreak: boolean;
  timeMap: Record<string, string>;
  maxSolveTimeSeconds: number;
  maxConsecutiveHours: number;
  weightAdjacentOverlap: number;
  weightStudentGap: number;
  weightLunch: number;
  weightInstructorBalance: number;
  excludedCoursePrefixes: string[];
}

export interface ConstraintBundle {
  periodKey: string;
  department: string;
  settings: ConstraintSettings;
  systemRules: Record<string, boolean>;
  constraints: SchedulerConstraint[];
  linkedGroups: LinkedCourseGroup[];
  splits: Record<string, string[]>;
}

/** Full payload returned by POST /api/scheduler/run. */
export interface SchedulerResult {
  courses: Course[];
  stats: ScheduleStats;
}

export interface UniversitySchedulerResult extends SchedulerResult {
  commonCourses: Course[];
  departmentSchedules: Record<string, Course[]>;
  generatedDepartments: string[];
}
