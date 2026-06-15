import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import type { Room } from '@/app/features/reservations/types/reservationTypes';
import { fetchRooms } from '@/app/services/lookupService';
import { durationOf, exportTableExcel, exportTablePdf, noRoom, pct, WEEKLY_SLOT_HOURS, type Cell } from '@/app/features/reports/utils/reportUtils';
import { BarRow, CardTitle, EmptyState, Insight, Note, ReportCard, ReportHeader, ReportTable, StatCard, StatGrid } from '@/app/features/reports/components/ReportUI';

const HOT_OCCUPANCY = 85;

export function RoomUtilizationReport({ periodLabel }: { periodLabel: string }) {
  const { allPublishedSessions } = useApp();
  const { t, locale } = useLocale();
  const r = t.reports;
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    let active = true;
    fetchRooms().then(data => { if (active) setRooms(data); }).catch(() => { if (active) setRooms([]); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    const inventory = new Map(rooms.map(room => [room.roomCode, room]));
    const codes = new Set(inventory.keys());
    allPublishedSessions.forEach(course => { if (!noRoom(course.room)) codes.add(course.room); });
    return [...codes].map(code => {
      const sessions = allPublishedSessions.filter(course => course.room === code);
      const room = inventory.get(code);
      const busyHours = sessions.reduce((sum, course) => sum + durationOf(course), 0);
      return {
        code,
        capacity: room?.capacity ?? Math.max(0, ...sessions.map(course => course.totalCapacity)),
        type: room?.type === 'laboratuvar' ? r.typeLab : r.typeNormal,
        busyHours,
        occupancy: pct(busyHours, WEEKLY_SLOT_HOURS),
        sessions: sessions.length,
      };
    }).sort((a, b) => b.occupancy - a.occupancy);
  }, [allPublishedSessions, rooms, r.typeLab, r.typeNormal]);

  const used = rows.filter(row => row.busyHours > 0);
  const idle = rows.filter(row => row.busyHours === 0);
  const average = used.length ? Math.round(used.reduce((sum, row) => sum + row.occupancy, 0) / used.length) : 0;
  const hot = rows.filter(row => row.occupancy >= HOT_OCCUPANCY);
  const maxOccupancy = Math.max(1, ...rows.map(row => row.occupancy));
  const head = [r.roomCol, r.capacity, r.type, r.busyHours, r.occupancy, r.sessions];
  const exportRows: Cell[][] = rows.map(row => [row.code, row.capacity, row.type, row.busyHours, `%${row.occupancy}`, row.sessions]);
  const fileName = `derslik_kullanim_${periodLabel}`.replace(/\s+/g, '_');
  const insight = hot.length
    ? (locale === 'tr' ? `${hot.length} derslik %${HOT_OCCUPANCY} ve üzeri doluluğa ulaştı.` : `${hot.length} room(s) reached at least ${HOT_OCCUPANCY}% utilisation.`)
    : (locale === 'tr' ? `${idle.length}/${rows.length} derslik bu dönem kullanılmıyor; ortalama doluluk %${average}.` : `${idle.length}/${rows.length} rooms are unused; average utilisation is ${average}%.`);

  if (!allPublishedSessions.length) return <><ReportHeader title={r.roomTitle} desc={r.roomDesc} onPdf={() => {}} onExcel={() => {}} disabled /><EmptyState message={r.noData} /></>;
  return (
    <>
      <ReportHeader
        title={r.roomTitle}
        desc={r.roomDesc}
        disabled={!rows.length}
        onPdf={() => exportTablePdf({ fileName, title: r.roomTitle, subtitle: periodLabel, sections: [{ head, rows: exportRows }] })}
        onExcel={() => exportTableExcel({ fileName, sheets: [{ name: r.tabRoom, title: periodLabel, head, rows: exportRows }] })}
      />
      <Insight tone={hot.length ? 'warn' : 'info'}>{insight}</Insight>
      <StatGrid>
        <StatCard label={r.avgOccupancy} value={`%${average}`} hint={r.avgOccupancyHint} accent="var(--brand-primary)" />
        <StatCard label={r.idleRooms} value={`${idle.length}/${rows.length}`} hint={r.idleRoomsHint} />
        <StatCard label={r.busiestRoom} value={rows[0]?.code ?? '—'} hint={rows[0] ? `%${rows[0].occupancy}` : ''} />
      </StatGrid>
      <ReportCard>
        <CardTitle>{r.occupancyByRoom}</CardTitle>
        <div className="p-4 space-y-2.5">
          {used.slice(0, 10).map(row => <BarRow key={row.code} label={row.code} value={row.occupancy} max={maxOccupancy} display={`%${row.occupancy}`} color={row.occupancy >= HOT_OCCUPANCY ? '#f59e0b' : undefined} />)}
        </div>
      </ReportCard>
      <ReportCard>
        <CardTitle>{r.allRooms}</CardTitle>
        <ReportTable head={head} rows={rows.map(row => [row.code, row.capacity, row.type, row.busyHours, `%${row.occupancy}`, row.sessions])} />
        <Note>{r.roomNote}</Note>
      </ReportCard>
    </>
  );
}
