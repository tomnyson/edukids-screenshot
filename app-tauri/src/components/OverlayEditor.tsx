import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { fetchImage } from '../idb';

export default function OverlayEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

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

    try {
      const output = await invoke<string>('crop_overlay_selection', { x, y, width: w, height: h });
      await invoke('close_overlay', { dataUrl: output });
    } catch (error) {
      console.error('Failed to crop selected area', error);
      invoke('close_overlay', { dataUrl: null }).catch(console.error);
    }
  };

  const rectLeft = Math.min(startPos.x, endPos.x);
  const rectTop = Math.min(startPos.y, endPos.y);
  const rectWidth = Math.abs(endPos.x - startPos.x);
  const rectHeight = Math.abs(endPos.y - startPos.y);

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: '100% 100%' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium z-50 pointer-events-none">
        Kéo thả để chọn vùng chụp (ấn ESC để huỷ)
      </div>

      {!isDragging && <div className="absolute inset-0 bg-black/40 pointer-events-none" />}
      {isDragging && (
        <div
          className="absolute border border-white pointer-events-none"
          style={{
            left: rectLeft,
            top: rectTop,
            width: rectWidth,
            height: rectHeight,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
          }}
        />
      )}
    </div>
  );
}
