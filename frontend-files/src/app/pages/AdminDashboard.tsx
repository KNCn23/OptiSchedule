import { CheckCircle2, Download, BarChart2, X, ChevronLeft, ChevronRight, Building2, RefreshCw, Trash2, Zap, Archive } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { LoginScreen } from '@/app/features/auth/components/LoginScreen';
import { DynamicFilters } from '@/app/features/scheduler/components/DynamicFilters';
import { StatusPanel } from '@/app/features/scheduler/components/StatusPanel';
import { CourseDetailModal } from '@/app/features/scheduler/components/CourseDetailModal';
import { CourseManagementModal } from '@/app/features/courses/components/CourseManagementModal';
import { ConstraintWizard } from '@/app/features/scheduler/components/ConstraintWizard';
import { ExportModal } from '@/app/features/scheduler/components/ExportModal';
import { RoomAssignmentModal } from '@/app/features/scheduler/components/RoomAssignmentModal';
import { CommonCourseUploadModal } from '@/app/features/scheduler/components/CommonCourseUploadModal';
import { DeleteScheduleModal } from '@/app/features/scheduler/components/DeleteScheduleModal';
import { ScheduleArchiveModal } from '@/app/features/scheduler/components/ScheduleArchiveModal';
import { ScheduleTableView } from '@/app/features/scheduler/components/ScheduleTableView';
import { ProgressStepper } from '@/app/features/scheduler/components/ProgressStepper';
import { PublishValidationModal } from '@/app/features/scheduler/components/PublishValidationModal';
import { DEPARTMENTS, POOL_DEPARTMENT, departmentName, departmentCodeForUser, isPoolDept } from '@/app/data/departments';
import { useState, useEffect } from 'react';

export function AdminDashboard() {
  const {
    darkMode, publishedAt, setPublishedAt, selectedCourse, setIsManageModalOpen,
    isCalculating, runAlgorithm, scheduledCourses, selectedTerm, setSelectedTerm,
    currentUser,
    selectedDepartment, setSelectedDepartment,
    saveCommonSchedule, saveDeptSchedule, archiveCurrentSchedule,
    commonWorkbookRows,
  } = useApp();

  const canAssignRooms = currentUser?.role === 'admin' || currentUser?.role === 'dept_chair';
  // Dept-locked roles can only build their own program — pin the department selector.
  const lockedDept = (currentUser?.role === 'coordinator' || currentUser?.role === 'secretary')
    ? departmentCodeForUser(currentUser) : '';
  const { t, locale } = useLocale();
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [isConstraintsOpen, setIsConstraintsOpen] = useState(false);
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isRoomAssignOpen, setIsRoomAssignOpen] = useState(false);
  const [isCommonUploadOpen, setIsCommonUploadOpen] = useState(false);
  const [isDeleteScheduleOpen, setIsDeleteScheduleOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  // Status panel drawer (default closed)
  const [statusOpen, setStatusOpen] = useState(false);

  // Dept-locked roles always work on their own department.
  useEffect(() => {
    if (lockedDept && selectedDepartment !== lockedDept) setSelectedDepartment(lockedDept);
  }, [lockedDept, selectedDepartment, setSelectedDepartment]);

  if (!currentUser || currentUser.role === 'instructor') {
    return <LoginScreen />;
  }

  const termLabel = selectedTerm === 'spring' ? t.academicYear.termSpring : t.academicYear.termFall;
  function openPublishValidation() {
    setIsValidationOpen(true);
  }

  async function handlePublishConfirm() {
    const now = new Date();
    const formatted = now.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    setPublishedAt(formatted);
    if (isPoolDept(selectedDepartment)) {
      await saveCommonSchedule(scheduledCourses);
    } else if (selectedDepartment) {
      await saveDeptSchedule(selectedDepartment, scheduledCourses.filter(c => !c.isLocked));
    }
    await archiveCurrentSchedule();
  }

  // Build schedule (step 3) is gated until all constraint steps are saved.
  function handleBuildSchedule() {
    if (isCalculating) return;
    if (isPoolDept(selectedDepartment) && commonWorkbookRows.length === 0) {
      setIsCommonUploadOpen(true);
      return;
    }
    runAlgorithm();
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      {/* Top bar */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-3 sm:px-5 py-3 sm:py-2.5 border-b shrink-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {t.admin.title}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {selectedDepartment ? `${departmentName(selectedDepartment)} · ` : ''}{termLabel} · {scheduledCourses.length} {t.admin.sessions}
            </p>
          </div>

          {/* Mobile Panel Toggle */}
          <button
            onClick={() => setIsMobilePanelOpen(true)}
            className="flex lg:hidden items-center justify-center p-2 rounded-lg font-medium transition-colors"
            style={{ backgroundColor: 'var(--bg-mute)', color: 'var(--text-primary)' }}
          >
            <BarChart2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Department selector — pinned to their own program for dept-locked roles */}
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            disabled={!!lockedDept}
            className="h-9 px-2 rounded-lg text-xs font-medium focus:outline-none disabled:cursor-not-allowed"
            style={{
              fontSize: '13px',
              backgroundColor: selectedDepartment ? 'var(--brand-primary-soft)' : 'var(--bg-mute)',
              color: selectedDepartment ? 'var(--brand-primary)' : 'var(--text-muted)',
              border: `1px solid ${selectedDepartment ? 'var(--brand-primary)' : 'var(--border-light)'}`,
              fontWeight: 600,
              maxWidth: 220,
            }}
          >
            {lockedDept ? (
              <option value={lockedDept}>{lockedDept} · {departmentName(lockedDept)}</option>
            ) : (
              <>
                <option value="">{t.courseManage.department}…</option>
                <option value={POOL_DEPARTMENT.code}>
                  {POOL_DEPARTMENT.code} · {POOL_DEPARTMENT.name}
                </option>
                {DEPARTMENTS.map(d => (
                  <option key={d.code} value={d.code}>{d.code} · {d.name}</option>
                ))}
              </>
            )}
          </select>
          {isPoolDept(selectedDepartment) && (
            <button
              onClick={handleBuildSchedule}
              disabled={isCalculating}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold transition-colors disabled:cursor-wait disabled:opacity-70"
              style={{ fontSize: '13px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: '1px solid var(--brand-primary)' }}
            >
              {isCalculating
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Zap className="w-3.5 h-3.5" />}
              {isCalculating
                ? t.admin.running
                : commonWorkbookRows.length > 0
                  ? t.admin.createCommonSchedule
                  : t.commonUpload.button}
            </button>
          )}
          {canAssignRooms && (
            <button
              onClick={() => setIsRoomAssignOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold transition-colors"
              style={{ fontSize: '13px', backgroundColor: darkMode ? '#3b0764' : '#f5f3ff', color: '#7c3aed', border: '1px solid #7c3aed' }}
            >
              <Building2 className="w-3.5 h-3.5" />
              {t.roomAssign.button}
            </button>
          )}
          {canAssignRooms && scheduledCourses.length > 0 && (
            <button
              onClick={() => setIsDeleteScheduleOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold transition-colors"
              style={{
                fontSize: '13px',
                backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
                color: darkMode ? '#fca5a5' : '#b91c1c',
                border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`,
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.admin.deletePrevious}
            </button>
          )}
          <button
            onClick={() => setIsArchiveOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-medium transition-colors"
            style={{ fontSize: '13px', backgroundColor: 'var(--bg-mute)', color: 'var(--text-muted)', border: '1px solid var(--border-light)' }}
          >
            <Archive className="w-3.5 h-3.5" />
            {t.admin.archiveButton}
          </button>
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-medium transition-colors"
            style={{ fontSize: '13px', backgroundColor: 'var(--bg-mute)', color: 'var(--text-muted)', border: '1px solid var(--border-light)' }}
          >
            <Download className="w-3.5 h-3.5" />
            {t.admin.export}
          </button>

          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value as 'fall' | 'spring')}
            className="h-9 px-3 rounded-lg text-sm font-semibold focus:outline-none"
            style={{ backgroundColor: 'var(--bg-mute)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
          >
            <option value="fall">{t.academicYear.termFall}</option>
            <option value="spring">{t.academicYear.termSpring}</option>
          </select>

          {publishedAt && (
            <span
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold ml-auto sm:ml-0"
              style={{ fontSize: '13px', backgroundColor: darkMode ? '#022c22' : '#f0fdf4', color: '#16a34a' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.published}
            </span>
          )}
        </div>
      </div>

      {/* Progress Stepper */}
      <ProgressStepper
        onStepCourses={() => {
          if (isPoolDept(selectedDepartment)) setIsCommonUploadOpen(true);
          else setIsManageModalOpen(true);
        }}
        onStepConstraints={() => { if (!isConstraintsOpen) setIsConstraintsOpen(true); }}
        onStepAlgorithm={handleBuildSchedule}
        onStepPublish={openPublishValidation}
      />

      {/* Filters */}
      <DynamicFilters />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        <ScheduleTableView />

        {/* Desktop status panel drawer + grip handle (default closed) */}
        <div className="hidden lg:flex absolute top-0 right-0 h-full z-30">
          {/* Grip handle */}
          <div className="relative group self-center">
            <button
              onClick={() => setStatusOpen(o => !o)}
              className="flex items-center justify-center w-6 py-6 rounded-l-xl shadow-md transition-colors"
              style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-light)', borderRight: 'none' }}
              aria-label={t.status.title}
            >
              {statusOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            {!statusOpen && (
              <span
                className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-surface)' }}
              >
                {t.status.openPanel}
              </span>
            )}
          </div>
          {/* Panel */}
          {statusOpen && (
            <div className="h-full animate-in slide-in-from-right duration-200 ease-out shadow-2xl">
              <StatusPanel onPublish={openPublishValidation} />
            </div>
          )}
        </div>

        {/* Mobile Status panel overlay */}
        {isMobilePanelOpen && (
          <div className="lg:hidden absolute inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobilePanelOpen(false)} />
            <div className="relative h-full animate-in slide-in-from-right duration-200 ease-out shadow-2xl">
              <button
                onClick={() => setIsMobilePanelOpen(false)}
                className="absolute top-3 left-[-40px] p-2 rounded-full shadow-lg border border-white/20"
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <X className="w-4 h-4" />
              </button>
              <StatusPanel onPublish={openPublishValidation} isMobile={true} />
            </div>
          </div>
        )}
      </div>

      {/* Course detail modal */}
      {selectedCourse && <CourseDetailModal />}

      {/* Course management modal — pick term courses (catalog / excel), then İlerle */}
      <CourseManagementModal onProceed={() => setIsConstraintsOpen(true)} />

      {/* Unified constraint wizard (KISITLARI BELİRLE) */}
      {isConstraintsOpen && (
        <ConstraintWizard
          onClose={() => setIsConstraintsOpen(false)}
          onProceed={() => {
            handleBuildSchedule();
          }}
        />
      )}

      {/* Export modal */}
      {isExportOpen && <ExportModal onClose={() => setIsExportOpen(false)} />}

      {/* Room assignment (dean) */}
      {isRoomAssignOpen && <RoomAssignmentModal onClose={() => setIsRoomAssignOpen(false)} />}
      {isCommonUploadOpen && <CommonCourseUploadModal onClose={() => setIsCommonUploadOpen(false)} />}
      {isDeleteScheduleOpen && <DeleteScheduleModal onClose={() => setIsDeleteScheduleOpen(false)} />}
      {isArchiveOpen && <ScheduleArchiveModal onClose={() => setIsArchiveOpen(false)} />}

      {/* Review & Save validation modal */}
      {isValidationOpen && (
        <PublishValidationModal
          onClose={() => setIsValidationOpen(false)}
          onConfirm={handlePublishConfirm}
        />
      )}
    </div>
  );
}
