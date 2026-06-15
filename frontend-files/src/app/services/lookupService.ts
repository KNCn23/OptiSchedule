/**
 * ─── lookupService ──────────────────────────────────────────────────────────
 * Reference/lookup lists that used to be hardcoded (departments, lecturers,
 * class levels, rooms, blocks). Backend serves these so dropdowns stay in sync
 * with the database.
 *
 * Expected backend endpoints:
 *   GET /api/departments    → string[]   (e.g. ["Bilgisayar Mühendisliği", ...])
 *   GET /api/lecturers      → string[]   (display names)
 *   GET /api/class-levels   → string[]   (e.g. ["1. Sınıf BİL", ...])
 *   GET /api/blocks         → string[]   (e.g. ["D", "B", ...])
 *   GET /api/rooms          → Room[]
 *
 * NOTE: Most filter dropdowns in the app currently derive their options from the
 * already-loaded schedule (scheduledCourses) via useMemo, so they keep working
 * without these endpoints. Use this service when you need the *full* reference
 * list independent of what's currently scheduled.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Room } from '@/app/features/reservations/types/reservationTypes';
import { request } from '@/app/services/apiClient';

export function fetchDepartments(): Promise<string[]> {
  return request<string[]>('/departments');
}

export function fetchLecturers(): Promise<string[]> {
  return request<string[]>('/lecturers');
}

export function fetchClassLevels(): Promise<string[]> {
  return request<string[]>('/class-levels');
}

export function fetchBlocks(): Promise<string[]> {
  return request<string[]>('/blocks');
}

export function fetchRooms(): Promise<Room[]> {
  return request<Room[]>('/rooms');
}
