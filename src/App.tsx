import { useState, useEffect } from 'react';
import Toolbar from './components/Toolbar';
import CanvasEditor, { type BackgroundOption } from './components/CanvasEditor';
import PermissionGuide from './components/PermissionGuide';
import OverlayEditor from './components/OverlayEditor';
import { storeImage, fetchImage } from './idb';
import './index.css';

declare global {
  interface Window {
    electronAPI?: {
      getSources: () => Promise<Array<{ id: string; name: string }>>;
      saveImage: (dataUrl: string, name: string) => Promise<boolean>;
      copyImage: (dataUrl: string) => Promise<boolean>;
      hideWindow: () => Promise<void>;
      showWindow: () => Promise<void>;
      startRegionCapture: (dataUrl: string) => Promise<void>;
      closeOverlay: (dataUrl: string | null) => Promise<void>;
      onInitOverlay: (cb: (dataUrl: string) => void) => void;
      onRegionCaptured: (cb: (dataUrl: string) => void) => void;
      onTriggerCaptureRegion: (cb: () => void) => void;
      onTriggerCaptureFull: (cb: () => void) => void;
    };
  }
}

type AppState = 'idle' | 'no-electron' | 'no-permission' | 'has-image';

/**
 * Captures the screen using getUserMedia with a desktop source ID.
 * This is the reliable approach on macOS 13+ (Ventura/Sonoma) — the old
 * desktopCapturer thumbnail approach fails with ad-hoc signed apps.
 *
 * Retina / HiDPI fix: Chromium's getUserMedia can deliver a 1x stream even
 * when the mandatory constraints request a 2x resolution, causing the
 * "1/4 corner" bug (the video element renders at 1x into a 2x canvas).
 * We fix this by:
 *   1. Attaching the video to a hidden off-screen DOM element so Chromium
 *      runs the full compositing / HiDPI decode pipeline.
 *   2. Waiting for multiple decoded frames (skip first 2) so the stream
 *      fully settles before we capture.
 *   3. Verifying the delivered videoWidth/videoHeight matches the expected
 *      native pixel dimensions before resolving.
 */
async function captureWithGetUserMedia(sourceId: string): Promise<string> {
  const nativeW = Math.round(window.screen.width * window.devicePixelRatio);
  const nativeH = Math.round(window.screen.height * window.devicePixelRatio);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // @ts-ignore — chromeMediaSource / mandatory are Electron-specific extensions
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: nativeW,
        minHeight: nativeH,
        maxWidth: nativeW,
        maxHeight: nativeH,
      },
    },
  });

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    // Attach to DOM so Chromium runs the full HiDPI compositing pipeline.
    // The container is off-screen (not display:none, which can suppress decode).
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    container.appendChild(video);
    document.body.appendChild(container);

    const cleanup = () => {
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      try { document.body.removeChild(container); } catch (_) {}
    };

    video.play().then(() => {
      let captured = false;
      let frameCount = 0;

      const doCapture = () => {
        if (captured) return;
        captured = true;
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;

          // Warn in console if dimensions don't match native — helps debugging.
          if (w !== nativeW || h !== nativeH) {
            console.warn(
              `[screenshot] videoWidth=${w}×${h} expected ${nativeW}×${nativeH}. ` +
              'Stream may not be at native Retina resolution.'
            );
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No canvas context');
          ctx.drawImage(video, 0, 0);
          cleanup();
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          cleanup();
          reject(e);
        }
      };

      const onFrame = () => {
        if (captured) return;
        frameCount++;
        // Skip the first 2 frames — stream often hasn't settled to native
        // resolution yet. Capture on the 3rd frame and beyond.
        if (frameCount >= 3) {
          doCapture();
        } else if ('requestVideoFrameCallback' in video) {
          (video as any).requestVideoFrameCallback(onFrame);
        }
      };

      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(onFrame);
      }

      // Fallback: if requestVideoFrameCallback never fires (e.g. browser
      // doesn't support it), capture after a generous delay to let the
      // stream settle.
      setTimeout(() => {
        if (!captured && video.videoWidth > 0 && video.videoHeight > 0) {
          doCapture();
        }
      }, 600);

    }).catch(err => {
      cleanup();
      reject(err);
    });
  });
}

function MainApp() {
  const [image, setImage] = useState<string | null>(null);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [appState, setAppState] = useState<AppState>('idle');
  const [drawColor, setDrawColor] = useState<string>('#ef4444');
  const [drawSize,  setDrawSize]  = useState<number>(4);
  const [background, setBackground] = useState<BackgroundOption>({
    type: 'gradient',
    stops: ['#667eea', '#764ba2'],
    angle: 135,
  });

  useEffect(() => {
    if (window.electronAPI?.onRegionCaptured) {
      window.electronAPI.onRegionCaptured(async (url: string) => {
        if (url === 'use-idb') {
          try {
            url = await fetchImage();
          } catch (err) {
            console.error('Failed to load cropped image from DB', err);
            return;
          }
        }
        setImage(url);
        setAppState('has-image');
      });
    }

    // Global shortcuts: Cmd+Shift+2 → region, Cmd+Shift+3 → full
    window.electronAPI?.onTriggerCaptureRegion?.(() => captureFlow(true));
    window.electronAPI?.onTriggerCaptureFull?.(() => captureFlow(false));
  }, []);

  const handleCaptureRegion = async () => captureFlow(true);
  const handleCaptureFull = async () => captureFlow(false);

  const captureFlow = async (isRegion: boolean) => {
    if (!window.electronAPI) {
      setAppState('no-electron');
      return;
    }

    const sources = await window.electronAPI.getSources();
    if (sources.length === 0) {
      // No sources = permission denied or macOS blocked access
      setAppState('no-permission');
      // Show window so user can see the permission guide (app may be running in tray)
      await window.electronAPI.showWindow?.();
      return;
    }

    try {
      // Hide the window so it doesn't appear in the screenshot
      if (window.electronAPI.hideWindow) {
        await window.electronAPI.hideWindow();
        // Wait for macOS window hide animation to finish and capture to settle
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      // Add a hard timeout to the capture process so the window always comes back!
      const capturePromise = captureWithGetUserMedia(sources[0].id);
      const timeoutPromise = new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('Capture timed out')), 5000)
      );
      
      const dataUrl = await Promise.race([capturePromise, timeoutPromise]);
      
      if (isRegion) {
        if (window.electronAPI.startRegionCapture) {
          try {
            await storeImage(dataUrl);
            await window.electronAPI.startRegionCapture('use-idb');
          } catch (e) {
            console.error('Failed to store image or start IPC:', e);
            throw e;
          }
        }
      } else {
        setImage(dataUrl);
        setAppState('has-image');
        if (window.electronAPI.showWindow) {
          await window.electronAPI.showWindow();
        }
      }
    } catch (err: any) {
      console.error('Capture failed:', err);
      // Give a highly visible alert if capture process fails inside App.tsx
      if (err instanceof Error && err.message !== 'Capture timed out') {
        alert('Lỗi khi chụp màn hình: ' + err.message);
      }
      setAppState('no-permission');
      if (window.electronAPI?.showWindow) {
        await window.electronAPI.showWindow();
      }
    }
  };

  const handleSave = async () => {
    if (!editorRef || !image) return;
    const dataUrl = editorRef.exportImage();
    if (!dataUrl) return;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    if (window.electronAPI) {
      await window.electronAPI.saveImage(dataUrl, `Screenshot-${dateStr}.png`);
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Screenshot-${dateStr}.png`;
      a.click();
    }
  };

  const handleCopy = async () => {
    if (!editorRef || !image) return;
    const dataUrl = editorRef.exportImage();
    if (dataUrl && window.electronAPI) {
      await window.electronAPI.copyImage(dataUrl);
    }
  };

  if (appState === 'no-electron' || appState === 'no-permission') {
    return (
      <PermissionGuide
        reason={appState}
        onRetry={() => { setAppState('idle'); handleCaptureRegion(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <div className="h-8 drag-region w-full absolute top-0 left-0 bg-transparent z-50" />
      <Toolbar
        onCaptureRegion={handleCaptureRegion}
        onCaptureFull={handleCaptureFull}
        onSave={handleSave}
        onCopy={handleCopy}
        onToolSelect={(tool) => editorRef?.setTool(tool)}
        onUndo={() => editorRef?.undo()}
        onRedo={() => editorRef?.redo()}
        onClear={() => editorRef?.clearAll()}
        hasImage={!!image}
        drawColor={drawColor}
        drawSize={drawSize}
        onColorChange={setDrawColor}
        onSizeChange={setDrawSize}
        background={background}
        onBgChange={setBackground}
      />
      <div className="flex-1 bg-gray-900 flex overflow-auto p-4 pt-8">
        {image ? (
          <div className="m-auto">
            <CanvasEditor
              imageUrl={image}
              onReady={setEditorRef}
              drawColor={drawColor}
              drawSize={drawSize}
              onDrawSizeChange={setDrawSize}
              background={background}
            />
          </div>
        ) : (
          <div className="m-auto">
            <EmptyState onCaptureRegion={handleCaptureRegion} onCaptureFull={handleCaptureFull} />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCaptureRegion, onCaptureFull }: { onCaptureRegion: () => void, onCaptureFull: () => void }) {
  return (
    <div className="text-center flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center border border-gray-700">
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <p className="text-gray-400 text-sm">Chưa có ảnh nào. Bắt đầu bằng cách chụp màn hình.</p>
      <div className="flex gap-4 mt-2">
        <button
          onClick={onCaptureRegion}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-medium transition-colors cursor-pointer flex items-center gap-2"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h2v2H4zm14 12h2v2h-2z" /></svg>
          Chụp Vùng
        </button>
        <button
          onClick={onCaptureFull}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
        >
          Toàn màn hình
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash === '#overlay') {
    return <OverlayEditor />;
  }
  return <MainApp />;
}
