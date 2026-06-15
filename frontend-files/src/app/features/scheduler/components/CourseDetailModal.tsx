import { X, User } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { COURSE_COLORS } from '@/app/data/mockData';

/** "BİL172-2" → "BİL 172 (02)" */
function formatCode(code: string): string {
  const dash = code.lastIndexOf('-');
  const base = dash > 0 ? code.slice(0, dash) : code;
  const sec = dash > 0 ? code.slice(dash + 1) : '';
  const spaced = base.replace(/^([^\d]+)(\d.*)$/, '$1 $2');
  return sec ? `${spaced} (${sec.padStart(2, '0')})` : spaced;
}

export function CourseDetailModal() {
  const { selectedCourse, setSelectedCourse, darkMode } = useApp();
  if (!selectedCourse) return null;

  const color = COURSE_COLORS[selectedCourse.colorIndex];
  const bg = darkMode ? color.darkBg : color.lightBg;
  const border = darkMode ? color.darkBorder : color.lightBorder;
  const textColor = darkMode ? color.darkText : color.lightText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={() => setSelectedCourse(null)}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: darkMode ? '#1e293b' : '#ffffff' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Colored top accent */}
        <div className="h-1.5 w-full" style={{ backgroundColor: border }} />

        <div className="px-6 pt-5 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Code */}
              <span
                className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide mb-2"
                style={{ backgroundColor: bg, color: textColor }}
              >
                {formatCode(selectedCourse.code)}
              </span>
              {/* Name */}
              <h2
                style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}
              >
                {selectedCourse.name}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCourse(null)}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'var(--bg-mute)', color: 'var(--text-faint)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Instructor */}
          <div className="flex items-center gap-2 mt-4">
            <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {selectedCourse.lecturer}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
