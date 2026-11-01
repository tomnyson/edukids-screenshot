import { useRef, useCallback } from 'react';
import { useT } from '../i18n';

interface TrimTimelineProps {
  duration: number;
  start: number;
  end: number;
  current: number;
  onChange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
  disabled?: boolean;
}

const MIN_GAP = 0.2; // seconds

export function formatTime(t: number): string {
  if (!Number.isFinite(t)) return '--:--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Timeline with two drag handles (trim start / end) and a playhead. */
export default function TrimTimeline({ duration, start, end, current, onChange, onSeek, disabled }: TrimTimelineProps) {
  const tr = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  const timeAt = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const drag = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const t = timeAt(ev.clientX);
      if (which === 'start') {
        const s = Math.min(t, end - MIN_GAP);
        onChange(Math.max(0, s), end);
        onSeek(Math.max(0, s));
      } else {
        const en = Math.max(t, start + MIN_GAP);
        onChange(start, Math.min(duration, en));
        onSeek(Math.min(duration, en));
      }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const nudge = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 1 : 0.1;
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (which === 'start') onChange(Math.min(Math.max(0, start + dir * step), end - MIN_GAP), end);
    else onChange(start, Math.max(Math.min(duration, end + dir * step), start + MIN_GAP));
  };

  const handle = (which: 'start' | 'end', t: number) => (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={which === 'start' ? tr('trim.start') : tr('trim.end')}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={t}
      title={`${which === 'start' ? tr('trim.startShort') : tr('trim.endShort')}: ${formatTime(t)} ${tr('trim.help')}`}
      onPointerDown={drag(which)}
      onKeyDown={nudge(which)}
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-8 rounded-md bg-[var(--accent)] border-2 border-white
        focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${disabled ? 'opacity-50' : 'cursor-ew-resize'}`}
      style={{ left: `${pct(t)}%`, touchAction: 'none' }}
    />
  );

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className={`relative h-9 rounded-lg bg-[var(--raised)] ${disabled ? '' : 'cursor-pointer'}`}
        onPointerDown={(e) => { if (!disabled) onSeek(Math.min(Math.max(timeAt(e.clientX), start), end)); }}
      >
        {/* dimmed (cut) areas */}
        <div className="absolute inset-y-0 left-0 bg-black/50 rounded-l-md" style={{ width: `${pct(start)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-black/50 rounded-r-md" style={{ width: `${100 - pct(end)}%` }} />
        {/* kept range */}
        <div
          className="absolute inset-y-0 border-y-2 border-[var(--accent)] bg-[#6ea8ff26]"
          style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
        />
        {/* playhead */}
        <div className="absolute inset-y-0 w-0.5 bg-white pointer-events-none" style={{ left: `${pct(current)}%` }} />
        {handle('start', start)}
        {handle('end', end)}
      </div>
      <div className="flex justify-between mt-1 num text-[12px] text-[var(--muted)]">
        <span>{formatTime(start)}</span>
        <span className="text-[var(--text)] font-semibold">{formatTime(current)}</span>
        <span>{formatTime(end)}</span>
      </div>
    </div>
  );
}
