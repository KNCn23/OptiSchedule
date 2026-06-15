import { useMemo, useState } from 'react';
import { X, Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { registerTurkishFont } from '@/app/features/scheduler/utils/pdfFont';
import type { Course, DayKey } from '@/app/data/mockData';

const DAY_ORDER: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 10 }, (_, i) => 9 + i); // 09:00 .. 18:00
const LEVELS = [1, 2, 3, 4];

type Fmt = 'pdf' | 'excel';

function yearOf(classLevel: string): number {
  const m = classLevel.match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

/** Lines for one cell. Default groups sections ("MAT 151 (01-02-03)"); when
 *  includeRooms is on, each section is shown with its room ("MAT 151 (01) · A-101"). */
function formatCell(courses: Course[], includeRooms = false): string[] {
  if (includeRooms) {
    // Room goes on the line BELOW the course code, not beside it.
    return courses.map(c => {
      const dash = c.code.lastIndexOf('-');
      const base = dash > 0 ? c.code.slice(0, dash) : c.code;
      const sec = dash > 0 ? `(${c.code.slice(dash + 1).padStart(2, '0')})` : '';
      const spaced = base.replace(/^([^\d]+)(\d.*)$/, '$1 $2');
      const codeLine = `${spaced} ${sec}`.trim();
      return c.room ? `${codeLine}\n${c.room}` : codeLine;
    });
  }
  const byCode = new Map<string, string[]>();
  for (const c of courses) {
    const dash = c.code.lastIndexOf('-');
    const base = dash > 0 ? c.code.slice(0, dash) : c.code;
    const sec = dash > 0 ? c.code.slice(dash + 1).padStart(2, '0') : '';
    const spaced = base.replace(/^([^\d]+)(\d.*)$/, '$1 $2');
    if (!byCode.has(spaced)) byCode.set(spaced, []);
    if (sec) byCode.get(spaced)!.push(sec);
  }
  return [...byCode.entries()].map(([code, secs]) =>
    secs.length ? `${code} (${[...new Set(secs)].sort().join('-')})` : code
  );
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { darkMode, scheduledCourses, selectedTerm, roomsAssigned } = useApp();
  const { t } = useLocale();
  const ex = t.export;

  const departments = useMemo(() => {
    return [...new Set(scheduledCourses.map(c => c.department))].sort();
  }, [scheduledCourses]);

  const [dept, setDept] = useState<string>(departments[0] ?? '');
  const [fmt, setFmt] = useState<Fmt>('pdf');
  const [includeRooms, setIncludeRooms] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasSchedule = scheduledCourses.length > 0;
  const termLabel = selectedTerm === 'spring' ? t.academicYear.termSpring : t.academicYear.termFall;
  const dayLabels = DAY_ORDER.map(d => t.days[d]);

  /** grid[hour][dayIdx] = Course[] for a single class level. */
  function buildGrid(level: number): Record<number, Course[][]> {
    // Locked common ("Ortak Dersler") sessions belong to every department's
    // timetable, so include them alongside the selected department's own courses.
    const courses = scheduledCourses.filter(c => (c.department === dept || c.isLocked) && yearOf(c.classLevel) === level);
    const grid: Record<number, Course[][]> = {};
    for (const h of HOURS) grid[h] = DAY_ORDER.map(() => []);
    for (const c of courses) {
      const di = DAY_ORDER.indexOf(c.day);
      if (di < 0) continue;
      const sh = parseInt(c.startTime);
      const eh = parseInt(c.endTime);
      for (let h = sh; h < eh; h++) {
        if (grid[h]) grid[h][di].push(c);
      }
    }
    return grid;
  }

  const safeName = `${dept.replace(/[^\w]+/g, '_')}_${termLabel.replace(/\s+/g, '_')}`;

  // ── PDF: real downloadable file via jsPDF + autotable (Turkish font) ──
  async function exportPdf() {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const font = await registerTurkishFont(doc);
    doc.setFont(font, 'normal');
    const pageW = doc.internal.pageSize.getWidth();
    const deptTitle = dept.toLocaleUpperCase('tr-TR');

    LEVELS.forEach((level, idx) => {
      if (idx > 0) doc.addPage();
      // Centered black title + subtitle (black & white output)
      doc.setFont(font, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(15);
      doc.text(deptTitle, pageW / 2, 42, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`${termLabel} ${level}. Sınıf`, pageW / 2, 64, { align: 'center' });

      const grid = buildGrid(level);
      const body = HOURS.map(h => [
        `${String(h).padStart(2, '0')}:00`,
        ...DAY_ORDER.map((_, di) => formatCell(grid[h][di], includeRooms).join('\n')),
      ]);

      autoTable(doc, {
        startY: 84,
        head: [['', ...dayLabels]],
        body,
        theme: 'grid',
        styles: { font, fontStyle: 'normal', fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
        headStyles: { font, fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.5 },
        columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
        margin: { left: 24, right: 24 },
      });
    });

    doc.save(`${safeName}.pdf`);
  }

  // ── Excel: 4 sheets (one per class level) ──
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    for (const level of LEVELS) {
      const grid = buildGrid(level);
      const aoa: string[][] = [
        [`${dept} · ${termLabel} · ${ex.classLevel.replace('{n}', String(level))}`],
        ['', ...dayLabels],
        ...HOURS.map(h => [
          `${String(h).padStart(2, '0')}:00`,
          ...DAY_ORDER.map((_, di) => formatCell(grid[h][di], includeRooms).join('\n')),
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 8 }, ...dayLabels.map(() => ({ wch: 22 }))];
      XLSX.utils.book_append_sheet(wb, ws, ex.classLevel.replace('{n}', String(level)));
    }
    XLSX.writeFile(wb, `${safeName}.xlsx`);
  }

  async function handleGenerate() {
    if (!hasSchedule || !dept || busy) return;
    setBusy(true);
    setDone(false);
    try {
      if (fmt === 'pdf') await exportPdf();
      else exportExcel();
      setDone(true);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setBusy(false);
    }
  }

  const selectStyle = {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-light)',
    color: 'var(--text-primary)',
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--bg-mute)' }}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Download className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
              {ex.title}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{ex.subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-faint)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!hasSchedule && (
            <div className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: darkMode ? '#422006' : '#fef3c7', color: '#b45309' }}>
              {ex.noSchedule}
            </div>
          )}

          {/* Department */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{ex.department}</label>
            <select
              value={dept}
              onChange={e => setDept(e.target.value)}
              disabled={!hasSchedule}
              className="mt-1 w-full px-3 py-2 rounded-xl border text-sm font-medium outline-none cursor-pointer disabled:opacity-50"
              style={selectStyle}
            >
              {departments.length === 0 && <option value="">{ex.selectDept}</option>}
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{ex.format}</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([['pdf', FileText, ex.formatPdf], ['excel', FileSpreadsheet, ex.formatExcel]] as const).map(([val, Icon, label]) => (
                <button
                  key={val}
                  onClick={() => setFmt(val)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all"
                  style={{
                    borderColor: fmt === val ? 'var(--brand-primary)' : 'var(--border-light)',
                    backgroundColor: fmt === val ? 'var(--brand-primary-soft)' : 'transparent',
                    color: fmt === val ? 'var(--brand-primary)' : 'var(--text-muted)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Include classrooms (only meaningful once rooms were assigned) */}
          {roomsAssigned && (
            <button
              onClick={() => setIncludeRooms(v => !v)}
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: includeRooms ? 'var(--brand-primary)' : 'transparent', border: `2px solid ${includeRooms ? 'var(--brand-primary)' : 'var(--border-light)'}` }}>
                {includeRooms && <span className="text-white text-[10px] leading-none">✓</span>}
              </span>
              {ex.includeRooms}
            </button>
          )}

          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{ex.note}</p>

          {done && !busy && (
            <div className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: darkMode ? '#052e16' : '#f0fdf4', color: '#16a34a' }}>
              {ex.success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-end gap-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--bg-mute)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
            {t.close}
          </button>
          <button
            onClick={handleGenerate}
            disabled={!hasSchedule || !dept || busy}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: hasSchedule && dept ? 'var(--brand-gradient)' : '#9ca3af' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {ex.generate}
          </button>
        </div>
      </div>
    </div>
  );
}
