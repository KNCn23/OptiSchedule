/**
 * Sample list of the faculty's departments. The schedule workflow is scoped to
 * one selected department (the program the timetable is built for).
 *
 * NOTE: This is placeholder demo data. When the backend is wired, replace this
 * with a fetch from the departments table (GET /api/departments). The `code`
 * is the short prefix shown on chips; `name` is the full program name.
 */
export interface Department {
  code: string;
  name: string;
}

export const DEPARTMENTS: Department[] = [
  { code: 'BİL', name: 'Bilgisayar Mühendisliği' },
  { code: 'EEM', name: 'Elektrik-Elektronik Mühendisliği' },
  { code: 'END', name: 'Endüstri Mühendisliği' },
  { code: 'CE', name: 'Civil Engineering' },
  { code: 'BME', name: 'Biyomedikal Mühendisliği' },
  { code: 'MAK', name: 'Makine Mühendisliği' },
  { code: 'AI', name: 'Yapay Zeka Mühendisliği' },
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'BENG', name: 'Biomedical Engineering' },
  { code: 'EEE', name: 'Electrical and Electronics Engineering' },
  { code: 'IND', name: 'Industrial Engineering' },
  { code: 'ME', name: 'Mechanical Engineering' },
];

/** Special cross-department scope: the dean schedules shared/pool courses here. */
export const POOL_DEPARTMENT: Department = { code: 'HAVUZ', name: 'Ortak Dersler (Havuz)' };

export function isPoolDept(code: string): boolean {
  return code === POOL_DEPARTMENT.code;
}

export function departmentName(code: string): string {
  if (code === POOL_DEPARTMENT.code) return POOL_DEPARTMENT.name;
  return DEPARTMENTS.find(d => d.code === code)?.name ?? code;
}

/** Resolve a department code from its full name (e.g. "Bilgisayar Mühendisliği" → "BİL"). */
export function departmentCodeByName(name?: string | null): string {
  if (!name) return '';
  return DEPARTMENTS.find(d => d.name === name)?.code ?? '';
}

/** The department a dept-locked account (coordinator / secretary) is bound to. */
export function departmentCodeForUser(account?: { department_name?: string | null } | null): string {
  return departmentCodeByName(account?.department_name);
}
