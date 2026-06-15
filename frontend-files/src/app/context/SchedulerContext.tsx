import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Course, DayKey } from '@/app/data/mockData';
import type { AlgorithmInput, CommonWorkbookRow, ConstraintBundle, ConstraintSettings, LinkedCourseGroup, SchedulerConstraint, ScheduleStats, TermType } from '@/app/features/scheduler/types/schedulerTypes';
import type { ConstraintType, DayOfWeek } from '@/app/features/scheduler/types/schedulerTypes';
import type { Account } from '@/app/features/auth/types/authTypes';
import type { Room } from '@/app/features/reservations/types/reservationTypes';
import * as schedulerService from '@/app/services/schedulerService';
import * as courseService from '@/app/services/courseService';
import * as scheduleStore from '@/app/services/scheduleStore';
import { departmentCodeForUser, isPoolDept, POOL_DEPARTMENT } from '@/app/data/departments';
import { assignRooms } from '@/app/features/scheduler/utils/roomAssignment';
import { useUI } from '@/app/context/UIContext';
import { useAuth } from '@/app/context/AuthContext';

interface SchedulerContextType {
  isCalculating: boolean;
  calculationTime: number | null;
  runAlgorithm: () => void;
  scheduledCourses: Course[];
  scheduleStats: ScheduleStats | null;
  selectedTerm: TermType;
  setSelectedTerm: (term: TermType) => void;
  selectedLecturer: string;
  setSelectedLecturer: (name: string) => void;
  algorithmCourses: AlgorithmInput[];
  linkableCourses: AlgorithmInput[];
  inputsLoading: boolean;
  updateCourseSection: (code: string, delta: number) => void;
  updateCourseContext: (code: string, newName: string, newLecturer: string) => void;
  importCourses: (courses: AlgorithmInput[]) => void;
  commonWorkbookRows: CommonWorkbookRow[];
  commonWorkbookFileName: string;
  setCommonWorkbook: (rows: CommonWorkbookRow[], fileName: string) => void;
  /** Add a user-defined ("katalog dışı") course to the catalog + open it + persist it. */
  addCustomCourse: (course: AlgorithmInput) => void;
  // ── Term course selection (DÖNEMLİK AÇILAN DERSLER) ──
  selectedCourseCodes: string[];
  toggleCourseSelection: (code: string) => void;
  selectCourses: (codes: string[]) => void;
  deselectCourse: (code: string) => void;
  clearCourseSelection: () => void;
  // ── Default (system) constraint toggles ──
  systemRuleEnabled: Record<string, boolean>;
  toggleSystemRule: (key: string) => void;
  constraintSettings: ConstraintSettings;
  setLunchBreakEnabled: (enabled: boolean) => void;
  setLunchBreakSlot: (slot: number) => void;
  // ── Course hour-splitting choices (per course_code) ──
  courseSplits: Record<string, string[]>;
  setCourseSplit: (code: string, options: string[]) => void;
  // ── Constraint-wizard saved gating ──
  constraintSaved: Record<string, boolean>;
  markConstraintSaved: (key: string) => void;
  resetConstraintSaved: () => void;
  allConstraintsSaved: boolean;
  // ── Department the schedule is being built for (code from DEPARTMENTS) ──
  selectedDepartment: string;
  setSelectedDepartment: (code: string) => void;
  // ── Shared/pool ("Ortak Dersler") schedule, saved by the dean per year+term ──
  commonSchedule: Course[];
  saveCommonSchedule: (courses: Course[]) => Promise<void>;
  // ── Per-department published schedules + global classroom assignment ──
  saveDeptSchedule: (deptCode: string, courses: Course[]) => Promise<void>;
  archiveCurrentSchedule: () => Promise<void>;
  publishedDepartments: string[];
  assignAllRooms: (enrollment: Record<string, number>, rooms: Room[], uploadedDeptCodes?: string[]) => {
    assigned: number;
    unassigned: number;
    noSuitableRoom: number;
    allSuitableRoomsBusy: number;
  };
  roomsAssigned: boolean;
  linkedGroups: LinkedCourseGroup[];
  addLinkedGroup: (courseCodes: string[]) => void;
  removeLinkedGroup: (groupId: string) => void;
  updateLinkedGroup: (groupId: string, courseCodes: string[]) => void;
  constraints: SchedulerConstraint[];
  addConstraint: (type: ConstraintType, target: string, day: DayOfWeek, hour: number) => void;
  removeConstraint: (id: string) => void;
  clearConstraints: (target?: string) => void;
  /** Manually move a placed course block to a new day/start hour (preserves duration). */
  moveScheduledCourse: (id: string, day: DayKey, startHour: number) => void;
  /** Every published session for the current year+term (pool + all departments), for the global classroom matrix. */
  allPublishedSessions: Course[];
  /** Reload the last saved/published schedule into view (e.g. after a re-run replaced it). */
  restorePublishedSchedule: () => void;
  /** Delete pool + department schedules persisted for the selected term. */
  deletePreviousSchedule: () => Promise<void>;
}

/** Re-flag manual-move conflicts: same day + overlapping time sharing an
 *  instructor, a room, or a class level. Mirrors demoData.detectConflicts but
 *  also catches room/class clashes that a drag-drop can introduce. */
function redetectConflicts(courses: Course[]): Course[] {
  const out = courses.map(c => ({ ...c, hasConflict: false, conflictReason: undefined as string | undefined }));
  const anon = (n?: string) => !n || n.toLowerCase() === 'atanmamış' || n.toLowerCase() === 'anonim';

  // A clash only counts when a SHARED resource is double-booked at an
  // overlapping time: the same instructor, or the same room. Two DIFFERENT
  // courses sharing a slot is allowed (e.g. BİL101-01 and BİL110-01 may run at
  // the same hour — students pick non-overlapping sections), so it is NEVER
  // flagged red. Only genuine instructor/room collisions turn red.
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.day !== b.day) continue;
      const aS = parseInt(a.startTime), aE = parseInt(a.endTime);
      const bS = parseInt(b.startTime), bE = parseInt(b.endTime);
      if (!(aS < bE && aE > bS)) continue;
      if (a.coScheduleGroup && a.coScheduleGroup === b.coScheduleGroup) continue;
      let reason = '';
      if (!anon(a.lecturer) && a.lecturer === b.lecturer) {
        reason = `Öğretim elemanı çakışması: ${a.lecturer}`;
      } else if (a.room && a.room !== 'TBA' && a.room === b.room) {
        reason = `Derslik çakışması: ${a.room}`;
      }
      if (reason) {
        out[i] = { ...out[i], hasConflict: true, conflictReason: reason };
        out[j] = { ...out[j], hasConflict: true, conflictReason: reason };
      }
    }
  }
  return out;
}

/** Scope a period's PUBLISHED schedules to what a given account should see:
 *  instructors get only their own sessions; dept-locked roles get their
 *  department + the locked common blocks; the dean gets common + whatever
 *  department is in scope. Used by both the auto-hydration effect and the
 *  manual "restore saved schedule" action so the two stay identical. */
function scopedPublishedView(
  common: Course[],
  depts: Record<string, Course[]>,
  user: Account,
  deptScope: string,
  audienceByCourseCode: Map<string, string[]> = new Map(),
): Course[] {
  const commonForDepartment = (department: string) => common.filter(course => {
    const baseCode = course.code.split("-", 1)[0];
    const audience = course.audienceDepartments?.length
      ? course.audienceDepartments
      : (audienceByCourseCode.get(baseCode) ?? []);
    return audience.length === 0 || audience.includes(department);
  });
  const lockedCommon = commonForDepartment(deptScope)
    .map(course => ({ ...course, isLocked: true }));
  if (user.role === 'instructor') {
    const all = [
      ...common.map(course => ({ ...course, isLocked: true })),
      ...Object.values(depts).flat(),
    ];
    return all.filter(c => c.lecturer === user.full_name);
  }
  if (user.role === 'coordinator' || user.role === 'secretary') {
    const dept = departmentCodeForUser(user);
    return [
      ...commonForDepartment(dept).map(course => ({ ...course, isLocked: true })),
      ...(depts[dept] ?? []),
    ];
  }
  if (isPoolDept(deptScope)) return common;
  return deptScope && depts[deptScope]
    ? [...lockedCommon, ...depts[deptScope]]
    : [];
}

const SchedulerContext = createContext<SchedulerContextType>({} as SchedulerContextType);

export function SchedulerProvider({ children }: { children: React.ReactNode }) {
  const { setPublishedAt, setOpenCourseIds } = useUI();
  const { currentUser } = useAuth();

  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationTime, setCalculationTime] = useState<number | null>(null);
  // Curriculum/section inputs come from the backend (GET /api/scheduler/inputs).
  const [algorithmCourses, setAlgorithmCourses] = useState<AlgorithmInput[]>([]);
  const [linkableCourses, setLinkableCourses] = useState<AlgorithmInput[]>([]);
  const [inputsLoading, setInputsLoading] = useState(true);
  const [scheduledCourses, setScheduledCourses] = useState<Course[]>([]);
  const [scheduleStats, setScheduleStats] = useState<ScheduleStats | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<TermType>('spring');
  const [commonWorkbookByTerm, setCommonWorkbookByTerm] = useState<Record<TermType, {
    rows: CommonWorkbookRow[];
    fileName: string;
  }>>({
    fall: { rows: [], fileName: '' },
    spring: { rows: [], fileName: '' },
  });
  const commonWorkbookRows = commonWorkbookByTerm[selectedTerm].rows;
  const commonWorkbookFileName = commonWorkbookByTerm[selectedTerm].fileName;
  const [selectedLecturer, setSelectedLecturer] = useState<string>('');
  const [constraints, setConstraints] = useState<SchedulerConstraint[]>([]);
  // Course selection is stored per department + term. Fall and spring choices
  // must never leak into each other.
  const [selectionByDept, setSelectionByDept] = useState<Record<string, string[]>>({});
  // Department the schedule is being built for. The raw setter is wrapped further
  // down (setSelectedDepartment) to reset the working constraints on dept change.
  const [selectedDepartment, setSelectedDepartmentRaw] = useState('BİL');
  const selectedDeptRef = useRef(selectedDepartment);
  const selectionKey = `${selectedDepartment}|${selectedTerm}`;
  const selectedCourseCodes = selectionByDept[selectionKey] ?? [];
  const [systemRuleEnabled, setSystemRuleEnabled] = useState<Record<string, boolean>>({
    instructorClash: true,
    semesterClash: true,
    roomClash: true,
    consecutiveLimit: true,
    onlineExemption: true,
    weeklyHours: true,
  });
  const [constraintSettings, setConstraintSettings] = useState<ConstraintSettings>(
    () => ({ ...schedulerService.DEFAULT_CONSTRAINT_SETTINGS }),
  );

  const toggleCourseSelection = useCallback((code: string) => {
    setSelectionByDept(prev => {
      const cur = prev[selectionKey] ?? [];
      const next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
      return { ...prev, [selectionKey]: next };
    });
  }, [selectionKey]);

  const selectCourses = useCallback((codes: string[]) => {
    setSelectionByDept(prev => ({
      ...prev,
      [selectionKey]: Array.from(new Set([...(prev[selectionKey] ?? []), ...codes])),
    }));
  }, [selectionKey]);

  const deselectCourse = useCallback((code: string) => {
    setSelectionByDept(prev => ({
      ...prev,
      [selectionKey]: (prev[selectionKey] ?? []).filter(c => c !== code),
    }));
  }, [selectionKey]);

  const clearCourseSelection = useCallback(() => {
    setSelectionByDept(prev => ({ ...prev, [selectionKey]: [] }));
  }, [selectionKey]);

  const toggleSystemRule = useCallback((key: string) => {
    setSystemRuleEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const setLunchBreakEnabled = useCallback((enabled: boolean) => {
    setConstraintSettings(prev => ({ ...prev, enforceLunchBreak: enabled }));
  }, []);
  const setLunchBreakSlot = useCallback((slot: number) => {
    setConstraintSettings(prev => ({ ...prev, lunchSlots: [slot] }));
  }, []);

  // ── Course hour-splitting selections ──
  const [courseSplits, setCourseSplits] = useState<Record<string, string[]>>({});
  const setCourseSplit = useCallback((code: string, options: string[]) => {
    setCourseSplits(prev => ({ ...prev, [code]: options }));
  }, []);

  // ── Constraint wizard saved gating ──
  const CONSTRAINT_STEP_KEYS = ['default', 'linked', 'instructor_unavailable', 'course_fixed', 'course_blocked', 'course_split'];
  const [constraintSaved, setConstraintSaved] = useState<Record<string, boolean>>(
    Object.fromEntries(CONSTRAINT_STEP_KEYS.map(k => [k, false]))
  );
  const markConstraintSaved = useCallback((key: string) => {
    setConstraintSaved(prev => ({ ...prev, [key]: true }));
  }, []);
  const resetConstraintSaved = useCallback(() => {
    setConstraintSaved(Object.fromEntries(CONSTRAINT_STEP_KEYS.map(k => [k, false])));
  }, []);
  const allConstraintsSaved = CONSTRAINT_STEP_KEYS.every(k => constraintSaved[k]);

  // ── Selected department (program the schedule is built for) ──
  // Wrapped setter: when the department actually changes, the working constraints
  // (constraints, splits, wizard step confirmations) are reset so one program's
  // review never carries over to the next. Linked ("co-taught") groups are NOT
  // reset — they are global + persistent (per year+term) and shared across every
  // department whose courses they include. Saved schedules (commonMap /
  // deptScheduleMap) and per-department course selection are also left intact.
  const setSelectedDepartment = useCallback((code: string) => {
    if (selectedDeptRef.current !== code) {
      selectedDeptRef.current = code;
      setConstraints([]);
      setCourseSplits({});
      resetConstraintSaved();
    }
    setSelectedDepartmentRaw(code);
  }, [resetConstraintSaved]);

  // ── Shared/pool ("Ortak Dersler") schedule ──
  // In-memory caches of the published schedules for each period. They are
  // hydrated from scheduleStore (localStorage in demo, the backend once wired)
  // and written through it on every mutation — no direct localStorage here.
  const [commonMap, setCommonMap] = useState<Record<string, Course[]>>({});
  const currentCommonKey = `0000-0000|${selectedTerm}`;
  const commonSchedule = commonMap[currentCommonKey] ?? [];
  const audienceByCourseCode = useMemo(
    () => new Map(algorithmCourses.map(course => [
      course.course_code,
      course.department_codes ?? [],
    ])),
    [algorithmCourses],
  );

  // ── Linked ("co-taught") groups — GLOBAL + persistent per year+term ──
  // A co-taught link must hold across departments: a group that pairs a BİL
  // course with a MAT course is created once and applies to whoever builds
  // either program. So linked groups live in their own persisted store (keyed by
  // year+term), not in per-department working state.
  const [linkedMap, setLinkedMap] = useState<Record<string, LinkedCourseGroup[]>>({});
  const linkedGroups = linkedMap[currentCommonKey] ?? [];
  const writeLinked = useCallback((updater: (cur: LinkedCourseGroup[]) => LinkedCourseGroup[]) => {
    setLinkedMap(prev => {
      const groups = updater(prev[currentCommonKey] ?? []);
      scheduleStore.saveLinkedGroups(currentCommonKey, groups).catch(err => console.error('saveLinkedGroups failed:', err));
      return { ...prev, [currentCommonKey]: groups };
    });
  }, [currentCommonKey]);

  // PostgreSQL is the source of truth for the complete constraint bundle.
  // Hydrate it whenever the academic period or department scope changes.
  useEffect(() => {
    let cancelled = false;
    const constraintDepartment = selectedDepartment || 'HAVUZ';
    schedulerService.fetchConstraintBundle(currentCommonKey, constraintDepartment)
      .then(bundle => {
        if (cancelled || !bundle) return;
        setConstraints(bundle.constraints);
        setSystemRuleEnabled(bundle.systemRules);
        setConstraintSettings(bundle.settings);
        setCourseSplits(bundle.splits);
        setLinkedMap(prev => ({ ...prev, [currentCommonKey]: bundle.linkedGroups }));
      })
      .catch(err => console.error('Failed to load constraint bundle:', err));
    return () => { cancelled = true; };
  }, [currentCommonKey, selectedDepartment]);
  const saveCommonSchedule = useCallback(async (courses: Course[]) => {
    const next = courses.map(c => ({ ...c, isLocked: false }));
    setCommonMap(prev => ({ ...prev, [currentCommonKey]: next }));
    await scheduleStore.saveCommon(currentCommonKey, next);
  }, [currentCommonKey]);

  // ── Per-department published schedules (for the dean's global room assignment) ──
  const [deptScheduleMap, setDeptScheduleMap] = useState<Record<string, Course[]>>({});
  const saveDeptSchedule = useCallback(async (deptCode: string, courses: Course[]) => {
    const key = `${currentCommonKey}|${deptCode}`;
    const next = courses.map(c => ({ ...c, isLocked: false }));
    setDeptScheduleMap(prev => ({ ...prev, [key]: next }));
    await scheduleStore.saveDept(currentCommonKey, deptCode, next);
  }, [currentCommonKey]);

  const archiveCurrentSchedule = useCallback(async () => {
    await scheduleStore.createScheduleArchive(currentCommonKey);
  }, [currentCommonKey]);

  // Hydrate the published caches for the current period from the store. Runs on
  // mount and whenever the academic period changes (year/term).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      scheduleStore.getCommon(currentCommonKey),
      scheduleStore.getDeptSchedules(currentCommonKey),
      scheduleStore.getLinkedGroups(currentCommonKey),
    ]).then(([common, depts, linked]) => {
      if (cancelled) return;
      setCommonMap(prev => ({ ...prev, [currentCommonKey]: common }));
      setDeptScheduleMap(prev => {
        const next: Record<string, Course[]> = {};
        for (const [k, v] of Object.entries(prev)) if (!k.startsWith(`${currentCommonKey}|`)) next[k] = v;
        for (const [dept, courses] of Object.entries(depts)) next[`${currentCommonKey}|${dept}`] = courses;
        return next;
      });
      setLinkedMap(prev => ({ ...prev, [currentCommonKey]: linked }));
    }).catch(err => console.error('Failed to load published schedules:', err));
    return () => { cancelled = true; };
  }, [currentCommonKey]);

  const publishedDepartments = useMemo(() => {
    const prefix = `${currentCommonKey}|`;
    return Object.keys(deptScheduleMap).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
  }, [deptScheduleMap, currentCommonKey]);

  // Every published session for the current year+term: the pool ("Ortak Dersler")
  // schedule plus every department's published schedule. Used by the global
  // classroom matrix so room occupancy reflects ALL programs, not just the open one.
  const allPublishedSessions = useMemo(() => {
    const prefix = `${currentCommonKey}|`;
    const common = commonMap[currentCommonKey] ?? [];
    const dept = Object.keys(deptScheduleMap)
      .filter(k => k.startsWith(prefix))
      .flatMap(k => deptScheduleMap[k]);
    return [...common, ...dept];
  }, [commonMap, deptScheduleMap, currentCommonKey]);

  // ── Global classroom assignment (dean, across all departments + pool) ──
  const [roomsAssigned, setRoomsAssigned] = useState(false);
  // uploadedDeptCodes: when provided, only those departments (and the pool, if its
  // code is included) are (re)assigned — assignment is driven by which enrollment
  // files the user actually uploaded, instead of running over the whole system at
  // once. Departments left out keep their current rooms, and those rooms are seeded
  // as occupied so the partial pass never double-books them. When omitted, every
  // department + the pool is assigned (full-system behaviour).
  const assignAllRooms = useCallback((enrollment: Record<string, number>, rooms: Room[], uploadedDeptCodes?: string[]) => {
    const prefix = `${currentCommonKey}|`;
    const allDeptKeys = Object.keys(deptScheduleMap).filter(k => k.startsWith(prefix));
    const scope = uploadedDeptCodes ? new Set(uploadedDeptCodes) : null;
    const deptKeys = scope ? allDeptKeys.filter(k => scope.has(k.slice(prefix.length))) : allDeptKeys;
    const includePool = !scope || scope.has(POOL_DEPARTMENT.code);
    const common = commonMap[currentCommonKey] ?? [];

    const combined: Course[] = [...(includePool ? common : []), ...deptKeys.flatMap(k => deptScheduleMap[k])];
    // Sessions NOT in this pass that already hold a room — keep their rooms busy.
    const inPass = new Set(combined.map(c => c.id));
    const preOccupied: Course[] = [
      ...(includePool ? [] : common),
      ...allDeptKeys.filter(k => !deptKeys.includes(k)).flatMap(k => deptScheduleMap[k]),
    ].filter(c => !inPass.has(c.id));

    const {
      courses: assignedCourses,
      assigned,
      unassigned,
      noSuitableRoom,
      allSuitableRoomsBusy,
    } = assignRooms(combined, rooms, enrollment, preOccupied);
    const byId = new Map(assignedCourses.map(c => [c.id, c]));

    // Write rooms back into the assigned schedules, then persist each through the
    // store. The pool is only touched when it was part of this pass.
    if (includePool) {
      const nextCommon = common.map(c => byId.get(c.id) ?? c);
      setCommonMap(prev => ({ ...prev, [currentCommonKey]: nextCommon }));
      scheduleStore.saveCommon(currentCommonKey, nextCommon).catch(err => console.error('saveCommon failed:', err));
    }
    setDeptScheduleMap(prev => {
      const next = { ...prev };
      for (const k of deptKeys) next[k] = prev[k].map(c => byId.get(c.id) ?? c);
      return next;
    });
    for (const k of deptKeys) {
      const deptCode = k.slice(`${currentCommonKey}|`.length);
      const updated = deptScheduleMap[k].map(c => byId.get(c.id) ?? c);
      scheduleStore.saveDept(currentCommonKey, deptCode, updated).catch(err => console.error('saveDept failed:', err));
    }
    // Reflect new rooms in the currently-displayed schedule (match by id).
    setScheduledCourses(prev => prev.map(c => {
      const u = byId.get(c.id);
      return u ? { ...c, room: u.room, totalCapacity: u.totalCapacity, studentsEnrolled: u.studentsEnrolled } : c;
    }));
    setRoomsAssigned(true);
    return { assigned, unassigned, noSuitableRoom, allSuitableRoomsBusy };
  }, [deptScheduleMap, commonMap, currentCommonKey]);
  // Keep a ref to scheduledCourses so manual edits (drag-drop) can read the
  // current placement without a stale closure.
  const scheduledRef = useRef<Course[]>([]);
  scheduledRef.current = scheduledCourses;

  const addConstraint = useCallback((type: ConstraintType, target: string, day: DayOfWeek, hour: number) => {
    setConstraints(prev => {
      const exists = prev.some(c => c.type === type && c.target === target && c.day === day && c.hour === hour);
      if (exists) return prev;
      return [...prev, { id: crypto.randomUUID(), type, target, day, hour }];
    });
  }, []);

  const removeConstraint = useCallback((id: string) => {
    setConstraints(prev => prev.filter(c => c.id !== id));
  }, []);

  const clearConstraints = useCallback((target?: string) => {
    if (target) {
      setConstraints(prev => prev.filter(c => c.target !== target));
    } else {
      setConstraints([]);
    }
  }, []);

  // Manual drag-drop edit: move a placed course block to a new day + start hour.
  // Duration (in whole hours) is preserved. The move is also written back into the
  // saved schedule (pool or current department) so a published timetable stays in
  // sync, and conflicts are re-detected so the grid can flag clashes in red.
  const moveScheduledCourse = useCallback((id: string, day: DayKey, startHour: number) => {
    const moved = scheduledRef.current.find(c => c.id === id);
    if (!moved) return;
    const curStart = parseInt(moved.startTime.split(':')[0]);
    const curEnd = parseInt(moved.endTime.split(':')[0]);
    const duration = Math.max(1, curEnd - curStart);
    const newStart = Math.max(9, Math.min(startHour, 18 - duration));
    const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
    const patch = { day: day as Course['day'], startTime: pad(newStart), endTime: pad(newStart + duration) };

    // 1. Update the in-memory schedule and re-flag conflicts.
    setScheduledCourses(prev => redetectConflicts(prev.map(c => (c.id === id ? { ...c, ...patch } : c))));

    // 2. Persist into the saved schedule (write-through the store). Locked (pool)
    //    sessions aren't draggable, so the moved block belongs to either the pool
    //    or the active department.
    if (moved.isLocked) return;
    const apply = (list: Course[]) => list.map(c => (c.id === id ? { ...c, ...patch } : c));
    if (isPoolDept(selectedDepartment)) {
      setCommonMap(prev => {
        if (!prev[currentCommonKey]?.some(c => c.id === id)) return prev;
        const updated = apply(prev[currentCommonKey]);
        scheduleStore.saveCommon(currentCommonKey, updated).catch(err => console.error('saveCommon failed:', err));
        return { ...prev, [currentCommonKey]: updated };
      });
    } else if (selectedDepartment) {
      const key = `${currentCommonKey}|${selectedDepartment}`;
      setDeptScheduleMap(prev => {
        if (!prev[key]?.some(c => c.id === id)) return prev;
        const updated = apply(prev[key]);
        scheduleStore.saveDept(currentCommonKey, selectedDepartment, updated).catch(err => console.error('saveDept failed:', err));
        return { ...prev, [key]: updated };
      });
    }
  }, [selectedDepartment, currentCommonKey]);

  const addLinkedGroup = useCallback((courseCodes: string[]) => {
    if (courseCodes.length < 2) return;
    writeLinked(cur => [...cur, { id: crypto.randomUUID(), courseCodes }]);
  }, [writeLinked]);

  const removeLinkedGroup = useCallback((groupId: string) => {
    writeLinked(cur => cur.filter(g => g.id !== groupId));
  }, [writeLinked]);

  const updateLinkedGroup = useCallback((groupId: string, courseCodes: string[]) => {
    if (courseCodes.length < 2) {
      writeLinked(cur => cur.filter(g => g.id !== groupId));
      return;
    }
    writeLinked(cur => cur.map(g => g.id === groupId ? { ...g, courseCodes } : g));
  }, [writeLinked]);

  // Load the editable curriculum inputs for the active department and term, then
  // merge any persisted
  // custom ("katalog dışı") courses on top (by course_code) so they survive
  // reloads. In backend mode scheduleStore.getCustomCourses() returns [] because
  // custom courses already come back through fetchAlgorithmInputs (no double).
  useEffect(() => {
    let cancelled = false;
    setInputsLoading(true);
    (async () => {
      const custom = await scheduleStore.getCustomCourses().catch(() => [] as AlgorithmInput[]);
      try {
        const inputs = await schedulerService.fetchAlgorithmInputs(
          selectedTerm,
          selectedDepartment,
        );
        if (cancelled) return;
        const map = new Map(inputs.map(c => [c.course_code, c]));
        for (const c of custom) map.set(c.course_code, c);
        setAlgorithmCourses(Array.from(map.values()));
      } catch (err) {
        // Backend not ready yet → fall back to whatever custom courses we have.
        console.error('Failed to load scheduler inputs:', err);
        if (!cancelled) setAlgorithmCourses(custom);
      } finally {
        if (!cancelled) setInputsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDepartment, selectedTerm]);

  useEffect(() => {
    let cancelled = false;
    schedulerService.fetchLinkableInputs(selectedTerm)
      .then(inputs => {
        if (!cancelled) setLinkableCourses(inputs);
      })
      .catch(err => {
        console.error('Failed to load linkable scheduler inputs:', err);
        if (!cancelled) setLinkableCourses([]);
      });
    return () => { cancelled = true; };
  }, [selectedTerm]);

  const addCustomCourse = useCallback((course: AlgorithmInput) => {
    const entry: AlgorithmInput = { ...course, course_id: course.course_id || Date.now() };
    // 1. Upsert into the in-memory catalog.
    setAlgorithmCourses(prev => {
      const map = new Map(prev.map(c => [c.course_code, c]));
      map.set(entry.course_code, entry);
      return Array.from(map.values());
    });
    // 2. Open it in the current department's term selection.
    setSelectionByDept(prev => ({
      ...prev,
      [selectionKey]: Array.from(new Set([...(prev[selectionKey] ?? []), entry.course_code])),
    }));
    // 3. Persist via the store (localStorage in demo) + POST to the backend when wired.
    scheduleStore.saveCustomCourse(entry).catch(err => console.error('saveCustomCourse failed:', err));
    courseService.createCourse(entry).catch(err => console.error('createCourse failed:', err));
  }, [selectionKey]);

  const updateCourseSection = useCallback((code: string, delta: number) => {
    setAlgorithmCourses(prev => prev.map(c =>
      c.course_code === code ? { ...c, section_count: Math.max(1, c.section_count + delta) } : c
    ));
  }, []);

  const updateCourseContext = useCallback((code: string, newName: string, newLecturer: string) => {
    setAlgorithmCourses(prev => prev.map(c =>
      c.course_code === code ? { ...c, course_name: newName, instructor_full_name: newLecturer } : c
    ));
  }, []);

  const importCourses = useCallback((imported: AlgorithmInput[]) => {
    setAlgorithmCourses(prev => {
      const map = new Map(prev.map(c => [c.course_code, c]));
      for (const c of imported) {
        map.set(c.course_code, c);
      }
      return Array.from(map.values());
    });
    // Excel-imported courses land directly in the current department's term selection.
    setSelectionByDept(prev => ({
      ...prev,
      [selectionKey]: Array.from(new Set([...(prev[selectionKey] ?? []), ...imported.map(c => c.course_code)])),
    }));
  }, [selectionKey]);

  const setCommonWorkbook = useCallback((rows: CommonWorkbookRow[], fileName: string) => {
    setCommonWorkbookByTerm(prev => ({
      ...prev,
      [selectedTerm]: { rows, fileName },
    }));
    if (isPoolDept(selectedDepartment)) {
      setConstraints([]);
      setCourseSplits({});
      resetConstraintSaved();
    }
  }, [resetConstraintSaved, selectedDepartment, selectedTerm]);

  const runAlgorithm = useCallback(async () => {
    if (isPoolDept(selectedDepartment) && commonWorkbookRows.length === 0) {
      setCalculationTime(-1);
      return;
    }
    setIsCalculating(true);
    setCalculationTime(null);
    setPublishedAt(null);
    setRoomsAssigned(false); // a fresh timetable hasn't had rooms assigned yet

    try {
      const bundle: ConstraintBundle = {
        periodKey: currentCommonKey,
        department: selectedDepartment || 'HAVUZ',
        settings: constraintSettings,
        systemRules: systemRuleEnabled,
        constraints,
        linkedGroups,
        splits: courseSplits,
      };
      // Persist first, then run. The backend reloads this bundle from PostgreSQL,
      // ensuring browser state and the solver never use different constraints.
      await schedulerService.saveConstraintBundle(bundle);
      const result = await schedulerService.runUniversityScheduler(
        algorithmCourses,
        commonWorkbookRows,
        selectedTerm,
        selectedDepartment || 'BİL',
        isPoolDept(selectedDepartment),
        selectedCourseCodes,
        isPoolDept(selectedDepartment) ? [] : commonSchedule,
      );
      setCommonMap(prev => ({ ...prev, [currentCommonKey]: result.commonCourses }));
      setDeptScheduleMap(prev => {
        const next = { ...prev };
        for (const [department, courses] of Object.entries(result.departmentSchedules)) {
          next[`${currentCommonKey}|${department}`] = courses;
        }
        return next;
      });
      // Re-flag conflicts with the same rules the grid + drag-drop use, so a
      // fresh build paints real instructor/room clashes red consistently — not
      // only after the user manually moves a block.
      const displayedCourses = redetectConflicts(isPoolDept(selectedDepartment)
        ? result.commonCourses
        : [
            ...result.commonCourses
              .filter(course => {
                const baseCode = course.code.split("-", 1)[0];
                const audience = course.audienceDepartments?.length
                  ? course.audienceDepartments
                  : (audienceByCourseCode.get(baseCode) ?? []);
                return audience.length === 0 || audience.includes(selectedDepartment);
              })
              .map(course => ({ ...course, isLocked: true })),
            ...result.courses,
          ]);
      // Keep the reported conflict count in step with what the grid paints red.
      const stats = { ...result.stats, conflictCount: displayedCourses.filter(c => c.hasConflict).length };
      setScheduledCourses(displayedCourses);
      setScheduleStats(stats);
      setCalculationTime(result.stats.executionTime);
      setOpenCourseIds(displayedCourses.map(c => c.id));

      if (result.stats.uniqueLecturers.length > 0 && !selectedLecturer) {
        setSelectedLecturer(result.stats.uniqueLecturers[0]);
      }
    } catch (err) {
      console.error('Scheduler failed:', err);
      setScheduledCourses([]);
      setScheduleStats(null);
      setCalculationTime(-1);
    } finally {
      setIsCalculating(false);
    }
  }, [algorithmCourses, audienceByCourseCode, commonSchedule, commonWorkbookRows, selectedTerm, selectedLecturer, linkedGroups, constraints, courseSplits, systemRuleEnabled, constraintSettings, selectedDepartment, selectedCourseCodes, currentCommonKey, setPublishedAt, setOpenCourseIds]);

  // Department selection changes which result is displayed. A HAVUZ run stops
  // after phase 1; a department run generates only that selected department.
  useEffect(() => {
    if (!selectedDepartment) return;
    if (isPoolDept(selectedDepartment)) {
      const courses = commonMap[currentCommonKey];
      if (!courses) return;
      const flagged = redetectConflicts(courses);
      setScheduledCourses(flagged);
      setOpenCourseIds(flagged.map(course => course.id));
      return;
    }
    const courses = deptScheduleMap[`${currentCommonKey}|${selectedDepartment}`];
    if (!courses) {
      setScheduledCourses([]);
      setOpenCourseIds([]);
      setScheduleStats(null);
      setCalculationTime(null);
      return;
    }
    const common = (commonMap[currentCommonKey] ?? [])
      .filter(course => {
        const baseCode = course.code.split("-", 1)[0];
        const audience = course.audienceDepartments?.length
          ? course.audienceDepartments
          : (audienceByCourseCode.get(baseCode) ?? []);
        return audience.length === 0 || audience.includes(selectedDepartment);
      })
      .map(course => ({ ...course, isLocked: true }));
    const combined = redetectConflicts([...common, ...courses]);
    setScheduledCourses(combined);
    setOpenCourseIds(combined.map(course => course.id));
  }, [selectedDepartment, commonMap, deptScheduleMap, audienceByCourseCode, currentCommonKey, setOpenCourseIds]);

  // ── Read path: hydrate the displayed timetable from PUBLISHED schedules ──
  // Without this the grid only ever shows a freshly-built schedule and is empty
  // on reload / for instructors (who never build). Runs on login and period
  // change; a fresh runAlgorithm build overrides it afterwards (a build changes
  // neither dependency, so it is never clobbered).
  useEffect(() => {
    // A new session (login/logout/period change) starts unpublished — clear the
    // "published" badge so it never lingers across accounts.
    setPublishedAt(null);
    if (!currentUser) {
      setScheduledCourses([]);
      setOpenCourseIds([]);
      setScheduleStats(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      scheduleStore.getCommon(currentCommonKey),
      scheduleStore.getDeptSchedules(currentCommonKey),
    ]).then(([common, depts]) => {
      if (cancelled) return;
      // Re-flag conflicts on load so a saved/published schedule that already
      // contains a clash (same instructor / room) shows red right away — not
      // only after the user drags something.
      const view = redetectConflicts(scopedPublishedView(
        common,
        depts,
        currentUser,
        selectedDeptRef.current,
        audienceByCourseCode,
      ));
      setScheduledCourses(view);
      setOpenCourseIds(view.map(c => c.id));
      setScheduleStats(null);
    }).catch(err => console.error('hydratePublishedView failed:', err));
    return () => { cancelled = true; };
  }, [currentUser, currentCommonKey, audienceByCourseCode, setOpenCourseIds, setPublishedAt]);

  // Manually bring the saved/published schedule back into view. Running the
  // algorithm again replaces the displayed timetable with a fresh (unsaved)
  // build; this restores the last published one for the current scope so the
  // saved program is never lost behind a re-run.
  const restorePublishedSchedule = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [common, depts] = await Promise.all([
        scheduleStore.getCommon(currentCommonKey),
        scheduleStore.getDeptSchedules(currentCommonKey),
      ]);
      const view = redetectConflicts(scopedPublishedView(
        common,
        depts,
        currentUser,
        selectedDeptRef.current,
        audienceByCourseCode,
      ));
      setScheduledCourses(view);
      setOpenCourseIds(view.map(c => c.id));
      setScheduleStats(null);
      setCalculationTime(null);
      // Reflect rooms if the restored program already has them assigned.
      setRoomsAssigned(view.some(c => c.room && c.room !== 'TBA' && c.room.trim() !== ''));
    } catch (err) {
      console.error('restorePublishedSchedule failed:', err);
    }
  }, [currentUser, currentCommonKey, audienceByCourseCode, setOpenCourseIds]);

  const deletePreviousSchedule = useCallback(async () => {
    await scheduleStore.deletePublishedSchedules(currentCommonKey);
    setCommonMap(prev => ({ ...prev, [currentCommonKey]: [] }));
    setDeptScheduleMap(prev => {
      const next: Record<string, Course[]> = {};
      const prefix = `${currentCommonKey}|`;
      for (const [key, courses] of Object.entries(prev)) {
        if (!key.startsWith(prefix)) next[key] = courses;
      }
      return next;
    });
    setScheduledCourses([]);
    setOpenCourseIds([]);
    setScheduleStats(null);
    setCalculationTime(null);
    setRoomsAssigned(false);
    setPublishedAt(null);
  }, [currentCommonKey, setOpenCourseIds, setPublishedAt]);

  return (
    <SchedulerContext.Provider value={{
      isCalculating, calculationTime, runAlgorithm,
      scheduledCourses, scheduleStats,
      selectedTerm, setSelectedTerm,
      selectedLecturer, setSelectedLecturer,
      algorithmCourses, linkableCourses, inputsLoading, updateCourseSection, updateCourseContext, importCourses, addCustomCourse,
      commonWorkbookRows, commonWorkbookFileName, setCommonWorkbook,
      selectedCourseCodes, toggleCourseSelection, selectCourses, deselectCourse, clearCourseSelection,
      systemRuleEnabled, toggleSystemRule,
      constraintSettings, setLunchBreakEnabled, setLunchBreakSlot,
      courseSplits, setCourseSplit,
      constraintSaved, markConstraintSaved, resetConstraintSaved, allConstraintsSaved,
      selectedDepartment, setSelectedDepartment,
      commonSchedule, saveCommonSchedule,
      saveDeptSchedule, archiveCurrentSchedule, publishedDepartments, assignAllRooms, roomsAssigned,
      linkedGroups, addLinkedGroup, removeLinkedGroup, updateLinkedGroup,
      constraints, addConstraint, removeConstraint, clearConstraints,
      moveScheduledCourse,
      allPublishedSessions,
      restorePublishedSchedule,
      deletePreviousSchedule,
    }}>
      {children}
    </SchedulerContext.Provider>
  );
}

export const useScheduler = () => useContext(SchedulerContext);
