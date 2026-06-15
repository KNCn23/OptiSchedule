import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { Calendar, User, KeyRound, ArrowRight } from 'lucide-react';

export function LoginScreen() {
  const { darkMode, login } = useApp();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    try {
      const account = await login(id, password);
      if (account) {
        // Route to the portal that matches the role, so logging in from the
        // "wrong" portal card never leaves the user stuck on a login screen.
        navigate(account.role === 'instructor' ? '/academic' : '/admin');
      } else {
        setError(true);
        setTimeout(() => setError(false), 3000);
      }
    } catch {
      // Network/backend unavailable — surface the same inline error.
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Light-mode friendly colors ──
  const surface = 'var(--bg-page)';
  const cardBg = darkMode ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.85)';
  const inputBg = 'var(--bg-surface)';
  const textPrimary = 'var(--text-primary)';
  const textMuted = 'var(--text-muted)';
  const border = 'var(--border-light)';

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] relative overflow-x-hidden overflow-y-auto py-8" 
         style={{ backgroundColor: surface }}>
      
      {/* Background Decor */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="z-10 w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 shadow-xl"
               style={{ background: 'var(--brand-gradient)' }}>
            <Calendar className="w-8 h-8 text-white" />
          </div>
          {/* Single general title — role-based routing happens after login, so we
              don't split the screen into "admin" vs "academic" portals. */}
          <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: textPrimary }}>
            {t.login.title}
          </h1>
          <p style={{ fontSize: '14px', color: textMuted }}>
            {t.login.subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} 
              className="rounded-2xl border p-6 shadow-sm backdrop-blur-xl"
              style={{ backgroundColor: cardBg, borderColor: border }}>
          
          <div className="space-y-4">
            <div>
              <label className="block font-semibold mb-1.5 uppercase tracking-wider" 
                     style={{ fontSize: '12px', color: textMuted }}>
                {t.login.accountId}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors" 
                      style={{ color: id ? (darkMode ? '#60a5fa' : 'var(--brand-primary)') : textMuted }} />
                <input 
                  type="text"
                  required
                  value={id}
                  onChange={e => { setId(e.target.value); setError(false); }}
                  placeholder={t.login.placeholder}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all focus:ring-2 focus:ring-opacity-50 outline-none"
                  style={{
                    fontSize: '14px',
                    backgroundColor: inputBg,
                    color: textPrimary,
                    borderColor: error ? '#ef4444' : border,
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1.5 uppercase tracking-wider" 
                     style={{ fontSize: '12px', color: textMuted }}>
                {t.login.password}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors" 
                          style={{ color: password ? (darkMode ? '#60a5fa' : 'var(--brand-primary)') : textMuted }} />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(false); }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all focus:ring-2 focus:ring-opacity-50 outline-none"
                  style={{
                    fontSize: '14px',
                    backgroundColor: inputBg,
                    color: textPrimary,
                    borderColor: error ? '#ef4444' : border,
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-6 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-white transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              fontSize: '14px',
              background: 'var(--brand-gradient)',
            }}
          >
            {t.login.signIn}
            <ArrowRight className="w-4 h-4" />
          </button>

          {error && (
            <p className="mt-4 text-center text-red-500 animate-pulse font-medium" style={{ fontSize: '13px' }}>
              {t.login.invalidCredentials}
            </p>
          )}
        </form>

        <p className="mt-8 text-center" style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
          {t.login.disclaimer}
        </p>
      </div>
    </div>
  );
}
