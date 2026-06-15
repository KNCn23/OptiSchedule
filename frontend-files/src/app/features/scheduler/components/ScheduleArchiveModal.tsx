import { useEffect, useMemo, useState } from 'react';
import { Archive, Download, Loader2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useLocale } from '@/app/i18n';
import { departmentName } from '@/app/data/departments';
import * as scheduleStore from '@/app/services/scheduleStore';
import type { ScheduleArchive } from '@/app/services/scheduleStore';
import type { Course } from '@/app/data/mockData';

export function ScheduleArchiveModal({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale();
  const [archives, setArchives] = useState<ScheduleArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<Record<number, string>>({});

  useEffect(() => {
    scheduleStore.getScheduleArchives()
      .then(setArchives)
      .catch(err => {
        console.error('Schedule archives could not be loaded:', err);
        setError(t.admin.archiveError);
      })
      .finally(() => setLoading(false));
  }, [t.admin.archiveError]);

  const formatter = useMemo(() => new Intl.DateTimeFormat(
    locale === 'tr' ? 'tr-TR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  ), [locale]);

  function termLabel(archive: ScheduleArchive) {
    return archive.term === 'spring'
      ? t.academicYear.termSpring
      : t.academicYear.termFall;
  }

  function departmentLabel(code: string) {
    return code === 'HAVUZ' ? 'HAVUZ · Ortak Dersler' : `${code} · ${departmentName(code)}`;
  }

  function exportArchive(archive: ScheduleArchive) {
    const department = selectedDepartments[archive.archive_id]
      ?? Object.keys(archive.schedules)[0]
      ?? '';
    if (!department) return;

    const common = department === 'HAVUZ' ? [] : (archive.schedules.HAVUZ ?? []);
    const own = archive.schedules[department] ?? [];
    const courses: Course[] = [
      ...common.map(course => ({ ...course, isLocked: true })),
      ...own,
    ];
    const rows = courses
      .sort((a, b) => a.day.localeCompare(b.day) || a.startTime.localeCompare(b.startTime))
      .map(course => ({
        'Ders Kodu': course.code,
        'Ders Adı': course.name,
        'Öğretim Elemanı': course.lecturer,
        'Bölüm': course.department,
        'Sınıf': course.classLevel,
        'Gün': t.days[course.day],
        'Başlangıç': course.startTime,
        'Bitiş': course.endTime,
        'Derslik': course.room,
      }));
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 16 }, { wch: 34 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, department);
    const date = archive.created_at.slice(0, 10);
    XLSX.writeFile(workbook, `program_arsivi_${archive.term}_${department}_${date}.xlsx`);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}>
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{t.admin.archiveTitle}</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.admin.archiveDescription}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2" aria-label={t.close}>
            <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> {t.admin.archiveLoading}
            </div>
          )}
          {!loading && error && <p className="py-10 text-center text-sm text-red-600">{error}</p>}
          {!loading && !error && archives.length === 0 && (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{t.admin.archiveEmpty}</p>
          )}
          <div className="space-y-3">
            {archives.map(archive => {
              const departments = Object.keys(archive.schedules).sort((a, b) => a === 'HAVUZ' ? -1 : b === 'HAVUZ' ? 1 : a.localeCompare(b));
              const selected = selectedDepartments[archive.archive_id] ?? departments[0] ?? '';
              const sessionCount = Object.values(archive.schedules).reduce((sum, courses) => sum + courses.length, 0);
              return (
                <div key={archive.archive_id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-mute)' }}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{termLabel(archive)}</div>
                      <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatter.format(new Date(archive.created_at))} · {departments.length} {t.admin.archiveDepartments} · {sessionCount} {t.admin.sessions}
                      </div>
                      {archive.created_by && <div className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>{t.admin.archiveCreatedBy}: {archive.created_by}</div>}
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={selected}
                        onChange={event => setSelectedDepartments(prev => ({ ...prev, [archive.archive_id]: event.target.value }))}
                        className="min-w-52 rounded-lg border px-3 py-2 text-xs font-medium"
                        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      >
                        {departments.map(code => <option key={code} value={code}>{departmentLabel(code)}</option>)}
                      </select>
                      <button
                        onClick={() => exportArchive(archive)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Download className="h-3.5 w-3.5" /> {t.admin.archiveDownload}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
