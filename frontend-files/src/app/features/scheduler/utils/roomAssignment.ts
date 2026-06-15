/**
 * Greedy best-fit classroom assignment. Runs across ALL sessions (every
 * department + the shared pool) at once because rooms are a shared resource.
 *
 * For each session (largest enrollment first) it picks the smallest room whose
 * capacity fits and that is free at that day/time. This mirrors what the
 * backend room-assignment module will do; swap in the real solver server-side.
 */
import type { Course } from '@/app/data/mockData';
import type { Room } from '@/app/features/reservations/types/reservationTypes';

const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };
const UNASSIGNED_ROOM = 'TBA';

export interface RoomAssignResult {
  courses: Course[];
  assigned: number;
  unassigned: number;
  noSuitableRoom: number;
  allSuitableRoomsBusy: number;
}

interface Placement {
  roomCode: string;
  capacity: number;
}

interface RepairBudget {
  remaining: number;
}

const MAX_REPAIR_DEPTH = 3;
const MAX_REPAIR_ROOMS = 12;
const MAX_REPAIR_STEPS = 6000;

/** enrollment: session code ("BİL101-1") → enrolled count (overrides the session's own count).
 *  preOccupied: sessions that already hold a room (e.g. departments assigned in an
 *  earlier pass). Their rooms are seeded as busy so a partial, department-by-department
 *  assignment never double-books a room another department already took. */
export function assignRooms(
  allSessions: Course[],
  rooms: Room[],
  enrollment: Record<string, number> = {},
  preOccupied: Course[] = [],
): RoomAssignResult {
  const normalizedEnrollment = Object.fromEntries(
    Object.entries(enrollment).map(([key, value]) => [normalizeCode(key), value]),
  );
  const occ = new Map<string, { day: number; start: number; end: number }[]>();
  const parseHour = (value: string) => Number.parseInt(value.split(':', 1)[0], 10);
  const isFree = (room: string, day: number, s: number, e: number) => {
    const list = occ.get(room);
    if (!list) return true;
    return !list.some(o => o.day === day && s < o.end && e > o.start);
  };
  // Seed occupancy with rooms already taken by sessions outside this pass.
  for (const c of preOccupied) {
    if (!c.room || c.room === UNASSIGNED_ROOM) continue;
    const day = DAY_INDEX[c.day] ?? 0;
    if (!occ.has(c.room)) occ.set(c.room, []);
    occ.get(c.room)!.push({ day, start: parseHour(c.startTime), end: parseHour(c.endTime) });
  }

  const codeKeys = (c: Course) => {
    const code = normalizeCode(c.code);
    const section = c.sectionNumber ?? sectionFromCode(code) ?? 1;
    const base = baseCodeOf(code);
    return Array.from(new Set([
      code,
      `${base}-${section}`,
      base,
    ]));
  };

  const needOf = (c: Course) => {
    for (const key of codeKeys(c)) {
      const value = normalizedEnrollment[key];
      if (Number.isFinite(value)) return value;
    }
    return c.studentsEnrolled ?? 0;
  };

  const result = allSessions.map(c => ({ ...c }));
  const workSessions: Course[] = [];
  const unitMembers: number[][] = [];
  const linkedUnitIndexes = new Map<string, number>();

  result.forEach((course, originalIndex) => {
    const isLinkedUnit = course.coScheduleGroup?.startsWith('LINKED:');
    if (!isLinkedUnit) {
      workSessions.push(course);
      unitMembers.push([originalIndex]);
      return;
    }

    const unitKey = [
      course.coScheduleGroup,
      course.day,
      course.startTime,
      course.endTime,
    ].join('|');
    const existingIndex = linkedUnitIndexes.get(unitKey);
    if (existingIndex !== undefined) {
      unitMembers[existingIndex].push(originalIndex);
      workSessions[existingIndex].studentsEnrolled =
        (workSessions[existingIndex].studentsEnrolled ?? 0) + needOf(course);
      if (course.type === 'Lab') workSessions[existingIndex].type = 'Lab';
      return;
    }

    const workIndex = workSessions.length;
    linkedUnitIndexes.set(unitKey, workIndex);
    workSessions.push({
      ...course,
      id: `linked-room-unit:${unitKey}`,
      code: `LINKEDUNIT${workIndex + 1}`,
      studentsEnrolled: needOf(course),
    });
    unitMembers.push([originalIndex]);
  });

  const compatibleRooms = (c: Course, allowLabOverflow = false) => {
    const need = needOf(c);
    const capacityMatches = rooms.filter(r => r.capacity >= need);
    if (c.type !== 'Lab') return capacityMatches;
    const labs = capacityMatches.filter(r => r.type === 'laboratuvar');
    return labs.length > 0 || !allowLabOverflow ? labs : capacityMatches;
  };

  // Place the hardest sessions first: fewer feasible rooms, then larger class.
  const order = workSessions.map((c, i) => {
    const compatibleCount = compatibleRooms(c, true).length;
    return {
      c,
      i,
      compatibleCount,
      need: needOf(c),
      duration: parseHour(c.endTime) - parseHour(c.startTime),
    };
  }).sort((a, b) => (
    a.compatibleCount - b.compatibleCount
    || b.need - a.need
    || b.duration - a.duration
  ));

  const placements = new Map<number, Placement>();
  const unplaced: number[] = [];
  for (const { c, i } of order) {
    const need = needOf(c);
    const day = DAY_INDEX[c.day] ?? 0;
    const s = parseHour(c.startTime);
    const e = parseHour(c.endTime);
    const strictRooms = compatibleRooms(c, false);
    const suitableRooms = strictRooms.length > 0 ? strictRooms : compatibleRooms(c, true);
    const fittingRooms = suitableRooms.filter(r => isFree(r.roomCode, day, s, e));
    const fits = fittingRooms
      .sort((a, b) => {
        const aTypePenalty = typePenalty(c, a);
        const bTypePenalty = typePenalty(c, b);
        return aTypePenalty - bTypePenalty || a.capacity - b.capacity;
      });
    if (fits.length) {
      const room = fits[0];
      placements.set(i, { roomCode: room.roomCode, capacity: room.capacity });
      if (!occ.has(room.roomCode)) occ.set(room.roomCode, []);
      occ.get(room.roomCode)!.push({ day, start: s, end: e });
    } else {
      unplaced.push(i);
    }
  }

  // Repair greedy dead-ends by moving already placed sessions to alternate
  // rooms. The search is transactional: a failed chain leaves assignments
  // untouched, while a successful chain frees a compatible room for the
  // previously unassigned session.
  const repairBudget: RepairBudget = { remaining: MAX_REPAIR_STEPS };
  for (const index of unplaced) {
    if (repairBudget.remaining <= 0) break;
    const repaired = tryPlaceWithRelocation(
      index,
      workSessions,
      placements,
      rooms,
      compatibleRooms,
      preOccupied,
      new Set(),
      new Set(),
      0,
      repairBudget,
    );
    if (repaired) {
      placements.clear();
      for (const [sessionIndex, placement] of repaired) placements.set(sessionIndex, placement);
    }
  }

  let assigned = 0;
  let noSuitableRoom = 0;
  let allSuitableRoomsBusy = 0;
  workSessions.forEach((course, index) => {
    const placement = placements.get(index);
    const members = unitMembers[index];
    if (placement) {
      for (const memberIndex of members) {
        result[memberIndex].studentsEnrolled = needOf(result[memberIndex]);
        result[memberIndex].room = placement.roomCode;
        result[memberIndex].totalCapacity = placement.capacity;
      }
      assigned += members.length;
      return;
    }
    for (const memberIndex of members) {
      result[memberIndex].studentsEnrolled = needOf(result[memberIndex]);
      result[memberIndex].room = UNASSIGNED_ROOM;
      result[memberIndex].totalCapacity = 0;
    }
    if (compatibleRooms(course, true).length === 0) noSuitableRoom += members.length;
    else allSuitableRoomsBusy += members.length;
  });
  const unassigned = result.length - assigned;
  return { courses: result, assigned, unassigned, noSuitableRoom, allSuitableRoomsBusy };
}

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '').split('#', 1)[0];
}

function sectionFromCode(code: string): number | null {
  const match = code.match(/-(\d+)$/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function baseCodeOf(code: string): string {
  return code.replace(/-\d+$/, '');
}

function typePenalty(course: Course, room: Room): number {
  if (course.type === 'Lab') return room.type === 'laboratuvar' ? 0 : 20;
  if (room.type === 'derslik') return 0;
  if (room.type === 'amfi') return 1;
  return 5;
}

function tryPlaceWithRelocation(
  sessionIndex: number,
  sessions: Course[],
  placements: Map<number, Placement>,
  rooms: Room[],
  compatibleRooms: (course: Course, allowLabOverflow?: boolean) => Room[],
  fixedSessions: Course[],
  visitingSessions: Set<number>,
  reservedRooms: Set<string>,
  depth: number,
  budget: RepairBudget,
): Map<number, Placement> | null {
  budget.remaining--;
  if (
    budget.remaining < 0
    || depth > MAX_REPAIR_DEPTH
    || visitingSessions.has(sessionIndex)
  ) return null;
  const course = sessions[sessionIndex];
  const strictRooms = compatibleRooms(course, false);
  const candidates = (strictRooms.length > 0 ? strictRooms : compatibleRooms(course, true))
    .filter(room => !reservedRooms.has(room.roomCode))
    .sort((a, b) => typePenalty(course, a) - typePenalty(course, b) || a.capacity - b.capacity)
    .slice(0, MAX_REPAIR_ROOMS);

  const nextVisiting = new Set(visitingSessions).add(sessionIndex);
  for (const room of candidates) {
    if (fixedSessions.some(fixed => (
      fixed.room === room.roomCode
      && sessionsOverlap(course, fixed)
    ))) continue;

    const blockers = Array.from(placements.entries())
      .filter(([otherIndex, placement]) => (
        otherIndex !== sessionIndex
        && placement.roomCode === room.roomCode
        && sessionsOverlap(course, sessions[otherIndex])
      ))
      .map(([otherIndex]) => otherIndex);

    let candidatePlacements = new Map(placements);
    candidatePlacements.delete(sessionIndex);
    const nextReserved = new Set(reservedRooms).add(room.roomCode);
    let success = true;
    for (const blocker of blockers) {
      candidatePlacements.delete(blocker);
      const moved = tryPlaceWithRelocation(
        blocker,
        sessions,
        candidatePlacements,
        rooms,
        compatibleRooms,
        fixedSessions,
        nextVisiting,
        nextReserved,
        depth + 1,
        budget,
      );
      if (!moved) {
        success = false;
        break;
      }
      candidatePlacements = moved;
    }
    if (!success) continue;
    candidatePlacements.set(sessionIndex, {
      roomCode: room.roomCode,
      capacity: room.capacity,
    });
    return candidatePlacements;
  }
  return null;
}

function sessionsOverlap(a: Course, b: Course): boolean {
  if (a.day !== b.day) return false;
  const aStart = Number.parseInt(a.startTime.split(':', 1)[0], 10);
  const aEnd = Number.parseInt(a.endTime.split(':', 1)[0], 10);
  const bStart = Number.parseInt(b.startTime.split(':', 1)[0], 10);
  const bEnd = Number.parseInt(b.endTime.split(':', 1)[0], 10);
  return aStart < bEnd && aEnd > bStart;
}
