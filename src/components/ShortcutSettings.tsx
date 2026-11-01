import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Keyboard, RotateCcw } from 'lucide-react';
import { Dialog, DialogClose } from './AboutDialog';
import { useT, useLang } from '../i18n';

type ShortcutInfo = {
  event: string;
  name: string;
  accelerator: string | null;
  label: string | null;
  isCustom: boolean;
  error: string | null;
};

const isMac = navigator.userAgent.includes('Mac');
const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight',
]);

/** KeyboardEvent → accelerator string understood by the global-shortcut plugin. */
function toAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push(isMac ? 'Control' : 'Ctrl');
  if (e.metaKey) mods.push(isMac ? 'Command' : 'Super');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const standalone = /^F\d{1,2}$/.test(e.code) || e.code === 'PrintScreen';
  // Shift alone would hijack normal typing (Shift+A = "A") in every app.
  const hasStrongModifier = e.ctrlKey || e.altKey || e.metaKey;
  if (!hasStrongModifier && !standalone) return null;
  return [...mods, e.code].join('+');
}

/** Live preview of what the user is pressing, in OS notation. */
function previewLabel(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push(isMac ? '⌃' : 'Ctrl');
  if (e.metaKey) parts.push(isMac ? '⌘' : 'Win');
  if (e.altKey) parts.push(isMac ? '⌥' : 'Alt');
  if (e.shiftKey) parts.push(isMac ? '⇧' : 'Shift');
  if (!MODIFIER_CODES.has(e.code)) parts.push(e.code.replace(/^(Digit|Key)/, ''));
  return parts.join(isMac ? '' : '+');
}

export default function ShortcutSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [lang] = useLang();
  const [items, setItems] = useState<ShortcutInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pressed, setPressed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    invoke<ShortcutInfo[]>('get_shortcut_settings').then(setItems).catch((e) => setError(String(e)));
  }, []);
  // Reload on a language change too: the action names come from Rust.
  useEffect(load, [load, lang]);

  const stopEditing = useCallback(async () => {
    setEditing(null);
    setPressed('');
    await invoke('resume_shortcuts').catch(() => {});
    load();
  }, [load]);

  const startEditing = async (event: string) => {
    setError(null);
    setPressed('');
    // Release global shortcuts so pressing the current combo doesn't trigger a capture.
    await invoke('suspend_shortcuts').catch(() => {});
    setEditing(event);
  };

  const apply = useCallback(async (event: string, accelerator: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const next = await invoke<ShortcutInfo[]>('set_shortcut', { event, accelerator });
      setItems(next);
      setEditing(null);
      setPressed('');
    } catch (e) {
      setError(String(e));
      await invoke('resume_shortcuts').catch(() => {});
      setEditing(null);
      load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  // Capture the next key combination while editing.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        void stopEditing();
        return;
      }
      setPressed(previewLabel(e));
      const acc = toAccelerator(e);
      if (acc) void apply(editing, acc);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, apply, stopEditing]);

  // Never leave shortcuts suspended if the dialog closes mid-edit.
  const close = async () => {
    if (editing) await invoke('resume_shortcuts').catch(() => {});
    onClose();
  };

  return (
    <Dialog title={t('shortcuts.title')} onClose={() => void close()} width={500}>
      <div className="flex items-center gap-2.5 px-6 pt-5">
        <Keyboard size={20} className="text-[var(--accent)]" />
        <h2 className="text-[18px] font-bold">{t('shortcuts.title')}</h2>
        <span className="ml-auto"><DialogClose onClose={() => void close()} /></span>
      </div>
      <p className="px-6 mt-1.5 text-sm text-[var(--muted)]">
        {t('shortcuts.helpBefore')} <b className="text-[var(--text)]">{t('shortcuts.change')}</b> {t('shortcuts.helpAfter', { mac: isMac ? t('shortcuts.orCmd') : '' })}
      </p>

      <ul className="px-4 pt-4 pb-5 space-y-1.5">
        {items.map((it) => {
          const isEditing = editing === it.event;
          return (
            <li key={it.event} className={`flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 ${isEditing ? 'bg-[var(--active)]' : 'bg-[var(--raised)]'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium">{it.name}</div>
                {it.error && !isEditing && <div className="text-[12px] text-[var(--moon)] truncate" title={it.error}>{it.error}</div>}
              </div>
              <kbd
                className={`num min-w-[124px] h-8 inline-flex items-center justify-center px-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap ${isEditing ? 'animate-pulse' : ''}`}
                style={{
                  background: 'var(--ground)',
                  border: `1px solid ${isEditing ? 'var(--accent)' : it.label ? 'var(--control)' : 'var(--moon)'}`,
                  color: isEditing ? 'var(--accent)' : it.label ? 'var(--text)' : 'var(--moon)',
                }}
              >
                {isEditing ? (pressed || t('shortcuts.press')) : (it.label ?? t('shortcuts.none'))}
              </kbd>
              {isEditing ? (
                <button type="button" onClick={() => void stopEditing()}
                  className="h-8 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer bg-[var(--hover)] hover:bg-[var(--control)]">
                  {t('common.cancel')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || editing !== null}
                  onClick={() => void startEditing(it.event)}
                  className="h-8 px-3.5 rounded-full text-[13px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-40"
                >
                  {t('shortcuts.change')}
                </button>
              )}
              <button
                type="button"
                disabled={busy || editing !== null || !it.isCustom}
                onClick={() => void apply(it.event, null)}
                title={t('shortcuts.reset')}
                aria-label={t('shortcuts.resetAria', { name: it.name })}
                className="w-8 h-8 grid place-items-center rounded-full cursor-pointer text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-25"
              >
                <RotateCcw size={15} />
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <div role="alert" className="mx-6 mb-5 -mt-1 text-sm rounded-[var(--radius-control)] px-3.5 py-2.5" style={{ background: '#2a1416', color: 'var(--rec-ink)' }}>
          {error}
        </div>
      )}
    </Dialog>
  );
}
