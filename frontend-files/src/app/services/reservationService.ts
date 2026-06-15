/**
 * ─── reservationService ─────────────────────────────────────────────────────
 * Classroom reservation CRUD + availability. Replaces the temporary
 * localStorage store currently in utils/reservationUtils.ts.
 *
 * Expected backend endpoints:
 *   GET    /api/reservations               → Reservation[]      (all)
 *   GET    /api/reservations?userId=:id     → Reservation[]      (mine)
 *   POST   /api/reservations                body: NewReservation → Reservation
 *   DELETE /api/reservations/:id                                 → 204
 *   GET    /api/rooms/availability
 *          ?date=YYYY-MM-DD&timeSlots=...&roomType=...&minCapacity=...
 *          → (Room & { isAvailable: boolean })[]
 *
 * Backend dev: once these are live, swap the localStorage calls in
 * utils/reservationUtils.ts for these functions (the components already call
 * through that util layer, so the change is localized).
 * ────────────────────────────────────────────────────────────────────────────
 */

import type {
  Reservation,
  Room,
  RoomTypeFilter,
  TimeSlot,
} from '@/app/features/reservations/types/reservationTypes';
import { request } from '@/app/services/apiClient';

export interface NewReservation {
  roomCode: string;
  date: string; // YYYY-MM-DD
  timeSlots: TimeSlot[];
  courseCode?: string;
  instructorName?: string;
  description?: string;
}

export function fetchAllReservations(): Promise<Reservation[]> {
  return request<Reservation[]>('/reservations');
}

export function fetchUserReservations(userId: string): Promise<Reservation[]> {
  return request<Reservation[]>(`/reservations?userId=${encodeURIComponent(userId)}`);
}

export function createReservation(body: NewReservation): Promise<Reservation> {
  return request<Reservation>('/reservations', { method: 'POST', body });
}

export function deleteReservation(id: string): Promise<void> {
  return request<void>(`/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchRoomAvailability(params: {
  date: string;
  timeSlots: TimeSlot[];
  roomType: RoomTypeFilter;
  minCapacity: number;
}): Promise<(Room & { isAvailable: boolean })[]> {
  const q = new URLSearchParams({
    date: params.date,
    timeSlots: params.timeSlots.join(','),
    roomType: params.roomType,
    minCapacity: String(params.minCapacity),
  });
  return request<(Room & { isAvailable: boolean })[]>(`/rooms/availability?${q.toString()}`);
}
