import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Building2, Upload, CheckCircle2, Loader2, DoorOpen } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { departmentName, POOL_DEPARTMENT } from '@/app/data/departments';
import type { Room } from '@/app/features/reservations/types/reservationTypes';
import { fetchRooms } from '@/app/services/lookupService';

// Header → field detection for the enrollment Excel (same files, updated counts).
function classify(header: string): 'code' | 'section' | 'enrolled' | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, ' ');
  if (['ders kodu', 'ders_kodu', 'course_code', 'code', 'kod'].includes(h)) return 'code';
  if (['şube', 'sube', 'section', 'şube no', 'sube no'].includes(h)) return 'section';
  if (['sınıf mevcudu', 'sinif mevcudu', 'mevcut', 'enrolled', 'sınıf mevcut'].includes(h)) return 'enrolled';
  return null;
}

export function RoomAssignmentModal({ onClose }: { onClose: () => void }) {
  const { darkMode, commonSchedule, publishedDepartments, assignAllRooms } = useApp();
  const { t } = useLocale();
  const ra = t.roomAssign;

  // Accumulated enrollment across department uploads: "BİL101-1" → count.
  const [enrollment, setEnrollment] = useState<Record<string, number>>({});
  // Per-department: how many rows were read (also marks "uploaded").
  const [uploaded, setUploaded] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [result, setResult] = useState<{
    assigned: number;
    unassigned: number;
    noSuitableRoom: number;
    allSuitableRoomsBusy: number;
  } | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    fetchRooms()
      .then(data => {
        if (!cancelled) setRooms(data);
      })
      .catch(err => console.error('Derslikler yüklenemedi:', err))
      .finally(() => {
        if (!cancelled) setRoomsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Rows: every published department + the pool (if a common schedule exists).
  const rows = useMemo(() => {
    const list = publishedDepartments.map(code => ({ code, name: departmentName(code) }));
    if (commonSchedule.length > 0) list.unshift({ code: POOL_DEPARTMENT.code, name: POOL_DEPARTMENT.name });
    return list;
  }, [publishedDepartments, commonSchedule.length]);

  function parseEnrollment(deptCode: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const add: Record<string, number> = {};
        let count = 0;
        for (const raw of json) {
          let code = '', sec = '', enr = '';
          for (const [k, v] of Object.entries(raw)) {
            const f = classify(k);
            if (f === 'code' && !code) code = String(v).trim().toUpperCase().replace(/\s+/g, '');
            else if (f === 'section' && !sec) sec = String(v).trim();
            else if (f === 'enrolled' && !enr) enr = String(v).trim();
          }
          if (!code) continue;
          const subeNum = parseInt(sec) || 1;
          const key = `${code}-${subeNum}`;
          const val = parseInt(enr);
          if (!isNaN(val)) { add[key] = val; count++; }
        }
        setEnrollment(prev => ({ ...prev, ...add }));
        setUploaded(prev => ({ ...prev, [deptCode]: count }));
        setResult(null);
      } catch { /* ignore bad file */ }
    };
    reader.readAsArrayBuffer(file);
  }

  // Only departments whose enrollment file the user actually uploaded get assigned.
  const uploadedCodes = Object.keys(uploaded);

  function handleAssign() {
    if (busy || rows.length === 0 || rooms.length === 0 || uploadedCodes.length === 0) return;
    setBusy(true);
    setResult(null);
    // Let the UI paint the spinner before the (sync) assignment work.
    setTimeout(() => {
      try {
        const r = assignAllRooms(enrollment, rooms, uploadedCodes);
        setResult(r);
      } catch (error) {
        console.error('Derslik atama başarısız:', error);
      } finally {
        setBusy(false);
      }
    }, 150);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--bg-mute)' }}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <DoorOpen className="w-5 h-5" style={{ color: '#7c3aed' }} />
              {ra.title}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{ra.subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-faint)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{ra.uploadsTitle}</p>

          {rows.length === 0 ? (
            <div className="text-sm px-3 py-3 rounded-lg text-center" style={{ backgroundColor: darkMode ? '#422006' : '#fef3c7', color: '#b45309' }}>
              {ra.noSchedules}
            </div>
          ) : rows.map(row => {
            const isUploaded = uploaded[row.code] !== undefined;
            return (
              <div key={row.code} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border-light)', backgroundColor: darkMode ? '#1e293b' : '#fff' }}>
                <Building2 className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{row.name}</p>
                  <p className="text-[11px]" style={{ color: isUploaded ? '#16a34a' : 'var(--text-faint)' }}>
                    {isUploaded ? `✓ ${ra.uploaded} · ${ra.rowsRead.replace('{n}', String(uploaded[row.code]))}` : ra.pending}
                  </p>
                </div>
                <input
                  ref={el => { fileRefs.current[row.code] = el; }}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) parseEnrollment(row.code, f); e.target.value = ''; }}
                />
                <button
                  onClick={() => fileRefs.current[row.code]?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0"
                  style={{
                    backgroundColor: isUploaded ? 'var(--bg-mute)' : 'var(--brand-primary-soft)',
                    color: isUploaded ? 'var(--text-muted)' : 'var(--brand-primary)',
                    border: '1px solid var(--border-light)',
                  }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploaded ? ra.reupload : ra.upload}
                </button>
              </div>
            );
          })}

          <p className="text-[11px] leading-relaxed pt-1" style={{ color: 'var(--text-faint)' }}>{ra.note}</p>
          {!roomsLoading && rooms.length > 0 && (
            <p className="text-[11px] font-semibold" style={{ color: '#16a34a' }}>
              {rooms.length} gerçek derslik veritabanından yüklendi.
            </p>
          )}
          {!roomsLoading && rooms.length === 0 && (
            <p className="text-[11px] font-semibold" style={{ color: '#dc2626' }}>
              Derslik listesi yüklenemedi.
            </p>
          )}

          {result && (
            <div className="space-y-1.5">
              <div className="text-sm px-3 py-2 rounded-lg flex items-center gap-2" style={{ backgroundColor: darkMode ? '#052e16' : '#f0fdf4', color: '#16a34a' }}>
                <CheckCircle2 className="w-4 h-4" />{ra.resultOk.replace('{assigned}', String(result.assigned))}
              </div>
              {result.unassigned > 0 && (
                <div className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: darkMode ? '#450a0a' : '#fef2f2', color: '#dc2626' }}>
                  {ra.resultUnassigned.replace('{n}', String(result.unassigned))}
                  <div className="text-[11px] mt-1 opacity-90">
                    {ra.resultCapacity.replace('{n}', String(result.noSuitableRoom))}
                  </div>
                  <div className="text-[11px] opacity-90">
                    {ra.resultBusy.replace('{n}', String(result.allSuitableRoomsBusy))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-end gap-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--bg-mute)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
            {t.close}
          </button>
          <button
            onClick={handleAssign}
            disabled={busy || rows.length === 0 || roomsLoading || rooms.length === 0 || uploadedCodes.length === 0}
            title={uploadedCodes.length === 0 ? ra.assignNeedsUpload : undefined}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: (rows.length > 0 && uploadedCodes.length > 0) ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#9ca3af' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />}
            {busy ? ra.assigning : ra.assign}
          </button>
        </div>
      </div>
    </div>
  );
}
