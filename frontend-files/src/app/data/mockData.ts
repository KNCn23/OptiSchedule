/**
 * ─── Course domain types + UI constants ─────────────────────────────────────
 * NOTE: Despite the filename, this file no longer holds mock data. All hand-made
 * records were removed for the backend handoff. What remains are TYPE contracts
 * (Course, Lecturer, DayKey, CourseType) and pure UI constants (DAYS,
 * DAY_LABELS, COURSE_COLORS) that the backend never provides. The `Course` shape
 * here is what POST /api/scheduler/run must return in its `courses[]`.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
export type CourseType = 'Lecture' | 'Lab' | 'Seminar' | 'Tutorial';

export interface Course {
  id: string;
  name: string;
  code: string;
  lecturer: string;
  lecturerId: string;
  department: string;
  classLevel: string;
  room: string;
  day: DayKey;
  startTime: string;
  endTime: string;
  studentsEnrolled: number;
  totalCapacity: number;
  colorIndex: number;
  type: CourseType;
  hasConflict?: boolean;
  conflictReason?: string;
  isPinned?: boolean;
  /** True for shared/pool ("Ortak Dersler") sessions inherited into a department
   *  schedule — shown but locked (non-draggable, treated as a fixed constraint). */
  isLocked?: boolean;
  courseSemester?: number;
  sectionNumber?: number;
  totalSections?: number;
  /** Department codes whose students take this shared/pool course. */
  audienceDepartments?: string[];
  /** Sections sharing this value are intentionally taught at the same time. */
  coScheduleGroup?: string;
}

export interface Lecturer {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
}

export const DAYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DAY_LABELS: Record<DayKey, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
};

export const COURSE_COLORS = [
  // Light palette retuned for the BUOBS / AdminLTE blue-heavy identity:
  // distinct AdminLTE state colors (skin-blue, aqua, green, yellow, purple,
  // navy, orange, maroon) softened to pastels so course cards stay readable.
  // Dark palette intentionally unchanged so dark mode keeps the OptiSched identity.
  { lightBg: '#D6E9F4', lightBorder: '#3C8DBC', lightText: '#1F4E68', darkBg: '#172554', darkBorder: '#3B82F6', darkText: '#93C5FD' },   // skin-blue (AdminLTE primary)
  { lightBg: '#DEF1F6', lightBorder: '#00C0EF', lightText: '#0B5460', darkBg: '#2E1065', darkBorder: '#7C3AED', darkText: '#C4B5FD' },   // aqua / cyan-info
  { lightBg: '#DCFCE7', lightBorder: '#00A65A', lightText: '#155724', darkBg: '#022C22', darkBorder: '#34D399', darkText: '#6EE7B7' },   // green / success
  { lightBg: '#FFF8DC', lightBorder: '#F39C12', lightText: '#856404', darkBg: '#451A03', darkBorder: '#F59E0B', darkText: '#FCD34D' },   // yellow / warning
  { lightBg: '#E7E5F6', lightBorder: '#605CA8', lightText: '#2D2A6B', darkBg: '#500724', darkBorder: '#EC4899', darkText: '#F9A8D4' },   // purple
  { lightBg: '#DDE5F0', lightBorder: '#001F3F', lightText: '#001F3F', darkBg: '#042F2E', darkBorder: '#14B8A6', darkText: '#5EEAD4' },   // navy
  { lightBg: '#FCE6CC', lightBorder: '#FF851B', lightText: '#7E3F0B', darkBg: '#1E1B4B', darkBorder: '#6366F1', darkText: '#A5B4FC' },   // orange
  { lightBg: '#FAD7DC', lightBorder: '#D81B60', lightText: '#66102E', darkBg: '#450A0A', darkBorder: '#F87171', darkText: '#FCA5A5' },   // maroon / pink
];

// NOTE: Hand-made reference lists (LECTURERS, DEPARTMENTS, CLASS_LEVELS) were
// removed for the backend handoff. Dropdowns derive their options from the
// loaded schedule (see DynamicFilters / useCourseFilters). When you need the
// full reference lists independent of the schedule, use lookupService
// (GET /api/departments, /api/lecturers, /api/class-levels).
