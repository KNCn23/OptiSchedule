import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/app/i18n';
import type { Reservation } from '@/app/features/reservations/types/reservationTypes';
import { fetchAllReservations } from '@/app/services/reservationService';
import { exportTableExcel, exportTablePdf, type Cell } from '@/app/features/reports/utils/reportUtils';
import { BarRow, CardTitle, EmptyState, Insight, ReportCard, ReportHeader, ReportTable, StatCard, StatGrid } from '@/app/features/reports/components/ReportUI';

export function ReservationReport({ periodLabel }: { periodLabel: string }) {
  const { t, locale } = useLocale();
  const r = t.reports;
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAllReservations()
      .then(data => { if (active) setReservations(data); })
      .catch(() => { if (active) setReservations([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const { byRoom, byRole, rows } = useMemo(() => {
    const roomCounts = new Map<string, number>();
    const roleCounts = new Map<string, number>();
    reservations.forEach(reservation => {
      roomCounts.set(reservation.roomCode, (roomCounts.get(reservation.roomCode) ?? 0) + 1);
      roleCounts.set(reservation.userRole, (roleCounts.get(reservation.userRole) ?? 0) + 1);
    });
    return {
      byRoom: [...roomCounts].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value),
      byRole: [...roleCounts].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value),
      rows: [...reservations].sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [reservations]);

  const roleLabel = (role: string) => (t.roles as Record<string, string>)[role] ?? role;
  const head = [r.room, r.date, r.slots, r.requester, r.role, r.course];
  const exportRows: Cell[][] = rows.map(row => [row.roomCode, row.date, row.timeSlots.join(', '), row.userName, roleLabel(row.userRole), row.courseCode ?? '—']);
  const fileName = `rezervasyon_raporu_${periodLabel}`.replace(/\s+/g, '_');

  if (loading) return <EmptyState message={r.loading} />;
  if (!rows.length) return <><ReportHeader title={r.resvTitle} desc={r.resvDesc} onPdf={() => {}} onExcel={() => {}} disabled /><EmptyState message={r.noReservations} /></>;

  return (
    <>
      <ReportHeader
        title={r.resvTitle}
        desc={r.resvDesc}
        onPdf={() => exportTablePdf({ fileName, title: r.resvTitle, subtitle: periodLabel, sections: [{ head, rows: exportRows }] })}
        onExcel={() => exportTableExcel({ fileName, sheets: [{ name: r.tabReservation, title: periodLabel, head, rows: exportRows }] })}
      />
      <Insight>{locale === 'tr' ? `Toplam ${rows.length} rezervasyon, ${byRoom.length} farklı derslikte yapıldı.` : `${rows.length} reservations were made across ${byRoom.length} rooms.`}</Insight>
      <StatGrid>
        <StatCard label={r.totalReservations} value={rows.length} accent="var(--brand-primary)" />
        <StatCard label={r.mostReserved} value={byRoom[0]?.key ?? '—'} hint={byRoom[0] ? `${byRoom[0].value} ${r.count.toLocaleLowerCase()}` : ''} />
        <StatCard label={r.distinctRooms} value={byRoom.length} hint={r.distinctRoomsHint} />
      </StatGrid>
      <div className="grid md:grid-cols-2 gap-5">
        <ReportCard>
          <CardTitle>{r.mostReservedRooms}</CardTitle>
          <div className="p-4 space-y-2.5">
            {byRoom.slice(0, 8).map(row => <BarRow key={row.key} label={row.key} value={row.value} max={byRoom[0]?.value ?? 1} />)}
          </div>
        </ReportCard>
        <ReportCard>
          <CardTitle>{r.byRole}</CardTitle>
          <ReportTable head={[r.role, r.count]} rows={byRole.map(row => [roleLabel(row.key), row.value])} />
        </ReportCard>
      </div>
      <ReportCard>
        <CardTitle>{r.allReservations}</CardTitle>
        <ReportTable head={head} align={['left', 'left', 'left', 'left', 'left', 'left']} rows={rows.map(row => [row.roomCode, row.date, row.timeSlots.join(', '), row.userName, roleLabel(row.userRole), row.courseCode ?? '—'])} />
      </ReportCard>
    </>
  );
}
