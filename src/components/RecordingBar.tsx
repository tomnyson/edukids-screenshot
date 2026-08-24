import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface RecordingBarProps {
  onStop: () => void;
}

export default function RecordingBar({ onStop }: RecordingBarProps) {
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
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-red-900/50 z-10">
      <div className="flex items-center gap-3">
        {/* Blinking red dot */}
        <span className="relative flex h-3 w-3">
          {!isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isPaused ? 'bg-orange-500' : 'bg-red-600'}`} />
        </span>

        <span className={`${isPaused ? 'text-orange-400' : 'text-red-400'} font-semibold text-sm tracking-wide select-none`}>
          {isPaused ? 'PAUSED' : 'REC'}
        </span>

        {/* Timer */}
        <span className="text-white font-mono text-sm tracking-wider select-none tabular-nums">
          {mins}:{secs}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Pause/Resume button */}
        <button
          onClick={togglePause}
          className="flex items-center gap-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {isPaused ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Tiếp tục
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
              Tạm dừng
            </>
          )}
        </button>

        {/* Stop button */}
        <button
          onClick={onStop}
          className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="2" width="10" height="10" rx="1.5" />
          </svg>
          Dừng quay
        </button>
      </div>
    </div>
  );
}
