import { useState } from 'react';
import { X, Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { registerTurkishFont } from '@/app/features/scheduler/utils/pdfFont';
import type { Course, DayKey } from '@/app/data/mockData';

const DAY_ORDER: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 10 }, (_, i) => 9 + i); // 09:00 .. 18:00

type Fmt = 'pdf' | 'excel';

/** One line per course: code on top, room on the line below (matches the dept export). */
function cellLines(courses: Course[]): string[] {
  return courses.map(c => {
    const dash = c.code.lastIndexOf('-');
    const base = dash > 0 ? c.code.slice(0, dash) : c.code;
    const sec = dash > 0 ? `(${c.code.slice(dash + 1).padStart(2, '0')})` : '';
    const spaced = base.replace(/^([^\d]+)(\d.*)$/, '$1 $2');
    const codeLine = `${spaced} ${sec}`.trim();
    return c.room ? `${codeLine}\n${c.room}` : codeLine;
  });
}

interface Props {
  onClose: () => void;
  /** The instructor's own sessions. */
  courses: Course[];
  lecturerName: string;
  termLabel: string;
}

export function InstructorExportModal({ onClose, courses, lecturerName, termLabel }: Props) {
  const { darkMode } = useApp();
  const { t } = useLocale();
  const ex = t.export;

  const [fmt, setFmt] = useState<Fmt>('pdf');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const hasSchedule = courses.length > 0;
  const dayLabels = DAY_ORDER.map(d => t.days[d]);
  const titleSub = `${termLabel} ${t.export.scheduleSuffix}`;
  const safeName = `${lecturerName.replace(/[^\w]+/g, '_')}_${termLabel.replace(/\s+/g, '_')}`;

  /** grid[hour][dayIdx] = Course[] */
  function buildGrid(): Record<number, Course[][]> {
    const grid: Record<number, Course[][]> = {};
    for (const h of HOURS) grid[h] = DAY_ORDER.map(() => []);
    for (const c of courses) {
      const di = DAY_ORDER.indexOf(c.day);
      if (di < 0) continue;
      const sh = parseInt(c.startTime);
      const eh = parseInt(c.endTime);
      for (let h = sh; h < eh; h++) if (grid[h]) grid[h][di].push(c);
    }
    return grid;
  }

  async function exportPdf() {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const font = await registerTurkishFont(doc);
    const pageW = doc.internal.pageSize.getWidth();

    // Name (bold) with the period/title fainter underneath.
    doc.setFont(font, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text(lecturerName, pageW / 2, 46, { align: 'center' });
    doc.setFont(font, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text(titleSub, pageW / 2, 66, { align: 'center' });

    const grid = buildGrid();
    const body = HOURS.map(h => [
      `${String(h).padStart(2, '0')}:00`,
      ...DAY_ORDER.map((_, di) => cellLines(grid[h][di]).join('\n')),
    ]);

    autoTable(doc, {
      startY: 86,
      head: [['', ...dayLabels]],
      body,
      theme: 'grid',
      styles: { font, fontStyle: 'normal', fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
      headStyles: { font, fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.5 },
      columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
      margin: { left: 24, right: 24 },
    });

    doc.save(`${safeName}.pdf`);
  }

  function exportExcel() {
    const grid = buildGrid();
    const aoa: string[][] = [
      [lecturerName],
      [titleSub],
      ['', ...dayLabels],
      ...HOURS.map(h => [
        `${String(h).padStart(2, '0')}:00`,
        ...DAY_ORDER.map((_, di) => cellLines(grid[h][di]).join('\n')),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 8 }, ...dayLabels.map(() => ({ wch: 22 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, termLabel);
    XLSX.writeFile(wb, `${safeName}.xlsx`);
  }

  async function handleGenerate() {
    if (!hasSchedule || busy) return;
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
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{lecturerName} · {termLabel}</p>
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
            disabled={!hasSchedule || busy}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: hasSchedule ? 'var(--brand-gradient)' : '#9ca3af' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {ex.generate}
          </button>
        </div>
      </div>
    </div>
  );
}
