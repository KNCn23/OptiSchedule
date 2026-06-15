import type { Room } from '@/app/features/reservations/types/reservationTypes';
import { useLocale } from '@/app/i18n';
import { getRoomTypeLabel } from '@/app/features/reservations/utils/reservationUtils';
import { DoorOpen, Users, Layers, Lock } from 'lucide-react';

interface Props {
  room: Room & { isAvailable: boolean };
  darkMode: boolean;
  onClick: () => void;
}

export function RoomCard({ room, darkMode, onClick }: Props) {
  const { locale } = useLocale();
  const { t } = useLocale();
  const rt = t.reservation;

  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';

  const typeColors: Record<string, string> = {
    derslik: 'var(--brand-primary)',
    amfi: '#f59e0b',
    laboratuvar: 'var(--brand-accent)',
  };
  const accent = typeColors[room.type] ?? 'var(--brand-primary)';

  if (!room.isAvailable) {
    return (
      <div
        className="rounded-xl border p-4 opacity-50 cursor-not-allowed relative overflow-hidden"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <div className="absolute top-2 right-2">
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
              color: darkMode ? '#fca5a5' : '#dc2626',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            <Lock className="w-3 h-3" />
            {rt.occupied}
          </div>
        </div>
        <p style={{ fontSize: '15px', fontWeight: 700, color: text }}>{room.roomCode}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1" style={{ fontSize: '11px', color: muted }}>
            <Users className="w-3 h-3" /> {room.capacity}
          </span>
          <span className="flex items-center gap-1" style={{ fontSize: '11px', color: muted }}>
            <Layers className="w-3 h-3" /> {getRoomTypeLabel(room.type, locale)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98] relative overflow-hidden"
      style={{ backgroundColor: surface, borderColor: border }}
    >
      {/* Accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
        style={{ backgroundColor: accent }}
      />

      <div className="absolute top-2 right-2">
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: darkMode ? '#052e16' : '#dcfce7',
            color: darkMode ? '#4ade80' : '#166534',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          <DoorOpen className="w-3 h-3" />
          {rt.available}
        </div>
      </div>

      <p style={{ fontSize: '15px', fontWeight: 700, color: text }} className="mb-2">
        {room.roomCode}
      </p>

      <div className="space-y-1">
        <div className="flex items-center gap-1" style={{ fontSize: '11px', color: muted }}>
          <Users className="w-3 h-3" />
          <span>{rt.capacityLabel}: {room.capacity}</span>
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: '11px', color: muted }}>
          <Layers className="w-3 h-3" />
          <span>{rt.typeLabel}: {getRoomTypeLabel(room.type, locale)}</span>
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: '11px', color: muted }}>
          <span style={{ fontWeight: 500 }}>{rt.blockLabel}: {room.block} · {rt.floorLabel}: {room.floor}</span>
        </div>
      </div>

      {/* Hover overlay */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background: darkMode
            ? `linear-gradient(135deg, ${accent}10, ${accent}08)`
            : `linear-gradient(135deg, ${accent}06, ${accent}04)`,
        }}
      />
    </button>
  );
}
