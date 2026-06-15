import type {
  Reservation,
  Room,
  RoomTypeFilter,
  TimeSlot,
  RoomGrouped,
} from '@/app/features/reservations/types/reservationTypes';
import { DEMO_MODE } from '@/app/services/apiClient';
import { DEMO_ROOMS } from '@/app/services/demoData';

/**
 * Room reference list. Real data comes from the backend; until then DEMO_MODE
 * supplies a small sample list so the reservation UI is usable standalone.
 *
 * BACKEND TODO: load this from `lookupService.fetchRooms()` (GET /api/rooms),
 * and replace the localStorage helpers below with `reservationService` calls
 * (GET/POST/DELETE /api/reservations, GET /api/rooms/availability).
 */
const ROOMS: Room[] = DEMO_MODE ? DEMO_ROOMS : [];

const STORAGE_KEY = 'optisched-reservations';

// ── localStorage helpers ──

export function getReservations(): Reservation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveReservation(reservation: Reservation): void {
  const all = getReservations();
  all.push(reservation);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function removeReservation(id: string): void {
  const all = getReservations().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getUserReservations(userId: string): Reservation[] {
  return getReservations().filter(r => r.userId === userId);
}

// ── Availability check ──

export function isRoomAvailable(
  roomCode: string,
  date: string,
  timeSlots: TimeSlot[],
): boolean {
  const reservations = getReservations();
  return !reservations.some(
    r =>
      r.roomCode === roomCode &&
      r.date === date &&
      r.timeSlots.some(ts => timeSlots.includes(ts)),
  );
}

// ── Filtering ──

export function filterRooms(
  roomType: RoomTypeFilter,
  minCapacity: number,
  date: string,
  timeSlots: TimeSlot[],
): (Room & { isAvailable: boolean })[] {
  return ROOMS
    .filter(room => {
      if (roomType !== 'all' && room.type !== roomType) return false;
      if (room.capacity < minCapacity) return false;
      return true;
    })
    .map(room => ({
      ...room,
      isAvailable: isRoomAvailable(room.roomCode, date, timeSlots),
    }));
}

// ── Grouping ──

export function groupRoomsByBlockAndFloor(
  rooms: (Room & { isAvailable: boolean })[],
): RoomGrouped[] {
  const blockMap = new Map<string, Map<number, (Room & { isAvailable: boolean })[]>>();

  for (const room of rooms) {
    if (!blockMap.has(room.block)) {
      blockMap.set(room.block, new Map());
    }
    const floorMap = blockMap.get(room.block)!;
    if (!floorMap.has(room.floor)) {
      floorMap.set(room.floor, []);
    }
    floorMap.get(room.floor)!.push(room);
  }

  const result: RoomGrouped[] = [];
  const sortedBlocks = [...blockMap.keys()].sort();

  for (const block of sortedBlocks) {
    const floorMap = blockMap.get(block)!;
    const sortedFloors = [...floorMap.keys()].sort((a, b) => a - b);
    const floors = sortedFloors.map(floor => ({
      floor,
      rooms: floorMap.get(floor)!.sort((a, b) => a.roomCode.localeCompare(b.roomCode)),
    }));
    result.push({ block, floors });
  }

  return result;
}

// ── ID generation ──

export function generateReservationId(): string {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Date helpers ──

export function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateTr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export function formatDateEn(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

export function getRoomTypeLabel(type: string, locale: 'tr' | 'en'): string {
  const map: Record<string, Record<string, string>> = {
    derslik: { tr: 'Derslik', en: 'Classroom' },
    amfi: { tr: 'Amfi', en: 'Amphitheater' },
    laboratuvar: { tr: 'Laboratuvar', en: 'Laboratory' },
    all: { tr: 'Tümü', en: 'All' },
  };
  return map[type]?.[locale] ?? type;
}

// ── Week helpers ──

/** Returns the Monday of the week containing the given date */
export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  // getDay(): 0=Sun, 1=Mon, ...6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Returns Monday-Friday date strings (YYYY-MM-DD) for a given week offset from today */
export function getWeekDates(weekOffset: number = 0): string[] {
  const now = new Date();
  const monday = getMonday(now);
  monday.setDate(monday.getDate() + weekOffset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

/** Returns a formatted week range string, e.g. "12.05.2026 - 16.05.2026" */
export function getWeekRangeLabel(weekOffset: number, locale: 'tr' | 'en'): string {
  const dates = getWeekDates(weekOffset);
  const mon = dates[0];
  const fri = dates[4];
  if (locale === 'tr') {
    return `${formatDateTr(mon)} - ${formatDateTr(fri)}`;
  }
  return `${formatDateEn(mon)} - ${formatDateEn(fri)}`;
}

/** Returns all reservations that fall within the given week */
export function getReservationsForWeek(weekOffset: number): Reservation[] {
  const dates = getWeekDates(weekOffset);
  const dateSet = new Set(dates);
  return getReservations().filter(r => dateSet.has(r.date));
}
