import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Live view of what ffmpeg is currently capturing.
 *
 * The backend pushes downscaled JPEG frames (~8fps) on `recording-preview-frame`.
 * Frames are written straight onto the <img> element rather than through React
 * state, so a running recording never triggers a render per frame.
 */
export default function RecordingLivePreview() {
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
      <div className="relative rounded-2xl border border-red-900/60 bg-black overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        <img
          ref={imgRef}
          alt="Xem trước nội dung đang được quay"
          className={`block w-full transition-opacity duration-300 ${hasFrame ? 'opacity-100' : 'opacity-0'}`}
        />

        {!hasFrame && (
          <div className="aspect-video flex flex-col items-center justify-center gap-3 text-gray-500">
            <span className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-red-500 animate-spin" />
            <span className="text-xs tracking-wide">Đang kết nối luồng hình ảnh…</span>
          </div>
        )}

        {/* Live badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm border border-red-900/60">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
          </span>
          <span className="text-red-300 text-[10px] font-semibold uppercase tracking-[0.18em]">
            Trực tiếp
          </span>
        </div>
      </div>

      <figcaption className="mt-3 text-center text-xs text-gray-500">
        Đây là bản xem trước đã giảm chất lượng. Video lưu ra vẫn ở độ phân giải gốc, 30fps.
      </figcaption>
    </figure>
  );
}
