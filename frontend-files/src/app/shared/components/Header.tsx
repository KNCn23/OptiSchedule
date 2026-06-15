import { Moon, Sun, Calendar, LogOut, BookOpen, BarChart3 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { useState } from 'react';

export function Header() {
  const { darkMode, toggleDarkMode, currentUser, logout, publishedAt } = useApp();
  const { locale, setLocale, t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isLanding = location.pathname === '/';

  async function handleLogout() {
    await logout();
    setUserMenuOpen(false);
    navigate('/');
  }

  // ── Themed via CSS variables (light = Başkent palette, dark = original) ──
  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const textPrimary = 'var(--text-primary)';
  const textMuted = 'var(--text-muted)';
  const pillBg = 'var(--bg-mute)';

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-5 h-14 border-b"
      style={{ backgroundColor: surface, borderColor: border }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 select-none transition-transform hover:scale-105"
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
          style={{ background: 'var(--logo-gradient)' }}
        >
          <Calendar className="w-4 h-4 text-white" />
        </div>
        <span className="flex flex-col leading-tight min-w-0 text-left">
          <span
            className="tracking-tight truncate"
            style={{ fontSize: '13px', fontWeight: 700, color: textPrimary }}
          >
            {t.brandUniversity}
          </span>
          <span
            className="hidden lg:block truncate"
            style={{ fontSize: '10px', color: textMuted }}
          >
            {t.brandSystem}
          </span>
        </span>
        <span
          className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
          style={{ backgroundColor: pillBg, color: textMuted }}
        >
          {t.beta}
        </span>
      </button>

      {/* Nav links (non-landing) */}
      {!isLanding && currentUser && (
        <nav className="hidden md:flex items-center gap-2">
          <button
            onClick={() => {
              if (currentUser.role === 'instructor') navigate('/academic');
              else navigate('/admin');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              fontSize: '13px',
              backgroundColor:
                location.pathname === '/admin' || location.pathname === '/academic'
                  ? darkMode ? '#1e293b' : '#f0f0f0'
                  : 'transparent',
              color:
                location.pathname === '/admin' || location.pathname === '/academic'
                  ? textPrimary : textMuted,
            }}
          >
            {t.header.dashboard}
          </button>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: border }} />

          <button
            onClick={() => navigate('/reservations')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              fontSize: '13px',
              backgroundColor:
                location.pathname === '/reservations'
                  ? darkMode ? '#312e81' : 'var(--brand-primary-soft)'
                  : 'transparent',
              color:
                location.pathname === '/reservations'
                  ? darkMode ? '#a5b4fc' : 'var(--brand-primary-active)'
                  : textMuted,
            }}
          >
            <Calendar className="w-3.5 h-3.5" />
            {t.header.reservations}
          </button>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: border }} />

          <button
            onClick={() => navigate('/courses')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              fontSize: '13px',
              backgroundColor:
                location.pathname === '/courses'
                  ? darkMode ? '#1e3a5f' : 'var(--brand-primary-soft)'
                  : 'transparent',
              color:
                location.pathname === '/courses'
                  ? darkMode ? '#60a5fa' : 'var(--brand-primary)'
                  : textMuted,
            }}
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t.header.courses}
          </button>

          {currentUser.role !== 'instructor' && (
            <>
              <div className="w-px h-5 mx-1" style={{ backgroundColor: border }} />
              <button
                onClick={() => navigate('/reports')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  fontSize: '13px',
                  backgroundColor: location.pathname === '/reports' ? 'var(--brand-primary-soft)' : 'transparent',
                  color: location.pathname === '/reports' ? 'var(--brand-primary)' : textMuted,
                }}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                {t.header.reports}
              </button>
            </>
          )}
        </nav>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Published badge — only while signed in */}
        {publishedAt && currentUser && (
          <span
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              fontSize: '13px',
              backgroundColor: darkMode ? '#052e16' : '#dcfce7',
              color: darkMode ? '#4ade80' : '#166534',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {t.published}
          </span>
        )}

        {/* Language toggle */}
        <button
          onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-[11px] font-bold"
          style={{ backgroundColor: pillBg, color: textMuted }}
          title={locale === 'tr' ? 'Switch to English' : 'Türkçeye Geç'}
        >
          {locale === 'tr' ? 'EN' : 'TR'}
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ backgroundColor: pillBg, color: textMuted }}
          title={darkMode ? t.header.lightMode : t.header.darkMode}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User avatar & Menu */}
        {!isLanding && currentUser && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-full transition-colors group"
              style={{
                backgroundColor: pillBg,
                border: `1px solid ${border}`,
              }}
            >
              <span className="text-xs font-semibold max-w-[120px] truncate" style={{ color: textPrimary, fontSize: '13px' }}>
                {currentUser.full_name}
              </span>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                style={{ background: 'var(--brand-gradient)' }}
              >
                {currentUser.full_name.charAt(0).toUpperCase()}
              </div>
            </button>
            {userMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-xl shadow-xl border py-1.5 z-50 overflow-hidden"
                style={{ backgroundColor: surface, borderColor: border }}
              >
                <div className="px-3 py-2 border-b mb-1" style={{ borderColor: border }}>
                  <p className="text-xs font-semibold truncate" style={{ color: textPrimary, fontSize: '13px' }}>{currentUser.full_name}</p>
                  <p className="truncate mt-0.5" style={{ fontSize: '11px', color: textMuted }}>
                    {t.roles[currentUser.role] ?? currentUser.role}
                  </p>
                </div>
                
                {/* Mobile Nav Links */}
                <div className="md:hidden">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      if (currentUser.role === 'instructor') navigate('/academic');
                      else navigate('/admin');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium transition-colors hover:opacity-80"
                    style={{ color: textPrimary, fontSize: '13px' }}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {t.header.dashboard}
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/reservations'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium transition-colors hover:opacity-80"
                    style={{ color: textPrimary, fontSize: '13px' }}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {t.header.reservations}
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/courses'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium transition-colors hover:opacity-80"
                    style={{ color: textPrimary, fontSize: '13px' }}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {t.header.courses}
                  </button>
                  {currentUser.role !== 'instructor' && (
                    <button
                      onClick={() => { setUserMenuOpen(false); navigate('/reports'); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium transition-colors hover:opacity-80"
                      style={{ color: textPrimary, fontSize: '13px' }}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      {t.header.reports}
                    </button>
                  )}
                  <div className="mx-3 my-1 border-t" style={{ borderColor: border }} />
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between px-3 py-2 text-left font-semibold transition-colors hover:bg-red-500/10 text-red-500"
                  style={{ fontSize: '13px' }}
                >
                  {t.header.signOut}
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
