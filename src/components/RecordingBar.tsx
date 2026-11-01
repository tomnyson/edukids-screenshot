import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Pause, Play } from 'lucide-react';
import { isMac } from '../hooks/useShortcutLabels';
import { useT } from '../i18n';

interface RecordingBarProps {
  onStop: () => void;
}

export default function RecordingBar({ onStop }: RecordingBarProps) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused]);

  const togglePause = async () => {
    try {
      if (isPaused) {
        await invoke('resume_recording');
        setIsPaused(false);
      } else {
        await invoke('pause_recording');
        setIsPaused(true);
      }
    } catch (e) {
      console.error('Failed to toggle pause', e);
    }
  };

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-4 px-5 h-16 flex-shrink-0 border-b"
      style={{ background: '#1a0e12', borderColor: '#3a1a20' }}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3" aria-hidden>
          {!isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--rec)] opacity-60" />}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isPaused ? 'bg-[var(--moon)]' : 'bg-[var(--rec)]'}`} />
        </span>
        <span className="text-[15px] font-bold" style={{ color: isPaused ? 'var(--moon)' : 'var(--rec-ink)' }}>
          {isPaused ? t('recbar.paused') : t('recbar.recording')}
        </span>
        <span className="num text-[22px] font-semibold tracking-tight">{mins}:{secs}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Pause/resume uses SIGSTOP/SIGCONT and only exists on macOS. */}
        {isMac && (
          <button
            type="button"
            onClick={togglePause}
            className="h-10 px-4 rounded-full flex items-center gap-2 text-sm font-semibold cursor-pointer border bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--control)]"
          >
            {isPaused ? <><Play size={15} /> {t('recbar.resume')}</> : <><Pause size={15} /> {t('recbar.pause')}</>}
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          className="h-10 px-5 rounded-full flex items-center gap-2 text-sm font-bold cursor-pointer text-white bg-[var(--rec)] hover:bg-[#dc2626]"
        >
          <span className="w-3 h-3 rounded-[3px] bg-white" aria-hidden /> {t('recbar.stop')}
        </button>
      </div>
    </div>
  );
}
