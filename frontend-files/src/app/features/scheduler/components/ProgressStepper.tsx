import { BookOpen, Link2, RefreshCw, CheckCircle2, Shield, Zap } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import type { ReactNode } from 'react';

interface ProgressStepperProps {
  onStepCourses: () => void;
  onStepConstraints: () => void;
  onStepAlgorithm: () => void;
  onStepPublish?: () => void;
}

type StepStatus = 'completed' | 'active' | 'pending';

interface StepDef {
  key: string;
  label: string;
  subtitle: string;
  icon: ReactNode;
  status: StepStatus;
  onClick: () => void;
}

export function ProgressStepper({ onStepCourses, onStepConstraints, onStepAlgorithm, onStepPublish }: ProgressStepperProps) {
  const {
    darkMode,
    selectedCourseCodes,
    scheduledCourses,
    isCalculating,
    publishedAt,
    linkedGroups,
    constraints,
    scheduleStats,
    selectedDepartment,
    commonWorkbookRows,
  } = useApp();
  const { t } = useLocale();

  const totalConstraints = linkedGroups.length + constraints.length;
  const conflictCount = scheduleStats?.conflictCount ?? 0;

  // ── Determine active step ──
  const isCommon = selectedDepartment === 'HAVUZ';
  const coursesReady = isCommon ? commonWorkbookRows.length > 0 : selectedCourseCodes.length > 0;
  const algorithmRan = scheduledCourses.length > 0;
  const isPublished = !!publishedAt;

  function getActiveStep(): number {
    if (isPublished) return 4;
    if (algorithmRan) return 4;
    if (isCalculating) return 3;
    if (coursesReady) return 2;
    return 1;
  }
  const activeStep = getActiveStep();

  function status(step: number): StepStatus {
    if (step === 4 && isPublished) return 'completed';
    if (step < activeStep) return 'completed';
    if (step === activeStep) return 'active';
    return 'pending';
  }

  // ── Subtitles ──
  function coursesSub(): string {
    if (coursesReady) return t.stepper.coursesReady.replace('{n}', String(isCommon ? commonWorkbookRows.length : selectedCourseCodes.length));
    return t.stepper.noCourses;
  }

  function constraintsSub(): string {
    if (totalConstraints > 0) return t.stepper.constraintsSet.replace('{n}', String(totalConstraints));
    return t.stepper.constraintsOptional;
  }

  function algorithmSub(): string {
    if (isCalculating) return t.stepper.running;
    if (algorithmRan) return t.stepper.algorithmDone.replace('{n}', String(scheduledCourses.length));
    return t.stepper.clickToRun;
  }

  function publishSub(): string {
    if (isPublished) return t.stepper.published;
    if (algorithmRan && conflictCount > 0) return t.stepper.hasConflicts.replace('{n}', String(conflictCount));
    if (algorithmRan) return t.stepper.readyToPublish;
    return t.stepper.pendingPublish;
  }

  const steps: StepDef[] = [
    {
      key: 'courses',
      label: t.stepper.stepCourses,
      subtitle: coursesSub(),
      icon: <BookOpen className="w-4 h-4" />,
      status: status(1),
      onClick: onStepCourses,
    },
    {
      key: 'constraints',
      label: t.stepper.stepConstraints,
      subtitle: constraintsSub(),
      icon: totalConstraints > 0 ? <Shield className="w-4 h-4" /> : <Link2 className="w-4 h-4" />,
      status: status(2),
      onClick: onStepConstraints,
    },
    {
      key: 'algorithm',
      label: t.stepper.stepAlgorithm,
      subtitle: algorithmSub(),
      icon: isCalculating
        ? <RefreshCw className="w-4 h-4 animate-spin" />
        : <Zap className="w-4 h-4" />,
      status: status(3),
      onClick: onStepAlgorithm,
    },
    {
      key: 'publish',
      label: t.stepper.stepPublish,
      subtitle: publishSub(),
      icon: <CheckCircle2 className="w-4 h-4" />,
      status: status(4),
      onClick: () => { if (algorithmRan && !isPublished && onStepPublish) onStepPublish(); },
    },
  ];

  // ── Colors ──
  function circleStyle(s: StepStatus) {
    if (s === 'completed') return {
      backgroundColor: darkMode ? '#064e3b' : '#dcfce7',
      color: '#22c55e',
      border: `2px solid ${darkMode ? '#16a34a' : '#bbf7d0'}`,
    };
    if (s === 'active') return {
      backgroundColor: darkMode ? '#1e3a5f' : 'var(--brand-primary-soft)',
      color: 'var(--brand-primary)',
      border: '2px solid var(--brand-primary)',
    };
    return {
      backgroundColor: 'var(--bg-mute)',
      color: 'var(--text-faint)',
      border: '2px solid var(--border-light)',
    };
  }

  function lineColor(beforeStep: number): string {
    if (beforeStep < activeStep) return darkMode ? '#16a34a' : '#86efac';
    return 'var(--border-light)';
  }

  return (
    <div
      className="flex items-center justify-center gap-0 px-4 sm:px-6 py-2.5 border-b shrink-0 overflow-x-auto"
      style={{
        backgroundColor: darkMode ? 'var(--bg-surface)' : 'rgba(255,255,255,0.6)',
        borderColor: 'var(--border-light)',
      }}
    >
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : 'none' }}>
          {/* Step circle + labels */}
          <button
            onClick={step.onClick}
            className="flex items-center gap-2.5 group cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] min-w-0"
            style={{ outline: 'none' }}
          >
            {/* Circle */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
              style={{
                ...circleStyle(step.status),
                boxShadow: step.status === 'active' ? '0 0 0 3px var(--brand-primary-soft)' : 'none',
              }}
            >
              {step.key === 'algorithm' && isCalculating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <span className="text-sm font-bold leading-none">{i + 1}</span>
              )}
            </div>
            {/* Text */}
            <div className="hidden sm:flex flex-col min-w-0">
              <span
                className="text-xs font-semibold truncate"
                style={{
                  color: step.status === 'pending' ? 'var(--text-faint)' : 'var(--text-primary)',
                }}
              >
                {step.label}
              </span>
              <span
                className="text-[10px] truncate"
                style={{
                  color: step.status === 'active' ? 'var(--brand-primary)' : 'var(--text-muted)',
                }}
              >
                {step.subtitle}
              </span>
            </div>
          </button>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className="hidden sm:block flex-1 mx-3"
              style={{
                height: 2,
                minWidth: 24,
                backgroundColor: lineColor(i + 1),
                borderRadius: 1,
                transition: 'background-color 0.3s ease',
              }}
            />
          )}
          {/* Mobile: small dot connector */}
          {i < steps.length - 1 && (
            <div
              className="sm:hidden mx-1.5"
              style={{
                width: 12,
                height: 2,
                backgroundColor: lineColor(i + 1),
                borderRadius: 1,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
