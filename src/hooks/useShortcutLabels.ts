import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Shortcut labels actually registered by the backend (OS notation: "Ctrl+Shift+2" / "⌘⇧2"). */
export function useShortcutLabels(): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () => {
      invoke<Record<string, string>>('get_shortcut_labels').then(setLabels).catch(() => {});
    };
    load();
    // Refresh when the user changes shortcuts in settings.
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen('shortcuts-changed', load).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  return labels;
}

export const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
