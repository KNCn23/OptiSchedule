import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { departmentCodeForUser } from '@/app/data/departments';
import { useLocale } from '@/app/i18n';
import type { Course, DayKey } from '@/app/data/mockData';
import { matchesScheduleScope } from '@/app/features/scheduler/utils/scheduleFilters';

const DAYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 9 }, (_, i) => 9 + i); // 9..17

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Format course code for display: "BİL172-1" → "BİL 172 (01)" */
function formatCourseLabel(code: string): { label: string; isBil: boolean } {
  // code is like "BİL172-1" or "MAT151-2"
  const dashIdx = code.lastIndexOf('-');
  const baseCode = dashIdx > 0 ? code.slice(0, dashIdx) : code;
  const section = dashIdx > 0 ? code.slice(dashIdx + 1) : '';

  // Check if it's a BİL course
  const isBil = baseCode.toUpperCase().startsWith('BİL') || baseCode.toUpperCase().startsWith('BIL');

  // Insert space between letters and digits: "BİL172" → "BİL 172"
  const spaced = baseCode.replace(/([A-ZÇĞİÖŞÜa-zçğıöşü]+)(\d+)/, '$1 $2');

  const sectionLabel = section ? ` (${section.padStart(2, '0')})` : '';
  return { label: `${spaced}${sectionLabel}`, isBil };
}

interface ScheduleTableViewProps {
  filterFn?: (c: Course) => boolean;
}

export function ScheduleTableView({ filterFn }: ScheduleTableViewProps = {}) {
  const { darkMode, filters, scheduledCourses, algorithmCourses, openCourseIds, setSelectedCourse, currentUser, moveScheduledCourse, roomsAssigned } = useApp();
  const { t } = useLocale();

  // Instructors get a read-only timetable: no drag-to-move, no drag hint.
  const canDrag = currentUser?.role !== 'instructor';

  /* ── Drag-drop (manual schedule editing) ───────────────────── */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // "day-hour"

  function handleDrop(day: DayKey, hour: number) {
    if (draggingId) moveScheduledCourse(draggingId, day, hour);
    setDraggingId(null);
    setDropTarget(null);
  }

  // Duration (in whole hours) of the block currently being dragged, so the drop
  // preview can highlight every hour the block would occupy — not just one cell.
  const draggingDuration = (() => {
    if (!draggingId) return 1;
    const c = scheduledCourses.find(x => x.id === draggingId);
    if (!c) return 1;
    return Math.max(1, parseInt(c.endTime) - parseInt(c.startTime));
  })();

  /** True if (day,hour) falls inside the block-sized drop preview. */
  function isInDropPreview(day: DayKey, hour: number): boolean {
    if (!dropTarget || !draggingId) return false;
    const dash = dropTarget.lastIndexOf('-');
    const dDay = dropTarget.slice(0, dash) as DayKey;
    const dHour = parseInt(dropTarget.slice(dash + 1));
    if (day !== dDay) return false;
    // Mirror the clamping in moveScheduledCourse so the preview matches the result.
    const effStart = Math.max(9, Math.min(dHour, 18 - draggingDuration));
    return hour >= effStart && hour < effStart + draggingDuration;
  }

  /* ── Filter visible courses ────────────────────────────────── */
  const visibleCourses = useMemo(() => {
    const userDepartment = departmentCodeForUser(currentUser);
    const audienceByCourseCode = new Map(
      algorithmCourses.map(course => [course.course_code, course.department_codes ?? []]),
    );
    return scheduledCourses.filter(c => {
      if (!openCourseIds.includes(c.id)) return false;
      if (filterFn && !filterFn(c)) return false;
      // Dept-locked roles (secretary / coordinator) only see their own program's
      // sessions, but the locked common ("Ortak Dersler") blocks stay visible.
      if ((currentUser?.role === 'secretary' || currentUser?.role === 'coordinator')
        && userDepartment && !c.isLocked && c.department !== userDepartment) return false;
      const baseCourseCode = c.code.split('-', 1)[0];
      if (!matchesScheduleScope(
        c,
        filters.department,
        filters.classLevel,
        audienceByCourseCode.get(baseCourseCode),
      )) return false;
      if (filters.lecturer && c.lecturer !== filters.lecturer) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) return false;
      }
      if (filters.room && c.room !== filters.room) return false;
      if (!filters.room && filters.block && !c.room.startsWith(filters.block)) return false;
      return true;
    });
  }, [filters, scheduledCourses, algorithmCourses, openCourseIds, currentUser, filterFn]);

  /* ── Build cell data: day × hour → courses ─────────────────── */
  const cellMap = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const c of visibleCourses) {
      const startMin = toMinutes(c.startTime);
      const endMin = toMinutes(c.endTime);
      // Place course in each hour slot it occupies
      for (let h = Math.floor(startMin / 60); h < Math.ceil(endMin / 60) && h <= 17; h++) {
        if (h < 9) continue;
        const key = `${c.day}-${h}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
    }
    return map;
  }, [visibleCourses]);

  /* ── Styles ────────────────────────────────────────────────── */
  const borderColor = darkMode ? '#334155' : '#000';
  const headerBg = darkMode ? '#1e293b' : '#f0f0f0';
  const cellBg = darkMode ? '#0f172a' : '#fff';
  const textPrimary = darkMode ? '#e2e8f0' : '#000';
  const textMuted = darkMode ? '#94a3b8' : '#555';

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: darkMode ? '#0f172a' : '#fff' }}>
      {/* Slim info row (class-year presets removed — use the filter bar above).
          Hidden entirely when there's nothing to show (e.g. instructor view). */}
      {(canDrag || visibleCourses.length > 0) && (
        <div
          className="sticky top-0 z-30 flex items-center justify-end gap-3 px-4 py-2 border-b"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#f8fafc',
            borderColor: darkMode ? '#334155' : '#e2e8f0',
          }}
        >
          {canDrag && (
            <span className="hidden md:inline text-[11px] italic" style={{ color: textMuted }}>
              {t.scheduleTable.dragHint}
            </span>
          )}
          <span className="text-[11px]" style={{ color: textMuted }}>
            {visibleCourses.length} {t.admin.sessions}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="p-4 overflow-x-auto">
        <table
          className="w-full border-collapse"
          style={{ borderColor: borderColor, minWidth: 700 }}
        >
          <thead>
            <tr>
              <th
                className="border p-2 text-center text-xs font-bold"
                style={{
                  borderColor: borderColor,
                  backgroundColor: headerBg,
                  color: textPrimary,
                  width: 70,
                }}
              >
                {t.scheduleTable.hour}
              </th>
              {DAYS.map(day => (
                <th
                  key={day}
                  className="border p-2 text-center text-xs font-bold"
                  style={{
                    borderColor: borderColor,
                    backgroundColor: headerBg,
                    color: textPrimary,
                  }}
                >
                  {t.days[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                <td
                  className="border p-2 text-center text-xs font-semibold"
                  style={{
                    borderColor: borderColor,
                    backgroundColor: headerBg,
                    color: textPrimary,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {String(hour).padStart(2, '0')}:00
                </td>
                {DAYS.map(day => {
                  const courses = cellMap.get(`${day}-${hour}`) || [];
                  // Deduplicate: a multi-hour course appears in multiple hour slots
                  // Show it in every slot it occupies
                  const uniqueCourses = courses.filter((c, i, arr) =>
                    arr.findIndex(x => x.id === c.id) === i
                  );
                  const cellKey = `${day}-${hour}`;
                  const isDropTarget = isInDropPreview(day, hour);
                  return (
                    <td
                      key={day}
                      className="border p-1.5 align-top"
                      style={{
                        borderColor: borderColor,
                        backgroundColor: isDropTarget
                          ? (darkMode ? 'rgba(59,130,246,0.22)' : 'rgba(60,141,188,0.18)')
                          : cellBg,
                        minHeight: 40,
                        transition: 'background-color 0.1s',
                      }}
                      onDragOver={(e) => { if (draggingId) { e.preventDefault(); setDropTarget(cellKey); } }}
                      onDragLeave={() => setDropTarget(prev => (prev === cellKey ? null : prev))}
                      onDrop={(e) => { e.preventDefault(); handleDrop(day, hour); }}
                    >
                      <div className="flex flex-col gap-0.5">
                        {uniqueCourses.map(course => {
                          const { label, isBil } = formatCourseLabel(course.code);
                          const isDragging = draggingId === course.id;
                          const locked = !!course.isLocked;
                          return (
                            <button
                              key={course.id}
                              draggable={!locked && canDrag}
                              onDragStart={(e) => {
                                if (locked || !canDrag) { e.preventDefault(); return; }
                                setDraggingId(course.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', course.id);
                              }}
                              onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                              onClick={() => setSelectedCourse(course)}
                              className="flex flex-col items-start text-left text-[11px] leading-tight px-1 py-0.5 rounded transition-all w-full"
                              style={{
                                color: locked ? (darkMode ? '#94a3b8' : '#64748b') : (course.hasConflict ? '#ef4444' : textPrimary),
                                fontWeight: locked ? 600 : (course.hasConflict ? 700 : (isBil ? 700 : 400)),
                                cursor: !canDrag ? 'pointer' : (locked ? 'not-allowed' : 'grab'),
                                opacity: isDragging ? 0.4 : 1,
                                backgroundColor: locked
                                  ? (darkMode ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.12)')
                                  : course.hasConflict
                                    ? (darkMode ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.18)')
                                    : 'transparent',
                                // Unmistakable red outline when this block clashes with another.
                                border: course.hasConflict ? '1.5px solid #ef4444' : '1.5px solid transparent',
                                boxShadow: course.hasConflict ? '0 0 0 1px rgba(239,68,68,0.35)' : 'none',
                              }}
                              title={course.hasConflict && course.conflictReason
                                ? `⚠ ${course.conflictReason}`
                                : (locked ? `${course.name} — ${course.lecturer} (Ortak ders · kilitli)` : `${course.name} — ${course.lecturer}`)}
                            >
                              <span className="flex items-center gap-1">
                                {locked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                                {label}
                              </span>
                              {roomsAssigned && course.room && (
                                <span className="text-[9px] font-semibold" style={{ color: course.room === 'TBA' ? '#ef4444' : (darkMode ? '#67e8f9' : '#0891b2') }}>
                                  📍 {course.room === 'TBA' ? 'Atanmadı' : course.room}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
