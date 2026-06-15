/**
 * ─── Course hour splitting options ──────────────────────────────────────────
 * The scheduler splits a course's weekly hours into blocks. By default a 3h
 * course is placed as a single 3h block (3+0), a 4h course as 2+2, 5h as 2+3,
 * 6h as 3+3. The admin can allow extra split patterns per course (multi-select)
 * to give the algorithm more flexibility. These patterns are sent to the
 * backend with each course.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** All selectable split patterns for a given weekly-hour count. */
export function getSplitOptions(hours: number): string[] {
  switch (hours) {
    case 1: return ['1+0'];
    case 2: return ['2+0', '1+1'];
    case 3: return ['3+0', '2+1'];
    case 4: return ['2+2', '3+1', '4+0'];
    case 5: return ['2+3', '3+2', '4+1', '5+0'];
    case 6: return ['3+3', '4+2', '2+2+2'];
    default: return [`${hours}+0`];
  }
}

/** The scheduler's default (pre-selected) split pattern for a weekly-hour count. */
export function getDefaultSplit(hours: number): string {
  switch (hours) {
    case 1: return '1+0';
    case 2: return '2+0';
    case 3: return '3+0';
    case 4: return '2+2';
    case 5: return '2+3';
    case 6: return '3+3';
    default: return `${hours}+0`;
  }
}

export function getCourseTotalHours(course: {
  weekly_hours: number;
  t_hour?: number;
  l_hour?: number;
}): number {
  const componentTotal = (course.t_hour ?? 0) + (course.l_hour ?? 0);
  return componentTotal > 0 ? componentTotal : course.weekly_hours;
}
