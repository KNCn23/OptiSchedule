import type { DbCourse } from '@/app/features/courses/types/courseTypes';
import type { AlgorithmInput } from '@/app/features/scheduler/types/schedulerTypes';
import { request, DEMO_MODE } from '@/app/services/apiClient';
import { DEMO_DB_COURSES } from '@/app/services/demoData';

/**
 * ─── Course Service ─────────────────────────────────────────────────────────
 *
 * Fetches the course catalog from the backend.
 *
 * Expected backend endpoint:
 *   GET /api/courses → DbCourse[]
 *
 * The shape must match the `DbCourse` interface in types/courseTypes.ts.
 * ────────────────────────────────────────────────────────────────────────────
 */
export async function fetchCourseData(): Promise<DbCourse[]> {
  if (DEMO_MODE) {
    // Simulate a small network delay so loading skeletons are visible.
    await new Promise(r => setTimeout(r, 300));
    return DEMO_DB_COURSES.map(c => ({ ...c }));
  }
  return request<DbCourse[]>('/courses');
}

/**
 * Persist a user-added ("katalog dışı") course so it can be reused later.
 *
 * Expected backend endpoint:
 *   POST /api/scheduler/inputs  body: AlgorithmInput → AlgorithmInput
 *
 * In DEMO_MODE there is no backend, so the course is echoed back and the caller
 * keeps it in localStorage (the DB stand-in).
 */
export async function createCourse(input: AlgorithmInput): Promise<AlgorithmInput> {
  if (DEMO_MODE) return { ...input };
  return request<AlgorithmInput>('/scheduler/inputs', { method: 'POST', body: input });
}
