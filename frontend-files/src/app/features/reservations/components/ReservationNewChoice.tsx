import { ArrowLeft, Search, Grid3X3 } from 'lucide-react';
import { useLocale } from '@/app/i18n';

interface Props {
  darkMode: boolean;
  onBack: () => void;
  onFilters: () => void;
  onMatrix: () => void;
}

export function ReservationNewChoice({ darkMode, onBack, onFilters, onMatrix }: Props) {
  const { t } = useLocale();
  const rt = t.reservation;

  const surface = 'var(--bg-surface)';
  const border = 'var(--border-light)';
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with back */}
      <div
        className="shrink-0 px-5 py-4 border-b flex items-center gap-4"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: muted }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: text }}>{rt.newReservation}</h2>
          <p style={{ fontSize: '13px', color: muted }}>{rt.newChooseSubtitle}</p>
        </div>
      </div>

      {/* Two big choice buttons */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <h3 className="text-lg font-bold text-center mb-1" style={{ color: text }}>
          {rt.newChooseTitle}
        </h3>
        <p className="text-sm text-center mb-8 max-w-md" style={{ color: muted }}>
          {rt.newChooseSubtitle}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
          {/* Filter search */}
          <button
            onClick={onFilters}
            className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              borderColor: 'var(--brand-primary)',
              backgroundColor: darkMode ? 'rgba(59,130,246,0.06)' : 'rgba(60,141,188,0.05)',
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ background: 'var(--brand-gradient)' }}
            >
              <Search className="w-7 h-7 text-white" />
            </div>
            <div>
              <h4 className="text-base font-bold" style={{ color: text }}>{rt.searchByFilter}</h4>
              <p className="text-xs mt-1" style={{ color: muted }}>{rt.searchByFilterDesc}</p>
            </div>
          </button>

          {/* Matrix view */}
          <button
            onClick={onMatrix}
            className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              borderColor: '#6366f1',
              backgroundColor: darkMode ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.05)',
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
            >
              <Grid3X3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h4 className="text-base font-bold" style={{ color: text }}>{rt.matrixViewOption}</h4>
              <p className="text-xs mt-1" style={{ color: muted }}>{rt.matrixViewOptionDesc}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
