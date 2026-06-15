/**
 * Sample classroom inventory for the room-assignment module. Placeholder demo
 * data — replace with a backend fetch (GET /api/rooms) when wired. Capacity is
 * used to fit a section's enrollment; block/floor are informational.
 */
export interface Room {
  code: string;
  capacity: number;
  block: string;
  floor: number;
  type: 'normal' | 'lab';
}

export const ROOMS: Room[] = [
  // ── Block A ──
  { code: 'A-101', capacity: 40, block: 'A', floor: 1, type: 'normal' },
  { code: 'A-102', capacity: 40, block: 'A', floor: 1, type: 'normal' },
  { code: 'A-103', capacity: 60, block: 'A', floor: 1, type: 'normal' },
  { code: 'A-201', capacity: 80, block: 'A', floor: 2, type: 'normal' },
  { code: 'A-202', capacity: 120, block: 'A', floor: 2, type: 'normal' },
  { code: 'A-Lab1', capacity: 30, block: 'A', floor: 1, type: 'lab' },
  { code: 'A-Lab2', capacity: 30, block: 'A', floor: 2, type: 'lab' },
  // ── Block B ──
  { code: 'B-101', capacity: 50, block: 'B', floor: 1, type: 'normal' },
  { code: 'B-102', capacity: 50, block: 'B', floor: 1, type: 'normal' },
  { code: 'B-103', capacity: 35, block: 'B', floor: 1, type: 'normal' },
  { code: 'B-201', capacity: 70, block: 'B', floor: 2, type: 'normal' },
  { code: 'B-202', capacity: 90, block: 'B', floor: 2, type: 'normal' },
  { code: 'B-Lab1', capacity: 25, block: 'B', floor: 1, type: 'lab' },
  { code: 'B-Lab2', capacity: 25, block: 'B', floor: 2, type: 'lab' },
  // ── Block C ──
  { code: 'C-101', capacity: 45, block: 'C', floor: 1, type: 'normal' },
  { code: 'C-102', capacity: 45, block: 'C', floor: 1, type: 'normal' },
  { code: 'C-201', capacity: 60, block: 'C', floor: 2, type: 'normal' },
  { code: 'C-202', capacity: 100, block: 'C', floor: 2, type: 'normal' },
  { code: 'C-301', capacity: 150, block: 'C', floor: 3, type: 'normal' },
  { code: 'C-Lab1', capacity: 30, block: 'C', floor: 1, type: 'lab' },
  // ── Block D ──
  { code: 'D-101', capacity: 40, block: 'D', floor: 1, type: 'normal' },
  { code: 'D-102', capacity: 55, block: 'D', floor: 1, type: 'normal' },
  { code: 'D-201', capacity: 75, block: 'D', floor: 2, type: 'normal' },
  { code: 'D-202', capacity: 110, block: 'D', floor: 2, type: 'normal' },
  { code: 'D-Lab1', capacity: 28, block: 'D', floor: 1, type: 'lab' },
  { code: 'D-Lab2', capacity: 28, block: 'D', floor: 2, type: 'lab' },
];
