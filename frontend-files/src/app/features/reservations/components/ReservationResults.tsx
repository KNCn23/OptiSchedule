import { useEffect, useState } from 'react';
import { useLocale } from '@/app/i18n';
import type { ReservationFilterState, Room } from '@/app/features/reservations/types/reservationTypes';
import { groupRoomsByBlockAndFloor, formatDateTr, formatDateEn, getRoomTypeLabel } from '@/app/features/reservations/utils/reservationUtils';
import { fetchRoomAvailability } from '@/app/services/reservationService';
import { RoomCard } from '@/app/features/reservations/components/RoomCard';
import { ArrowLeft, Loader2, SearchX } from 'lucide-react';

interface Props {
  darkMode: boolean;
  filters: ReservationFilterState;
  onBack: () => void;
  onSelectRoom: (room: Room & { isAvailable: boolean }) => void;
}

export function ReservationResults({ darkMode, filters, onBack, onSelectRoom }: Props) {
  const { t, locale } = useLocale();
  const rt = t.reservation;

  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';
  const pillBg = 'var(--bg-mute)';

  const [filteredRooms, setFilteredRooms] = useState<(Room & { isAvailable: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchRoomAvailability(filters)
      .then(rooms => {
        if (!cancelled) setFilteredRooms(rooms);
      })
      .catch(err => {
        console.error('Derslik uygunluğu yüklenemedi:', err);
        if (!cancelled) {
          setFilteredRooms([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters]);

  const grouped = groupRoomsByBlockAndFloor(filteredRooms);
  const availableCount = filteredRooms.filter(r => r.isAvailable).length;
  const dateFormatted = locale === 'tr' ? formatDateTr(filters.date) : formatDateEn(filters.date);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: pillBg, color: muted, fontSize: '13px' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {rt.back}
          </button>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: text }}>{rt.resultsTitle}</h2>
        </div>

        {/* Filter Summary Badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge label={`📅 ${dateFormatted}`} darkMode={darkMode} />
          {filters.timeSlots.map(slot => (
            <Badge key={slot} label={`🕐 ${slot}`} darkMode={darkMode} />
          ))}
          <Badge
            label={`🏫 ${getRoomTypeLabel(filters.roomType, locale)}`}
            darkMode={darkMode}
          />
          {filters.minCapacity > 0 && (
            <Badge label={`👥 ≥${filters.minCapacity}`} darkMode={darkMode} />
          )}
          <span
            className="ml-auto flex items-center px-3 py-1 rounded-full"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: availableCount > 0
                ? darkMode ? '#052e16' : '#dcfce7'
                : darkMode ? '#450a0a' : '#fef2f2',
              color: availableCount > 0
                ? darkMode ? '#4ade80' : '#166534'
                : darkMode ? '#fca5a5' : '#dc2626',
            }}
          >
            {availableCount} {rt.availableRooms}
          </span>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand-primary)' }} />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-2xl border"
            style={{ backgroundColor: surface, borderColor: border }}
          >
            <SearchX className="w-12 h-12 mb-4" style={{ color: muted }} />
            <p style={{ fontSize: '15px', fontWeight: 600, color: text }}>
              {loadError ? 'Derslikler yüklenemedi' : rt.noRooms}
            </p>
            <p style={{ fontSize: '13px', color: muted, marginTop: 4 }}>
              {loadError ? 'Backend bağlantısını kontrol edip tekrar deneyin.' : rt.noRoomsDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.block}>
                {/* Block Header */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="px-3 py-1 rounded-lg"
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      backgroundColor: darkMode ? '#312e81' : 'var(--brand-primary-soft)',
                      color: darkMode ? '#a5b4fc' : 'var(--brand-primary-active)',
                    }}
                  >
                    {group.block} {rt.blockLabel.toUpperCase()}
                  </div>
                </div>

                {group.floors.map(floorGroup => (
                  <div key={floorGroup.floor} className="mb-4 ml-2">
                    {/* Floor Header */}
                    <p
                      className="mb-2 flex items-center gap-1"
                      style={{ fontSize: '12px', fontWeight: 600, color: muted }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: darkMode ? '#6366f1' : '#818cf8' }}
                      />
                      {floorGroup.floor}. {rt.floorLabel.toUpperCase()}
                    </p>

                    {/* Room Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-3">
                      {floorGroup.rooms.map(room => (
                        <RoomCard
                          key={room.roomCode}
                          room={room}
                          darkMode={darkMode}
                          onClick={() => room.isAvailable && onSelectRoom(room)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ label, darkMode }: { label: string; darkMode: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full"
      style={{
        fontSize: '11px',
        fontWeight: 500,
        backgroundColor: 'var(--bg-mute)',
        color: darkMode ? '#cbd5e1' : '#334155',
      }}
    >
      {label}
    </span>
  );
}
