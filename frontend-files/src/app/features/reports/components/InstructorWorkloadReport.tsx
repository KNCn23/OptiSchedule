import { useMemo, useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { baseCode, durationOf, exportTableExcel, exportTablePdf, isAnon, type Cell } from '@/app/features/reports/utils/reportUtils';
import { BarRow, CardTitle, EmptyState, Pill, ReportCard, ReportHeader, ReportTable, StatCard, StatGrid } from '@/app/features/reports/components/ReportUI';

export function InstructorWorkloadReport({ periodLabel }: { periodLabel: string }) {
  const { allPublishedSessions } = useApp();
  const { t } = useLocale();
  const r = t.reports;
  const [department, setDepartment] = useState('');

  const departments = useMemo(
    () => [...new Set(allPublishedSessions.map(course => course.department).filter(Boolean))].sort(),
    [allPublishedSessions],
  );
  const rows = useMemo(() => {
    const map = new Map<string, { hours: number; courses: Set<string> }>();
    const sessions = department ? allPublishedSessions.filter(course => course.department === department) : allPublishedSessions;
    sessions.forEach(course => {
      if (isAnon(course.lecturer)) return;
      const entry = map.get(course.lecturer) ?? { hours: 0, courses: new Set<string>() };
      entry.hours += durationOf(course);
      entry.courses.add(baseCode(course.code));
      map.set(course.lecturer, entry);
    });
    return [...map.entries()]
      .map(([name, entry]) => ({ name, hours: entry.hours, courses: entry.courses.size }))
      .sort((a, b) => b.hours - a.hours);
  }, [allPublishedSessions, department]);

  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.hours, 0) / rows.length) : 0;
  const band = Math.max(2, average * 0.15);
  const maxHours = Math.max(1, ...rows.map(row => row.hours));
  const statusOf = (hours: number) => {
    if (average && hours > average + band) return { label: r.aboveAvg, color: '#f59e0b' };
    if (average && hours < average - band) return { label: r.belowAvg, color: '#3b82f6' };
    return { label: r.atAvg, color: '#16a34a' };
  };
  const head = [r.instructor, r.weeklyHours, r.coursesCol, r.status];
  const exportRows: Cell[][] = rows.map(row => [row.name, row.hours, row.courses, statusOf(row.hours).label]);
  const subtitle = `${periodLabel} · ${department || r.deptFilterAll}`;
  const fileName = `egitmen_yuku_${department || 'tum'}_${periodLabel}`.replace(/\s+/g, '_');

  return (
    <>
      <ReportHeader
        title={r.instrTitle}
        desc={r.instrDesc}
        disabled={!rows.length}
        onPdf={() => exportTablePdf({ fileName, title: r.instrTitle, subtitle, sections: [{ head, rows: exportRows }] })}
        onExcel={() => exportTableExcel({ fileName, sheets: [{ name: r.tabInstructor, title: subtitle, head, rows: exportRows }] })}
      />
      <div className="flex items-center gap-2 mb-4">
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{r.department}:</span>
        <select
          value={department}
          onChange={event => setDepartment(event.target.value)}
          className="h-9 px-2 rounded-lg font-medium focus:outline-none cursor-pointer"
          style={{ fontSize: '13px', backgroundColor: 'var(--bg-mute)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          <option value="">{r.deptFilterAll}</option>
          {departments.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {!allPublishedSessions.length || !rows.length ? <EmptyState message={r.noData} /> : (
        <>
          <StatGrid>
            <StatCard label={r.totalInstructors} value={rows.length} accent="var(--brand-primary)" />
            <StatCard label={r.avgHours} value={`${average} ${r.hoursUnit}`} hint={r.avgHoursHint} />
            <StatCard label={r.aboveAvgCount} value={rows.filter(row => row.hours > average + band).length} hint={r.aboveAvgCountHint} />
          </StatGrid>
          <ReportCard>
            <CardTitle>{r.hoursByInstructor}</CardTitle>
            <div className="p-4 space-y-2.5">
              {rows.slice(0, 12).map(row => <BarRow key={row.name} label={row.name} value={row.hours} max={maxHours} display={`${row.hours} ${r.hoursUnit}`} color={statusOf(row.hours).color} />)}
            </div>
          </ReportCard>
          <ReportCard>
            <CardTitle>{r.allInstructors}</CardTitle>
            <ReportTable head={head} rows={rows.map(row => [row.name, `${row.hours} ${r.hoursUnit}`, row.courses, <Pill key={row.name} {...statusOf(row.hours)} />])} />
          </ReportCard>
        </>
      )}
    </>
  );
}
