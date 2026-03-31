import { useEffect, useState, useRef } from 'react';

interface RecordingBarProps {
  onStop: () => void;
}

export default function RecordingBar({ onStop }: RecordingBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-red-900/50 z-10">
      <div className="flex items-center gap-3">
        {/* Blinking red dot */}
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
        </span>

        <span className="text-red-400 font-semibold text-sm tracking-wide select-none">
          REC
        </span>

        {/* Timer */}
        <span className="text-white font-mono text-sm tracking-wider select-none tabular-nums">
          {mins}:{secs}
        </span>
      </div>

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
  );
}
