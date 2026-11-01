import React, { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { useT } from '../i18n';

export default function OverlayEditor() {
  const t = useT();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [overlayMode, setOverlayMode] = useState<'screenshot' | 'record'>('screenshot');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '16:9' | '9:16'>('free');

  // Use refs for interaction state to avoid stale closures in window-level listeners
  const interactionRef = useRef<'creating' | 'resizing' | 'moving' | 'idle'>('idle');
  const activeHandleRef = useRef<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartRect = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const rectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const aspectRatioRef = useRef<'free' | '16:9' | '9:16'>('free');
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayModeRef = useRef<'screenshot' | 'record'>('screenshot');

  // Keep refs in sync with state
  useEffect(() => { rectRef.current = rect; }, [rect]);
  useEffect(() => { aspectRatioRef.current = aspectRatio; }, [aspectRatio]);
  useEffect(() => { overlayModeRef.current = overlayMode; }, [overlayMode]);

  // Helper to update both state and ref for interaction mode
  const setInteractionMode = useCallback((mode: 'creating' | 'resizing' | 'moving' | 'idle') => {
    interactionRef.current = mode;
  }, []);

  const setActiveHandle = useCallback((handle: string | null) => {
    activeHandleRef.current = handle;
  }, []);

  // Force re-render trigger (interaction mode is in ref, so we need this for UI updates)
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    let mounted = true;
    let unlistenRefresh: (() => void) | null = null;

    const fetchImg = async () => {
      try {
        const url = await invoke<string>('get_overlay_image');
        if (mounted && url) {
          setImageUrl(url);
          setRect(null);
          interactionRef.current = 'idle';
          activeHandleRef.current = null;

          const img = new Image();
          img.src = url;
          img.onload = () => {
            imgRef.current = img;
          };
        }
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

    return () => {
      mounted = false;
      if (unlistenRefresh) unlistenRefresh();
    };
  }, []);

  // Keyboard handler — separate effect to avoid re-registering on every rect change
  const handleConfirmRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        invoke('close_overlay', { dataUrl: null }).catch(console.error);
      } else if (e.key === 'Enter') {
        handleConfirmRef.current?.();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // Magnifier drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const zoom = 2.5;
    const sWidth = canvas.width / zoom;
    const sHeight = canvas.height / zoom;
    const sx = cursorPos.x - sWidth / 2;
    const sy = cursorPos.y - sHeight / 2;

    ctx.drawImage(
      imgRef.current,
      sx, sy, sWidth, sHeight,
      0, 0, canvas.width, canvas.height
    );
  }, [cursorPos, imageUrl]);

  // Window-level pointermove/pointerup handlers for drag operations
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      const mode = interactionRef.current;
      if (mode === 'idle') return;

      const clientX = e.clientX;
      const clientY = e.clientY;
      setCursorPos({ x: clientX, y: clientY });

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const currentAspect = aspectRatioRef.current;

      if (mode === 'creating') {
        let newX = Math.min(dragStartPos.current.x, clientX);
        let newY = Math.min(dragStartPos.current.y, clientY);
        let w = Math.abs(clientX - dragStartPos.current.x);
        let h = Math.abs(clientY - dragStartPos.current.y);

        if (currentAspect !== 'free') {
          const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
          if (w / targetRatio > h) {
            h = w / targetRatio;
          } else {
            w = h * targetRatio;
          }
        }

        if (clientX < dragStartPos.current.x) {
          newX = dragStartPos.current.x - w;
        }
        if (clientY < dragStartPos.current.y) {
          newY = dragStartPos.current.y - h;
        }

        setRect({ x: newX, y: newY, w, h });
      } else if (mode === 'moving') {
        const dx = clientX - dragStartPos.current.x;
        const dy = clientY - dragStartPos.current.y;

        let newX = dragStartRect.current.x + dx;
        let newY = dragStartRect.current.y + dy;

        newX = Math.max(0, Math.min(screenW - dragStartRect.current.w, newX));
        newY = Math.max(0, Math.min(screenH - dragStartRect.current.h, newY));

        setRect({
          x: newX,
          y: newY,
          w: dragStartRect.current.w,
          h: dragStartRect.current.h,
        });
      } else if (mode === 'resizing') {
        const handle = activeHandleRef.current;
        if (!handle) return;

        const dx = clientX - dragStartPos.current.x;
        const dy = clientY - dragStartPos.current.y;

        let { x, y, w, h } = dragStartRect.current;

        switch (handle) {
          case 'top-left': {
            let newX = Math.max(0, Math.min(dragStartRect.current.x + dragStartRect.current.w - 10, dragStartRect.current.x + dx));
            let newW = dragStartRect.current.x + dragStartRect.current.w - newX;
            let newY = Math.max(0, Math.min(dragStartRect.current.y + dragStartRect.current.h - 10, dragStartRect.current.y + dy));
            let newH = dragStartRect.current.y + dragStartRect.current.h - newY;
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              if (newW / targetRatio > newH) { newH = newW / targetRatio; newY = dragStartRect.current.y + dragStartRect.current.h - newH; }
              else { newW = newH * targetRatio; newX = dragStartRect.current.x + dragStartRect.current.w - newW; }
            }
            x = newX; w = newW; y = newY; h = newH;
            break;
          }
          case 'top': {
            let newY = Math.max(0, Math.min(dragStartRect.current.y + dragStartRect.current.h - 10, dragStartRect.current.y + dy));
            let newH = dragStartRect.current.y + dragStartRect.current.h - newY;
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              w = newH * targetRatio;
            }
            y = newY; h = newH;
            break;
          }
          case 'top-right': {
            let newY = Math.max(0, Math.min(dragStartRect.current.y + dragStartRect.current.h - 10, dragStartRect.current.y + dy));
            let newH = dragStartRect.current.y + dragStartRect.current.h - newY;
            let newW = Math.max(10, Math.min(screenW - dragStartRect.current.x, dragStartRect.current.w + dx));
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              if (newW / targetRatio > newH) { newH = newW / targetRatio; newY = dragStartRect.current.y + dragStartRect.current.h - newH; }
              else { newW = newH * targetRatio; }
            }
            y = newY; h = newH; w = newW;
            break;
          }
          case 'right': {
            w = Math.max(10, Math.min(screenW - dragStartRect.current.x, dragStartRect.current.w + dx));
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              h = w / targetRatio;
            }
            break;
          }
          case 'bottom-right': {
            let newW = Math.max(10, Math.min(screenW - dragStartRect.current.x, dragStartRect.current.w + dx));
            let newH = Math.max(10, Math.min(screenH - dragStartRect.current.y, dragStartRect.current.h + dy));
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              if (newW / targetRatio > newH) { newH = newW / targetRatio; }
              else { newW = newH * targetRatio; }
            }
            w = newW; h = newH;
            break;
          }
          case 'bottom': {
            h = Math.max(10, Math.min(screenH - dragStartRect.current.y, dragStartRect.current.h + dy));
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              w = h * targetRatio;
            }
            break;
          }
          case 'bottom-left': {
            let newX = Math.max(0, Math.min(dragStartRect.current.x + dragStartRect.current.w - 10, dragStartRect.current.x + dx));
            let newW = dragStartRect.current.x + dragStartRect.current.w - newX;
            let newH = Math.max(10, Math.min(screenH - dragStartRect.current.y, dragStartRect.current.h + dy));
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              if (newW / targetRatio > newH) { newH = newW / targetRatio; }
              else { newW = newH * targetRatio; newX = dragStartRect.current.x + dragStartRect.current.w - newW; }
            }
            x = newX; w = newW; h = newH;
            break;
          }
          case 'left': {
            let newX = Math.max(0, Math.min(dragStartRect.current.x + dragStartRect.current.w - 10, dragStartRect.current.x + dx));
            let newW = dragStartRect.current.x + dragStartRect.current.w - newX;
            if (currentAspect !== 'free') {
              const targetRatio = currentAspect === '16:9' ? 16 / 9 : 9 / 16;
              h = newW / targetRatio;
            }
            x = newX; w = newW;
            break;
          }
        }

        setRect({ x, y, w, h });
      }
    };

    const handleWindowPointerUp = () => {
      const mode = interactionRef.current;
      if (mode === 'idle') return;

      if (mode === 'creating') {
        const r = rectRef.current;
        if (r && (r.w < 10 || r.h < 10)) {
          setRect(null);
        }
      }

      interactionRef.current = 'idle';
      activeHandleRef.current = null;
      forceUpdate(n => n + 1);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, []);

  if (!imageUrl) return null;

  const handleConfirm = async () => {
    const activeRect = rectRef.current;
    if (!activeRect || activeRect.w < 5 || activeRect.h < 5) return;

    if (overlayModeRef.current === 'record') {
      const scaleFactor = window.devicePixelRatio || 1;
      const physX = Math.round(activeRect.x * scaleFactor);
      const physY = Math.round(activeRect.y * scaleFactor);
      const physW = Math.round(activeRect.w * scaleFactor);
      const physH = Math.round(activeRect.h * scaleFactor);

      // FIX: Emit the event FIRST, then close overlay.
      // This prevents the race condition where close_overlay hides the window
      // before the event reaches the main window.
      await emit('region-record-start', {
        x: physX,
        y: physY,
        width: physW,
        height: physH,
      });
      // Small delay to ensure event is processed before overlay closes
      await new Promise(resolve => setTimeout(resolve, 100));
      await invoke('close_overlay', { dataUrl: null });
    } else {
      try {
        const output = await invoke<string>('crop_overlay_selection', {
          x: activeRect.x,
          y: activeRect.y,
          width: activeRect.w,
          height: activeRect.h,
        });
        await invoke('close_overlay', { dataUrl: output });
      } catch (error) {
        console.error('Failed to crop selected area', error);
        invoke('close_overlay', { dataUrl: null }).catch(console.error);
      }
    }
  };

  // Keep handleConfirmRef up to date
  handleConfirmRef.current = handleConfirm;

  const handleCopy = async () => {
    if (!rect || rect.w < 5 || rect.h < 5) return;
    try {
      const output = await invoke<string>('crop_overlay_selection', {
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
      });
      await invoke('copy_image', { dataUrl: output });
      await invoke('close_overlay', { dataUrl: null });
    } catch (error) {
      console.error('Failed to copy cropped area', error);
      invoke('close_overlay', { dataUrl: null }).catch(console.error);
    }
  };

  const handleCancel = async () => {
    await invoke('close_overlay', { dataUrl: null });
  };

  // Backdrop pointer down — only starts new selection when clicking on empty area
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setCursorPos({ x: e.clientX, y: e.clientY });

    // Start new selection (backdrop was clicked, not a handle/selection)
    interactionRef.current = 'creating';
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    forceUpdate(n => n + 1);
  };

  // Track cursor for magnifier even when idle
  const handlePointerMovePassive = (e: React.PointerEvent<HTMLDivElement>) => {
    setCursorPos({ x: e.clientX, y: e.clientY });
  };

  // Resize handle — starts resize mode (uses window listeners for tracking)
  const startResize = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!rect) return;
    interactionRef.current = 'resizing';
    activeHandleRef.current = handle;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartRect.current = { ...rect };
    forceUpdate(n => n + 1);
  };

  // Move handle — starts move mode (uses window listeners for tracking)
  const startMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!rect) return;
    interactionRef.current = 'moving';
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartRect.current = { ...rect };
    forceUpdate(n => n + 1);
  };

  const isRecord = overlayMode === 'record';
  const interactionMode = interactionRef.current;

  // Calculate coordinates and toolbar position
  const showSelection = rect && rect.w > 0 && rect.h > 0;
  const rectLeft = rect ? rect.x : 0;
  const rectTop = rect ? rect.y : 0;
  const rectWidth = rect ? rect.w : 0;
  const rectHeight = rect ? rect.h : 0;

  // Position Action Toolbar below/above/inside the selection
  const toolbarWidth = isRecord ? 340 : 360;
  const space = 12;
  let toolbarTop = rectTop + rectHeight + space;
  let toolbarLeft = rectLeft + rectWidth / 2 - toolbarWidth / 2;

  if (toolbarTop + 54 > window.innerHeight) {
    toolbarTop = rectTop - 54 - space;
  }
  if (toolbarTop < 0) {
    toolbarTop = rectTop + rectHeight - 54 - space;
  }
  toolbarLeft = Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, toolbarLeft));

  // Determine magnifier position offset from cursor so it is visible
  let loupeLeft = cursorPos.x + 20;
  let loupeTop = cursorPos.y - 150;
  if (loupeLeft + 130 > window.innerWidth) {
    loupeLeft = cursorPos.x - 140;
  }
  if (loupeTop < 10) {
    loupeTop = cursorPos.y + 20;
  }

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none bg-black/40"
      style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: '100% 100%' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMovePassive}
    >
      {/* Top Banner Guide */}
      <div className={`absolute top-4 left-1/2 -translate-x-1/2 ${isRecord ? 'bg-[var(--rec)]' : 'bg-[var(--surface)]'} text-white px-5 py-2 rounded-full text-[14px] font-semibold z-50 border ${isRecord ? 'border-transparent' : 'border-[var(--border)]'} transition-all pointer-events-none`}>
        {isRecord
          ? t('overlay.hintRecord')
          : t('overlay.hintCapture')
        }
      </div>

      {/* Loupe / Magnifier */}
      {interactionMode !== 'idle' && (
        <div
          className="absolute w-[120px] h-[120px] border-4 border-white shadow-2xl rounded-full overflow-hidden z-50 pointer-events-none bg-gray-950/80 flex items-center justify-center"
          style={{ left: loupeLeft, top: loupeTop }}
        >
          <canvas
            ref={canvasRef}
            width={112}
            height={112}
            className="w-full h-full rounded-full"
          />
          {/* Magnifier Grid/Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute w-full h-[1px] bg-red-500/40" />
            <div className="absolute h-full w-[1px] bg-red-500/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
          </div>
          {/* Zoom Level Indicator */}
          <div className="absolute bottom-1 bg-black/75 px-1.5 py-0.5 rounded text-[11px] num text-white leading-none">
            2.5X
          </div>
        </div>
      )}

      {/* Selected Box Area */}
      {showSelection && (
        <>
          <div
            className={`absolute pointer-events-auto select-none ${isRecord ? 'border-2 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]' : 'border-2 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]'}`}
            style={{
              left: rectLeft,
              top: rectTop,
              width: rectWidth,
              height: rectHeight,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
              cursor: interactionMode === 'idle' ? 'move' : 'crosshair',
            }}
            onPointerDown={startMove}
            onDoubleClick={handleConfirm}
          >
            {/* Dimensions tooltip */}
            <div className={`absolute -top-6 left-0 px-2 py-0.5 ${isRecord ? 'bg-red-500' : 'bg-[var(--primary)]'} num text-[12px] font-bold text-white rounded shadow-sm pointer-events-none`}>
              {Math.round(rectWidth)} × {Math.round(rectHeight)}
            </div>

            {/* Corner Resize Handles */}
            <div
              className={`absolute w-3.5 h-3.5 bg-white border-2 ${isRecord ? 'border-red-500 hover:bg-red-50' : 'border-blue-500 hover:bg-blue-50'} rounded-full shadow-md z-40 -top-1.5 -left-1.5 cursor-nwse-resize transition-transform hover:scale-125`}
              onPointerDown={(e) => startResize(e, 'top-left')}
            />
            <div
              className={`absolute w-3.5 h-3.5 bg-white border-2 ${isRecord ? 'border-red-500 hover:bg-red-50' : 'border-blue-500 hover:bg-blue-50'} rounded-full shadow-md z-40 -top-1.5 -right-1.5 cursor-nesw-resize transition-transform hover:scale-125`}
              onPointerDown={(e) => startResize(e, 'top-right')}
            />
            <div
              className={`absolute w-3.5 h-3.5 bg-white border-2 ${isRecord ? 'border-red-500 hover:bg-red-50' : 'border-blue-500 hover:bg-blue-50'} rounded-full shadow-md z-40 -bottom-1.5 -right-1.5 cursor-nwse-resize transition-transform hover:scale-125`}
              onPointerDown={(e) => startResize(e, 'bottom-right')}
            />
            <div
              className={`absolute w-3.5 h-3.5 bg-white border-2 ${isRecord ? 'border-red-500 hover:bg-red-50' : 'border-blue-500 hover:bg-blue-50'} rounded-full shadow-md z-40 -bottom-1.5 -left-1.5 cursor-nesw-resize transition-transform hover:scale-125`}
              onPointerDown={(e) => startResize(e, 'bottom-left')}
            />

            {/* Edge Resize Handles */}
            <div
              className="absolute h-1.5 left-2 right-2 -top-1 cursor-ns-resize z-30"
              onPointerDown={(e) => startResize(e, 'top')}
            />
            <div
              className="absolute w-1.5 top-2 bottom-2 -right-1 cursor-ew-resize z-30"
              onPointerDown={(e) => startResize(e, 'right')}
            />
            <div
              className="absolute h-1.5 left-2 right-2 -bottom-1 cursor-ns-resize z-30"
              onPointerDown={(e) => startResize(e, 'bottom')}
            />
            <div
              className="absolute w-1.5 top-2 bottom-2 -left-1 cursor-ew-resize z-30"
              onPointerDown={(e) => startResize(e, 'left')}
            />
          </div>

          {/* Action Toolbar */}
          {interactionMode === 'idle' && (
            <div
              className="absolute h-[48px] bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-50 transition-all select-none"
              style={{
                top: toolbarTop,
                left: toolbarLeft,
                width: toolbarWidth,
              }}
              onPointerDown={(e) => e.stopPropagation()} // Prevents resetting selection
            >
              {!isRecord ? (
                <>
                  {/* Screenshot Actions */}
                  <button
                    onClick={handleConfirm}
                    className="flex-1 h-8 flex items-center justify-center gap-1.5 px-3 py-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-95 text-[13px] font-semibold text-white rounded-lg transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {t('overlay.capture')}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex-1 h-8 flex items-center justify-center gap-1.5 px-3 py-1 bg-[var(--raised)] hover:bg-[var(--hover)] active:scale-95 text-[13px] font-semibold text-[var(--text)] rounded-lg transition-all cursor-pointer border border-[var(--border)] ml-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2" />
                    </svg>
                    {t('overlay.copy')}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="h-8 w-8 flex items-center justify-center bg-[var(--raised)] hover:bg-red-950 hover:text-red-400 text-[var(--muted)] rounded-lg transition-all cursor-pointer border border-[var(--border)] ml-2"
                    title={t('overlay.cancel')}
                    aria-label={t('overlay.cancel')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  {/* Aspect Ratio & Size Presets */}
                  <div className="flex gap-1 mr-2 border-r border-[var(--border)] pr-2">
                    <button
                      onClick={() => setAspectRatio('free')}
                      className={`h-7 px-2 text-[12px] font-semibold rounded ${aspectRatio === 'free' ? 'bg-[var(--active)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'} transition-colors cursor-pointer`}
                    >
                      Free
                    </button>
                    <select
                      className="h-8 px-1 text-[12px] font-semibold rounded bg-[var(--raised)] text-white border border-[var(--border)] outline-none cursor-pointer"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '16:9' || val === '9:16') {
                          setAspectRatio(val);
                          if (rect && rect.w > 0) {
                            setRect({ ...rect, h: rect.w / (val === '16:9' ? 16/9 : 9/16) });
                          }
                        } else if (val.includes('x')) {
                          const [presetW, presetH] = val.split('x').map(Number);
                          setAspectRatio(presetW > presetH ? '16:9' : '9:16');
                          const screenW = window.innerWidth;
                          const screenH = window.innerHeight;
                          const finalW = Math.min(presetW, screenW);
                          const finalH = Math.min(presetH, screenH);
                          setRect({
                            x: Math.max(0, screenW / 2 - finalW / 2),
                            y: Math.max(0, screenH / 2 - finalH / 2),
                            w: finalW,
                            h: finalH,
                          });
                        }
                      }}
                      value={aspectRatio}
                    >
                      <option value="free" disabled className="hidden">{t('overlay.ratioPlaceholder')}</option>
                      <option value="16:9">{t('overlay.ratio', { value: '16:9' })}</option>
                      <option value="1920x1080">1920 x 1080 (16:9)</option>
                      <option value="1280x720">1280 x 720 (16:9)</option>
                      <option value="9:16">{t('overlay.ratio', { value: '9:16' })}</option>
                      <option value="1080x1920">1080 x 1920 (9:16)</option>
                      <option value="720x1280">720 x 1280 (9:16)</option>
                    </select>
                  </div>
                  {/* Recording Actions */}
                  <button
                    onClick={handleConfirm}
                    className="flex-1 h-8 flex items-center justify-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-500 active:scale-95 text-[13px] font-semibold text-white rounded-lg transition-all cursor-pointer shadow-sm shadow-red-500/10"
                  >
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8" />
                    </svg>
                    Quay
                  </button>
                  <button
                    onClick={handleCancel}
                    className="h-8 w-8 flex items-center justify-center bg-[var(--raised)] hover:bg-red-950 hover:text-red-400 text-[var(--muted)] rounded-lg transition-all cursor-pointer border border-[var(--border)] ml-2"
                    title={t('overlay.cancel')}
                    aria-label={t('overlay.cancel')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
