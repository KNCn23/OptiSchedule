/**
 * ─── Auth contract ──────────────────────────────────────────────────────────
 * Mirrors the backend Users + Roles tables (5may_db_nobugs.sql). The frontend
 * never sees password_hash. `role` carries the Roles.role_name string.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Roles.role_name values from the backend.
 *   admin       — full access
 *   dept_chair  — dean / department chair (admin portal)
 *   coordinator — department program coordinator (admin portal, dept-locked, no pool)
 *   secretary   — department secretary (admin portal, dept-scoped)
 *   instructor  — academic staff (academic portal)
 *   viewer      — read-only
 */
export type UserRole = 'admin' | 'dept_chair' | 'coordinator' | 'instructor' | 'secretary' | 'viewer';

export interface Account {
  /** Users.user_id */
  user_id: number;

  /** Users.username — login identifier shown in the header. */
  username: string;

  /** Display name (Instructors.full_name for instructors, else username). */
  full_name: string;

  /** Roles.role_name — gates routes (admin vs academic) and UI permissions. */
  role: UserRole;

  /** Users.department_id — set for dept_chair / secretary / instructor. */
  department_id?: number | null;

  /** Joined Departments.department_name for display + catalog filtering. */
  department_name?: string | null;
}

/** Credentials POSTed to /api/auth/login. */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Backend response for /api/auth/login on success. */
export interface LoginResponse {
  account: Account;
  /** Session token (JWT or opaque); frontend stores it for subsequent requests. */
  token: string;
}
