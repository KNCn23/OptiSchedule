import { useState } from 'react';
import { SlidersHorizontal, ChevronDown, ChevronUp, X, RotateCcw } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { departmentCodeForUser } from '@/app/data/departments';
import { useLocale } from '@/app/i18n';

interface DynamicFiltersProps {
  showSearch?: boolean;
  compact?: boolean;
}

export function DynamicFilters({ showSearch = true, compact = false }: DynamicFiltersProps) {
  const { darkMode, filters, setFilter, resetFilters, scheduledCourses, currentUser, allPublishedSessions, restorePublishedSchedule } = useApp();
  const { t } = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);

  // Build-capable roles can restore the last saved/published schedule (e.g. after
  // a re-run replaced the view). Hidden for instructors and when nothing is saved.
  const canRestore = currentUser?.role !== 'instructor' && allPublishedSessions.length > 0;
  
  // Dept-locked roles (secretary / coordinator) are pinned to their own department.
  const isSecretary = currentUser?.role === 'secretary' || currentUser?.role === 'coordinator';
  const secretaryDept = departmentCodeForUser(currentUser);

  const hasActiveFilters = Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : v !== '');

  // Output filtering is intentionally limited to department + class year.
  const departments = Array.from(new Set(scheduledCourses.map(c => c.department).filter(Boolean))).sort();
  const classLevels = ['1', '2', '3', '4'];

  const selectStyle = {
    backgroundColor: 'var(--bg-mute)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-light)',
    fontSize: '13px',
  };

  return (
    <div
      className="flex flex-col gap-2.5 px-3 sm:px-4 py-3 sm:py-2.5 border-b"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-light)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5 w-full">
        <div className="flex items-center gap-1.5 mr-auto lg:mr-1" style={{ color: 'var(--text-muted)' }}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {!compact && (
            <span className="font-medium" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {t.filters.label}
            </span>
          )}
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border"
          style={{
            ...selectStyle,
            borderColor: 'var(--border-light)',
          }}
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {isExpanded ? 'Gizle' : 'Filtreler'}
        </button>

        {/* Restore the last saved/published schedule (far right) */}
        {canRestore && (
          <button
            onClick={() => restorePublishedSchedule()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: darkMode ? '#0f172a' : '#eff6ff',
              color: 'var(--brand-primary)',
              border: '1px solid var(--brand-primary)',
            }}
            title={t.admin.restoreSaved}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.admin.restoreSaved}</span>
          </button>
        )}
      </div>

      <div className={`${isExpanded ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 animate-in slide-in-from-top-2 duration-200`}>
      {/* Department */}
      <select
        disabled={isSecretary}
        value={isSecretary && secretaryDept ? secretaryDept : (filters.department[0] ?? '')}
        onChange={e => {
          const department = e.target.value;
          setFilter('department', department ? [department] : []);
        }}
        className={`px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${isSecretary ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
        style={selectStyle}
      >
        {!isSecretary && <option value="">{t.filters.allDepartments}</option>}
        {isSecretary && secretaryDept ? (
          <option value={secretaryDept}>{secretaryDept}</option>
        ) : (
          departments.map(d => (
            <option key={d} value={d}>{d}</option>
          ))
        )}
      </select>

      {/* Class Level */}
      <select
        value={filters.classLevel[0] ?? ''}
        onChange={e => {
          const classLevel = e.target.value;
          setFilter('classLevel', classLevel ? [classLevel] : []);
        }}
        className="px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer"
        style={selectStyle}
      >
        <option value="">{t.filters.allClasses}</option>
        {classLevels.map(c => (
          <option key={c} value={c}>{c}. Sınıf</option>
        ))}
      </select>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="flex items-center justify-center gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition-colors w-full sm:w-auto"
          style={{
            backgroundColor: darkMode ? '#450a0a' : '#fee2e2',
            color: darkMode ? '#f87171' : '#b91c1c',
          }}
        >
          <X className="w-3 h-3" />
          {t.reset}
        </button>
      )}
      </div>

      {/* Active filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 ml-1">
        {filters.department.map(department => (
          <FilterPill
            key={department}
            darkMode={darkMode}
            label={department}
            onRemove={() => setFilter('department', filters.department.filter(value => value !== department))}
          />
        ))}
        {filters.classLevel.map(classLevel => (
          <FilterPill
            key={classLevel}
            darkMode={darkMode}
            label={`${classLevel}. Sınıf`}
            onRemove={() => setFilter('classLevel', filters.classLevel.filter(value => value !== classLevel))}
          />
        ))}
      </div>
    </div>
  );
}

function FilterPill({ label, onRemove, darkMode }: { label: string; onRemove: () => void; darkMode: boolean }) {
  return (
    <span
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{
        backgroundColor: darkMode ? '#1e3a5f' : 'var(--brand-primary-soft)',
        color: darkMode ? '#93c5fd' : 'var(--brand-primary-active)',
      }}
    >
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:opacity-70">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}
