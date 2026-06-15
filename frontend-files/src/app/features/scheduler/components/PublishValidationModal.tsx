import {
  X, CheckCircle2, XCircle, AlertTriangle, Info,
  Shield, BookOpen, Building2, User, Users, Timer, BarChart3,
} from 'lucide-react';

/** Map check status → translation key without fragile dynamic string building */
const STATUS_LABEL_KEY: Record<CheckStatus, 'statusPassed' | 'statusFailed' | 'statusWarning' | 'statusInfo'> = {
  passed: 'statusPassed',
  failed: 'statusFailed',
  warning: 'statusWarning',
  info: 'statusInfo',
};
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { DAYS } from '@/app/data/mockData';
import { useMemo, useState } from 'react';

type CheckStatus = 'passed' | 'failed' | 'warning' | 'info';

interface ValidationCheck {
  id: string;
  title: string;
  message: string;
  status: CheckStatus;
  icon: React.ReactNode;
  critical: boolean; // if true, blocks publishing
  details?: string[]; // per-item breakdown (which instructor / day / course …)
}

/** "BİL172-1" → "BİL172 (01)" */
function fmtCode(code: string): string {
  const dash = code.lastIndexOf('-');
  if (dash <= 0) return code;
  return `${code.slice(0, dash)} (${code.slice(dash + 1).padStart(2, '0')})`;
}

interface PublishValidationModalProps {
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function PublishValidationModal({ onClose, onConfirm }: PublishValidationModalProps) {
  const {
    darkMode, scheduledCourses, scheduleStats,
  } = useApp();
  const { t } = useLocale();
  const [isSaving, setIsSaving] = useState(false);

  const checks = useMemo<ValidationCheck[]>(() => {
    const courses = scheduledCourses;
    const stats = scheduleStats;
    const result: ValidationCheck[] = [];

    // 1. Conflict Check (critical)
    const conflictCount = stats?.conflictCount ?? courses.filter(c => c.hasConflict).length;
    const conflictDetails = courses
      .filter(c => c.hasConflict)
      .map(c => {
        const dt = `${t.days[c.day] || c.day} ${c.startTime}–${c.endTime}`;
        const reason = c.conflictReason ? ` — ${c.conflictReason}` : '';
        return `${fmtCode(c.code)} · ${c.lecturer} · ${dt}${reason}`;
      });
    result.push({
      id: 'conflict',
      title: t.publishValidation.conflictTitle,
      message: conflictCount === 0
        ? t.publishValidation.conflictPass
        : t.publishValidation.conflictFail.replace('{n}', String(conflictCount)),
      status: conflictCount === 0 ? 'passed' : 'failed',
      icon: <Shield className="w-4.5 h-4.5" />,
      critical: true,
      details: conflictDetails,
    });

    // 2. All Courses Placed (critical)
    const totalPlaced = stats?.totalPlaced ?? courses.length;
    const totalTasks = stats?.totalTasks ?? courses.length;
    const unplaced = totalTasks - totalPlaced;
    result.push({
      id: 'placed',
      title: t.publishValidation.placedTitle,
      message: unplaced === 0
        ? t.publishValidation.placedPass
            .replace('{n}', String(totalPlaced))
            .replace('{total}', String(totalTasks))
        : t.publishValidation.placedFail
            .replace('{n}', String(unplaced))
            .replace('{placed}', String(totalPlaced))
            .replace('{total}', String(totalTasks)),
      status: unplaced === 0 ? 'passed' : 'failed',
      icon: <BookOpen className="w-4.5 h-4.5" />,
      critical: true,
    });

    // 3. Room Assignment (critical)
    const noRoom = courses.filter(c => !c.room || c.room.trim() === '').length;
    result.push({
      id: 'room',
      title: t.publishValidation.roomTitle,
      message: noRoom === 0
        ? t.publishValidation.roomPass
        : t.publishValidation.roomFail.replace('{n}', String(noRoom)),
      status: noRoom === 0 ? 'passed' : 'failed',
      icon: <Building2 className="w-4.5 h-4.5" />,
      critical: true,
    });

    // 4. Instructor Assignment (warning)
    const noInstructorCourses = courses.filter(c => !c.lecturer || c.lecturer.trim() === '' || c.lecturer.toLowerCase() === 'anonim' || c.lecturer.toLowerCase() === 'atanmamış');
    const noInstructor = noInstructorCourses.length;
    const instructorDetails = [...new Set(noInstructorCourses.map(c => `${fmtCode(c.code)} · ${c.name}`))];
    result.push({
      id: 'instructor',
      title: t.publishValidation.instructorTitle,
      message: noInstructor === 0
        ? t.publishValidation.instructorPass
        : t.publishValidation.instructorWarn.replace('{n}', String(noInstructor)),
      status: noInstructor === 0 ? 'passed' : 'warning',
      icon: <User className="w-4.5 h-4.5" />,
      critical: false,
      details: instructorDetails,
    });

    // 5. Capacity Check (warning)
    const overCapacityCourses = courses.filter(c => {
      if (c.totalCapacity === 0) return false;
      return (c.studentsEnrolled / c.totalCapacity) >= 0.9;
    });
    const overCapacity = overCapacityCourses.length;
    const capacityDetails = overCapacityCourses.map(c =>
      `${fmtCode(c.code)} · ${c.room} · ${c.studentsEnrolled}/${c.totalCapacity} (%${Math.round((c.studentsEnrolled / c.totalCapacity) * 100)})`
    );
    result.push({
      id: 'capacity',
      title: t.publishValidation.capacityTitle,
      message: overCapacity === 0
        ? t.publishValidation.capacityPass
        : t.publishValidation.capacityWarn.replace('{n}', String(overCapacity)),
      status: overCapacity === 0 ? 'passed' : 'warning',
      icon: <Users className="w-4.5 h-4.5" />,
      critical: false,
      details: capacityDetails,
    });

    // 6. Consecutive Limit (warning)
    // Group courses by lecturer+day, merge contiguous slots, flag blocks ≥ 6h.
    type Slot = { start: number; end: number; code: string };
    const lecturerDayMap: Record<string, Slot[]> = {};
    for (const c of courses) {
      if (!c.lecturer || c.lecturer.toLowerCase() === 'anonim' || c.lecturer.toLowerCase() === 'atanmamış') continue;
      const key = `${c.lecturer}__${c.day}`;
      const startH = parseInt(c.startTime.split(':')[0]);
      const endH = parseInt(c.endTime.split(':')[0]);
      if (!lecturerDayMap[key]) lecturerDayMap[key] = [];
      lecturerDayMap[key].push({ start: startH, end: endH, code: c.code });
    }
    const overConsecutive = new Set<string>();
    const consecutiveDetails: string[] = [];
    for (const [key, slots] of Object.entries(lecturerDayMap)) {
      slots.sort((a, b) => a.start - b.start);
      // Walk contiguous blocks
      let blockStart = slots[0].start;
      let blockEnd = slots[0].end;
      let blockCodes: string[] = [slots[0].code];
      const flush = () => {
        if (blockEnd - blockStart >= 6) {
          const [lecturer, day] = key.split('__');
          overConsecutive.add(lecturer);
          const codes = [...new Set(blockCodes)].map(fmtCode).join(', ');
          consecutiveDetails.push(
            `${lecturer} · ${t.days[day] || day} · ${String(blockStart).padStart(2, '0')}:00–${String(blockEnd).padStart(2, '0')}:00 (${blockEnd - blockStart} saat): ${codes}`
          );
        }
      };
      for (let i = 1; i < slots.length; i++) {
        if (slots[i].start <= blockEnd) {
          blockEnd = Math.max(blockEnd, slots[i].end);
          blockCodes.push(slots[i].code);
        } else {
          flush();
          blockStart = slots[i].start;
          blockEnd = slots[i].end;
          blockCodes = [slots[i].code];
        }
      }
      flush();
    }
    result.push({
      id: 'consecutive',
      title: t.publishValidation.consecutiveTitle,
      message: overConsecutive.size === 0
        ? t.publishValidation.consecutivePass
        : t.publishValidation.consecutiveWarn.replace('{n}', String(overConsecutive.size)),
      status: overConsecutive.size === 0 ? 'passed' : 'warning',
      icon: <Timer className="w-4.5 h-4.5" />,
      critical: false,
      details: consecutiveDetails,
    });

    // 7. Day Distribution (info)
    const dayCount: Record<string, number> = {};
    for (const d of DAYS) dayCount[d] = 0;
    for (const c of courses) dayCount[c.day] = (dayCount[c.day] || 0) + 1;
    const dayCounts = DAYS.map(d => ({ day: d, count: dayCount[d] }));
    const maxDay = dayCounts.reduce((a, b) => (b.count > a.count ? b : a), dayCounts[0]);
    const minDay = dayCounts.reduce((a, b) => (b.count < a.count ? b : a), dayCounts[0]);
    const ratio = maxDay.count > 0 ? minDay.count / maxDay.count : 1;
    const dayLabel = (d: string) => t.days[d] || d;
    const distributionDetail = t.publishValidation.distributionInfo
      .replace('{day}', dayLabel(maxDay.day))
      .replace('{n}', String(maxDay.count))
      .replace('{minDay}', dayLabel(minDay.day))
      .replace('{minN}', String(minDay.count));
    result.push({
      id: 'distribution',
      title: t.publishValidation.distributionTitle,
      message: distributionDetail,
      status: ratio >= 0.6 ? 'passed' : 'info',
      icon: <BarChart3 className="w-4.5 h-4.5" />,
      critical: false,
    });

    return result;
  }, [scheduledCourses, scheduleStats, t]);

  const passedCount = checks.filter(c => c.status === 'passed').length;
  const failedCount = checks.filter(c => c.status === 'failed').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  const hasBlocker = failedCount > 0;
  const hasWarning = warningCount > 0;

  // Single source of truth for the overall summary status
  const summaryLevel: CheckStatus = hasBlocker ? 'failed' : hasWarning ? 'warning' : 'passed';

  const summaryText = hasBlocker
    ? t.publishValidation.summaryBlocked.replace('{failed}', String(failedCount))
    : hasWarning
      ? t.publishValidation.summaryWithWarnings
          .replace('{passed}', String(passedCount))
          .replace('{total}', String(checks.length))
          .replace('{warnings}', String(warningCount))
      : t.publishValidation.summaryAllPassed;

  const statusColors: Record<CheckStatus, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    passed: {
      bg: darkMode ? '#022c22' : '#f0fdf4',
      text: '#16a34a',
      border: darkMode ? '#166534' : '#bbf7d0',
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    failed: {
      bg: darkMode ? '#450a0a' : '#fef2f2',
      text: '#ef4444',
      border: darkMode ? '#7f1d1d' : '#fecaca',
      icon: <XCircle className="w-4 h-4" />,
    },
    warning: {
      bg: darkMode ? '#451a03' : '#fffbeb',
      text: '#d97706',
      border: darkMode ? '#854d0e' : '#fde68a',
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    info: {
      bg: darkMode ? '#1e3a5f' : '#eff6ff',
      text: '#3b82f6',
      border: darkMode ? '#1e40af' : '#bfdbfe',
      icon: <Info className="w-4 h-4" />,
    },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: darkMode ? '#1e293b' : '#ffffff' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent */}
        <div
          className="h-1.5 w-full"
          style={{
            background: hasBlocker
              ? '#ef4444'
              : hasWarning
                ? '#d97706'
                : 'var(--brand-gradient)',
          }}
        />

        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                }}
              >
                {t.publishValidation.title}
              </h2>
              <p
                className="mt-1"
                style={{ fontSize: '12px', color: 'var(--text-muted)' }}
              >
                {t.publishValidation.subtitle}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{
                backgroundColor: 'var(--bg-mute)',
                color: 'var(--text-faint)',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary bar — uses summaryLevel to avoid repeated ternaries */}
        <div
          className="mx-6 mb-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border"
          style={{
            backgroundColor: statusColors[summaryLevel].bg,
            borderColor: statusColors[summaryLevel].border,
          }}
        >
          <span style={{ color: statusColors[summaryLevel].text }}>
            {statusColors[summaryLevel].icon}
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: statusColors[summaryLevel].text }}
          >
            {summaryText}
          </span>
        </div>

        {/* Checks list */}
        <div className="px-6 pb-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {checks.map(check => {
            const sc = statusColors[check.status];
            return (
              <div
                key={check.id}
                className="flex items-start gap-3 p-3 rounded-xl border transition-colors"
                style={{
                  backgroundColor: sc.bg,
                  borderColor: sc.border,
                }}
              >
                {/* Status icon */}
                <div
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                  style={{
                    backgroundColor: `${sc.text}18`,
                    color: sc.text,
                  }}
                >
                  {check.icon}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {check.title}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: `${sc.text}18`, color: sc.text }}
                    >
                      {t.publishValidation[STATUS_LABEL_KEY[check.status]]}
                    </span>
                  </div>
                  <p
                    className="text-[11px] leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {check.message}
                  </p>
                  {check.details && check.details.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {check.details.map((d, i) => (
                        <li
                          key={i}
                          className="text-[10.5px] leading-snug flex items-start gap-1.5 rounded-md px-2 py-1"
                          style={{ color: 'var(--text-primary)', backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                        >
                          <span className="mt-[3px] w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: sc.text }} />
                          <span className="min-w-0">{d}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Check/X indicator */}
                <div className="shrink-0 mt-1" style={{ color: sc.text }}>
                  {sc.icon}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4 border-t"
          style={{ borderColor: darkMode ? '#334155' : '#f1f5f9' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-mute)',
              color: 'var(--text-faint)',
            }}
          >
            {t.publishValidation.cancel}
          </button>
          <button
            onClick={async () => {
              setIsSaving(true);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                console.error('Schedule could not be saved or archived:', err);
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={hasBlocker || isSaving}
            className="px-5 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            style={{
              background: hasBlocker
                ? 'var(--border-light)'
                : hasWarning
                  ? '#d97706'
                  : 'var(--brand-gradient)',
              color: hasBlocker ? 'var(--text-muted)' : 'white',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isSaving
              ? t.admin.archiveLoading
              : hasBlocker
              ? t.publishValidation.blocked
              : hasWarning
                ? t.publishValidation.publishWithWarnings
                : t.publishValidation.publish}
          </button>
        </div>
      </div>
    </div>
  );
}
