import { useState } from 'react';
import { BarChart3, Building2, CalendarCheck, GitCompare, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { LoginScreen } from '@/app/features/auth/components/LoginScreen';
import { DepartmentComparisonReport } from '@/app/features/reports/components/DepartmentComparisonReport';
import { InstructorWorkloadReport } from '@/app/features/reports/components/InstructorWorkloadReport';
import { ReservationReport } from '@/app/features/reports/components/ReservationReport';
import { RoomUtilizationReport } from '@/app/features/reports/components/RoomUtilizationReport';

type TabKey = 'room' | 'instructor' | 'department' | 'reservation';

export function Reports() {
  const { darkMode, currentUser, selectedTerm } = useApp();
  const { t } = useLocale();
  const [tab, setTab] = useState<TabKey>('room');
  const r = t.reports;

  if (!currentUser) return <LoginScreen />;
  if (currentUser.role === 'instructor') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center" style={{ backgroundColor: 'var(--bg-page)' }}>
        <ShieldCheck className="w-10 h-10 mb-3" style={{ color: 'var(--text-faint)' }} />
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.managersOnly}</p>
      </div>
    );
  }

  const periodLabel = selectedTerm === 'spring' ? t.academicYear.termSpring : t.academicYear.termFall;
  const tabs = [
    { key: 'room' as const, label: r.tabRoom, icon: Building2 },
    { key: 'instructor' as const, label: r.tabInstructor, icon: Users },
    { key: 'department' as const, label: r.tabDepartment, icon: GitCompare },
    { key: 'reservation' as const, label: r.tabReservation, icon: CalendarCheck },
  ];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--bg-mute)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: darkMode ? 'linear-gradient(135deg, #1e3a5f, #172554)' : 'linear-gradient(135deg, #dbeafe, #bfdbfe)' }}>
          <BarChart3 className="w-4.5 h-4.5" style={{ color: darkMode ? '#60a5fa' : 'var(--brand-primary)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.title}</h1>
          <p style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{r.welcome} · {periodLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 px-3 sm:px-5 py-2 border-b shrink-0 overflow-x-auto" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-medium whitespace-nowrap"
            style={{ fontSize: '13px', backgroundColor: tab === key ? 'var(--brand-primary-soft)' : 'transparent', color: tab === key ? 'var(--brand-primary)' : 'var(--text-muted)', border: `1px solid ${tab === key ? 'var(--brand-primary)' : 'transparent'}` }}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {tab === 'room' && <RoomUtilizationReport periodLabel={periodLabel} />}
          {tab === 'instructor' && <InstructorWorkloadReport periodLabel={periodLabel} />}
          {tab === 'department' && <DepartmentComparisonReport periodLabel={periodLabel} />}
          {tab === 'reservation' && <ReservationReport periodLabel={periodLabel} />}
        </div>
      </div>
    </div>
  );
}
