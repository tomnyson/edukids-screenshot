import { useEffect, useRef, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import TrimTimeline, { formatTime } from './TrimTimeline';
import { Scissors, Gauge, FileVideo, VolumeX, Trash2, Download, Loader2, X, TriangleAlert } from 'lucide-react';

interface RecordingPreviewProps {
  filePath: string;
  onClose: () => void;
}

type Format = 'mp4' | 'gif';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const GIF_WARN_SECONDS = 30;

export default function RecordingPreview({ filePath, onClose }: RecordingPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSrc = convertFileSrc(filePath);

  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mute, setMute] = useState(false);
  const [format, setFormat] = useState<Format>('mp4');

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outDuration = Math.max(0, (end - start) / speed);
  const unchanged =
    duration > 0 && start <= 0.05 && end >= duration - 0.05 && speed === 1 && !mute && format === 'mp4';

  // Preview reflects the options without re-encoding.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    v.muted = mute || format === 'gif';
  }, [speed, mute, format]);

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    setDuration(d);
    setStart(0);
    setEnd(d);
  };

  // Keep playback inside the trimmed range (loops).
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (end > 0 && (v.currentTime >= end || v.currentTime < start - 0.05)) {
      v.currentTime = start;
    }
    setCurrent(v.currentTime);
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrent(t);
  };

  const setStartHere = () => setStart(Math.min(current, end - 0.2));
  const setEndHere = () => setEnd(Math.max(current, start + 0.2));
  const resetTrim = () => { setStart(0); setEnd(duration); };

  const discard = async () => {
    try { await invoke('discard_recording', { sourcePath: filePath }); } catch (err) { console.error('Discard failed:', err); }
    onClose();
  };

  const handleSave = async () => {
    setError(null);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');

    // Nothing edited → fast path: just move the file (no re-encode).
    if (unchanged) {
      setBusy(true);
      try {
        const saved = await invoke<boolean>('save_recording', {
          sourcePath: filePath,
          defaultName: `Recording-${dateStr}.mp4`,
        });
        if (saved) onClose();
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    const dest = await save({
      defaultPath: `Recording-${dateStr}.${format}`,
      filters: [{ name: format === 'gif' ? 'GIF' : 'Video MP4', extensions: [format] }],
    });
    if (!dest) return;

    videoRef.current?.pause();
    setBusy(true);
    setProgress(0);
    const unlisten = await listen<number>('export-progress', (e) => setProgress(e.payload));
    try {
      await invoke('export_recording', {
        sourcePath: filePath,
        destPath: dest,
        options: { start, end, speed, mute: mute || format === 'gif', format },
      });
      await invoke('discard_recording', { sourcePath: filePath }).catch(() => {});
      onClose();
    } catch (err) {
      const msg = String(err);
      if (!msg.includes('Đã huỷ')) setError(msg);
    } finally {
      unlisten();
      setBusy(false);
      setProgress(null);
    }
  };

  const cancelExport = () => { invoke('cancel_export').catch(() => {}); };

  const chip = (active: boolean) =>
    `h-8 px-3 rounded-full text-[13px] font-semibold cursor-pointer disabled:opacity-40 ${
      active ? 'bg-[var(--active)] text-[var(--text)] shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-[var(--raised)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
    }`;

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/65">
      <div
        className="border rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,.5)] max-w-3xl w-full mx-4 overflow-hidden max-h-[95vh] flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--rec)]" aria-hidden />
            <h2 className="font-bold text-[17px]">Xem lại & chỉnh video</h2>
          </div>
          <button
            onClick={discard}
            disabled={busy}
            className="w-8 h-8 grid place-items-center rounded-full cursor-pointer text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-30"
            title="Đóng (bỏ video)"
          >
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto">
          {/* Video player */}
          <div className="p-4 pb-2">
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              autoPlay
              onLoadedMetadata={onLoaded}
              onTimeUpdate={onTimeUpdate}
              className="w-full rounded-[12px] bg-black"
              style={{ maxHeight: '360px' }}
            />
          </div>

          {/* Trim */}
          <div className="px-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold flex items-center gap-1.5"><Scissors size={16} className="text-[var(--accent)]" /> Cắt video</span>
              <div className="flex gap-1.5">
                <button className={chip(false)} disabled={busy || !duration} onClick={setStartHere}>⇤ Đặt đầu tại đây</button>
                <button className={chip(false)} disabled={busy || !duration} onClick={setEndHere}>Đặt cuối tại đây ⇥</button>
                <button className={chip(false)} disabled={busy || !duration} onClick={resetTrim} title="Bỏ cắt">↺</button>
              </div>
            </div>
            {duration > 0 ? (
              <TrimTimeline
                duration={duration}
                start={start}
                end={end}
                current={current}
                onChange={(s, e) => { setStart(s); setEnd(e); }}
                onSeek={seek}
                disabled={busy}
              />
            ) : (
              <div className="h-8 rounded-md bg-[var(--raised)]" />
            )}
          </div>

          {/* Options */}
          <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5"><Gauge size={16} className="text-[var(--accent)]" /> Tốc độ</div>
              <div className="flex flex-wrap gap-1">
                {SPEEDS.map((s) => (
                  <button key={s} className={chip(speed === s)} disabled={busy} onClick={() => setSpeed(s)}>{s}x</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5"><FileVideo size={16} className="text-[var(--accent)]" /> Định dạng</div>
              <div className="flex items-center gap-1">
                <button className={chip(format === 'mp4')} disabled={busy} onClick={() => setFormat('mp4')}>MP4</button>
                <button className={chip(format === 'gif')} disabled={busy} onClick={() => setFormat('gif')}>GIF</button>
                <label className={`ml-3 flex items-center gap-1.5 text-[13px] font-medium cursor-pointer ${format === 'gif' ? 'text-[var(--faint)]' : 'text-[var(--text)]'}`}>
                  <input
                    type="checkbox"
                    checked={mute || format === 'gif'}
                    disabled={busy || format === 'gif'}
                    onChange={(e) => setMute(e.target.checked)}
                    className="w-4 h-4 accent-[#2563eb]"
                  />
                  <VolumeX size={15} /> Tắt tiếng
                </label>
              </div>
            </div>
          </div>

          <div className="px-5 pb-3 text-[13px] text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1">
            <span>Độ dài sau khi xuất: <b className="num text-[var(--text)]">{formatTime(outDuration)}</b></span>
            {unchanged && <span className="text-[var(--faint)]">Chưa chỉnh gì: bấm Lưu sẽ lưu ngay, không cần xuất lại</span>}
            {format === 'gif' && outDuration > GIF_WARN_SECONDS && (
              <span className="text-[var(--moon)] flex items-center gap-1"><TriangleAlert size={14} /> GIF dài hơn {GIF_WARN_SECONDS}s sẽ rất nặng, nên cắt ngắn hoặc dùng MP4</span>
            )}
          </div>

          {progress !== null && (
            <div className="px-5 pb-2 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-[var(--raised)] overflow-hidden">
                <div className="h-full bg-[var(--primary)] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="num text-[13px] font-semibold w-10 text-right">{Math.round(progress * 100)}%</span>
              <button onClick={cancelExport} className="h-8 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer bg-[var(--hover)] hover:bg-[var(--control)]">Huỷ</button>
            </div>
          )}

          {error && (
            <div className="mx-5 mb-3 text-[13px] rounded-[var(--radius-control)] px-3.5 py-2.5 whitespace-pre-wrap break-words select-text" style={{ background: '#2a1416', color: 'var(--rec-ink)' }} role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={discard}
            disabled={busy}
            className="h-11 px-5 rounded-full flex items-center gap-2 text-[15px] font-semibold cursor-pointer border bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--control)] disabled:opacity-40"
          >
            <Trash2 size={17} /> Bỏ video
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !duration}
            className="h-11 px-6 rounded-full flex items-center gap-2 text-[15px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {busy ? <><Loader2 size={17} className="animate-spin" /> {progress !== null ? 'Đang xuất…' : 'Đang lưu…'}</> : <><Download size={17} /> {format === 'gif' ? 'Xuất GIF' : 'Lưu video'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
