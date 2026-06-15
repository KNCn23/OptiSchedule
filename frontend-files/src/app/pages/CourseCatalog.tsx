import { BookOpen } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { useCourseData } from '@/app/features/courses/hooks/useCourseData';
import { CourseDataTable } from '@/app/features/courses/components/CourseDataTable';
import { LoginScreen } from '@/app/features/auth/components/LoginScreen';
import { useMemo } from 'react';

/**
 * ─── CourseCatalog Page ─────────────────────────────────────────────────────
 *
 * Assembles the useCourseData hook with the CourseDataTable component.
 * This page knows *what* to display, but not *how* or *where* data comes from.
 *
 * Architecture:
 *   fetchCourseData (service) → useCourseData (hook) → CourseCatalog (page) → CourseDataTable (UI)
 * ────────────────────────────────────────────────────────────────────────────
 */
export function CourseCatalog() {
  const { darkMode, currentUser } = useApp();
  const { t } = useLocale();
  const { courses, isLoading, error, refetch } = useCourseData();

  const filteredCourses = useMemo(() => {
    if (!currentUser) return [];
    
    // Admin / dean (dept_chair) see everything
    if (currentUser.role === 'admin' || currentUser.role === 'dept_chair') return courses;

    // Dept-locked roles (secretary / coordinator) only see their own department.
    // The backend provides the user's department_id (Account.department_id) which
    // matches DbCourse.department_id.
    if ((currentUser.role === 'secretary' || currentUser.role === 'coordinator') && currentUser.department_id != null) {
      return courses.filter(c => c.department_id === currentUser.department_id);
    }

    // Academic sees all courses in the catalog reference
    return courses;
  }, [courses, currentUser]);

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      {/* ── Page Header ── */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--bg-mute)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: darkMode
                ? 'linear-gradient(135deg, #1e3a5f, #172554)'
                : 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
            }}
          >
            <BookOpen
              className="w-4.5 h-4.5"
              style={{ color: darkMode ? '#60a5fa' : 'var(--brand-primary)' }}
            />
          </div>
          <div>
            <h1
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {t.courseTable.title}
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              {t.courseTable.welcomePrefix} {currentUser.full_name}
            </p>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <CourseDataTable
          courses={filteredCourses}
          isLoading={isLoading}
          error={error}
          onRefresh={refetch}
        />
      </div>
    </div>
  );
}
