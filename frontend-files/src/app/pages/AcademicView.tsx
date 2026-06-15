import { useState, ReactNode } from 'react';
import { Clock, Users, BookOpen, ChevronDown, BarChart2, X, Download } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { ScheduleTableView } from '@/app/features/scheduler/components/ScheduleTableView';
import { DynamicFilters } from '@/app/features/scheduler/components/DynamicFilters';
import { CourseDetailModal } from '@/app/features/scheduler/components/CourseDetailModal';
import { InstructorExportModal } from '@/app/features/scheduler/components/InstructorExportModal';
import { COURSE_COLORS, DAYS, DayKey, Course } from '@/app/data/mockData';
import { LoginScreen } from '@/app/features/auth/components/LoginScreen';

export function AcademicView() {
  const {
    darkMode, selectedCourse, scheduledCourses, scheduleStats,
    currentUser, selectedTerm,
  } = useApp();
  const { t } = useLocale();
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  if (!currentUser || currentUser.role !== 'instructor') {
    return <LoginScreen />;
  }

  const currentLecturer = currentUser.full_name;

  const myCourses = scheduledCourses.filter(c => c.lecturer === currentLecturer);
  const totalHours = myCourses.reduce((sum, c) => {
    const [sh, sm] = c.startTime.split(':').map(Number);
    const [eh, em] = c.endTime.split(':').map(Number);
    return sum + (eh * 60 + em - sh * 60 - sm) / 60;
  }, 0);
  const totalStudents = myCourses.reduce((s, c) => s + c.studentsEnrolled, 0);

  const termLabel = selectedTerm === 'spring' ? t.academicYear.termSpring : t.academicYear.termFall;

  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const muted = 'var(--text-muted)';
  const text = 'var(--text-primary)';

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      {/* Top bar */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-3 sm:px-5 py-3 sm:py-2.5 border-b shrink-0"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, color: text, letterSpacing: '-0.02em' }}>
            {t.academic.title}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Lecturer selector */}
            <div className="relative">
              <select
                disabled
                value={currentLecturer}
                className="appearance-none pr-5 pl-1 py-0.5 rounded font-medium cursor-not-allowed focus:outline-none"
                style={{
                  fontSize: '13px',
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary)',
                  border: '1px solid var(--border-light)',
                }}
              >
                  <option value={currentLecturer}>{currentLecturer}</option>
              </select>
              <ChevronDown
                className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-faint)' }}
              />
            </div>
            <span style={{ fontSize: '11px', color: muted }}>
              · {selectedTerm === 'spring' ? 'Bahar' : 'Güz'} {new Date().getFullYear()}
            </span>
          </div>
        </div>
        </div>

        {/* Desktop Summary chips */}
        <div className="hidden sm:flex items-center gap-2">
          <SummaryChip
            icon={<Clock className="w-3 h-3" />}
            label={`${totalHours} ${t.academic.hoursPerWeek}`}
            darkMode={darkMode}
            color={darkMode ? '#6366f1' : '#3c8dbc'}
          />
          <SummaryChip
            icon={<BookOpen className="w-3 h-3" />}
            label={`${myCourses.length} ${t.academic.sessions}`}
            darkMode={darkMode}
            color={darkMode ? '#0891b2' : '#00c0ef'}
          />
          <SummaryChip
            icon={<Users className="w-3 h-3" />}
            label={`${totalStudents} ${t.academic.students}`}
            darkMode={darkMode}
            color="#16a34a"
          />
          {/* Export own schedule (PDF / Excel) */}
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg font-medium transition-colors"
            style={{ fontSize: '13px', backgroundColor: 'var(--bg-mute)', color: 'var(--text-muted)', border: '1px solid var(--border-light)' }}
          >
            <Download className="w-3.5 h-3.5" />
            {t.admin.export}
          </button>
        </div>

        {/* Mobile actions */}
        <div className="flex sm:hidden items-center gap-2 ml-auto mt-2">
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center justify-center p-2 rounded-lg font-medium transition-colors"
            style={{ backgroundColor: 'var(--bg-mute)', color: 'var(--text-primary)' }}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMobilePanelOpen(true)}
            className="flex items-center justify-center p-2 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-mute)',
              color: 'var(--text-primary)',
            }}
          >
            <BarChart2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters (lecturer locked) */}
      <DynamicFilters showSearch={false} compact />

      {/* Main: sidebar + grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar: day-by-day breakdown */}
        <aside
          className="hidden lg:flex flex-col border-r shrink-0 overflow-y-auto"
          style={{ width: 220, backgroundColor: surface, borderColor: border }}
        >
          <div className="px-3 py-2.5 border-b" style={{ borderColor: border }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {t.academic.dailySummary}
            </p>
          </div>
          <div className="p-2 space-y-1.5 flex-1">
            {DAYS.map(day => {
              const dayCourses = myCourses.filter(c => c.day === day);
              return (
                <DaySummaryCard
                  key={day}
                  day={day}
                  courses={dayCourses}
                  darkMode={darkMode}
                />
              );
            })}
          </div>

          {/* Week total */}
          <div
            className="p-3 border-t"
            style={{ borderColor: border }}
          >
            <p style={{ fontSize: '10px', fontWeight: 600, color: muted, marginBottom: 8 }}>
              {t.academic.weeklyTotal}
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span style={{ fontSize: '11px', color: muted }}>{t.academic.teachingHours}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: text }}>{totalHours}h</span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: '11px', color: muted }}>{t.academic.sessions}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: text }}>{myCourses.length}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: '11px', color: muted }}>{t.academic.students}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: text }}>{totalStudents}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Schedule table filtered to this lecturer */}
        <ScheduleTableView filterFn={c => c.lecturer === currentLecturer} />

        {/* Mobile Stats panel overlay */}
        {isMobilePanelOpen && (
          <div className="lg:hidden absolute inset-0 z-50 flex justify-start">
            <div 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
              onClick={() => setIsMobilePanelOpen(false)}
            />
            <div className="relative h-full animate-in slide-in-from-left duration-200 ease-out shadow-2xl bg-white dark:bg-slate-900 border-r"
                 style={{ width: '85vw', maxWidth: 320, backgroundColor: surface, borderColor: border }}>
              <button
                onClick={() => setIsMobilePanelOpen(false)}
                className="absolute top-3 right-[-40px] p-2 rounded-full shadow-lg border border-white/20"
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="flex flex-col h-full overflow-y-auto">
                <div className="px-3 py-2.5 border-b" style={{ borderColor: border }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {t.academic.dailySummary}
                  </p>
                </div>
                <div className="p-2 space-y-1.5 flex-1">
                  {DAYS.map(day => {
                    const dayCourses = myCourses.filter(c => c.day === day);
                    return (
                      <DaySummaryCard
                        key={day}
                        day={day}
                        courses={dayCourses}
                        darkMode={darkMode}
                      />
                    );
                  })}
                </div>

                {/* Week total */}
                <div
                  className="p-3 border-t shrink-0"
                  style={{ borderColor: border }}
                >
                  <p style={{ fontSize: '10px', fontWeight: 600, color: muted, marginBottom: 8 }}>
                    {t.academic.weeklyTotal}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span style={{ fontSize: '11px', color: muted }}>{t.academic.teachingHours}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: text }}>{totalHours}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ fontSize: '11px', color: muted }}>{t.academic.sessions}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: text }}>{myCourses.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ fontSize: '11px', color: muted }}>{t.academic.students}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: text }}>{totalStudents}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedCourse && <CourseDetailModal />}

      {isExportOpen && (
        <InstructorExportModal
          onClose={() => setIsExportOpen(false)}
          courses={myCourses}
          lecturerName={currentLecturer}
          termLabel={termLabel}
        />
      )}
    </div>
  );
}

function SummaryChip({
  icon, label, darkMode, color,
}: {
  icon: ReactNode; label: string; darkMode: boolean; color: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
      style={{
        backgroundColor: darkMode ? '#1e293b' : 'var(--bg-mute)',
        color: 'var(--text-primary)',
      }}
    >
      <span style={{ color }} className="[&>svg]:w-3 [&>svg]:h-3">{icon}</span>
      <span style={{ fontSize: '11px', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function DaySummaryCard({
  day, courses, darkMode,
}: {
  day: DayKey; courses: Course[]; darkMode: boolean;
}) {
  const { t } = useLocale();
  const text = 'var(--text-primary)';
  const muted = 'var(--text-faint)';

  if (courses.length === 0) {
    return (
      <div
        className="px-3 py-2.5 rounded-lg"
        style={{ backgroundColor: darkMode ? '#0f172a' : 'var(--bg-mute)' }}
      >
        <p style={{ fontSize: '11px', fontWeight: 600, color: muted }}>{t.days[day]?.slice(0, 3)}</p>
        <p style={{ fontSize: '10px', color: muted, marginTop: 2 }}>{t.academic.freeDay}</p>
      </div>
    );
  }

  return (
    <div
      className="px-3 py-2.5 rounded-lg"
      style={{ backgroundColor: darkMode ? '#1e293b' : 'var(--bg-mute)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p style={{ fontSize: '11px', fontWeight: 700, color: text }}>{t.days[day]?.slice(0, 3)}</p>
        <span
          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
          style={{
            backgroundColor: darkMode ? '#172554' : 'var(--brand-primary-soft)',
            color: darkMode ? '#93c5fd' : 'var(--brand-primary-active)',
          }}
        >
          {courses.length}
        </span>
      </div>
      <div className="space-y-1">
        {courses.map(c => {
          const color = COURSE_COLORS[c.colorIndex];
          return (
            <div
              key={c.id}
              className="flex items-start gap-1.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                style={{ backgroundColor: darkMode ? color.darkBorder : color.lightBorder }}
              />
              <div>
                <p style={{ fontSize: '9px', fontWeight: 500, color: text, lineHeight: 1.3 }}>
                  {c.code}
                </p>
                <p style={{ fontSize: '9px', color: muted }}>
                  {c.startTime}–{c.endTime}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
