import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useT } from '../i18n';

/**
 * Live view of what ffmpeg is currently capturing.
 *
 * The backend pushes downscaled JPEG frames (~8fps) on `recording-preview-frame`.
 * Frames are written straight onto the <img> element rather than through React
 * state, so a running recording never triggers a render per frame.
 */
export default function RecordingLivePreview() {
  const t = useT();
  const imgRef = useRef<HTMLImageElement>(null);
  const hasFrameRef = useRef(false);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<string>('recording-preview-frame', (event) => {
      if (disposed || !event.payload) return;
      const img = imgRef.current;
      if (!img) return;

      img.src = event.payload;
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
      }
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((err) => console.error('Preview listener failed:', err));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <figure className="m-auto w-full max-w-3xl">
      <div className="relative rounded-[16px] bg-black overflow-hidden" style={{ boxShadow: '0 0 0 1px #3a1a20' }}>
        <img
          ref={imgRef}
          alt={t('live.alt')}
          className={`block w-full transition-opacity duration-300 ${hasFrame ? 'opacity-100' : 'opacity-0'}`}
        />

        {!hasFrame && (
          <div className="aspect-video flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
            <span className="w-8 h-8 rounded-full border-2 border-[var(--control)] border-t-[var(--rec)] animate-spin" />
            <span className="text-[13px]">{t('live.connecting')}</span>
          </div>
        )}

        {/* Live badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 h-7 px-3 rounded-full bg-black/75">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--rec)]" />
          <span className="text-[12px] font-semibold text-[var(--rec-ink)]">{t('live.badge')}</span>
        </div>
      </div>

      <figcaption className="mt-3 text-center text-[13px] text-[var(--faint)]">
        {t('live.caption')}
      </figcaption>
    </figure>
  );
}
