import { CheckCircle2, AlertTriangle, Clock, BookOpen, Users, Building2, ChevronRight, Zap, RefreshCw } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { COURSE_COLORS } from '@/app/data/mockData';
import { useState, ReactNode } from 'react';

interface StatusPanelProps {
  onPublish?: () => void;
  isMobile?: boolean;
}

export function StatusPanel({ onPublish, isMobile = false }: StatusPanelProps) {
  const {
    darkMode, publishedAt, setSelectedCourse, isCalculating, calculationTime,
    scheduledCourses, scheduleStats,
  } = useApp();
  const { t } = useLocale();
  const [expanded, setExpanded] = useState<string | null>('stats');

  // Use real stats from algorithm if available, otherwise defaults
  const currentConflicts = scheduleStats?.conflictCount ?? 0;
  const currentWarnings = scheduleStats?.warnings ?? [];
  const currentPlaced = scheduleStats?.totalPlaced ?? scheduledCourses.length;
  const totalTasks = scheduleStats?.totalTasks ?? scheduledCourses.length;
  const execTime = calculationTime ?? scheduleStats?.executionTime ?? 0;
  const lecturerHours = scheduleStats?.lecturerHours ?? {};
  const uniqueLecturers = scheduleStats?.uniqueLecturers ?? [];
  const roomsUsed = scheduleStats?.roomsUsed ?? new Set(scheduledCourses.map(c => c.room)).size;
  const totalRooms = scheduleStats?.totalRooms ?? roomsUsed + 4;

  const totalStudents = scheduledCourses.reduce((sum, c) => sum + c.studentsEnrolled, 0);

  const surface = 'var(--bg-mute)';
  const border = 'var(--border-light)';
  const muted = 'var(--text-muted)';
  const text = 'var(--text-primary)';
  const subText = 'var(--text-muted)';

  function toggle(key: string) {
    setExpanded(prev => prev === key ? null : key);
  }

  return (
    <aside
      className={`flex flex-col shrink-0 overflow-y-auto ${isMobile ? 'h-full' : 'border-l'}`}
      style={{
        width: isMobile ? '85vw' : 256,
        maxWidth: isMobile ? 320 : 'none',
        backgroundColor: 'var(--bg-surface)',
        borderColor: isMobile ? 'transparent' : border,
      }}
    >
      {/* Panel header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: border }}
      >
        <Zap className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: text, letterSpacing: '-0.01em' }}>
          {t.status.title}
        </span>
        <span
          className="ml-auto px-2 py-0.5 rounded-full font-semibold"
          style={{
            fontSize: '11px',
            backgroundColor: currentConflicts > 0
              ? darkMode ? '#450a0a' : '#fee2e2'
              : darkMode ? '#022c22' : '#dcfce7',
            color: currentConflicts > 0 ? '#ef4444' : '#16a34a',
          }}
        >
          {currentConflicts > 0 ? `${currentConflicts} ${t.status.issues}` : t.status.clear}
        </span>
      </div>

      {/* Algorithm result */}
      <div
        className="mx-3 mt-3 mb-2 p-3 rounded-xl"
        style={{ backgroundColor: surface }}
      >
        <p style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          {t.status.algorithmResult}
        </p>
        <div className="flex items-center gap-2 mb-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: darkMode ? '#1e3a5f' : 'var(--brand-primary-soft)' }}
          >
            {isCalculating ? (
              <RefreshCw className="w-4 h-4 animate-spin" style={{ color: '#3b82f6' }} />
            ) : (
              <Clock className="w-4 h-4" style={{ color: '#3b82f6' }} />
            )}
          </div>
          <div>
            <p style={{ fontSize: '18px', fontWeight: 700, color: text, lineHeight: 1 }}>
              {isCalculating ? (
                <span style={{ fontSize: '14px', color: '#3b82f6' }}>{t.status.calculating}</span>
              ) : (
                `${execTime}s`
              )}
            </p>
            <p style={{ fontSize: '12px', color: muted }}>{t.status.executionTime}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricChip
            label={t.status.placed}
            value={`${currentPlaced}/${totalTasks}`}
            color="#22c55e"
            darkMode={darkMode}
          />
          <MetricChip
            label={t.status.conflicts}
            value={String(currentConflicts)}
            color={currentConflicts > 0 ? '#ef4444' : '#22c55e'}
            darkMode={darkMode}
          />
        </div>
      </div>

      {/* Warnings */}
      {currentWarnings.length > 0 && (
        <div className="mx-3 mb-2">
          <SectionHeader
            title={t.status.warnings}
            count={currentWarnings.length}
            open={expanded === 'warnings'}
            onClick={() => toggle('warnings')}
            darkMode={darkMode}
            color="#ef4444"
          />
          {expanded === 'warnings' && (
            <div className="space-y-1.5 mt-1.5">
              {currentWarnings.map(w => (
                <div
                  key={w.id}
                  className="p-2.5 rounded-lg border"
                  style={{
                    backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
                    borderColor: darkMode ? '#7f1d1d' : '#fecaca',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p style={{ fontSize: '10px', color: darkMode ? '#fca5a5' : '#b91c1c', lineHeight: 1.4 }}>
                      {w.message}
                    </p>
                  </div>
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {w.courses.map(cid => {
                      const course = scheduledCourses.find(c => c.id === cid);
                      if (!course) return null;
                      const color = COURSE_COLORS[course.colorIndex];
                      return (
                        <button
                          key={cid}
                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold hover:opacity-80 transition-opacity"
                          style={{
                            backgroundColor: darkMode ? color.darkBg : color.lightBg,
                            color: darkMode ? color.darkText : color.lightText,
                          }}
                          onClick={() => setSelectedCourse(course)}
                        >
                          {course.code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule stats */}
      <div className="mx-3 mb-2">
        <SectionHeader
          title={t.status.scheduleStats}
          open={expanded === 'stats'}
          onClick={() => toggle('stats')}
          darkMode={darkMode}
          color="#6366f1"
        />
        {expanded === 'stats' && (
          <div className="mt-1.5 space-y-1.5">
            <StatRow
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label={t.status.totalSessions}
              value={`${currentPlaced}`}
              darkMode={darkMode}
            />
            <StatRow
              icon={<Users className="w-3.5 h-3.5" />}
              label={t.status.studentSessions}
              value={totalStudents.toLocaleString()}
              darkMode={darkMode}
            />
            <StatRow
              icon={<Building2 className="w-3.5 h-3.5" />}
              label={t.status.roomsUsed}
              value={`${roomsUsed}/${totalRooms}`}
              darkMode={darkMode}
            />
          </div>
        )}
      </div>

      {/* Lecturer hours */}
      <div className="mx-3 mb-2">
        <SectionHeader
          title={t.status.lecturerHours}
          open={expanded === 'lecturers'}
          onClick={() => toggle('lecturers')}
          darkMode={darkMode}
          color="#0891b2"
        />
        {expanded === 'lecturers' && (
          <div className="mt-1.5 space-y-2">
            {uniqueLecturers.map(name => {
              const hours = lecturerHours[name] ?? 0;
              const maxHours = Math.max(20, ...Object.values(lecturerHours));
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span style={{ fontSize: '10px', fontWeight: 500, color: subText }}>
                      {name}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: text }}>{hours}h</span>
                  </div>
                  <div
                    className="w-full rounded-full overflow-hidden"
                    style={{ height: 4, backgroundColor: 'var(--bg-mute)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(hours / maxHours) * 100}%`,
                        backgroundColor: 'var(--brand-primary)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Publish button */}
      <div className="p-3 border-t" style={{ borderColor: border }}>
        {publishedAt ? (
          <div
            className="flex items-center gap-2 p-2.5 rounded-xl"
            style={{ backgroundColor: darkMode ? '#022c22' : '#f0fdf4' }}
          >
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a' }}>{t.published}</p>
              <p style={{ fontSize: '9px', color: darkMode ? '#4ade80' : '#15803d' }}>{publishedAt}</p>
            </div>
          </div>
        ) : (
          <button
            onClick={onPublish}
            disabled={currentConflicts > 0 || isCalculating}
            className="w-full py-2.5 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: currentConflicts > 0 || isCalculating
                ? 'var(--border-light)'
                : 'var(--brand-gradient)',
              color: currentConflicts > 0 || isCalculating ? muted : 'white',
            }}
          >
            {currentConflicts > 0 ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                {t.status.resolveFirst}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t.status.publishProgramme}
              </>
            )}
          </button>
        )}
        {currentConflicts > 0 && (
          <p style={{ fontSize: '9px', color: muted, textAlign: 'center', marginTop: 6 }}>
            {t.status.fixConflicts.replace('{n}', String(currentConflicts))}
          </p>
        )}
      </div>
    </aside>
  );
}

function MetricChip({ label, value, color, darkMode }: { label: string; value: string; color: string; darkMode: boolean }) {
  return (
    <div
      className="flex flex-col items-center py-2 rounded-lg"
      style={{ backgroundColor: 'var(--bg-surface)', border: `1px solid ${'var(--bg-mute)'}` }}
    >
      <span style={{ fontSize: '14px', fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: '9px', color: 'var(--text-faint)', marginTop: 1 }}>{label}</span>
    </div>
  );
}

function SectionHeader({
  title, open, onClick, darkMode, color, count,
}: {
  title: string; open: boolean; onClick: () => void; darkMode: boolean; color: string; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-1.5 py-1.5 group"
    >
      <ChevronRight
        className="w-3 h-3 transition-transform"
        style={{
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          color,
        }}
      />
      <span style={{ fontSize: '10px', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {title}
      </span>
      {count !== undefined && (
        <span
          className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatRow({ icon, label, value, darkMode }: { icon: ReactNode; label: string; value: string; darkMode: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
      style={{ backgroundColor: 'var(--bg-mute)' }}
    >
      <span style={{ color: 'var(--text-faint)' }} className="[&>svg]:w-3.5 [&>svg]:h-3.5">
        {icon}
      </span>
      <span style={{ fontSize: '11px', color: 'var(--text-faint)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}