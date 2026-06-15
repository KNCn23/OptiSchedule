import type { Course } from '@/app/data/mockData';

const POOL_DEPARTMENT = 'HAVUZ';

interface ParsedClassLevel {
  year: number;
}

function parseClassLevel(value: string): ParsedClassLevel | null {
  const match = value.match(/^(\d+)/);
  if (!match) return null;
  return { year: Number(match[1]) };
}

export function matchesScheduleScope(
  course: Course,
  selectedDepartments: string[],
  selectedClassLevels: string[],
  inferredAudienceDepartments: string[] = [],
): boolean {
  const hasDepartmentFilter = selectedDepartments.length > 0;
  const hasClassFilter = selectedClassLevels.length > 0;
  if (!hasDepartmentFilter && !hasClassFilter) return true;

  const courseClass = parseClassLevel(course.classLevel);
  const selectedYears = selectedClassLevels
    .map(value => Number(value))
    .filter(Number.isFinite);
  const matchesYear = !hasClassFilter || Boolean(courseClass && selectedYears.includes(courseClass.year));
  if (!matchesYear) return false;

  if (course.department === POOL_DEPARTMENT) {
    const audienceDepartments = course.audienceDepartments?.length
      ? course.audienceDepartments
      : inferredAudienceDepartments;
    if (!hasDepartmentFilter) return true;
    if (selectedDepartments.includes(POOL_DEPARTMENT)) return true;
    return selectedDepartments.some(department => audienceDepartments.includes(department));
  }

  if (selectedDepartments.includes(POOL_DEPARTMENT)) return false;
  return !hasDepartmentFilter || selectedDepartments.includes(course.department);
}
