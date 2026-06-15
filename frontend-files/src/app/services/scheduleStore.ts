/**
 * ─── scheduleStore ──────────────────────────────────────────────────────────
 * Single persistence layer for every SHARED schedule artefact: the dean's
 * published common ("Ortak Dersler") schedule, each department's published
 * schedule, the global classroom assignment, co-taught (linked) groups and
 * user-added ("katalog dışı") courses.
 *
 * Every function follows the same `DEMO_MODE ? localStorage : request(...)`
 * pattern used across the services folder, so the whole app is fully usable
 * without a backend AND becomes backend-driven the moment VITE_API_BASE_URL is
 * set — no call sites change.
 *
 * `key` everywhere is the academic period: `${yearStart}-${yearEnd}|${term}`
 * (e.g. "0000-0000|spring"; the year component is an internal placeholder).
 *
 * Expected backend endpoints (backend devs implement these; shapes below):
 *   GET  /scheduler/common?key=…                 → Course[]
 *   PUT  /scheduler/common                       body { key, courses }      → void
 *   GET  /scheduler/dept?key=…                   → Record<deptCode, Course[]>
 *   PUT  /scheduler/dept                         body { key, department, courses } → void
 *   GET  /scheduler/linked?key=…                 → LinkedCourseGroup[]
 *   PUT  /scheduler/linked                       body { key, groups }       → void
 *   GET  /scheduler/inputs/custom                → AlgorithmInput[]   (user-added courses)
 *
 * Note: in DEMO_MODE these read/write the same localStorage keys the app has
 * always used, so existing demo data keeps working unchanged.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Course } from '@/app/data/mockData';
import type { AlgorithmInput, LinkedCourseGroup } from '@/app/features/scheduler/types/schedulerTypes';
import { request, DEMO_MODE } from '@/app/services/apiClient';

const COMMON_KEY = 'pf_common_schedules';
const DEPT_KEY = 'pf_dept_schedules';
const LINKED_KEY = 'pf_linked_groups';
const CUSTOM_KEY = 'pf_custom_courses';
const ARCHIVE_KEY = 'pf_schedule_archives';

export interface ScheduleArchive {
  archive_id: number;
  period_key: string;
  term: 'fall' | 'spring';
  schedules: Record<string, Course[]>;
  created_by?: string | null;
  created_at: string;
}

/* ── localStorage helpers (DEMO_MODE implementation) ─────────────────────────── */

function readMap<T>(storageKey: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
}
function writeMap(storageKey: string, value: unknown): void {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* ignore quota */ }
}

/* ── Common ("Ortak Dersler") schedule ───────────────────────────────────────── */

export async function getCommon(key: string): Promise<Course[]> {
  if (DEMO_MODE) return readMap<Course[]>(COMMON_KEY)[key] ?? [];
  return request<Course[]>(`/scheduler/common?key=${encodeURIComponent(key)}`);
}

export async function saveCommon(key: string, courses: Course[]): Promise<void> {
  if (DEMO_MODE) {
    const map = readMap<Course[]>(COMMON_KEY);
    map[key] = courses;
    writeMap(COMMON_KEY, map);
    return;
  }
  await request<void>('/scheduler/common', { method: 'PUT', body: { key, courses } });
}

/* ── Per-department published schedules ──────────────────────────────────────── */

export async function getDeptSchedules(key: string): Promise<Record<string, Course[]>> {
  if (DEMO_MODE) {
    // Demo stores all departments under one map keyed by `${key}|${dept}`.
    const all = readMap<Course[]>(DEPT_KEY);
    const prefix = `${key}|`;
    const out: Record<string, Course[]> = {};
    for (const k of Object.keys(all)) {
      if (k.startsWith(prefix)) out[k.slice(prefix.length)] = all[k];
    }
    return out;
  }
  return request<Record<string, Course[]>>(`/scheduler/dept?key=${encodeURIComponent(key)}`);
}

export async function saveDept(key: string, department: string, courses: Course[]): Promise<void> {
  if (DEMO_MODE) {
    const all = readMap<Course[]>(DEPT_KEY);
    all[`${key}|${department}`] = courses;
    writeMap(DEPT_KEY, all);
    return;
  }
  await request<void>('/scheduler/dept', { method: 'PUT', body: { key, department, courses } });
}

/** Delete every published schedule for one academic period (pool + departments). */
export async function deletePublishedSchedules(key: string): Promise<void> {
  if (DEMO_MODE) {
    const common = readMap<Course[]>(COMMON_KEY);
    delete common[key];
    writeMap(COMMON_KEY, common);

    const departments = readMap<Course[]>(DEPT_KEY);
    const prefix = `${key}|`;
    for (const storedKey of Object.keys(departments)) {
      if (storedKey.startsWith(prefix)) delete departments[storedKey];
    }
    writeMap(DEPT_KEY, departments);
    return;
  }
  await request<void>(`/scheduler/published?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

export async function createScheduleArchive(key: string): Promise<ScheduleArchive> {
  if (DEMO_MODE) {
    const common = readMap<Course[]>(COMMON_KEY)[key] ?? [];
    const departments = await getDeptSchedules(key);
    const archives = (() => {
      try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]') as ScheduleArchive[]; }
      catch { return []; }
    })();
    const archive: ScheduleArchive = {
      archive_id: Date.now(),
      period_key: key,
      term: key.endsWith('|fall') ? 'fall' : 'spring',
      schedules: { HAVUZ: common, ...departments },
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify([archive, ...archives]));
    return archive;
  }
  return request<ScheduleArchive>(`/scheduler/archives?key=${encodeURIComponent(key)}`, {
    method: 'POST',
  });
}

export async function getScheduleArchives(): Promise<ScheduleArchive[]> {
  if (DEMO_MODE) {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]'); }
    catch { return []; }
  }
  return request<ScheduleArchive[]>('/scheduler/archives');
}

/* ── Linked ("co-taught") groups — global per period ─────────────────────────── */

export async function getLinkedGroups(key: string): Promise<LinkedCourseGroup[]> {
  if (DEMO_MODE) return readMap<LinkedCourseGroup[]>(LINKED_KEY)[key] ?? [];
  return request<LinkedCourseGroup[]>(`/scheduler/linked?key=${encodeURIComponent(key)}`);
}

export async function saveLinkedGroups(key: string, groups: LinkedCourseGroup[]): Promise<void> {
  if (DEMO_MODE) {
    const map = readMap<LinkedCourseGroup[]>(LINKED_KEY);
    map[key] = groups;
    writeMap(LINKED_KEY, map);
    return;
  }
  await request<void>('/scheduler/linked', { method: 'PUT', body: { key, groups } });
}

/* ── User-added ("katalog dışı") courses ─────────────────────────────────────── */

/**
 * In DEMO_MODE custom courses live in localStorage (the DB stand-in) and are
 * merged into the catalog on load. With a backend they come back through
 * `GET /scheduler/inputs` instead, so this returns `[]` to avoid a stale
 * localStorage copy overriding the server's version.
 */
export async function getCustomCourses(): Promise<AlgorithmInput[]> {
  if (!DEMO_MODE) return [];
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}

/** Persist a custom course locally (DEMO_MODE). The POST to the backend is done
 *  by courseService.createCourse, so in backend mode this is a no-op. */
export async function saveCustomCourse(input: AlgorithmInput): Promise<void> {
  if (!DEMO_MODE) return;
  let list: AlgorithmInput[] = [];
  try { list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { /* ignore */ }
  const next = [...list.filter(c => c.course_code !== input.course_code), input];
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* ignore quota */ }
}
