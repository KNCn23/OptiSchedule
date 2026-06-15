import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { ApiError } from '@/app/services/apiClient';

interface DeleteScheduleModalProps {
  onClose: () => void;
}

export function DeleteScheduleModal({ onClose }: DeleteScheduleModalProps) {
  const { darkMode, deletePreviousSchedule, selectedTerm } = useApp();
  const { t } = useLocale();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeleting) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onClose]);

  async function handleDelete() {
    setIsDeleting(true);
    setError('');
    try {
      await deletePreviousSchedule();
      onClose();
    } catch (err) {
      console.error('Published schedules could not be deleted:', err);
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Oturumunuz geçersiz veya süresi dolmuş. Tekrar giriş yapın.'
          : err instanceof ApiError && err.status === 403
            ? 'Bu programı kaldırmak için yetkiniz bulunmuyor.'
            : t.admin.deletePreviousError,
      );
      setIsDeleting(false);
    }
  }

  const termLabel = selectedTerm === 'spring'
    ? t.academicYear.termSpring
    : t.academicYear.termFall;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={isDeleting ? undefined : onClose}
      />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: darkMode ? '#450a0a' : '#fee2e2', color: '#dc2626' }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {t.admin.deletePreviousTitle}
              </h3>
              <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>{termLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg p-1.5 disabled:opacity-50"
            aria-label={t.close}
          >
            <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {t.admin.deletePreviousDescription}
          </p>
          {error && (
            <div
              className="mt-4 rounded-lg border px-3 py-2 text-xs font-medium"
              style={{
                backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
                borderColor: darkMode ? '#7f1d1d' : '#fecaca',
                color: darkMode ? '#fca5a5' : '#b91c1c',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t px-5 py-4" style={{ borderColor: 'var(--border-light)' }}>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-mute)', color: 'var(--text-muted)' }}
          >
            {t.close}
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
            style={{ backgroundColor: '#dc2626' }}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeleting ? t.admin.deletePreviousDeleting : t.admin.deletePreviousConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
