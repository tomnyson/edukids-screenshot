import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';

export default function OverlayEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [overlayMode, setOverlayMode] = useState<'screenshot' | 'record'>('screenshot');

  useEffect(() => {
    let mounted = true;
    let unlistenRefresh: (() => void) | null = null;

    const fetchImg = async () => {
      try {
        const url = await invoke<string>('get_overlay_image');
        if (mounted && url) {
          setImageUrl(url);
          setIsDragging(false);
          setStartPos({ x: 0, y: 0 });
          setEndPos({ x: 0, y: 0 });
        }
        // Fetch overlay mode
        const mode = await invoke<string>('get_overlay_mode');
        if (mounted) {
          setOverlayMode(mode === 'record' ? 'record' : 'screenshot');
        }
      } catch (e) {
        console.error('Overlay failed to fetch image', e);
      }
    };

    fetchImg();

    listen('refresh-image', fetchImg).then(unlisten => {
      unlistenRefresh = unlisten;
    }).catch(console.error);

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        invoke('close_overlay', { dataUrl: null }).catch(console.error);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      mounted = false;
      window.removeEventListener('keydown', onEsc);
      if (unlistenRefresh) unlistenRefresh();
    };
  }, []);

  if (!imageUrl) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setEndPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setEndPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!isDragging) return;
    setIsDragging(false);

    const x = Math.min(startPos.x, endPos.x);
    const y = Math.min(startPos.y, endPos.y);
    const w = Math.abs(endPos.x - startPos.x);
    const h = Math.abs(endPos.y - startPos.y);

    if (w < 10 || h < 10) {
      await invoke('close_overlay', { dataUrl: null });
      return;
    }

    if (overlayMode === 'record') {
      // For recording: close overlay then emit coords to main window
      // We need to convert logical pixels to physical (Retina) pixels
      const scaleFactor = window.devicePixelRatio || 1;
      const physX = Math.round(x * scaleFactor);
      const physY = Math.round(y * scaleFactor);
      const physW = Math.round(w * scaleFactor);
      const physH = Math.round(h * scaleFactor);

      await invoke('close_overlay', { dataUrl: null });

      // Emit to main window to start recording with these coords
      await emit('region-record-start', {
        x: physX,
        y: physY,
        width: physW,
        height: physH,
      });
    } else {
      // Screenshot mode (existing behavior)
      try {
        const output = await invoke<string>('crop_overlay_selection', { x, y, width: w, height: h });
        await invoke('close_overlay', { dataUrl: output });
      } catch (error) {
        console.error('Failed to crop selected area', error);
        invoke('close_overlay', { dataUrl: null }).catch(console.error);
      }
    }
  };

  const rectLeft = Math.min(startPos.x, endPos.x);
  const rectTop = Math.min(startPos.y, endPos.y);
  const rectWidth = Math.abs(endPos.x - startPos.x);
  const rectHeight = Math.abs(endPos.y - startPos.y);

  const isRecord = overlayMode === 'record';

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: '100% 100%' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className={`absolute top-4 left-1/2 -translate-x-1/2 ${isRecord ? 'bg-red-900/80' : 'bg-black/60'} text-white px-4 py-2 rounded-full text-sm font-medium z-50 pointer-events-none`}>
        {isRecord
          ? 'Kéo thả để chọn vùng quay (ấn ESC để huỷ)'
          : 'Kéo thả để chọn vùng chụp (ấn ESC để huỷ)'
        }
      </div>

      {!isDragging && <div className="absolute inset-0 bg-black/40 pointer-events-none" />}
      {isDragging && (
        <>
          <div
            className={`absolute pointer-events-none ${isRecord ? 'border-2 border-red-500' : 'border border-white'}`}
            style={{
              left: rectLeft,
              top: rectTop,
              width: rectWidth,
              height: rectHeight,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
            }}
          />
          {/* Size indicator */}
          <div
            className="absolute pointer-events-none text-white text-xs bg-black/70 px-2 py-1 rounded"
            style={{
              left: rectLeft,
              top: rectTop + rectHeight + 8,
            }}
          >
            {Math.round(rectWidth)} × {Math.round(rectHeight)}
          </div>
        </>
      )}
    </div>
  );
}
