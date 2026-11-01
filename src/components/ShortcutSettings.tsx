import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Keyboard, RotateCcw, X } from 'lucide-react';

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
  const [items, setItems] = useState<ShortcutInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pressed, setPressed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    invoke<ShortcutInfo[]>('get_shortcut_settings').then(setItems).catch((e) => setError(String(e)));
  }, []);
  useEffect(load, [load]);

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
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => void close()}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-[420px] max-w-[92vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <Keyboard size={18} className="text-emerald-400" />
          <h2 className="text-base font-bold text-white">Cài đặt phím tắt</h2>
          <button onClick={() => void close()} className="ml-auto text-gray-400 hover:text-white cursor-pointer" title="Đóng">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Bấm <b>Đổi</b> rồi nhấn tổ hợp phím mới (cần có Ctrl hoặc Alt{isMac ? ' hoặc ⌘' : ''}; F1–F12 và PrtSc dùng riêng được). Esc để huỷ.
        </p>

        <div className="space-y-2">
          {items.map((it) => {
            const isEditing = editing === it.event;
            return (
              <div key={it.event} className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200">{it.name}</div>
                  {it.error && !isEditing && <div className="text-[11px] text-amber-400 truncate" title={it.error}>{it.error}</div>}
                </div>
                <kbd
                  className={`min-w-[96px] text-center text-xs px-2 py-1 rounded-md border font-mono ${
                    isEditing
                      ? 'border-emerald-500 text-emerald-300 animate-pulse'
                      : it.label ? 'border-gray-600 text-gray-100' : 'border-amber-600 text-amber-400'
                  }`}
                >
                  {isEditing ? (pressed || 'Nhấn phím…') : (it.label ?? 'Chưa có')}
                </kbd>
                {isEditing ? (
                  <button onClick={() => void stopEditing()} className="text-xs px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer">
                    Huỷ
                  </button>
                ) : (
                  <button
                    disabled={busy || editing !== null}
                    onClick={() => void startEditing(it.event)}
                    className="text-xs px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white cursor-pointer"
                  >
                    Đổi
                  </button>
                )}
                <button
                  disabled={busy || editing !== null || !it.isCustom}
                  onClick={() => void apply(it.event, null)}
                  title="Về mặc định"
                  className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-20 cursor-pointer"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {error && <div className="mt-3 text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}
      </div>
    </div>
  );
}
