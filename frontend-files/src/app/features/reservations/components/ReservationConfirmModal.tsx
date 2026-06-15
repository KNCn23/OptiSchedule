import { useState, useEffect } from 'react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/i18n';
import type { Room, ReservationFilterState } from '@/app/features/reservations/types/reservationTypes';
import {
  formatDateTr,
  formatDateEn,
  getRoomTypeLabel,
} from '@/app/features/reservations/utils/reservationUtils';
import { createReservation } from '@/app/services/reservationService';
import { ApiError } from '@/app/services/apiClient';

type ModalState = 'confirm' | 'loading' | 'success' | 'conflict';

interface Props {
  darkMode: boolean;
  room: Room;
  filters: ReservationFilterState;
  userId: string;
  userName: string;
  userRole: string;
  onClose: () => void;
  onReserved: () => void;
}

export function ReservationConfirmModal({
  darkMode,
  room,
  filters,
  userId,
  userName,
  userRole,
  onClose,
  onReserved,
}: Props) {
  const { t, locale } = useLocale();
  const rt = t.reservation;
  const [state, setState] = useState<ModalState>('confirm');

  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';
  const dateFormatted = locale === 'tr' ? formatDateTr(filters.date) : formatDateEn(filters.date);

  async function handleConfirm() {
    setState('loading');
    try {
      await createReservation({
        roomCode: room.roomCode,
        date: filters.date,
        timeSlots: filters.timeSlots,
      });
      setState('success');
    } catch (err) {
      console.error('Rezervasyon kaydedilemedi:', err);
      setState(err instanceof ApiError && err.status === 409 ? 'conflict' : 'conflict');
    }
  }

  function handleDone() {
    onReserved();
    onClose();
  }

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state !== 'loading') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={state !== 'loading' ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        {state === 'confirm' && (
          <>
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: border }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: text }}>
                {rt.confirmTitle}
              </h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" style={{ color: muted }} />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4 space-y-3">
              <DetailRow label={rt.roomLabel} value={room.roomCode} darkMode={darkMode} />
              <DetailRow label={rt.capacityLabel} value={`${room.capacity} ${rt.person}`} darkMode={darkMode} />
              <DetailRow label={rt.dateLabel} value={dateFormatted} darkMode={darkMode} />
              {/* Time slots - show each one individually */}
              <div className="flex items-start justify-between gap-4">
                <span style={{ fontSize: '13px', color: muted }}>{rt.timeLabel}</span>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {filters.timeSlots.map(slot => (
                    <span
                      key={slot}
                      className="px-2 py-0.5 rounded-md"
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: darkMode ? '#312e81' : 'var(--brand-primary-soft)',
                        color: darkMode ? '#a5b4fc' : 'var(--brand-primary-active)',
                      }}
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              </div>
              <DetailRow label={rt.typeLabel} value={getRoomTypeLabel(room.type, locale)} darkMode={darkMode} />

              {/* Info: separate reservations notice */}
              {filters.timeSlots.length > 1 && (
                <div
                  className="mt-2 px-4 py-2.5 rounded-lg flex items-start gap-2"
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: darkMode ? '#1c1917' : '#fffbeb',
                    color: darkMode ? '#fbbf24' : '#b45309',
                    border: `1px solid ${darkMode ? '#422006' : '#fde68a'}`,
                  }}
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>ℹ️</span>
                  <span>{rt.separateReservations.replace('{n}', String(filters.timeSlots.length))}</span>
                </div>
              )}

              <div
                className="mt-4 px-4 py-3 rounded-lg text-center"
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: darkMode ? '#172554' : 'var(--brand-primary-soft)',
                  color: darkMode ? '#93c5fd' : 'var(--brand-primary-active)',
                }}
              >
                {rt.confirmQuestion}
              </div>
            </div>

            {/* Actions */}
            <div
              className="flex gap-3 px-5 py-4 border-t"
              style={{ borderColor: border }}
            >
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-mute)',
                  color: muted,
                }}
              >
                {rt.cancel}
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  fontSize: '13px',
                  background: 'var(--brand-gradient)',
                  color: '#ffffff',
                }}
              >
                {rt.confirm}
              </button>
            </div>
          </>
        )}

        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <Loader2
              className="w-12 h-12 animate-spin mb-4"
              style={{ color: 'var(--brand-primary)' }}
            />
            <p style={{ fontSize: '15px', fontWeight: 600, color: text }}>
              {rt.saving}
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{
                backgroundColor: darkMode ? '#052e16' : '#dcfce7',
              }}
            >
              <CheckCircle2 className="w-8 h-8" style={{ color: '#16a34a' }} />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: text }} className="mb-1">
              {rt.successTitle}
            </p>
            <p style={{ fontSize: '13px', color: muted }} className="mb-6 text-center">
              {rt.successDesc}
            </p>
            <button
              onClick={handleDone}
              className="px-8 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                fontSize: '14px',
                background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                color: '#ffffff',
              }}
            >
              {rt.ok}
            </button>
          </div>
        )}

        {state === 'conflict' && (
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: darkMode ? '#450a0a' : '#fef2f2' }}
            >
              <X className="w-8 h-8" style={{ color: '#dc2626' }} />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: text }} className="mb-1">
              {rt.conflictTitle}
            </p>
            <p style={{ fontSize: '13px', color: muted }} className="mb-6 text-center">
              {rt.conflictDesc}
            </p>
            <button
              onClick={onClose}
              className="px-8 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                fontSize: '14px',
                backgroundColor: 'var(--bg-mute)',
                color: text,
              }}
            >
              {rt.ok}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, darkMode }: { label: string; value: string; darkMode: boolean }) {
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';
  return (
    <div className="flex items-start justify-between gap-4">
      <span style={{ fontSize: '13px', color: muted }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: text, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
