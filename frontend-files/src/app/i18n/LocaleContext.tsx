import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { tr, type Translations } from '@/app/i18n/translations/tr';
import { en } from '@/app/i18n/translations/en';

export type Locale = 'tr' | 'en';

const STORAGE_KEY = 'optisched-lang';

function detectLocale(): Locale {
  // 1. localStorage preference
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tr' || saved === 'en') return saved;
  } catch { /* SSR / privacy mode */ }

  // 2. Browser language
  const browserLang = (navigator.language ?? 'en').toLowerCase();
  return browserLang.startsWith('tr') ? 'tr' : 'en';
}

const translationMap: Record<Locale, Translations> = { tr, en };

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'tr',
  setLocale: () => {},
  t: tr,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch { /* privacy mode */ }
    // Update HTML lang attribute
    document.documentElement.lang = newLocale;
  }, []);

  const t = useMemo(() => translationMap[locale], [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export type { Translations };
