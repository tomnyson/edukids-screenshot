import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import vi from './vi';
import en from './en';

export type Lang = 'vi' | 'en';
export type Key = keyof typeof vi;
type Params = Record<string, string | number>;

const DICTS: Record<Lang, Record<Key, string>> = { vi, en };
export const LANGS: { code: Lang; short: string; name: string }[] = [
  { code: 'vi', short: 'VI', name: 'Tiếng Việt' },
  { code: 'en', short: 'EN', name: 'English' },
];

function format(lang: Lang, key: Key, params?: Params): string {
  let s = DICTS[lang][key] ?? DICTS.vi[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// Module-level copy for code outside React (native update dialogs).
let currentLang: Lang = 'vi';
export const tStatic = (key: Key, params?: Params) => format(currentLang, key, params);

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: Key, params?: Params) => string };
const I18nContext = createContext<Ctx>({
  lang: 'vi',
  setLang: () => {},
  t: (key, params) => format('vi', key, params),
});

/**
 * Language comes from Rust (settings.json), so the main window, the region
 * overlay and the tray menu always agree. Vietnamese is the default.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('vi');

  const apply = useCallback((l: string) => {
    const next: Lang = l === 'en' ? 'en' : 'vi';
    currentLang = next;
    document.documentElement.lang = next;
    setLangState(next);
  }, []);

  useEffect(() => {
    invoke<string>('get_language').then(apply).catch(() => apply('vi'));
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string>('language-changed', (e) => apply(e.payload)).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [apply]);

  const setLang = useCallback((l: Lang) => {
    apply(l); // instant in this window; Rust saves it and tells the others
    invoke('set_language', { lang: l }).catch((err) => console.error('set_language failed', err));
  }, [apply]);

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (key, params) => format(lang, key, params) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext).t;
export const useLang = () => {
  const { lang, setLang } = useContext(I18nContext);
  return [lang, setLang] as const;
};
