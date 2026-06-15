/**
 * ─── apiClient ──────────────────────────────────────────────────────────────
 * Thin fetch wrapper used by every service. Configure VITE_API_BASE_URL in a
 * `.env` file to point at the backend (e.g. http://localhost:8000/api).
 *
 * Adds:
 *   • JSON content-type by default
 *   • Bearer token from localStorage('optisched-token') when present
 *   • Friendly error throwing with HTTP status + message
 *
 * Backend devs: every service in this folder calls request() — no need to
 * touch this file unless auth scheme changes.
 * ────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? '/api';
const TOKEN_KEY = 'optisched-token';

/**
 * DEV-ONLY demo mode. Active when no backend URL is configured
 * (`VITE_API_BASE_URL` unset). In this mode the services fall back to local
 * demo data (see services/demoData.ts) so the frontend is fully usable without
 * a backend. As soon as VITE_API_BASE_URL is set, demo mode turns OFF and all
 * calls go to the real API — so demo data never conflicts with the database.
 */
export const DEMO_MODE = !((import.meta as any).env?.VITE_API_BASE_URL);

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  /** Skip auth header even if a token exists. Used by /auth/login. */
  noAuth?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (!opts.noAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const msg = (data as any)?.message || (data as any)?.detail || res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, data);
  }

  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
