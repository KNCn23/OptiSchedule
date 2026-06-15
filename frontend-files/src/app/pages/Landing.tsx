import { useNavigate } from 'react-router';
import { BookOpen, Calendar, Building2, ArrowRight, Sparkles } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';

export function Landing() {
  const navigate = useNavigate();
  const { darkMode } = useApp();
  const { t } = useLocale();

  // Three uniform entry points. Role-based routing happens after login, so the
  // schedule/room cards lead to a single shared login screen (no portal split).
  const CARDS = [
    {
      key: 'schedule',
      path: '/admin',
      icon: Calendar,
      label: t.landing.adminLabel,
      description: t.landing.adminDesc,
      enterLabel: t.landing.adminEnter,
      gradient: 'var(--brand-gradient)',
      accent: darkMode ? '#c4b5fd' : 'var(--brand-primary-active)',
    },
    {
      key: 'rooms',
      path: '/academic',
      icon: Building2,
      label: t.landing.academicLabel,
      description: t.landing.academicDesc,
      enterLabel: t.landing.academicEnter,
      gradient: 'var(--brand-gradient-accent)',
      accent: darkMode ? '#5eead4' : 'var(--brand-accent)',
    },
    {
      key: 'catalog',
      path: '/courses',
      icon: BookOpen,
      label: t.landing.courseCatalog,
      description: t.landing.courseCatalogDesc,
      enterLabel: t.landing.catalogEnter,
      gradient: 'linear-gradient(135deg, #6366f1, #3b82f6)',
      accent: darkMode ? '#93c5fd' : '#3b82f6',
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-x-hidden overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      {/* Background decoration */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: darkMode
            ? 'radial-gradient(ellipse at 20% 20%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(8,145,178,0.06) 0%, transparent 60%)'
            : 'radial-gradient(ellipse at 20% 20%, rgba(99,102,241,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(8,145,178,0.03) 0%, transparent 60%)',
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `linear-gradient(${darkMode ? '#1e293b' : '#e5e7eb'} 1px, transparent 1px), linear-gradient(90deg, ${darkMode ? '#1e293b' : '#e5e7eb'} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />

      {/* Logo + title */}
      <div className="relative flex flex-col items-center mb-12">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-xl"
          style={{ background: 'var(--logo-gradient)' }}
        >
          <Calendar className="w-8 h-8 text-white" />
        </div>

        <div className="flex flex-col items-center gap-1 mb-3 px-4">
          <div className="flex items-center gap-2">
            <h1
              style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: 'var(--text-primary)',
                lineHeight: 1.05,
                textAlign: 'center',
              }}
            >
              {t.brandUniversity}
            </h1>
            <Sparkles
              className="w-5 h-5 mb-1 shrink-0"
              style={{ color: darkMode ? '#8b5cf6' : 'var(--brand-primary)' }}
            />
          </div>
          <h2
            style={{
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--brand-primary)',
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: 460,
            }}
          >
            {t.brandSystem}
          </h2>
        </div>

        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            maxWidth: 420,
            lineHeight: 1.6,
            whiteSpace: 'pre-line',
          }}
        >
          {t.landing.subtitle}
        </p>

        {/* Term badge */}
        <div
          className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-medium"
          style={{
            borderColor: 'var(--border-light)',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-surface)',
            fontSize: '13px',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          {t.landing.termBadge}
        </div>
      </div>

      {/* Three aligned entry cards */}
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl items-stretch">
        {CARDS.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={() => navigate(card.path)}
              className="group flex flex-col text-left rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 h-full"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-light)',
                boxShadow: darkMode ? 'none' : '0 1px 4px rgba(0,0,0,0.08)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 30px ${card.accent}33, 0 0 0 1px ${card.accent}55`;
                (e.currentTarget as HTMLElement).style.borderColor = card.accent;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = darkMode ? 'none' : '0 1px 4px rgba(0,0,0,0.08)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)';
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 shadow-md"
                style={{ background: card.gradient }}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>

              <span
                style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}
              >
                {card.label}
              </span>

              <p
                className="flex-1"
                style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 10, marginBottom: 14 }}
              >
                {card.description}
              </p>

              <div
                className="flex items-center gap-1.5 text-xs font-semibold group-hover:gap-2.5 transition-all"
                style={{ color: card.accent, fontSize: '13px' }}
              >
                {card.enterLabel}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <p
        className="relative mt-10 text-center"
        style={{ fontSize: '12px', color: 'var(--text-very-faint)' }}
      >
        {t.landing.footer}
      </p>
    </div>
  );
}
