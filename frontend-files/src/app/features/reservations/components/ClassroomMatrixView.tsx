import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, CalendarPlus, X, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { verifyCredentials } from '@/app/services/authService';
import type { DayKey } from '@/app/data/mockData';
import type { Reservation, Room, TimeSlot } from '@/app/features/reservations/types/reservationTypes';
import { fetchRooms } from '@/app/services/lookupService';
import { createReservation, fetchAllReservations } from '@/app/services/reservationService';
import { ApiError } from '@/app/services/apiClient';
import {
  getWeekDates,
  formatDateTr,
  formatDateEn,
} from '@/app/features/reservations/utils/reservationUtils';

const DAYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 9 }, (_, i) => 9 + i); // 9..17

const DAY_INDEX: Record<DayKey, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };

/** Map hour number (9-17) to the TimeSlot string */
function hourToTimeSlot(hour: number): TimeSlot {
  const h = String(hour).padStart(2, '0');
  return `${h}:00 - ${h}:50` as TimeSlot;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

interface CellSelection {
  room: string;
  day: DayKey;
  hours: number[];
}

interface DragState {
  room: string;
  startHour: number;
  currentHour: number;
}

interface FormFields {
  courseCode: string;
  instructorName: string;
  description: string;
}

type ModalState = 'form' | 'verify' | 'loading' | 'success' | 'conflict';

interface Props {
  darkMode: boolean;
  onBack: () => void;
}

export function ClassroomMatrixView({ darkMode, onBack }: Props) {
  const { scheduledCourses, openCourseIds, currentUser, allPublishedSessions } = useApp();
  const { t, locale } = useLocale();

  // Classroom occupancy is global: derive from every published program (pool +
  // all departments). Fall back to the currently-open schedule before anything
  // has been published so the matrix is never empty during a single-dept run.
  const matrixSessions = useMemo(() => (
    allPublishedSessions.length > 0
      ? allPublishedSessions
      : scheduledCourses.filter(c => openCourseIds.includes(c.id))
  ), [allPublishedSessions, scheduledCourses, openCourseIds]);
  const mt = t.classroomMatrix;
  const rt = t.reservation;

  const [selectedDay, setSelectedDay] = useState<DayKey>('Mon');
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [modalState, setModalState] = useState<ModalState>('form');
  const [formFields, setFormFields] = useState<FormFields>({ courseCode: '', instructorName: '', description: '' });
  const [formErrors, setFormErrors] = useState<{ courseCode?: boolean; instructorName?: boolean }>({});
  const [verifyUsername, setVerifyUsername] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyError, setVerifyError] = useState(false);
  const [roomInventory, setRoomInventory] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRooms(), fetchAllReservations()])
      .then(([rooms, savedReservations]) => {
        if (cancelled) return;
        setRoomInventory(rooms);
        setReservations(savedReservations);
      })
      .catch(err => console.error('Derslik matrisi verileri yüklenemedi:', err));
    return () => { cancelled = true; };
  }, []);

  /* ── Build room list: full inventory + any room used by a session ─ */
  const rooms = useMemo(() => {
    const set = new Set<string>(roomInventory.map(room => room.roomCode));
    for (const c of matrixSessions) {
      if (c.room && c.room !== 'TBA') set.add(c.room);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [matrixSessions, roomInventory]);

  /* ── Build occupancy map: "room-day-hour" → course[] ─────────── */
  const occupancyMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string; lecturer: string }[]>();
    for (const c of matrixSessions) {
      if (!c.room || c.room === 'TBA') continue;
      const startMin = toMinutes(c.startTime);
      const endMin = toMinutes(c.endTime);
      for (let h = Math.floor(startMin / 60); h < Math.ceil(endMin / 60) && h <= 17; h++) {
        if (h < 9) continue;
        const key = `${c.room}-${c.day}-${h}`;
        if (!map.has(key)) map.set(key, []);
        const arr = map.get(key)!;
        if (!arr.some(x => x.code === c.code)) {
          arr.push({ code: c.code, name: c.name, lecturer: c.lecturer });
        }
      }
    }
    const weekDates = getWeekDates(0);
    for (const reservation of reservations) {
      const dayIndex = weekDates.indexOf(reservation.date);
      if (dayIndex < 0 || dayIndex >= DAYS.length) continue;
      const day = DAYS[dayIndex];
      for (const slot of reservation.timeSlots) {
        const hour = Number(slot.slice(0, 2));
        const key = `${reservation.roomCode}-${day}-${hour}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          code: reservation.courseCode || 'REZ',
          name: reservation.description || 'Rezervasyon',
          lecturer: reservation.instructorName || reservation.userName,
        });
      }
    }
    return map;
  }, [matrixSessions, reservations]);

  /* ── Stats for selected day ──────────────────────────────────── */
  const dayStats = useMemo(() => {
    let occupied = 0;
    let total = 0;
    for (const room of rooms) {
      for (const hour of HOURS) {
        total++;
        const key = `${room}-${selectedDay}-${hour}`;
        if (occupancyMap.has(key)) occupied++;
      }
    }
    return { occupied, total, available: total - occupied };
  }, [rooms, selectedDay, occupancyMap]);

  /* ── Reservation helpers ─────────────────────────────────────── */
  function getDateForDay(day: DayKey): string {
    const dates = getWeekDates(0); // current week
    return dates[DAY_INDEX[day]];
  }

  /* ── Drag-to-select helpers ──────────────────────────────────── */
  function isCellOccupied(room: string, hour: number) {
    return occupancyMap.has(`${room}-${selectedDay}-${hour}`);
  }

  // Empty hours covered by the current drag (same room, between start & current).
  function emptyHoursInDrag(d: DragState): number[] {
    const lo = Math.min(d.startHour, d.currentHour);
    const hi = Math.max(d.startHour, d.currentHour);
    const out: number[] = [];
    for (let h = lo; h <= hi; h++) {
      if (!isCellOccupied(d.room, h)) out.push(h);
    }
    return out;
  }

  function isCellInDrag(room: string, hour: number) {
    if (!drag || drag.room !== room) return false;
    const lo = Math.min(drag.startHour, drag.currentHour);
    const hi = Math.max(drag.startHour, drag.currentHour);
    return hour >= lo && hour <= hi && !isCellOccupied(room, hour);
  }

  function handleCellMouseDown(room: string, hour: number) {
    if (isCellOccupied(room, hour)) return;
    setDrag({ room, startHour: hour, currentHour: hour });
  }

  function handleCellMouseEnter(room: string, hour: number) {
    setDrag(d => (d && d.room === room ? { ...d, currentHour: hour } : d));
  }

  // Finalise the drag selection on global mouseup (even if released off-table).
  useEffect(() => {
    if (!drag) return;
    function finish() {
      const d = drag!;
      const hours = emptyHoursInDrag(d);
      setDrag(null);
      if (hours.length === 0) return;
      setSelection({ room: d.room, day: selectedDay, hours });
      setFormFields({ courseCode: '', instructorName: currentUser?.full_name ?? '', description: '' });
      setFormErrors({});
      setModalState('form');
    }
    window.addEventListener('mouseup', finish);
    return () => window.removeEventListener('mouseup', finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, occupancyMap, selectedDay, currentUser]);

  // Readable time label for the selected slots, e.g. "09:00 - 11:50".
  function selectionTimeLabel(hours: number[]): string {
    const sorted = [...hours].sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (sorted.length === 1) return hourToTimeSlot(first);
    return `${String(first).padStart(2, '0')}:00 - ${String(last).padStart(2, '0')}:50`;
  }

  function handleFormSubmit() {
    if (!selection || !currentUser) return;

    // Validate required fields
    const errors: { courseCode?: boolean; instructorName?: boolean } = {};
    if (!formFields.courseCode.trim()) errors.courseCode = true;
    if (!formFields.instructorName.trim()) errors.instructorName = true;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Move to verification step
    setVerifyUsername(currentUser.username);
    setVerifyPassword('');
    setVerifyError(false);
    setModalState('verify');
  }

  async function handleVerifyAndSave() {
    if (!selection || !currentUser) return;

    const ok = await verifyCredentials(verifyUsername, verifyPassword);
    if (!ok) {
      setVerifyError(true);
      return;
    }

    const date = getDateForDay(selection.day);
    const timeSlots = [...selection.hours].sort((a, b) => a - b).map(hourToTimeSlot);

    setModalState('loading');
    try {
      const saved = await createReservation({
        roomCode: selection.room,
        date,
        timeSlots,
        courseCode: formFields.courseCode.trim(),
        instructorName: formFields.instructorName.trim(),
        description: formFields.description.trim() || undefined,
      });
      setReservations(prev => [...prev, saved]);
      setModalState('success');
    } catch (err) {
      console.error('Rezervasyon kaydedilemedi:', err);
      if (err instanceof ApiError && err.status === 409) {
        setModalState('conflict');
      } else {
        setVerifyError(true);
        setModalState('verify');
      }
    }
  }

  function handleCloseModal() {
    setSelection(null);
    setModalState('form');
    setFormFields({ courseCode: '', instructorName: '', description: '' });
    setFormErrors({});
  }

  /* ── Styles ──────────────────────────────────────────────────── */
  const borderColor = darkMode ? '#334155' : '#d1d5db';
  const headerBg = darkMode ? '#1e293b' : '#f3f4f6';
  const cellBgEmpty = darkMode ? '#0f172a' : '#ffffff';
  const cellBgOccupied = darkMode ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)';
  const cellBgHover = darkMode ? 'rgba(34,197,94,0.10)' : 'rgba(34,197,94,0.08)';
  const cellBgSelected = darkMode ? 'rgba(34,197,94,0.32)' : 'rgba(34,197,94,0.28)';
  const textPrimary = darkMode ? '#e2e8f0' : '#1f2937';
  const textMuted = darkMode ? '#94a3b8' : '#6b7280';

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: darkMode ? '#0f172a' : '#f9fafb' }}>
      {/* Header */}
      <div
        className="shrink-0 px-5 py-4 border-b flex items-center gap-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: textMuted }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: textPrimary }}>
            {mt.title}
          </h2>
          <p style={{ fontSize: '13px', color: textMuted }}>
            {mt.subtitle}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: textMuted }}>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: cellBgEmpty, borderColor }} />
            {mt.available}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: darkMode ? '#991b1b' : '#fecaca' }} />
            {mt.occupied}
          </span>
          <span className="font-semibold" style={{ color: textPrimary }}>
            {dayStats.available}/{dayStats.total} {mt.availableSlots}
          </span>
        </div>
      </div>

      {/* Day Tabs */}
      <div
        className="shrink-0 flex items-center gap-1 px-5 py-2 border-b"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#f8fafc',
          borderColor: darkMode ? '#334155' : '#e2e8f0',
        }}
      >
        {DAYS.map(day => {
          const isActive = selectedDay === day;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: isActive
                  ? (darkMode ? '#3b82f6' : '#3C8DBC')
                  : (darkMode ? '#334155' : '#e5e7eb'),
                color: isActive ? '#fff' : textPrimary,
              }}
            >
              {t.days[day]}
            </button>
          );
        })}
        <span className="ml-2 text-[11px]" style={{ color: textMuted }}>
          {mt.clickToReserve}
        </span>
      </div>

      {/* Matrix Table */}
      <div className="flex-1 overflow-auto p-4" style={{ userSelect: drag ? 'none' : undefined }}>
        {rooms.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: textMuted }}>{mt.noRooms}</p>
              <p className="text-xs mt-1" style={{ color: textMuted }}>{mt.noRoomsDesc}</p>
            </div>
          </div>
        ) : (
          <table
            className="w-full border-collapse"
            style={{ minWidth: 700 }}
          >
            <thead>
              <tr>
                <th
                  className="border p-2 text-center text-xs font-bold sticky left-0 z-10"
                  style={{
                    borderColor,
                    backgroundColor: headerBg,
                    color: textPrimary,
                    minWidth: 90,
                  }}
                >
                  {mt.room}
                </th>
                {HOURS.map(hour => (
                  <th
                    key={hour}
                    className="border p-2 text-center text-xs font-bold"
                    style={{
                      borderColor,
                      backgroundColor: headerBg,
                      color: textPrimary,
                      minWidth: 90,
                    }}
                  >
                    {String(hour).padStart(2, '0')}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map(room => (
                <tr key={room}>
                  <td
                    className="border p-2 text-xs font-semibold text-center sticky left-0 z-10"
                    style={{
                      borderColor,
                      backgroundColor: headerBg,
                      color: textPrimary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {room}
                  </td>
                  {HOURS.map(hour => {
                    const key = `${room}-${selectedDay}-${hour}`;
                    const courses = occupancyMap.get(key);
                    const isOccupied = !!courses && courses.length > 0;
                    const inDrag = isCellInDrag(room, hour);
                    return (
                      <td
                        key={hour}
                        className={`border p-1 text-center align-middle transition-colors ${!isOccupied ? 'cursor-pointer group' : ''}`}
                        style={{
                          borderColor,
                          backgroundColor: isOccupied
                            ? cellBgOccupied
                            : (inDrag ? cellBgSelected : cellBgEmpty),
                          minHeight: 36,
                        }}
                        title={
                          isOccupied
                            ? courses!.map(c => `${c.code} — ${c.lecturer}`).join('\n')
                            : mt.clickToReserveCell
                        }
                        onMouseDown={(e) => { if (!isOccupied) { e.preventDefault(); handleCellMouseDown(room, hour); } }}
                        onMouseEnter={() => handleCellMouseEnter(room, hour)}
                      >
                        {isOccupied ? (
                          <div className="flex flex-col gap-0.5">
                            {courses!.map((c, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-semibold leading-tight"
                                style={{ color: darkMode ? '#fca5a5' : '#991b1b' }}
                              >
                                {c.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          /* Hover / drag indicator for empty cells */
                          <div
                            className={`w-full h-full min-h-[28px] rounded flex items-center justify-center transition-opacity ${inDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            style={{ backgroundColor: inDrag ? 'transparent' : cellBgHover }}
                          >
                            <CalendarPlus className="w-3.5 h-3.5" style={{ color: '#16a34a' }} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Quick Reservation Modal ─────────────────────────────── */}
      {selection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={modalState !== 'loading' ? handleCloseModal : undefined}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
          >
            {modalState === 'form' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex items-center gap-2">
                    <CalendarPlus className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: textPrimary }}>
                      {mt.quickReserve}
                    </h3>
                  </div>
                  <button onClick={handleCloseModal} className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                    <X className="w-4 h-4" style={{ color: textMuted }} />
                  </button>
                </div>

                {/* Slot info bubble */}
                <div
                  className="mx-5 mt-4 px-4 py-3 rounded-xl flex items-center justify-between gap-3"
                  style={{
                    backgroundColor: darkMode ? '#1e293b' : '#f1f5f9',
                    border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                  }}
                >
                  <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: textPrimary }}>
                    <span className="font-bold">{selection.room}</span>
                    <span style={{ color: textMuted }}>·</span>
                    <span>{t.days[selection.day]}</span>
                    <span style={{ color: textMuted }}>·</span>
                    <span className="font-semibold">{selectionTimeLabel(selection.hours)}</span>
                    {selection.hours.length > 1 && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: darkMode ? '#064e3b' : '#dcfce7', color: '#16a34a' }}
                      >
                        {mt.slotsSelected.replace('{n}', String(selection.hours.length))}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] shrink-0" style={{ color: textMuted }}>
                    {locale === 'tr'
                      ? formatDateTr(getDateForDay(selection.day))
                      : formatDateEn(getDateForDay(selection.day))}
                  </span>
                </div>

                {/* Form fields */}
                <div className="px-5 py-4 space-y-3">
                  {/* Course Code */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: textPrimary }}>
                      {mt.courseCodeLabel} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formFields.courseCode}
                      onChange={e => { setFormFields(f => ({ ...f, courseCode: e.target.value })); setFormErrors(e2 => ({ ...e2, courseCode: false })); }}
                      placeholder={mt.courseCodePlaceholder}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors focus:ring-2 focus:ring-blue-400/40"
                      style={{
                        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                        borderColor: formErrors.courseCode ? '#ef4444' : (darkMode ? '#334155' : '#d1d5db'),
                        color: textPrimary,
                      }}
                    />
                    {formErrors.courseCode && (
                      <p className="text-[11px] mt-0.5" style={{ color: '#ef4444' }}>{mt.errorCourseCode}</p>
                    )}
                  </div>

                  {/* Instructor Name */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: textPrimary }}>
                      {mt.instructorLabel} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formFields.instructorName}
                      onChange={e => { setFormFields(f => ({ ...f, instructorName: e.target.value })); setFormErrors(e2 => ({ ...e2, instructorName: false })); }}
                      placeholder={mt.instructorPlaceholder}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors focus:ring-2 focus:ring-blue-400/40"
                      style={{
                        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                        borderColor: formErrors.instructorName ? '#ef4444' : (darkMode ? '#334155' : '#d1d5db'),
                        color: textPrimary,
                      }}
                    />
                    {formErrors.instructorName && (
                      <p className="text-[11px] mt-0.5" style={{ color: '#ef4444' }}>{mt.errorInstructor}</p>
                    )}
                  </div>

                  {/* Description (optional) */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: textPrimary }}>
                      {mt.descriptionLabel}
                    </label>
                    <input
                      type="text"
                      value={formFields.description}
                      onChange={e => setFormFields(f => ({ ...f, description: e.target.value }))}
                      placeholder={mt.descriptionPlaceholder}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors focus:ring-2 focus:ring-blue-400/40"
                      style={{
                        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                        borderColor: darkMode ? '#334155' : '#d1d5db',
                        color: textPrimary,
                      }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
                  <button
                    onClick={handleCloseModal}
                    className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: 'var(--bg-mute)', color: textMuted }}
                  >
                    {rt.cancel}
                  </button>
                  <button
                    onClick={handleFormSubmit}
                    className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: 'var(--brand-gradient)', color: '#ffffff' }}
                  >
                    {rt.confirm}
                  </button>
                </div>
              </>
            )}

            {modalState === 'verify' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" style={{ color: '#f59e0b' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: textPrimary }}>
                      {mt.verifyTitle}
                    </h3>
                  </div>
                  <button onClick={handleCloseModal} className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                    <X className="w-4 h-4" style={{ color: textMuted }} />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p style={{ fontSize: '12px', color: textMuted, lineHeight: 1.5 }}>
                    {mt.verifyDesc}
                  </p>
                  {/* Username */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: textPrimary }}>
                      {t.login.accountId}
                    </label>
                    <input
                      type="text"
                      value={verifyUsername}
                      onChange={e => { setVerifyUsername(e.target.value); setVerifyError(false); }}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors focus:ring-2 focus:ring-amber-400/40"
                      style={{
                        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                        borderColor: verifyError ? '#ef4444' : (darkMode ? '#334155' : '#d1d5db'),
                        color: textPrimary,
                      }}
                    />
                  </div>
                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: textPrimary }}>
                      {t.login.password}
                    </label>
                    <input
                      type="password"
                      value={verifyPassword}
                      onChange={e => { setVerifyPassword(e.target.value); setVerifyError(false); }}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors focus:ring-2 focus:ring-amber-400/40"
                      style={{
                        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                        borderColor: verifyError ? '#ef4444' : (darkMode ? '#334155' : '#d1d5db'),
                        color: textPrimary,
                      }}
                    />
                  </div>
                  {verifyError && (
                    <p className="text-[11px]" style={{ color: '#ef4444' }}>{mt.verifyError}</p>
                  )}
                </div>
                <div className="flex gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
                  <button
                    onClick={() => setModalState('form')}
                    className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: 'var(--bg-mute)', color: textMuted }}
                  >
                    {rt.back}
                  </button>
                  <button
                    onClick={handleVerifyAndSave}
                    className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#ffffff' }}
                  >
                    {mt.verifyButton}
                  </button>
                </div>
              </>
            )}

            {modalState === 'loading' && (
              <div className="flex flex-col items-center justify-center py-14 px-8">
                <Loader2 className="w-10 h-10 animate-spin mb-3" style={{ color: 'var(--brand-primary)' }} />
                <p style={{ fontSize: '14px', fontWeight: 600, color: textPrimary }}>{rt.saving}</p>
              </div>
            )}

            {modalState === 'success' && (
              <div className="flex flex-col items-center justify-center py-14 px-8">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: darkMode ? '#052e16' : '#dcfce7' }}
                >
                  <CheckCircle2 className="w-7 h-7" style={{ color: '#16a34a' }} />
                </div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: textPrimary }} className="mb-1">{rt.successTitle}</p>
                <p style={{ fontSize: '12px', color: textMuted }} className="mb-5 text-center">{rt.successDesc}</p>
                <button
                  onClick={handleCloseModal}
                  className="px-6 py-2 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#ffffff' }}
                >
                  {rt.ok}
                </button>
              </div>
            )}

            {modalState === 'conflict' && (
              <div className="flex flex-col items-center justify-center py-14 px-8">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: darkMode ? '#450a0a' : '#fef2f2' }}
                >
                  <X className="w-7 h-7" style={{ color: '#dc2626' }} />
                </div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: textPrimary }} className="mb-1">{rt.conflictTitle}</p>
                <p style={{ fontSize: '12px', color: textMuted }} className="mb-5 text-center">{rt.conflictDesc}</p>
                <button
                  onClick={handleCloseModal}
                  className="px-6 py-2 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--bg-mute)', color: textPrimary }}
                >
                  {rt.ok}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, color, muted }: { label: string; value: string; color: string; muted: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span style={{ fontSize: '13px', color: muted }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
