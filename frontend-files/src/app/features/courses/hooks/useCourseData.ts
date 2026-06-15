import { useState, useEffect, useCallback } from 'react';
import type { DbCourse } from '@/app/features/courses/types/courseTypes';
import { fetchCourseData } from '@/app/services/courseService';

/**
 * ─── useCourseData Hook ─────────────────────────────────────────────────────
 * Manages the full lifecycle of fetching course data:
 *   • loading state (skeleton UI)
 *   • error state  (retry-able)
 *   • data state   (courses array)
 *   • refetch()    (manual refresh)
 *
 * Usage:
 *   const { courses, isLoading, error, refetch } = useCourseData();
 * ────────────────────────────────────────────────────────────────────────────
 */
export function useCourseData() {
  const [courses, setCourses] = useState<DbCourse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCourseData();
      setCourses(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setCourses([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return {
    /** The fetched course list (empty while loading or on error) */
    courses,
    /** True while the initial fetch or a refetch is in progress */
    isLoading,
    /** Error message string, or null if no error */
    error,
    /** Call this to re-fetch course data manually */
    refetch: loadCourses,
  };
}
