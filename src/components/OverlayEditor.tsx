import React, { useEffect, useState } from 'react';
import { storeImage, fetchImage } from '../idb';

export default function OverlayEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let mounted = true;
    if ((window as any).electronAPI?.getOverlayImage) {
      (window as any).electronAPI.getOverlayImage().then(async (url: string) => {
        if (url === 'use-idb') {
          try {
            url = await fetchImage();
          } catch (e) {
            console.error('Overlay failed to fetch image', e);
          }
        }
        if (mounted && url) setImageUrl(url);
      });
    }

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        (window as any).electronAPI?.closeOverlay(null);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      mounted = false;
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  if (!imageUrl) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setEndPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setEndPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = async () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const x = Math.min(startPos.x, endPos.x);
    const y = Math.min(startPos.y, endPos.y);
    const w = Math.abs(endPos.x - startPos.x);
    const h = Math.abs(endPos.y - startPos.y);

    if (w < 10 || h < 10) {
      (window as any).electronAPI?.closeOverlay(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Calculate exact scaling ratio between the screen space where user dragged
      // and the actual intrinsic resolution of the captured background image.
      const scaleX = img.width / window.innerWidth;
      const scaleY = img.height / window.innerHeight;

      const canvas = document.createElement('canvas');
      canvas.width = w * scaleX;
      canvas.height = h * scaleY;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(
          img, 
          x * scaleX, y * scaleY, w * scaleX, h * scaleY, 
          0, 0, canvas.width, canvas.height
        );
        const output = canvas.toDataURL('image/png', 1);
        storeImage(output).then(() => {
          (window as any).electronAPI?.closeOverlay('use-idb');
        }).catch(() => {
          (window as any).electronAPI?.closeOverlay(output);
        });
      } else {
        (window as any).electronAPI?.closeOverlay(null);
      }
    };
    img.onerror = () => {
      (window as any).electronAPI?.closeOverlay(null);
    };
    img.src = imageUrl;
  };

  const rectLeft = Math.min(startPos.x, endPos.x);
  const rectTop = Math.min(startPos.y, endPos.y);
  const rectWidth = Math.abs(endPos.x - startPos.x);
  const rectHeight = Math.abs(endPos.y - startPos.y);

  return (
    <div 
      className="fixed inset-0 cursor-crosshair select-none"
      style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: '100% 100%' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
