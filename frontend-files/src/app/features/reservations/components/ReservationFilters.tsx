import { useState } from 'react';
import { Calendar, Clock, Building2, Users, Search, AlertCircle, Grid3X3 } from 'lucide-react';
import { useLocale } from '@/app/i18n';
import {
  ALL_TIME_SLOTS,
  ROOM_TYPE_OPTIONS,
  type ReservationFilterState,
  type TimeSlot,
  type RoomTypeFilter,
} from '@/app/features/reservations/types/reservationTypes';
import { getTodayString, getRoomTypeLabel } from '@/app/features/reservations/utils/reservationUtils';

interface Props {
  darkMode: boolean;
  onSearch: (filters: ReservationFilterState) => void;
  onBack: () => void;
  onManualSearch?: () => void;
}

export function ReservationFilters({ darkMode, onSearch, onBack, onManualSearch }: Props) {
  const { t, locale } = useLocale();
  const rt = t.reservation;

  const [date, setDate] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([]);
  const [roomType, setRoomType] = useState<RoomTypeFilter>('all');
  const [minCapacity, setMinCapacity] = useState<number>(0);
  const [error, setError] = useState('');

  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';
  const pillBg = 'var(--bg-mute)';
  const today = getTodayString();

  function toggleSlot(slot: TimeSlot) {
    setSelectedSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot],
    );
    setError('');
  }

  function handleDateChange(value: string) {
    setError('');
    if (!value) {
      setDate('');
      return;
    }
    // Reject past dates
    if (value < today) {
      setError(rt.errorPastDate);
      setDate('');
      return;
    }
    setDate(value);
  }

  function handleSearch() {
    if (!date) {
      setError(rt.errorNoDate);
      return;
    }
    if (date < today) {
      setError(rt.errorPastDate);
      setDate('');
      return;
    }
    if (selectedSlots.length === 0) {
      setError(rt.errorNoTime);
      return;
    }
    setError('');
    onSearch({ date, timeSlots: selectedSlots, roomType, minCapacity });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: pillBg, color: muted, fontSize: '13px' }}
          >
            ← {rt.back}
          </button>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: text }}>{rt.filterTitle}</h2>
        </div>

        {/* Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Date */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: surface, borderColor: border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rt.selectDate}
              </span>
            </div>
            <input
              type="date"
              min={today}
              value={date}
              onChange={e => handleDateChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                backgroundColor: pillBg,
                borderColor: border,
                color: text,
                fontSize: '13px',
              }}
            />
          </div>

          {/* Room Type */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: surface, borderColor: border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4" style={{ color: 'var(--brand-accent)' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rt.roomType}
              </span>
            </div>
            <select
              value={roomType}
              onChange={e => setRoomType(e.target.value as RoomTypeFilter)}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                backgroundColor: pillBg,
                borderColor: border,
                color: text,
                fontSize: '13px',
              }}
            >
              {ROOM_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {locale === 'tr' ? opt.labelTr : opt.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* Min Capacity */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: surface, borderColor: border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4" style={{ color: '#16a34a' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rt.minCapacity}
              </span>
            </div>
            <input
              type="number"
              min={0}
              max={500}
              value={minCapacity || ''}
              placeholder="0"
              onChange={e => setMinCapacity(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                backgroundColor: pillBg,
                borderColor: border,
                color: text,
                fontSize: '13px',
              }}
            />
          </div>

          {/* Time Slots - spans full width on mobile */}
          <div
            className="rounded-xl border p-4 sm:col-span-2 lg:col-span-1"
            style={{ backgroundColor: surface, borderColor: border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rt.selectTime}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_TIME_SLOTS.map(slot => {
                const isSelected = selectedSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    onClick={() => toggleSlot(slot)}
                    className="px-2 py-1.5 rounded-lg text-center transition-all"
                    style={{
                      fontSize: '11px',
                      fontWeight: isSelected ? 600 : 400,
                      backgroundColor: isSelected
                        ? darkMode ? '#312e81' : 'var(--brand-primary-soft)'
                        : pillBg,
                      color: isSelected
                        ? darkMode ? '#a5b4fc' : 'var(--brand-primary-active)'
                        : muted,
                      border: `1px solid ${isSelected
                        ? darkMode ? '#4338ca' : 'var(--brand-primary)'
                        : 'transparent'}`,
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg mb-4"
            style={{
              backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
              color: darkMode ? '#fca5a5' : '#dc2626',
              fontSize: '13px',
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Search Button + Manuel Arama */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            onClick={handleSearch}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              fontSize: '14px',
              background: 'var(--brand-gradient)',
              color: '#ffffff',
            }}
          >
            <Search className="w-4 h-4" />
            {rt.searchRooms}
          </button>

          {onManualSearch && (
            <>
              <span style={{ fontSize: '12px', color: muted }}>{rt.manualSearchDesc}</span>
              <button
                onClick={onManualSearch}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold border transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  fontSize: '14px',
                  borderColor: border,
                  backgroundColor: surface,
                  color: text,
                }}
              >
                <Grid3X3 className="w-4 h-4" style={{ color: '#6366f1' }} />
                {rt.manualSearch}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
