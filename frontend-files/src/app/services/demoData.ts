/**
 * ─── DEMO DATA (DEV ONLY) ───────────────────────────────────────────────────
 * Self-contained sample data + a client-side scheduler used ONLY when
 * `DEMO_MODE` is active (i.e. no VITE_API_BASE_URL configured). This lets the
 * frontend run standalone — log in, run the algorithm, browse the catalog —
 * without a backend.
 *
 * As soon as the backend is wired (VITE_API_BASE_URL set), DEMO_MODE is false
 * and NONE of this is used. Field names mirror the backend so the demo behaves
 * like the real API. Safe to delete once the backend is permanent.
 *
 * Demo logins (username / password):
 *   dekan / dekan          → dept_chair  (admin portal, full access)
 *   bilkoor / bilkoor      → coordinator (admin portal, BİL'e kilitli, havuz yok)
 *   bilsek / bil           → secretary   (admin portal, Bilgisayar Müh.)
 *   esumer / esumer        → instructor (academic portal, Emre Sümer)
 *   …any named lecturer: username = first-initial + lastname, password = username
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Account } from '@/app/features/auth/types/authTypes';
import type { AlgorithmInput, ScheduleStats, SchedulerResult, TermType } from '@/app/features/scheduler/types/schedulerTypes';
import type { Course, DayKey, CourseType } from '@/app/data/mockData';
import { COURSE_COLORS } from '@/app/data/mockData';
import type { DbCourse } from '@/app/features/courses/types/courseTypes';
import type { Room } from '@/app/features/reservations/types/reservationTypes';

/* ── helpers ───────────────────────────────────────────────────────────────── */

function slugify(text: string): string {
  const trMap: Record<string, string> = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
  };
  return text.split('').map(ch => trMap[ch] || ch).join('').toLowerCase().replace(/\s+/g, '');
}

function generateUsername(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return slugify(parts[0]);
  return slugify(parts[0][0] + parts[parts.length - 1]);
}

function titleCase(name: string): string {
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* ── Curriculum (45 BİL courses) ───────────────────────────────────────────── */

const RAW: Array<[string, string, number, number, number, string]> = [
  // code, name, weekly_hours, course_semester, section_count, instructor_full_name
  ['BİL110', 'BİLGİSAYAR MÜHENDİSLİĞİNE GİRİŞ', 2, 1, 1, 'emre sümer'],
  ['MAT151', 'MATEMATİKSEL ANALİZ I', 5, 1, 3, 'anonim'],
  ['BİL101', 'BİLGİSAYAR YAZILIMI I', 4, 1, 3, 'anonim'],
  ['BİL105', 'PROGRAMLAMA LABORATUVARI I', 2, 1, 5, 'anonim'],
  ['ENG199', 'ADVANCED ENGLISH I', 4, 1, 4, 'anonim'],
  ['FİZ103', 'MEKANİK LABORATUVARI', 2, 1, 2, 'anonim'],
  ['FİZ105', 'GENEL FİZİK I', 4, 1, 2, 'anonim'],
  ['BİL122', 'İLERİ PROGRAMLAMA', 4, 2, 1, 'çağatay berke erdaş'],
  ['BİL124', 'İLERİ PROGRAMLAMA UYGULAMALARI', 2, 2, 5, 'çağatay berke erdaş'],
  ['BİL172', 'YAŞAM BİLİMLERİ VE BİLGİSAYAR MÜHENDİSLİĞİ', 3, 2, 2, 'tolga tarkan ölmez'],
  ['MAT152', 'MATEMATİKSEL ANALİZ II', 5, 2, 3, 'anonim'],
  ['MAT210', 'DOĞRUSAL CEBİR', 3, 2, 2, 'anonim'],
  ['FİZ104', 'ELEKTRİK LABORATUVARI', 2, 2, 2, 'anonim'],
  ['FİZ110', 'GENEL FİZİK II', 4, 2, 2, 'anonim'],
  ['BİL231', 'AYRIK YAPILAR', 4, 3, 2, 'nizami gasilov'],
  ['BİL265', 'VERİ YAPILARI', 4, 3, 2, 'oğul göçmen'],
  ['BİL275', 'SAYISAL MANTIK TASARIMI', 5, 3, 2, 'iclal çetin taş'],
  ['ENG200', 'ADVANCED ENGLISH II', 4, 3, 4, 'anonim'],
  ['BİL210', 'ELEKTRONİĞE GİRİŞ', 5, 4, 2, 'oğul göçmen'],
  ['BİL218', 'BİLGİSAYAR ORGANİZASYONU', 4, 4, 2, 'iclal çetin taş'],
  ['BİL240', 'PROGRAMLAMA DİLLERİ', 4, 4, 1, 'emre sümer'],
  ['MAT250', 'OLASILIK VE İSTATİSTİK', 4, 4, 2, 'elmas burcu mamak ekinci'],
  ['MAT286', 'BİLGİSAYAR MÜHENDİSLİĞİ İÇİN MATEMATİK', 4, 4, 2, 'nizami gasilov'],
  ['SOS203', 'EKONOMİ', 3, 4, 1, 'anonim'],
  ['BİL324', 'MİKROİŞLEMCİLER', 5, 5, 2, 'emre sümer'],
  ['BİL343', 'NESNE YÖNELİMLİ PROGRAMLAMA', 4, 5, 1, 'murat hacıömeroğlu'],
  ['BİL367', 'ALGORİTMALAR', 4, 5, 2, 'didem ölçer'],
  ['MAT311', 'SAYISAL ANALİZ TEKNİKLERİ', 5, 5, 2, 'elmas burcu mamak ekinci'],
  ['SOS204', 'İŞLETME', 3, 5, 1, 'alperen öztürk'],
  ['BİL001', 'TEKNİK SEÇİMLİK I', 3, 6, 1, 'anonim'],
  ['BİL007', 'SOSYAL SEÇİMLİK', 3, 6, 1, 'anonim'],
  ['BİL332', 'İŞLETİM SİSTEMLERİ', 4, 6, 2, 'mehmet dikmen'],
  ['BİL344', 'VERİTABANI SİSTEMLERİ', 5, 6, 1, 'murat hacıömeroğlu'],
  ['BİL386', 'YAZILIM MÜHENDİSLİĞİNE GİRİŞ', 5, 6, 2, 'didem ölçer'],
  ['ENG330', 'DEVELOPING ENGLISH LANGUAGE SKILLS', 4, 6, 4, 'anonim'],
  ['BİL002', 'TEKNİK SEÇİMLİK II', 3, 7, 1, 'anonim'],
  ['BİL003', 'TEKNİK SEÇİMLİK III', 3, 7, 1, 'anonim'],
  ['BİL499', 'BİLGİSAYAR AĞLARI', 5, 7, 2, 'çağatay berke erdaş'],
  ['ENG460', 'PRESENTATION SKILLS', 4, 7, 4, 'anonim'],
  ['BİL004', 'TEKNİK SEÇİMLİK IV', 3, 8, 1, 'anonim'],
  ['BİL005', 'TEKNİK SEÇİMLİK V', 3, 8, 1, 'anonim'],
  ['BİL006', 'TEKNİK SEÇİMLİK VI', 3, 8, 1, 'anonim'],
  ['BİL482', 'ETİK,TOPLUM VE MESLEK', 3, 8, 1, 'atilla aşçıoğlu'],
  ['SOS321', 'İLETİŞİM', 3, 8, 1, 'anonim'],
  ['SOS322', 'İŞLETME YÖNETİMİNE GİRİŞ', 3, 8, 1, 'anonim'],
];

export const DEMO_ALGORITHM_INPUTS: AlgorithmInput[] = RAW.map(([code, name, hours, sem, sec, lecturer], i) => ({
  course_id: i + 1,
  course_code: code,
  course_name: name,
  weekly_hours: hours,
  course_semester: sem,
  section_count: sec,
  instructor_full_name: lecturer,
  is_online: false,
  is_service: code.startsWith('ENG') || code.startsWith('SOS'),
}));

const NAMED_LECTURERS = Array.from(
  new Set(RAW.map(r => r[5]).filter(l => l !== 'anonim'))
);

/* ── Demo accounts ─────────────────────────────────────────────────────────── */

interface DemoCredential {
  account: Account;
  password: string;
}

const STATIC_CREDENTIALS: DemoCredential[] = [
  {
    account: { user_id: 1, username: 'dekan', full_name: 'Prof. Dr. Dekan', role: 'dept_chair' },
    password: 'dekan',
  },
  {
    account: {
      user_id: 2, username: 'bilsek', full_name: 'Ayşe Yılmaz (BİL Sekreteri)',
      role: 'secretary', department_id: 1, department_name: 'Bilgisayar Mühendisliği',
    },
    password: 'bil',
  },
  {
    account: { user_id: 3, username: 'admin', full_name: 'Sistem Yöneticisi', role: 'admin' },
    password: 'admin',
  },
  {
    account: {
      user_id: 4, username: 'bilkoor', full_name: 'Dr. Öğr. Üyesi Ayça Koç (BİL Koordinatörü)',
      role: 'coordinator', department_id: 1, department_name: 'Bilgisayar Mühendisliği',
    },
    password: 'bilkoor',
  },
];

const INSTRUCTOR_CREDENTIALS: DemoCredential[] = NAMED_LECTURERS.map((name, i) => {
  const username = generateUsername(name);
  return {
    account: {
      user_id: 100 + i,
      username,
      full_name: titleCase(name),
      role: 'instructor' as const,
      department_id: 1,
      department_name: 'Bilgisayar Mühendisliği',
    },
    password: username,
  };
});

const DEMO_CREDENTIALS: DemoCredential[] = [...STATIC_CREDENTIALS, ...INSTRUCTOR_CREDENTIALS];

export function demoLogin(username: string, password: string): Account | null {
  const hit = DEMO_CREDENTIALS.find(
    c => c.account.username.toLowerCase() === username.trim().toLowerCase() && c.password === password
  );
  return hit ? hit.account : null;
}

/* ── Demo course catalog (DbCourse[]) ──────────────────────────────────────── */

export const DEMO_DB_COURSES: DbCourse[] = DEMO_ALGORITHM_INPUTS.map((c) => ({
  course_id: c.course_id,
  course_code: c.course_code,
  course_name: c.course_name,
  course_type_id: c.is_service ? 4 : 1,
  course_semester: c.course_semester,
  expected_student: 40,
  is_online: c.is_online,
  is_service: c.is_service,
  weekly_hours: c.weekly_hours,
  t_hour: c.weekly_hours,
  l_hour: 0,
  department_id: 1,
  department_name: 'Bilgisayar Mühendisliği',
}));

/* ── Demo rooms ────────────────────────────────────────────────────────────── */

export const DEMO_ROOMS: Room[] = [
  { roomCode: 'D-01', capacity: 60, type: 'derslik', block: 'D', floor: 0 },
  { roomCode: 'D-02', capacity: 50, type: 'derslik', block: 'D', floor: 0 },
  { roomCode: 'D-03', capacity: 40, type: 'derslik', block: 'D', floor: 1 },
  { roomCode: 'D-04', capacity: 30, type: 'laboratuvar', block: 'D', floor: 1 },
  { roomCode: 'F-201', capacity: 120, type: 'amfi', block: 'F', floor: 2 },
  { roomCode: 'F-204', capacity: 120, type: 'amfi', block: 'F', floor: 2 },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Client-side scheduler (greedy) — produces a Course[] timetable.
   Mirrors the constraints the backend solver enforces.
   ═══════════════════════════════════════════════════════════════════════════ */

const DAYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIMESLOTS = 8; // 09:00–17:00, 1h each
const START_HOUR = 9;

function timeStr(slot: number): string {
  return `${String(START_HOUR + slot).padStart(2, '0')}:00`;
}

function splitHours(total: number): number[] {
  if (total === 5) return [3, 2];
  if (total === 4) return [2, 2];
  if (total === 6) return [3, 3];
  return [total];
}

interface Task {
  parentId: string;
  code: string;
  name: string;
  hours: number;
  semester: number;
  section: number;
  totalSections: number;
  lecturer: string;
  totalSplits: number;
}

interface Assignment { task: Task; day: number; startSlot: number; }

function expand(inputs: AlgorithmInput[]): Task[] {
  const tasks: Task[] = [];
  inputs.forEach((c, i) => {
    if (c.weekly_hours <= 0) return;
    const n = Math.max(1, c.section_count);
    const splits = splitHours(c.weekly_hours);
    for (let sec = 1; sec <= n; sec++) {
      splits.forEach((h, sp) => {
        tasks.push({
          parentId: `${i}_${sec}`,
          code: `${c.course_code}-${sec}`,
          name: `${c.course_name}-${sec}${splits.length > 1 ? ` (P${sp + 1})` : ''}`,
          hours: h,
          semester: c.course_semester,
          section: sec,
          totalSections: n,
          lecturer: c.instructor_full_name,
          totalSplits: splits.length,
        });
      });
    }
  });
  return tasks;
}

function canPlace(task: Task, day: number, slot: number, assigns: Assignment[], systemRules: Record<string, boolean> = {}): boolean {
  const end = slot + task.hours;
  if (end > TIMESLOTS) return false;
  // Default (system) rules default to ON; only an explicit `false` disables them.
  const instructorClash = systemRules.instructorClash !== false;
  const semesterClash = systemRules.semesterClash !== false;
  for (const a of assigns) {
    if (a.day !== day) continue;
    const aEnd = a.startSlot + a.task.hours;
    const overlap = slot < aEnd && end > a.startSlot;
    if (!overlap) continue;
    if (instructorClash && task.lecturer !== 'anonim' && task.lecturer.trim() !== '-' && task.lecturer === a.task.lecturer) return false;
    if (semesterClash && task.semester === a.task.semester &&
        (task.section === a.task.section || task.totalSections === 1 || a.task.totalSections === 1)) return false;
  }
  if (task.totalSplits > 1) {
    for (const a of assigns) {
      if (a.task.parentId === task.parentId && a.day === day) return false;
    }
  }
  return true;
}

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Convert already-placed (locked/common) sessions into seed assignments so the
 *  greedy scheduler avoids clashing the new department courses with them. */
function lockedToSeeds(locked: Course[]): Assignment[] {
  return locked.map(c => {
    const day = DAYS.indexOf(c.day);
    const startSlot = parseInt(c.startTime) - START_HOUR;
    const hours = Math.max(1, parseInt(c.endTime) - parseInt(c.startTime));
    const task: Task = {
      parentId: `locked-${c.id}`,
      code: c.code,
      name: c.name,
      hours,
      semester: -1, // sentinel: never triggers a false semester clash with dept courses
      section: 1,
      totalSections: 1,
      lecturer: c.lecturer === 'Atanmamış' ? 'anonim' : c.lecturer,
      totalSplits: 1,
    };
    return { task, day: day < 0 ? 0 : day, startSlot: startSlot < 0 ? 0 : startSlot };
  });
}

// NOTE: this greedy shuffle+retry placement is fine for the demo's ~45 courses,
// but is O(tasks × days × slots) per attempt and gets expensive on large data
// sets — the real backend CSP/heuristic solver should be used in production.
function schedule(tasks: Task[], seed: Assignment[] = [], systemRules: Record<string, boolean> = {}): Assignment[] {
  const assigns: Assignment[] = [...seed];
  const sorted = [...tasks].sort((a, b) =>
    b.hours - a.hours || a.semester - b.semester || a.section - b.section);
  for (const task of sorted) {
    let placed = false;
    for (const d of shuffle([0, 1, 2, 3, 4])) {
      if (placed) break;
      for (const s of shuffle(Array.from({ length: TIMESLOTS }, (_, i) => i))) {
        if (canPlace(task, d, s, assigns, systemRules)) { assigns.push({ task, day: d, startSlot: s }); placed = true; break; }
      }
    }
    if (!placed) {
      for (let d = 0; d < 5 && !placed; d++) {
        for (let s = 0; s <= TIMESLOTS - task.hours; s++) {
          if (canPlace(task, d, s, assigns, systemRules)) { assigns.push({ task, day: d, startSlot: s }); placed = true; break; }
        }
      }
    }
    if (!placed) assigns.push({ task, day: 0, startSlot: 0 });
  }
  return assigns;
}

function toCourses(assigns: Assignment[]): Course[] {
  let roomCounter = 1;
  const roomMap = new Map<string, string>();
  for (const a of assigns) {
    if (!roomMap.has(a.task.parentId)) roomMap.set(a.task.parentId, `D-${String(roomCounter++).padStart(2, '0')}`);
  }
  // Each scheduler run gets globally-unique ids. A plain `algo-${idx}` would
  // collide across runs — e.g. the saved pool ("Ortak Dersler") sessions and a
  // department's freshly-generated sessions would share `algo-0`, `algo-1`, …,
  // so dragging one block would also move its same-id twin (course vanishes /
  // turns red). A run-scoped token keeps every session distinct.
  const runToken = crypto.randomUUID().slice(0, 8);
  return assigns.map((a, idx) => {
    const nameLower = a.task.name.toLowerCase();
    const type: CourseType =
      nameLower.includes('lab') || nameLower.includes('uygulama') || nameLower.includes('laboratuvar') ? 'Lab' : 'Lecture';
    const lecturerName = a.task.lecturer === 'anonim' ? 'Atanmamış' : titleCase(a.task.lecturer);
    const year = Math.ceil(a.task.semester / 2);
    return {
      id: `algo-${runToken}-${idx}`,
      name: a.task.name,
      code: a.task.code,
      lecturer: lecturerName,
      lecturerId: `lec-${a.task.lecturer.replace(/\s/g, '-')}`,
      department: 'Bilgisayar Mühendisliği',
      classLevel: `${year}. Sınıf BİL`,
      room: roomMap.get(a.task.parentId) || `D-${idx}`,
      day: DAYS[a.day],
      startTime: timeStr(a.startSlot),
      endTime: timeStr(a.startSlot + a.task.hours),
      studentsEnrolled: 30 + Math.floor(Math.random() * 20),
      totalCapacity: 60,
      colorIndex: a.task.semester % COURSE_COLORS.length,
      type,
      hasConflict: false,
    };
  });
}

function detectConflicts(courses: Course[]): { courses: Course[]; conflictCount: number; warnings: ScheduleStats['warnings'] } {
  const warnings: ScheduleStats['warnings'] = [];
  let conflictCount = 0;
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i], b = courses[j];
      if (a.day !== b.day) continue;
      if (a.lecturer === 'Atanmamış' || b.lecturer === 'Atanmamış') continue;
      if (a.lecturer !== b.lecturer) continue;
      const aS = parseInt(a.startTime), aE = parseInt(a.endTime), bS = parseInt(b.startTime), bE = parseInt(b.endTime);
      if (aS < bE && aE > bS) {
        courses[i] = { ...a, hasConflict: true, conflictReason: `Öğretim elemanı çakışması: ${a.lecturer}` };
        courses[j] = { ...b, hasConflict: true, conflictReason: `Öğretim elemanı çakışması: ${b.lecturer}` };
        conflictCount++;
        warnings.push({ id: `w-${i}-${j}`, severity: 'error', message: `${a.lecturer}: ${a.code} ve ${b.code} çakışıyor (${a.day} ${a.startTime})`, courses: [a.id, b.id] });
      }
    }
  }
  return { courses, conflictCount, warnings };
}

export function runDemoScheduler(inputs: AlgorithmInput[], term: TermType, locked: Course[] = [], systemRules: Record<string, boolean> = {}): SchedulerResult {
  const start = performance.now();
  const filtered = inputs.filter(c => term === 'fall' ? c.course_semester % 2 !== 0 : c.course_semester % 2 === 0);
  const tasks = expand(filtered);
  // Seed the scheduler with the locked (common/pool) sessions so the new
  // department courses are placed AROUND them (no shared-instructor clashes).
  const seeds = lockedToSeeds(locked);
  const assigns = schedule(tasks, seeds, systemRules);
  const deptAssigns = assigns.slice(seeds.length); // exclude seeds from output
  const deptCourses = toCourses(deptAssigns);
  // Merge the locked common sessions on top (shown but non-editable).
  const lockedMarked = locked.map(c => ({ ...c, isLocked: true }));
  let courses = [...lockedMarked, ...deptCourses];
  const { courses: checked, conflictCount, warnings } = detectConflicts(courses);
  courses = checked;
  const executionTime = Number(((performance.now() - start) / 1000).toFixed(2));

  const lecturerHours: Record<string, number> = {};
  const lecturerSet = new Set<string>();
  for (const c of courses) {
    if (c.lecturer !== 'Atanmamış') {
      lecturerSet.add(c.lecturer);
      lecturerHours[c.lecturer] = (lecturerHours[c.lecturer] || 0) + (parseInt(c.endTime) - parseInt(c.startTime));
    }
  }
  const roomsUsed = new Set(courses.map(c => c.room)).size;

  const stats: ScheduleStats = {
    executionTime,
    totalPlaced: courses.length,
    totalTasks: tasks.length + lockedMarked.length,
    conflictCount,
    warnings,
    lecturerHours,
    uniqueLecturers: Array.from(lecturerSet).sort(),
    roomsUsed,
    totalRooms: roomsUsed + 4,
  };
  return { courses, stats };
}
