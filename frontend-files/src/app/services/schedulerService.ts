/**
 * ─── schedulerService ───────────────────────────────────────────────────────
 * Wraps backend scheduler endpoints. SchedulerContext is the only consumer.
 *
 * Expected backend endpoints:
 *   GET  /api/scheduler/inputs
 *        → AlgorithmInput[]   (curriculum + current section counts)
 *
 *   POST /api/scheduler/run
 *        body: { courses: AlgorithmInput[], term: 'fall' | 'spring' }
 *        → SchedulerResult    (placed Course[] + ScheduleStats)
 *
 *   PUT  /api/scheduler/inputs/:code
 *        body: Partial<AlgorithmInput>
 *        → AlgorithmInput     (update section count, name, lecturer)
 *
 * Publishing/reading built timetables lives in services/scheduleStore
 * (/scheduler/common · /scheduler/dept · /scheduler/linked). The backend owns
 * the actual CSP/heuristic solver; the frontend just shows what it returns.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type {
  AlgorithmInput,
  CommonWorkbookRow,
  ConstraintBundle,
  LinkedCourseGroup,
  SchedulerConstraint,
  SchedulerResult,
  TermType,
  UniversitySchedulerResult,
} from '@/app/features/scheduler/types/schedulerTypes';
import type { Course } from '@/app/data/mockData';
import { request, DEMO_MODE } from '@/app/services/apiClient';
import { DEMO_ALGORITHM_INPUTS, runDemoScheduler } from '@/app/services/demoData';

export const DEFAULT_CONSTRAINT_SETTINGS: ConstraintBundle['settings'] = {
  activeDays: [0, 1, 2, 3, 4],
  daytimeSlots: [0, 1, 2, 3, 4, 5, 6, 7],
  onlineSlots: [8, 9, 10, 11],
  lunchSlots: [3],
  enforceLunchBreak: false,
  timeMap: {
    0: '09:00-10:00', 1: '10:00-11:00', 2: '11:00-12:00', 3: '12:00-13:00',
    4: '13:00-14:00', 5: '14:00-15:00', 6: '15:00-16:00', 7: '16:00-17:00',
    8: '18:00-19:00', 9: '19:00-20:00', 10: '20:00-21:00', 11: '21:00-22:00',
  },
  maxSolveTimeSeconds: 60,
  maxConsecutiveHours: 5,
  weightAdjacentOverlap: 8,
  weightStudentGap: 0,
  weightLunch: 2,
  weightInstructorBalance: 1,
  excludedCoursePrefixes: ['GSB'],
};

export async function fetchConstraintBundle(
  periodKey: string,
  department: string,
): Promise<ConstraintBundle | null> {
  if (DEMO_MODE) return null;
  const query = new URLSearchParams({ periodKey, department: department || 'HAVUZ' });
  return request<ConstraintBundle>(`/scheduler/constraint-bundle?${query.toString()}`);
}

export async function saveConstraintBundle(bundle: ConstraintBundle): Promise<ConstraintBundle> {
  if (DEMO_MODE) return bundle;
  return request<ConstraintBundle>('/scheduler/constraint-bundle', {
    method: 'PUT',
    body: bundle,
  });
}

export async function fetchAlgorithmInputs(
  term: TermType = 'spring',
  department = 'BİL',
): Promise<AlgorithmInput[]> {
  if (DEMO_MODE) return DEMO_ALGORITHM_INPUTS.map(c => ({ ...c }));
  const params = new URLSearchParams({ term, department: department || 'BİL' });
  return request<AlgorithmInput[]>(`/scheduler/inputs?${params.toString()}`);
}

export async function fetchLinkableInputs(
  term: TermType = 'spring',
): Promise<AlgorithmInput[]> {
  if (DEMO_MODE) return DEMO_ALGORITHM_INPUTS.map(c => ({ ...c }));
  const params = new URLSearchParams({ term });
  return request<AlgorithmInput[]>(`/scheduler/linkable-inputs?${params.toString()}`);
}

export async function runScheduler(
  courses: AlgorithmInput[],
  term: TermType,
  linkedGroups: LinkedCourseGroup[] = [],
  constraints: SchedulerConstraint[] = [],
  splits: Record<string, string[]> = {},
  locked: Course[] = [],
  systemRules: Record<string, boolean> = {},
  periodKey = '0000-0000|spring',
  department = 'HAVUZ',
): Promise<SchedulerResult> {
  if (DEMO_MODE) return runDemoScheduler(courses, term, locked, systemRules);
  return request<SchedulerResult>('/scheduler/run', {
    method: 'POST',
    body: {
      courses,
      term,
      period_key: periodKey,
      department: department || 'HAVUZ',
      // Pre-published shared/pool ("Ortak Dersler") sessions to schedule around.
      locked_sessions: locked,
    },
  });
}

export async function runUniversityScheduler(
  courses: AlgorithmInput[],
  commonRows: CommonWorkbookRow[],
  term: TermType,
  viewDepartment = 'BİL',
  commonOnly = false,
  selectedCourseCodes: string[] = [],
  lockedCommonCourses: Course[] = [],
): Promise<UniversitySchedulerResult> {
  if (DEMO_MODE) {
    const demo = runDemoScheduler(courses, term, [], {});
    return {
      ...demo,
      commonCourses: [],
      departmentSchedules: { [viewDepartment]: demo.courses },
      generatedDepartments: [viewDepartment],
    };
  }
  return request<UniversitySchedulerResult>('/scheduler/run-university', {
    method: 'POST',
    body: {
      courses,
      common_rows: commonRows,
      term,
      view_department: viewDepartment || 'BİL',
      common_only: commonOnly,
      selected_course_codes: selectedCourseCodes,
      selection_department: viewDepartment || 'BİL',
      locked_common_courses: lockedCommonCourses,
    },
  });
}

export async function updateAlgorithmInput(
  code: string,
  patch: Partial<AlgorithmInput>,
): Promise<AlgorithmInput> {
  if (DEMO_MODE) return { course_code: code, ...patch } as AlgorithmInput;
  return request<AlgorithmInput>(`/scheduler/inputs/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: patch,
  });
}

// NOTE: publishing a built timetable is done by persisting it through
// services/scheduleStore (saveCommon / saveDept) — those writes ARE the publish
// (PUT /scheduler/common · /scheduler/dept). There is no separate publish call.
