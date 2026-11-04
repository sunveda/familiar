import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { catalogs, type Locale, type MessageKey } from './messages';

type Vars = Record<string, string | number>;
interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const Ctx = createContext<I18n | null>(null);
const LKEY = 'familiar.dev.locale';

function initialLocale(): Locale {
  const saved = localStorage.getItem(LKEY);
  if (saved === 'en' || saved === 'ja') return saved;
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? initialLocale());
  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(LKEY, l);
    document.documentElement.lang = l;
    setLocaleState(l);
  }, []);
  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: (key, vars) => format(catalogs[locale][key], vars) }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
