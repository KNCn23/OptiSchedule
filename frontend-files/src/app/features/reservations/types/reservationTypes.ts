// ── Reservation System Type Definitions ──

export type RoomType = 'derslik' | 'amfi' | 'laboratuvar';

export interface Room {
  roomCode: string;
  capacity: number;
  type: RoomType;
  block: string;
  floor: number;
}

export type TimeSlot =
  | '09:00 - 09:50'
  | '10:00 - 10:50'
  | '11:00 - 11:50'
  | '12:00 - 12:50'
  | '13:00 - 13:50'
  | '14:00 - 14:50'
  | '15:00 - 15:50'
  | '16:00 - 16:50';

export const ALL_TIME_SLOTS: TimeSlot[] = [
  '09:00 - 09:50',
  '10:00 - 10:50',
  '11:00 - 11:50',
  '12:00 - 12:50',
  '13:00 - 13:50',
  '14:00 - 14:50',
  '15:00 - 15:50',
  '16:00 - 16:50',
];

export type RoomTypeFilter = 'all' | RoomType;

export const ROOM_TYPE_OPTIONS: { value: RoomTypeFilter; labelTr: string; labelEn: string }[] = [
  { value: 'all', labelTr: 'Tümü', labelEn: 'All' },
  { value: 'derslik', labelTr: 'Derslik', labelEn: 'Classroom' },
  { value: 'amfi', labelTr: 'Amfi', labelEn: 'Amphitheater' },
  { value: 'laboratuvar', labelTr: 'Laboratuvar', labelEn: 'Laboratory' },
];

export interface ReservationFilterState {
  date: string; // YYYY-MM-DD
  timeSlots: TimeSlot[];
  roomType: RoomTypeFilter;
  minCapacity: number;
}

export interface Reservation {
  id: string;
  roomCode: string;
  date: string; // YYYY-MM-DD
  timeSlots: TimeSlot[];
  userId: string;
  userName: string;
  userRole: string;
  createdAt: string; // ISO string
  roomCapacity: number;
  roomType: RoomType;
  /** Optional — course code this reservation is for */
  courseCode?: string;
  /** Optional — instructor / requester name */
  instructorName?: string;
  /** Optional — purpose or notes */
  description?: string;
}

export type ReservationView = 'home' | 'newChoice' | 'filters' | 'results' | 'active' | 'allReservations' | 'matrix';

export interface RoomGrouped {
  block: string;
  floors: {
    floor: number;
    rooms: (Room & { isAvailable: boolean })[];
  }[];
}
