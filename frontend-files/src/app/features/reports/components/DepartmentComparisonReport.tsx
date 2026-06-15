import { useMemo } from 'react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { baseCode, durationOf, exportTableExcel, exportTablePdf, isAnon, type Cell } from '@/app/features/reports/utils/reportUtils';
import { BarRow, CardTitle, EmptyState, Insight, ReportCard, ReportHeader, ReportTable, StatCard, StatGrid } from '@/app/features/reports/components/ReportUI';

export function DepartmentComparisonReport({ periodLabel }: { periodLabel: string }) {
  const { allPublishedSessions, roomsAssigned } = useApp();
  const { t, locale } = useLocale();
  const r = t.reports;
  const rows = useMemo(() => {
    const map = new Map<string, { courses: Set<string>; hours: number; students: number; instructors: Set<string> }>();
    allPublishedSessions.forEach(course => {
      const department = course.department || '—';
      const entry = map.get(department) ?? { courses: new Set<string>(), hours: 0, students: 0, instructors: new Set<string>() };
      entry.courses.add(baseCode(course.code));
      entry.hours += durationOf(course);
      entry.students += course.studentsEnrolled;
      if (!isAnon(course.lecturer)) entry.instructors.add(course.lecturer);
      map.set(department, entry);
    });
    return [...map.entries()]
      .map(([department, entry]) => ({ department, courses: entry.courses.size, hours: entry.hours, students: entry.students, instructors: entry.instructors.size }))
      .sort((a, b) => b.hours - a.hours);
  }, [allPublishedSessions]);

  const head = [r.department, r.coursesCol, r.totalWeeklyHours, r.students, r.instructor];
  const exportRows: Cell[][] = rows.map(row => [row.department, row.courses, row.hours, roomsAssigned ? row.students : '—', row.instructors]);
  const fileName = `bolum_karsilastirma_${periodLabel}`.replace(/\s+/g, '_');
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const maxHours = Math.max(1, ...rows.map(row => row.hours));
  const busiest = rows[0];
  const lightest = rows[rows.length - 1];
  const insight = rows.length < 2
    ? (locale === 'tr' ? 'Karşılaştırma için en az iki bölüm programı yayınlanmalıdır.' : 'Publish at least two department schedules for comparison.')
    : (locale === 'tr'
      ? `En yoğun bölüm ${busiest.department} (${busiest.hours} saat), en hafif bölüm ${lightest.department} (${lightest.hours} saat).`
      : `${busiest.department} has the highest load (${busiest.hours}h); ${lightest.department} has the lowest (${lightest.hours}h).`);

  if (!rows.length) return <><ReportHeader title={r.deptTitle} desc={r.deptDesc} onPdf={() => {}} onExcel={() => {}} disabled /><EmptyState message={r.noData} /></>;
  return (
    <>
      <ReportHeader
        title={r.deptTitle}
        desc={r.deptDesc}
        onPdf={() => exportTablePdf({ fileName, title: r.deptTitle, subtitle: periodLabel, sections: [{ head, rows: exportRows }] })}
        onExcel={() => exportTableExcel({ fileName, sheets: [{ name: r.tabDepartment, title: periodLabel, head, rows: exportRows }] })}
      />
      <Insight>{insight}</Insight>
      <StatGrid>
        <StatCard label={r.totalDepartments} value={rows.length} hint={r.totalDepartmentsHint} accent="var(--brand-primary)" />
        <StatCard label={r.totalHours} value={`${totalHours} ${r.hoursUnit}`} />
        <StatCard label={r.totalStudents} value={roomsAssigned ? rows.reduce((sum, row) => sum + row.students, 0).toLocaleString() : '—'} hint={roomsAssigned ? r.totalStudentsHint : r.afterRoomAssignment} />
      </StatGrid>
      <ReportCard>
        <CardTitle>{r.hoursByDept}</CardTitle>
        <div className="p-4 space-y-2.5">
          {rows.map(row => <BarRow key={row.department} label={row.department} value={row.hours} max={maxHours} display={`${row.hours} ${r.hoursUnit}`} />)}
        </div>
      </ReportCard>
      <ReportCard>
        <CardTitle>{r.allDepartments}</CardTitle>
        <ReportTable head={head} rows={rows.map(row => [row.department, row.courses, row.hours, roomsAssigned ? row.students.toLocaleString() : '—', row.instructors])} />
      </ReportCard>
    </>
  );
}
