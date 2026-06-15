import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Clock, MapPin, User } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { departmentCodeForUser } from '@/app/data/departments';
import { matchesScheduleScope } from '@/app/features/scheduler/utils/scheduleFilters';
import { useLocale } from '@/app/i18n';
import { COURSE_COLORS, DAYS, DAY_LABELS, Course, DayKey } from '@/app/data/mockData';

/* ─── Layout Constants ─────────────────────────────────────────────── */
const SLOT_HEIGHT = 50;
const START_HOUR = 9;
const END_HOUR = 17;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2; // 16 half-hour slots
const GRID_PADDING_TOP = 16;
const TOOLTIP_WIDTH = 280;

/* ─── Time helpers ─────────────────────────────────────────────────── */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getTop(startTime: string): number {
  const mins = toMinutes(startTime) - START_HOUR * 60;
  return (mins / 30) * SLOT_HEIGHT + GRID_PADDING_TOP;
}

function getHeight(startTime: string, endTime: string): number {
  const duration = toMinutes(endTime) - toMinutes(startTime);
  return (duration / 30) * SLOT_HEIGHT;
}

/* ─── Overlap layout engine ────────────────────────────────────────── */
interface LayoutCourse extends Course {
  leftPct: number;
  widthPct: number;
}

function layoutDayCourses(courses: Course[]): LayoutCourse[] {
  if (courses.length === 0) return [];

  const overlaps = (a: Course, b: Course) =>
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(a.endTime) > toMinutes(b.startTime);

  // Union-find for overlapping groups
  const parent = courses.map((_, i) => i);
  const find = (x: number): number => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (x: number, y: number) => { parent[find(x)] = find(y); };

  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      if (overlaps(courses[i], courses[j])) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < courses.length; i++) {
    const p = find(i);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(i);
  }

  const result: LayoutCourse[] = courses.map(c => ({ ...c, leftPct: 0, widthPct: 100 }));

  for (const [, idxs] of groups) {
    const sorted = [...idxs].sort((a, b) => toMinutes(courses[a].startTime) - toMinutes(courses[b].startTime));
    const n = sorted.length;
    sorted.forEach((idx, col) => {
      result[idx].leftPct = (col / n) * 100;
      result[idx].widthPct = (1 / n) * 100;
    });
  }

  return result;
}

/* ─── Time label generation ────────────────────────────────────────── */
const TIME_LABELS: string[] = [];
for (let h = START_HOUR; h <= END_HOUR; h++) {
  TIME_LABELS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < END_HOUR) TIME_LABELS.push(`${String(h).padStart(2, '0')}:30`);
}

/* ─── Props & Types ────────────────────────────────────────────────── */
interface WeeklyGridProps {
  filterFn?: (course: Course) => boolean;
  highlightDay?: DayKey;
}

type TooltipPlacement = 'above' | 'below';

interface HoveredState {
  course: LayoutCourse;
  fixedLeft: number;
  fixedTop: number;
  placement: TooltipPlacement;
  arrowLeftPct: number;
}

/* ─── Current-time hook ────────────────────────────────────────────── */
function useCurrentMinute() {
  const [now, setNow] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function WeeklyGrid({ filterFn, highlightDay }: WeeklyGridProps) {
  const { darkMode, filters, setSelectedCourse, openCourseIds, scheduledCourses, algorithmCourses, currentUser } = useApp();
  const { t } = useLocale();
  const [hoveredCourse, setHoveredCourse] = useState<HoveredState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMinute = useCurrentMinute();

  /* ── Filter visible courses ──────────────────────────────────────── */
  const visibleCourses = useMemo(() => {
    const userDepartment = departmentCodeForUser(currentUser);
    const audienceByCourseCode = new Map(
      algorithmCourses.map(course => [course.course_code, course.department_codes ?? []]),
    );
    return scheduledCourses.filter(c => {
      if (!openCourseIds.includes(c.id)) return false;
      // Dept-locked roles (secretary / coordinator) see only their own program's
      // sessions; locked common ("Ortak Dersler") blocks stay visible.
      if ((currentUser?.role === 'secretary' || currentUser?.role === 'coordinator')
        && userDepartment && !c.isLocked && c.department !== userDepartment) return false;
      if (filterFn && !filterFn(c)) return false;
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
  }, [filters, filterFn, scheduledCourses, algorithmCourses, openCourseIds, currentUser]);

  const coursesByDay = useMemo(() => {
    const map: Record<DayKey, Course[]> = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };
    for (const c of visibleCourses) map[c.day].push(c);
    return map;
  }, [visibleCourses]);

  const totalHeight = TOTAL_SLOTS * SLOT_HEIGHT + GRID_PADDING_TOP;

  /* ── Current-time indicator position ─────────────────────────────── */
  const currentTimeTop = useMemo(() => {
    const startMin = START_HOUR * 60;
    const endMin = END_HOUR * 60;
    if (currentMinute < startMin || currentMinute > endMin) return null;
    return ((currentMinute - startMin) / 30) * SLOT_HEIGHT + GRID_PADDING_TOP;
  }, [currentMinute]);

  /* ── Tooltip hover handler ───────────────────────────────────────── */
  const handleCourseHover = useCallback((e: React.MouseEvent<HTMLDivElement>, course: LayoutCourse) => {
    const cardRect = e.currentTarget.getBoundingClientRect();
    const cardCenterX = cardRect.left + cardRect.width / 2;
    const cardTopY = cardRect.top;
    const cardBottomY = cardRect.bottom;

    const TOOLTIP_HEIGHT = 160;
    const spaceAbove = cardTopY;
    const placement: TooltipPlacement = spaceAbove >= TOOLTIP_HEIGHT + 16 ? 'above' : 'below';

    const fixedTop = placement === 'above' ? cardTopY - 12 : cardBottomY + 12;

    const halfTooltip = TOOLTIP_WIDTH / 2;
    let fixedLeft = cardCenterX;
    let arrowLeftPct = 50;

    if (fixedLeft - halfTooltip < 8) {
      const clamped = 8 + halfTooltip;
      const shift = fixedLeft - clamped;
      arrowLeftPct = Math.max(10, 50 + (shift / TOOLTIP_WIDTH) * 100);
      fixedLeft = clamped;
    }
    if (fixedLeft + halfTooltip > window.innerWidth - 8) {
      const clamped = window.innerWidth - 8 - halfTooltip;
      const shift = fixedLeft - clamped;
      arrowLeftPct = Math.min(90, 50 + (shift / TOOLTIP_WIDTH) * 100);
      fixedLeft = clamped;
    }

    setHoveredCourse({ course, fixedLeft, fixedTop, placement, arrowLeftPct });
  }, []);

  /* ── Shared style tokens ─────────────────────────────────────────── */
  const bg = 'var(--bg-soft)';
  const headerBg = 'var(--bg-surface)';
  const borderClr = 'var(--border-light)';
  const gutterBg = 'var(--bg-mute)';
  const lineHour = darkMode ? 'rgba(51,65,85,0.45)' : 'rgba(180,190,200,0.7)';
  const lineHalf = darkMode ? 'rgba(51,65,85,0.18)' : 'rgba(180,190,200,0.3)';
  const zebraEven = darkMode ? 'rgba(15,23,42,0.35)' : 'rgba(240,240,240,0.55)';

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative scroll-smooth"
      style={{ minHeight: 0, WebkitOverflowScrolling: 'touch', backgroundColor: bg }}
      onMouseLeave={() => setHoveredCourse(null)}
    >
      <div className="min-w-[600px] md:min-w-[740px]">
        {/* ══════════ Day Header Row ══════════ */}
        <div
          className="sticky top-0 z-30 flex border-b"
          style={{
            backgroundColor: headerBg,
            borderColor: borderClr,
            boxShadow: darkMode
              ? '0 2px 12px rgba(0,0,0,0.4)'
              : '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          {/* Top-left gutter */}
          <div
            className="shrink-0 w-[52px] sm:w-[60px] sticky left-0 z-40 border-r flex items-center justify-center"
            style={{
              backgroundColor: headerBg,
              borderColor: borderClr,
            }}
          >
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-very-faint)' }} />
          </div>

          {DAYS.map((day, i) => (
            <div
              key={day}
              className="flex-1 py-2.5 text-center"
              style={{
                borderLeft: i > 0 ? `1px solid ${borderClr}` : 'none',
                backgroundColor: highlightDay === day
                  ? darkMode ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)'
                  : 'transparent',
              }}
            >
              <p
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: 'var(--text-primary)',
                }}
              >
                {day.toUpperCase()}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: darkMode ? '#475569' : '#64748b',
                  marginTop: '1px',
                }}
              >
                {t.days[day] || DAY_LABELS[day]}
              </p>
            </div>
          ))}
        </div>

        {/* ══════════ Grid Body ══════════ */}
        <div className="flex relative" style={{ paddingBottom: 32 }}>
          {/* Time gutter */}
          <div
            className="shrink-0 w-[52px] sm:w-[60px] sticky left-0 z-20 border-r"
            style={{
              height: totalHeight,
              backgroundColor: gutterBg,
              borderColor: borderClr,
              boxShadow: darkMode
                ? '2px 0 8px rgba(0,0,0,0.3)'
                : '2px 0 6px rgba(0,0,0,0.04)',
            }}
          >
            {TIME_LABELS.map((label, i) => {
              const isHour = label.endsWith(':00');
              if (!isHour) return null;
              return (
                <div
                  key={label}
                  className="absolute w-full flex items-start justify-end pr-2 sm:pr-3"
                  style={{ top: i * SLOT_HEIGHT + GRID_PADDING_TOP, height: SLOT_HEIGHT }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text-faint)',
                      transform: 'translateY(-7px)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIdx) => {
            const dayCourses = layoutDayCourses(coursesByDay[day]);
            return (
              <div
                key={day}
                className="flex-1 relative"
                style={{
                  height: totalHeight,
                  borderLeft: dayIdx > 0 ? `1px solid ${borderClr}` : 'none',
                  backgroundColor: highlightDay === day
                    ? darkMode ? 'rgba(59,130,246,0.04)' : 'rgba(59,130,246,0.02)'
                    : 'transparent',
                }}
              >
                {/* Zebra-stripe hour bands & grid lines */}
                {TIME_LABELS.map((label, i) => {
                  const isHour = label.endsWith(':00');
                  const hourNum = parseInt(label.split(':')[0]);
                  const isEvenHour = hourNum % 2 === 0;
                  return (
                    <div
                      key={label}
                      className="absolute w-full"
                      style={{
                        top: i * SLOT_HEIGHT + GRID_PADDING_TOP,
                        height: SLOT_HEIGHT,
                        borderTop: `1px ${isHour ? 'solid' : 'dashed'} ${isHour ? lineHour : lineHalf}`,
                        backgroundColor: isHour && isEvenHour ? zebraEven : 'transparent',
                      }}
                    />
                  );
                })}

                {/* Current time indicator */}
                {currentTimeTop !== null && (
                  <div
                    className="absolute w-full z-10 pointer-events-none"
                    style={{ top: currentTimeTop }}
                  >
                    <div
                      className="absolute left-0 w-full"
                      style={{
                        height: '2px',
                        background: darkMode
                          ? 'linear-gradient(90deg, #ef4444 0%, rgba(239,68,68,0.3) 100%)'
                          : 'linear-gradient(90deg, #dc2626 0%, rgba(220,38,38,0.2) 100%)',
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: '-3px',
                        top: '-3px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: darkMode ? '#ef4444' : '#dc2626',
                      }}
                    />
                  </div>
                )}

                {/* Course cards */}
                {dayCourses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    darkMode={darkMode}
                    onClick={() => setSelectedCourse(course)}
                    onMouseEnter={(e) => handleCourseHover(e, course)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════ Tooltip (portal) ══════════ */}
      {hoveredCourse && createPortal(
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            zIndex: 9999,
            left: hoveredCourse.fixedLeft,
            top: hoveredCourse.fixedTop,
            transform: hoveredCourse.placement === 'above'
              ? 'translateX(-50%) translateY(-100%)'
              : 'translateX(-50%)',
            width: TOOLTIP_WIDTH,
            transition: 'left 100ms ease-out, top 100ms ease-out',
          }}
        >
          <TooltipContent hovered={hoveredCourse} darkMode={darkMode} />
        </div>,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TOOLTIP
   ═══════════════════════════════════════════════════════════════════════ */

function TooltipContent({ hovered, darkMode }: { hovered: HoveredState; darkMode: boolean }) {
  const { t } = useLocale();
  const color = COURSE_COLORS[hovered.course.colorIndex];
  const accentColor = darkMode ? color.darkBorder : color.lightBorder;
  const capacityPct = Math.round(
    (hovered.course.studentsEnrolled / hovered.course.totalCapacity) * 100
  );

  return (
    <div
      className="rounded-2xl shadow-2xl border relative overflow-hidden"
      style={{
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(20px)',
        borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        boxShadow: darkMode
          ? '0 20px 40px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
          : '0 20px 40px -8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: '3px', background: accentColor }} />

      <div className="px-4 py-3 flex flex-col gap-1.5">
        {/* Code + Time */}
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: darkMode
                ? `${color.darkBorder}22`
                : `${color.lightBorder}22`,
              color: darkMode ? color.darkText : color.lightText,
            }}
          >
            {hovered.course.code}
          </span>
          <span
            className="text-[10px] font-medium"
            style={{ color: 'var(--text-faint)' }}
          >
            {hovered.course.startTime} – {hovered.course.endTime}
          </span>
        </div>

        {/* Course name */}
        <h4
          className="text-sm font-bold leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {hovered.course.name}
        </h4>

        {/* Details */}
        <div
          className="flex flex-col gap-1 pt-1.5 mt-0.5 border-t"
          style={{ borderColor: 'var(--bg-mute)' }}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <User className="w-3 h-3 shrink-0" style={{ color: 'var(--text-faint)' }} />
            <span className="font-semibold" style={{ color: darkMode ? '#7dd3fc' : 'var(--brand-primary)' }}>
              {hovered.course.lecturer}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <MapPin className="w-3 h-3 shrink-0" style={{ color: 'var(--text-faint)' }} />
            <span className="font-medium" style={{ color: 'var(--text-faint)' }}>
              {hovered.course.room}
            </span>
            <span
              className="text-[10px] px-1.5 py-px rounded font-medium"
              style={{
                backgroundColor: 'var(--bg-mute)',
                color: 'var(--text-faint)',
              }}
            >
              {hovered.course.classLevel}
            </span>
          </div>
        </div>

        {/* Capacity bar */}
        <div className="pt-1.5 mt-0.5 border-t" style={{ borderColor: 'var(--bg-mute)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold" style={{ color: 'var(--text-faint)' }}>
              {t.tooltip.capacity}
            </span>
            <span className="text-[10px] font-bold" style={{ color: darkMode ? '#e2e8f0' : '#334155' }}>
              {hovered.course.studentsEnrolled}/{hovered.course.totalCapacity}
              <span className="ml-1 opacity-60">({capacityPct}%)</span>
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-mute)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${capacityPct}%`,
                backgroundColor: capacityPct >= 95 ? '#ef4444' : accentColor,
                boxShadow: `0 0 8px ${accentColor}66`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div
        className={`absolute w-3 h-3 rotate-45 ${hovered.placement === 'above'
            ? 'bottom-[-6px]'
            : 'top-[-6px]'
          }`}
        style={{
          backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.97)',
          left: `${hovered.arrowLeftPct}%`,
          transform: 'translateX(-50%) rotate(45deg)',
          borderRight: hovered.placement === 'above' ? `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
          borderBottom: hovered.placement === 'above' ? `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
          borderLeft: hovered.placement === 'below' ? `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
          borderTop: hovered.placement === 'below' ? `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   COURSE CARD
   ═══════════════════════════════════════════════════════════════════════ */

function CourseCard({
  course,
  darkMode,
  onClick,
  onMouseEnter,
}: {
  course: LayoutCourse;
  darkMode: boolean;
  onClick: () => void;
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const color = COURSE_COLORS[course.colorIndex];
  const cardBg = darkMode ? color.darkBg : color.lightBg;
  const accentColor = darkMode ? color.darkBorder : color.lightBorder;
  const textColor = darkMode ? color.darkText : color.lightText;

  const top = getTop(course.startTime);
  const height = getHeight(course.startTime, course.endTime);
  const isNarrow = course.widthPct < 30;

  return (
    <div
      className="absolute cursor-pointer select-none group"
      style={{
        top: top + 2,
        height: height - 4,
        left: `calc(${course.leftPct}% + 3px)`,
        width: `calc(${course.widthPct}% - 6px)`,
        zIndex: course.hasConflict ? 5 : 1,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div
        className="w-full h-full rounded-lg overflow-hidden flex flex-col transition-all duration-200 group-hover:shadow-xl group-hover:scale-[1.03] group-hover:z-50 active:scale-[0.98]"
        style={{
          backgroundColor: cardBg,
          boxShadow: course.hasConflict
            ? `0 4px 16px -4px rgba(239, 68, 68, 0.5), inset 0 0 0 1.5px #ef4444`
            : darkMode
              ? `0 2px 8px -2px rgba(0,0,0,0.4), inset 0 0 0 1px ${accentColor}33`
              : `0 2px 6px -2px rgba(0,0,0,0.08), inset 0 0 0 1px ${accentColor}44`,
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            height: course.hasConflict ? '3px' : '3px',
            flexShrink: 0,
            background: course.hasConflict
              ? 'linear-gradient(90deg, #ef4444, #f87171)'
              : accentColor,
          }}
        />

        {/* Hover shine overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            background: darkMode
              ? 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 60%)',
          }}
        />

        {/* Conflict badge */}
        {course.hasConflict && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <div
              className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"
              style={{ boxShadow: '0 2px 6px rgba(239,68,68,0.5)' }}
            >
              <AlertTriangle className="w-2.5 h-2.5 text-white" />
            </div>
          </div>
        )}

        {/* Card content — only course code */}
        <div
          className="flex-1 flex items-center justify-center min-h-0 overflow-hidden"
          style={{
            padding: '2px',
          }}
        >
          <span
            style={{
              fontSize: isNarrow ? '9px' : '10px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: textColor,
              lineHeight: 1.15,
              textAlign: 'center',
              wordBreak: 'break-word',
              ...(isNarrow || height < 60 ? {
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
              } : {}),
            }}
          >
            {course.code}
          </span>
        </div>
      </div>
    </div>
  );
}
