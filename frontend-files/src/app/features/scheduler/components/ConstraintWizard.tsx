import { useState, useMemo } from 'react';
import {
  X, Shield, Search, Link2, Plus, Trash2, AlertCircle,
  Users, BookOpen, Building2, Timer, Wifi, CalendarCheck, Check,
  ArrowRight, ArrowLeft, CheckCircle2, ChevronDown,
} from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { isPoolDept } from '@/app/data/departments';
import { getSplitOptions, getDefaultSplit, getCourseTotalHours } from '@/app/features/scheduler/utils/splitOptions';
import type { AlgorithmInput, CommonWorkbookRow, ConstraintType, DayOfWeek } from '@/app/features/scheduler/types/schedulerTypes';

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 9 }, (_, i) => 9 + i); // 9..17

type StepKey = 'default' | 'linked' | 'instructor_unavailable' | 'course_fixed' | 'course_blocked' | 'course_split';

const STEP_ORDER: StepKey[] = ['default', 'linked', 'instructor_unavailable', 'course_fixed', 'course_blocked', 'course_split'];

// System (default) rule rows: key matches systemRuleEnabled flags in context.
const SYSTEM_RULE_KEYS = [
  'instructorClash', 'semesterClash', 'roomClash', 'consecutiveLimit', 'onlineExemption', 'weeklyHours',
] as const;

function hoursForCommonRow(row: CommonWorkbookRow): number {
  const componentTotal = (row.t_hour ?? 0) + (row.l_hour ?? 0);
  return componentTotal > 0 ? componentTotal : row.credit;
}

function commonRowsToCourses(rows: CommonWorkbookRow[]): AlgorithmInput[] {
  const byCode = new Map<string, CommonWorkbookRow[]>();
  for (const row of rows) {
    const code = row.course_code.trim().toUpperCase();
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), row]);
  }

  return Array.from(byCode.entries())
    .map(([code, courseRows], index) => {
      const sortedRows = [...courseRows].sort((a, b) => a.section - b.section);
      const first = sortedRows[0];
      const sectionInstructors = sortedRows.map(row => row.instructor?.trim() || 'anonim');
      const totalHours = Math.max(1, ...sortedRows.map(hoursForCommonRow));
      const theoryHours = Math.max(0, ...sortedRows.map(row => row.t_hour ?? 0));
      const labHours = Math.max(0, ...sortedRows.map(row => row.l_hour ?? 0));
      const expectedStudent = Math.max(0, ...sortedRows.map(row => row.enrolled || row.capacity || 0));
      return {
        course_id: -(index + 1),
        course_code: code,
        course_name: first.course_name || code,
        weekly_hours: totalHours,
        t_hour: theoryHours,
        l_hour: labHours,
        course_semester: 1,
        section_count: new Set(sortedRows.map(row => row.section)).size || 1,
        instructor_full_name: sectionInstructors.find(name => !['anonim', 'atanmamış', '-', 'nan'].includes(name.toLocaleLowerCase('tr-TR'))) ?? 'anonim',
        is_online: false,
        is_service: true,
        is_common: true,
        course_type_id: 4,
        expected_student: expectedStudent,
        department_codes: [],
        section_instructors: sectionInstructors,
      } satisfies AlgorithmInput;
    })
    .sort((a, b) => a.course_code.localeCompare(b.course_code, 'tr'));
}

export function ConstraintWizard({ onClose, onProceed }: { onClose: () => void; onProceed?: () => void }) {
  const {
    darkMode,
    algorithmCourses,
    linkableCourses,
    commonWorkbookRows,
    selectedCourseCodes,
    selectedDepartment,
    constraints,
    addConstraint,
    removeConstraint,
    clearConstraints,
    linkedGroups,
    addLinkedGroup,
    removeLinkedGroup,
    updateLinkedGroup,
    systemRuleEnabled,
    toggleSystemRule,
    constraintSettings,
    setLunchBreakEnabled,
    setLunchBreakSlot,
    courseSplits,
    setCourseSplit,
    constraintSaved,
    markConstraintSaved,
  } = useApp();
  const { t } = useLocale();
  const cw = t.constraintWizard;
  const cd = t.constraintDef;
  const ct = t.constraints;
  const cs = t.courseSplit;

  const [stepIndex, setStepIndex] = useState(0);
  const confirmed = constraintSaved as Record<StepKey, boolean>;

  const step = STEP_ORDER[stepIndex];
  const isLastStep = stepIndex === STEP_ORDER.length - 1;

  // Courses opened for the term drive the course/instructor pickers.
  const termCourses = useMemo(() => {
    if (isPoolDept(selectedDepartment)) return commonRowsToCourses(commonWorkbookRows);
    const sel = new Set(selectedCourseCodes);
    const base = selectedCourseCodes.length > 0
      ? algorithmCourses.filter(c => sel.has(c.course_code))
      : algorithmCourses;
    return base.filter(c => c.section_count > 0);
  }, [algorithmCourses, commonWorkbookRows, selectedCourseCodes, selectedDepartment]);

  // ── grid (instructor/fixed/blocked) state ──
  const [selectedTarget, setSelectedTarget] = useState('');
  const [gridSearch, setGridSearch] = useState('');

  // ── split tab: which course's dropdown is open ──
  const [openSplitFor, setOpenSplitFor] = useState<string | null>(null);

  // ── linking state ──
  const [isCreating, setIsCreating] = useState(false);
  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkError, setLinkError] = useState('');

  const instructors = useMemo(() => {
    const names = termCourses.flatMap(course => [
      course.instructor_full_name,
      ...(course.section_instructors ?? []),
    ]);
    const set = new Set(
      names
        .map(name => name?.trim())
        .filter((name): name is string => (
          Boolean(name)
          && !['anonim', 'atanmamış', '-', 'nan'].includes(name.toLocaleLowerCase('tr-TR'))
        )),
    );
    return [...set].sort();
  }, [termCourses]);

  const gridType = (step === 'instructor_unavailable' || step === 'course_fixed' || step === 'course_blocked')
    ? step as ConstraintType : null;

  const gridConfig: Record<ConstraintType, { color: string; slotLabel: string; desc: string }> = {
    instructor_unavailable: { color: '#ef4444', slotLabel: cd.unavailable, desc: cd.instructorDesc },
    course_fixed: { color: '#22c55e', slotLabel: cd.fixed, desc: cd.fixedDesc },
    course_blocked: { color: '#f59e0b', slotLabel: cd.blocked, desc: cd.blockedDesc },
  };

  const filteredList = useMemo(() => {
    const q = gridSearch.toLowerCase();
    if (step === 'instructor_unavailable') return instructors.filter(n => !q || n.toLowerCase().includes(q));
    return termCourses.filter(c => !q || c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q));
  }, [step, instructors, termCourses, gridSearch]);

  const targetConstraints = useMemo(() => {
    if (!selectedTarget || !gridType) return [];
    return constraints.filter(c => c.type === gridType && c.target === selectedTarget);
  }, [constraints, gridType, selectedTarget]);

  function toggleSlot(day: DayOfWeek, hour: number) {
    if (!selectedTarget || !gridType) return;
    const existing = targetConstraints.find(c => c.day === day && c.hour === hour);
    if (existing) removeConstraint(existing.id);
    else addConstraint(gridType, selectedTarget, day, hour);
  }

  function getTargetLabel(target: string) {
    if (step === 'instructor_unavailable') return target;
    const c = termCourses.find(a => a.course_code === target)
      ?? algorithmCourses.find(a => a.course_code === target);
    return c ? `${c.course_code} — ${c.course_name}` : target;
  }

  // ── linking helpers ──
  // Co-taught links may span departments, but both sides must actually be
  // offered in the selected term's workbooks.
  const allLinkedCodes = new Set(linkedGroups.flatMap(g => g.courseCodes));
  const linkSourceCourses = linkableCourses;
  const availableForLink = linkSourceCourses.filter(c => {
    if (allLinkedCodes.has(c.course_code) && !pendingCodes.includes(c.course_code)) return false;
    if (pendingCodes.includes(c.course_code)) return false;
    if (!linkSearch) return true;
    const q = linkSearch.toLowerCase();
    return c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q) || c.instructor_full_name.toLowerCase().includes(q);
  });

  function getCourseName(code: string) {
    return termCourses.find(a => a.course_code === code)?.course_name
      ?? linkableCourses.find(a => a.course_code === code)?.course_name
      ?? algorithmCourses.find(a => a.course_code === code)?.course_name
      ?? code;
  }

  function handleSaveGroup() {
    if (pendingCodes.length < 2) { setLinkError(ct.minTwoCourses); return; }
    const selected = pendingCodes
      .map(code => linkableCourses.find(course => course.course_code === code))
      .filter((course): course is AlgorithmInput => Boolean(course));
    if (selected.length !== pendingCodes.length) {
      setLinkError(ct.unavailableCourse);
      return;
    }
    if (new Set(selected.map(course => course.section_count)).size > 1) {
      setLinkError(ct.sectionMismatch);
      return;
    }
    if (new Set(selected.map(getCourseTotalHours)).size > 1) {
      setLinkError(ct.hourMismatch);
      return;
    }
    addLinkedGroup(pendingCodes);
    setPendingCodes([]); setIsCreating(false); setLinkError('');
  }

  // ── navigation ──
  function confirmStep() {
    markConstraintSaved(step);
  }
  function goNext() {
    if (!confirmed[step]) return;
    if (isLastStep) { onClose(); onProceed?.(); return; }
    setStepIndex(i => Math.min(i + 1, STEP_ORDER.length - 1));
    setSelectedTarget(''); setGridSearch('');
  }
  function goBack() {
    if (stepIndex === 0) return;
    setStepIndex(i => Math.max(i - 1, 0));
    setSelectedTarget(''); setGridSearch('');
  }
  function jumpTo(i: number) {
    // Allow jumping only to already-confirmed steps or the current one.
    if (i === stepIndex) return;
    const allConfirmedUpTo = STEP_ORDER.slice(0, i).every(s => confirmed[s]);
    if (i < stepIndex || allConfirmedUpTo) {
      setStepIndex(i); setSelectedTarget(''); setGridSearch('');
    }
  }

  const tabLabels: Record<StepKey, string> = {
    default: cw.tabDefault,
    linked: cw.tabLinked,
    instructor_unavailable: cw.tabInstructor,
    course_fixed: cw.tabFixed,
    course_blocked: cw.tabBlocked,
    course_split: cw.tabSplit,
  };

  const systemRuleMeta: Record<string, { icon: typeof Shield; title: string; desc: string; color: string }> = {
    instructorClash: { icon: Users, title: cd.sysInstructorClash, desc: cd.sysInstructorClashDesc, color: '#ef4444' },
    semesterClash: { icon: BookOpen, title: cd.sysSemesterClash, desc: cd.sysSemesterClashDesc, color: '#f59e0b' },
    roomClash: { icon: Building2, title: cd.sysRoomClash, desc: cd.sysRoomClashDesc, color: '#3b82f6' },
    consecutiveLimit: { icon: Timer, title: cd.sysConsecutiveLimit, desc: cd.sysConsecutiveLimitDesc, color: '#8b5cf6' },
    onlineExemption: { icon: Wifi, title: cd.sysOnlineExemption, desc: cd.sysOnlineExemptionDesc, color: '#06b6d4' },
    weeklyHours: { icon: CalendarCheck, title: cd.sysWeeklyHours, desc: cd.sysWeeklyHoursDesc, color: '#22c55e' },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--bg-mute)' }}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Shield className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
              {cw.title}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {cw.stepOf.replace('{i}', String(stepIndex + 1)).replace('{n}', String(STEP_ORDER.length))} · {cw.subtitle}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-faint)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b shrink-0 overflow-x-auto" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-mute)' }}>
          {STEP_ORDER.map((s, i) => {
            const isActive = i === stepIndex;
            const isDone = confirmed[s];
            return (
              <button
                key={s}
                onClick={() => jumpTo(i)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors relative whitespace-nowrap"
                style={{
                  color: isActive ? 'var(--brand-primary)' : (isDone ? '#22c55e' : 'var(--text-muted)'),
                  borderBottom: isActive ? '2px solid var(--brand-primary)' : '2px solid transparent',
                }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    backgroundColor: isDone ? '#22c55e' : (isActive ? 'var(--brand-primary)' : 'var(--border-light)'),
                    color: isDone || isActive ? '#fff' : 'var(--text-faint)',
                  }}
                >
                  {isDone ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {tabLabels[s]}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── STEP: Default constraints (checkboxes) ── */}
          {step === 'default' && (
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>{cd.systemDesc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SYSTEM_RULE_KEYS.map(key => {
                  const meta = systemRuleMeta[key];
                  const enabled = systemRuleEnabled[key];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSystemRule(key)}
                      className="flex items-start gap-3 p-4 rounded-xl border text-left transition-all"
                      style={{
                        borderColor: enabled ? meta.color : 'var(--border-light)',
                        backgroundColor: enabled ? `${meta.color}10` : (darkMode ? '#0f172a' : '#f8fafc'),
                        opacity: enabled ? 1 : 0.65,
                      }}
                    >
                      {/* checkbox */}
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                        style={{
                          backgroundColor: enabled ? meta.color : 'transparent',
                          border: `2px solid ${enabled ? meta.color : 'var(--border-light)'}`,
                        }}
                      >
                        {enabled && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <meta.icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
                          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{meta.title}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: enabled ? '#22c55e22' : 'var(--border-light)', color: enabled ? '#22c55e' : 'var(--text-faint)' }}>
                            {enabled ? cd.systemBadge : cd.systemDisabled}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{meta.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-3 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
                style={{
                  borderColor: constraintSettings.enforceLunchBreak ? '#f97316' : 'var(--border-light)',
                  backgroundColor: constraintSettings.enforceLunchBreak ? '#f9731610' : (darkMode ? '#0f172a' : '#f8fafc'),
                }}
              >
                <button
                  type="button"
                  onClick={() => setLunchBreakEnabled(!constraintSettings.enforceLunchBreak)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: constraintSettings.enforceLunchBreak ? '#f97316' : 'transparent',
                      border: `2px solid ${constraintSettings.enforceLunchBreak ? '#f97316' : 'var(--border-light)'}`,
                    }}
                  >
                    {constraintSettings.enforceLunchBreak && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4" style={{ color: '#f97316' }} />
                      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {cd.sysLunchBreak}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {cd.sysLunchBreakDesc}
                    </p>
                  </div>
                </button>
                <select
                  value={constraintSettings.lunchSlots[0] ?? 3}
                  onChange={event => setLunchBreakSlot(Number(event.target.value))}
                  disabled={!constraintSettings.enforceLunchBreak}
                  className="h-9 rounded-lg border px-3 text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-light)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {constraintSettings.daytimeSlots.map(slot => (
                    <option key={slot} value={slot}>
                      {constraintSettings.timeMap[String(slot)] ?? `${slot}:00`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── STEP: Linked courses (co-scheduled constraint) ── */}
          {step === 'linked' && (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ct.linkedCourses}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{ct.linkedDesc}</p>
                </div>
                {!isCreating && (
                  <button onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'var(--brand-gradient)', color: 'var(--brand-on-primary)' }}>
                    <Plus className="w-3.5 h-3.5" />{ct.addGroup}
                  </button>
                )}
              </div>

              {linkedGroups.length === 0 && !isCreating && (
                <div className="text-center py-10 rounded-xl border-2 border-dashed" style={{ borderColor: 'var(--border-light)' }}>
                  <Link2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)', opacity: 0.5 }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-faint)' }}>{ct.noGroups}</p>
                  <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--text-faint)', opacity: 0.7 }}>{ct.noGroupsHint}</p>
                </div>
              )}

              <div className="space-y-3">
                {linkedGroups.map((group, idx) => {
                  const unavailable = group.courseCodes.filter(code => (
                    !linkableCourses.some(course => course.course_code === code)
                  ));
                  return (
                  <div key={group.id} className="rounded-xl border p-4" style={{ borderColor: unavailable.length ? '#ef4444' : 'var(--border-light)', backgroundColor: darkMode ? '#1e293b' : '#f8fafc' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--brand-on-primary)' }}>
                        {ct.groupLabel}-{idx + 1} · {group.courseCodes.length} {ct.coursesInGroup}
                      </span>
                      <button onClick={() => removeLinkedGroup(group.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-900/20" style={{ color: '#ef4444' }}>
                        <Trash2 className="w-3 h-3" />{ct.removeGroup}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.courseCodes.map(code => (
                        <div key={code} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                          <div>
                            <span className="text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>{code}</span>
                            <p className="text-[11px] truncate max-w-[180px]" style={{ color: 'var(--text-faint)' }}>{getCourseName(code)}</p>
                          </div>
                          <button onClick={() => updateLinkedGroup(group.id, group.courseCodes.filter(c => c !== code))}
                            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" style={{ color: 'var(--text-faint)' }}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {unavailable.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs font-medium" style={{ color: '#ef4444' }}>
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {ct.unavailableCourse}: {unavailable.join(', ')}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              {isCreating && (
                <div className="rounded-xl border-2 border-dashed p-4 mt-3" style={{ borderColor: 'var(--brand-primary)', backgroundColor: darkMode ? 'rgba(59,130,246,0.05)' : 'rgba(60,141,188,0.05)' }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{ct.addGroup}</h4>
                  {pendingCodes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {pendingCodes.map(code => (
                        <div key={code} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--brand-on-primary)' }}>
                          <span className="text-xs font-bold">{code}</span>
                          <span className="text-[10px] opacity-80 max-w-[120px] truncate">{getCourseName(code)}</span>
                          <button onClick={() => setPendingCodes(prev => prev.filter(c => c !== code))} className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-faint)' }} />
                    <input type="text" placeholder={ct.selectCourse} value={linkSearch}
                      onChange={e => { setLinkSearch(e.target.value); setLinkError(''); }}
                      className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-opacity-50"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }} />
                  </div>
                  {linkSearch && (
                    <div className="max-h-40 overflow-y-auto rounded-xl border mb-3" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                      {availableForLink.length === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-faint)' }}>{t.courseManage.noCourses}</p>
                      ) : availableForLink.slice(0, 20).map(c => (
                        <button key={c.course_code} onClick={() => { setPendingCodes(prev => [...prev, c.course_code]); setLinkSearch(''); setLinkError(''); }}
                          className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <div>
                            <span className="font-bold text-xs" style={{ color: 'var(--brand-primary)' }}>{c.course_code}</span>
                            <span className="ml-2 text-xs" style={{ color: 'var(--text-primary)' }}>{c.course_name}</span>
                            <span className="ml-2 text-[10px]" style={{ color: 'var(--text-faint)' }}>({c.instructor_full_name})</span>
                          </div>
                          <Plus className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                        </button>
                      ))}
                    </div>
                  )}
                  {linkError && (
                    <div className="flex items-center gap-1.5 mb-3 text-xs font-medium" style={{ color: '#ef4444' }}>
                      <AlertCircle className="w-3.5 h-3.5" />{linkError}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setPendingCodes([]); setIsCreating(false); setLinkError(''); setLinkSearch(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
                      {t.close}
                    </button>
                    <button onClick={handleSaveGroup} disabled={pendingCodes.length < 2}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                      style={{ background: pendingCodes.length >= 2 ? 'var(--brand-gradient)' : 'var(--bg-mute)', color: pendingCodes.length >= 2 ? 'var(--brand-on-primary)' : 'var(--text-faint)', cursor: pendingCodes.length >= 2 ? 'pointer' : 'not-allowed' }}>
                      <Link2 className="w-3.5 h-3.5" />{ct.addGroup}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: time-grid based (instructor / fixed / blocked) ── */}
          {gridType && (
            <>
              {/* Left target selector */}
              <div className="w-56 shrink-0 border-r flex flex-col overflow-hidden" style={{ borderColor: 'var(--border-light)', backgroundColor: darkMode ? '#0f172a' : '#f8fafc' }}>
                <div className="p-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
                    <input type="text" placeholder={step === 'instructor_unavailable' ? cd.selectInstructor : cd.selectCourse}
                      value={gridSearch} onChange={e => setGridSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none focus:ring-1"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2">
                  {filteredList.map(item => {
                    const key = typeof item === 'string' ? item : item.course_code;
                    const label = typeof item === 'string' ? item : item.course_code;
                    const sub = typeof item === 'string' ? null : item.course_name;
                    const isSelected = selectedTarget === key;
                    const count = constraints.filter(c => c.type === gridType && c.target === key).length;
                    return (
                      <button key={key} onClick={() => { setSelectedTarget(key); setGridSearch(''); }}
                        className="w-full text-left px-3 py-2 rounded-lg mb-0.5 text-xs transition-colors"
                        style={{ backgroundColor: isSelected ? (darkMode ? 'rgba(59,130,246,0.15)' : 'rgba(60,141,188,0.1)') : 'transparent', color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)', fontWeight: isSelected ? 600 : 400 }}>
                        <div className="flex items-center justify-between">
                          <span className="truncate">{label}</span>
                          {count > 0 && (
                            <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: gridConfig[gridType].color, color: '#fff' }}>{count}</span>
                          )}
                        </div>
                        {sub && <p className="truncate mt-0.5" style={{ color: 'var(--text-faint)', fontSize: '10px' }}>{sub}</p>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right time grid */}
              <div className="flex-1 overflow-auto p-4">
                {!selectedTarget ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: 'var(--text-faint)' }}>{cd.noTarget}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{getTargetLabel(selectedTarget)}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{gridConfig[gridType].desc}</p>
                      </div>
                      {targetConstraints.length > 0 && (
                        <button onClick={() => clearConstraints(selectedTarget)}
                          className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/20" style={{ color: '#ef4444' }}>
                          {cd.clearAll} ({targetConstraints.length})
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse" style={{ minWidth: 400 }}>
                        <thead>
                          <tr>
                            <th className="w-16 p-1.5" />
                            {DAYS.map(day => (
                              <th key={day} className="p-1.5 text-[11px] font-semibold text-center" style={{ color: 'var(--text-muted)' }}>{t.days[day]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {HOURS.map(hour => (
                            <tr key={hour}>
                              <td className="p-1.5 text-[11px] font-medium text-right whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{String(hour).padStart(2, '0')}:00</td>
                              {DAYS.map(day => {
                                const active = targetConstraints.some(c => c.day === day && c.hour === hour);
                                return (
                                  <td key={day} className="p-0.5">
                                    <button onClick={() => toggleSlot(day, hour)}
                                      className="w-full h-9 rounded-lg border-2 transition-all text-[10px] font-bold"
                                      style={{
                                        backgroundColor: active ? gridConfig[gridType].color : (darkMode ? '#1e293b' : '#f1f5f9'),
                                        borderColor: active ? gridConfig[gridType].color : 'var(--border-light)',
                                        color: active ? '#fff' : 'transparent', cursor: 'pointer',
                                      }}>
                                      {active ? gridConfig[gridType].slotLabel : ''}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── STEP: Course hour splitting ── */}
          {step === 'course_split' && (
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>{cs.desc}</p>
              {termCourses.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-center px-6">
                  <p className="text-sm" style={{ color: 'var(--text-faint)' }}>{cs.empty}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {termCourses.map(course => {
                    const totalHours = getCourseTotalHours(course);
                    const opts = getSplitOptions(totalHours);
                    const def = getDefaultSplit(totalHours);
                    const selected = courseSplits[course.course_code] ?? [def];
                    const open = openSplitFor === course.course_code;
                    return (
                      <div key={course.course_code} className="rounded-xl border" style={{ borderColor: 'var(--border-light)', backgroundColor: darkMode ? '#1e293b' : '#fff' }}>
                        <div className="flex items-center gap-3 p-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--border-light)', color: 'var(--text-muted)' }}>{course.course_code}</span>
                              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{course.course_name}</span>
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}>
                                {totalHours} {cs.hoursShort}
                              </span>
                            </div>
                            {/* selected chips */}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {selected.map(o => (
                                <span key={o} className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: o === def ? '#22c55e22' : 'var(--bg-mute)', color: o === def ? '#16a34a' : 'var(--text-muted)', border: '1px solid var(--border-light)' }}>
                                  {o}{o === def ? ` · ${cs.defaultBadge}` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                          {/* dropdown trigger */}
                          <div className="relative shrink-0">
                            <button
                              onClick={() => setOpenSplitFor(open ? null : course.course_code)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                              style={{ backgroundColor: 'var(--bg-mute)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                            >
                              {cs.options}
                              <ChevronDown className="w-3.5 h-3.5" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                            </button>
                            {open && (
                              <div className="absolute right-0 mt-1 z-10 w-44 rounded-xl border shadow-lg p-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
                                {opts.map(o => {
                                  const checked = selected.includes(o);
                                  return (
                                    <button
                                      key={o}
                                      onClick={() => {
                                        const next = checked ? selected.filter(x => x !== o) : [...selected, o];
                                        setCourseSplit(course.course_code, next.length ? next : [def]);
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      <span className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: checked ? 'var(--brand-primary)' : 'transparent', border: `2px solid ${checked ? 'var(--brand-primary)' : 'var(--border-light)'}` }}>
                                        {checked && <Check className="w-2.5 h-2.5 text-white" />}
                                      </span>
                                      <span className="flex-1 text-left">{o}</span>
                                      {o === def && <span className="text-[9px] font-bold" style={{ color: '#16a34a' }}>{cs.defaultBadge}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: navigation */}
        <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between gap-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--bg-mute)' }}>
          <button onClick={goBack} disabled={stepIndex === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft className="w-4 h-4" />{cw.back}
          </button>

          <div className="flex items-center gap-2">
            {!confirmed[step] ? (
              <button onClick={confirmStep}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: darkMode ? '#064e3b' : '#dcfce7', color: '#16a34a', border: '1px solid #22c55e' }}>
                <CheckCircle2 className="w-4 h-4" />{cw.confirm}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold" style={{ color: '#16a34a' }}>
                <CheckCircle2 className="w-4 h-4" />{cw.confirmed}
              </span>
            )}
            <button onClick={goNext} disabled={!confirmed[step]}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: confirmed[step] ? 'var(--brand-gradient)' : '#9ca3af' }}
              title={!confirmed[step] ? cw.confirmHint : ''}>
              {isLastStep ? cw.finish : cw.next}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
