import { useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import type { CommonWorkbookRow } from '@/app/features/scheduler/types/schedulerTypes';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function numberOf(value: unknown, fallback = 0): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function valueFor(row: Record<string, unknown>, names: string[]): unknown {
  const wanted = new Set(names.map(normalized));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalized(key)));
  return entry?.[1];
}

function valueForInstructor(row: Record<string, unknown>): unknown {
  const direct = valueFor(row, [
    'Öğretim Görevlisi',
    'Ogretim Gorevlisi',
    'Öğretim Elemanı',
    'Ogretim Elemani',
    'Öğretim Üyesi',
    'Ogretim Uyesi',
    'Dersi Veren Öğretim Elemanı',
    'Dersi Veren Ogretim Elemani',
    'Ders Sorumlusu',
    'Öğr. Gör.',
    'Ogr. Gor.',
    'Hoca',
    'instructor',
    'instructor_full_name',
    'lecturer',
  ]);
  if (direct !== undefined) return direct;

  const entry = Object.entries(row).find(([key]) => {
    const k = normalized(key);
    return (
      k.includes('öğretim')
      || k.includes('ogretim')
      || k.includes('görevli')
      || k.includes('gorevli')
      || k.includes('elemanı')
      || k.includes('elemani')
      || k.includes('üyesi')
      || k.includes('uyesi')
      || k.includes('instructor')
      || k.includes('lecturer')
      || k.includes('hoca')
    );
  });
  return entry?.[1];
}

export function CommonCourseUploadModal({ onClose }: { onClose: () => void }) {
  const { darkMode, selectedTerm, commonWorkbookRows, commonWorkbookFileName, setCommonWorkbook } = useApp();
  const { t } = useLocale();
  const copy = t.commonUpload;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  function parseFile(file: File) {
    setError('');
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const workbook = XLSX.read(new Uint8Array(event.target?.result as ArrayBuffer), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const rows: CommonWorkbookRow[] = rawRows.flatMap(raw => {
          const courseCode = String(valueFor(raw, ['Ders Kodu', 'ders_kodu', 'course_code']) ?? '')
            .trim().toUpperCase().replace(/\s+/g, '');
          if (!courseCode) return [];
          const credit = numberOf(valueFor(raw, ['Kredi', 'credit', 'weekly_hours']));
          const theory = numberOf(valueFor(raw, ['t_hour', 'Teorik Saat', 'teorik']));
          const lab = numberOf(valueFor(raw, ['l_hour', 'Laboratuvar Saati', 'uygulama']));
          if (credit + theory + lab <= 0) return [];
          return [{
            course_code: courseCode,
            course_name: String(valueFor(raw, ['Ders Adı', 'Ders Adi', 'course_name']) ?? '').trim(),
            section: Math.max(1, numberOf(valueFor(raw, ['Şube', 'Sube', 'section']), 1)),
            credit,
            t_hour: theory,
            l_hour: lab,
            capacity: numberOf(valueFor(raw, ['Kontenjan', 'capacity'])),
            enrolled: numberOf(valueFor(raw, ['Sınıf Mevcudu', 'Sinif Mevcudu', 'enrolled'])),
            instructor: String(valueForInstructor(raw) ?? 'anonim').trim() || 'anonim',
          }];
        });
        if (rows.length === 0) {
          setError(copy.noRows);
          return;
        }
        setCommonWorkbook(rows, file.name);
      } catch {
        setError(copy.invalidFile);
      }
    };
    reader.onerror = () => setError(copy.invalidFile);
    reader.readAsArrayBuffer(file);
  }

  const expected = selectedTerm === 'spring' ? 'ORTAK_BAHAR.xlsx' : 'ORTAK_GUZ.xlsx';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)' }} onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{copy.title}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{copy.subtitle.replace('{file}', expected)}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) parseFile(file);
              event.target.value = '';
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full min-h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors"
            style={{ borderColor: 'var(--brand-primary)', backgroundColor: darkMode ? '#172554' : 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
          >
            {commonWorkbookRows.length > 0 ? <CheckCircle2 className="w-9 h-9 text-green-500" /> : <Upload className="w-9 h-9" />}
            <span className="font-semibold">{commonWorkbookRows.length > 0 ? copy.replace : copy.choose}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{copy.accepted}</span>
          </button>
          {commonWorkbookRows.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: darkMode ? '#052e16' : '#f0fdf4', color: '#16a34a' }}>
              <FileSpreadsheet className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{commonWorkbookFileName}</p>
                <p className="text-xs">{copy.rows.replace('{n}', String(commonWorkbookRows.length))}</p>
              </div>
            </div>
          )}
          {error && <p className="text-sm rounded-lg p-3 bg-red-50 text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--border-light)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{t.close}</button>
          <button onClick={onClose} disabled={commonWorkbookRows.length === 0} className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: 'var(--brand-primary)' }}>{copy.continue}</button>
        </div>
      </div>
    </div>
  );
}
