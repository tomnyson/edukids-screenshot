import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Toolbar from './components/Toolbar';
import CanvasEditor, { type BackgroundOption } from './components/CanvasEditor';
import PermissionGuide from './components/PermissionGuide';
import OverlayEditor from './components/OverlayEditor';
import RecordingBar from './components/RecordingBar';
import FfmpegInstallModal from './components/FfmpegInstallModal';
import RecordingPreview from './components/RecordingPreview';
import AppLogo from './components/AppLogo';
import edukidsLogo from './assets/edukids-logo.png';
import { storeImage, fetchImage } from './idb';
import './index.css';

type AppState = 'idle' | 'no-permission' | 'has-image';

function MainApp() {
  const [image, setImage] = useState<string | null>(null);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [appState, setAppState] = useState<AppState>('idle');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState<string>('#ef4444');
  const [drawSize, setDrawSize] = useState<number>(4);
  const [background, setBackground] = useState<BackgroundOption>({
    type: 'gradient',
    stops: ['#667eea', '#764ba2'],
    angle: 135,
  });
  const unlistenRefs = useRef<Array<() => void>>([]);
  const [showAbout, setShowAbout] = useState(false);

  // ── Recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  const [ffmpegMissing, setFfmpegMissing] = useState(false);

  // captureFlow defined before useEffect so the listener closures can call it
  const captureFlowRef = useRef<((isRegion: boolean) => Promise<void>) | undefined>(undefined);
  const recordFlowRef = useRef<((isRegion: boolean) => Promise<void>) | undefined>(undefined);
  const stopRecordRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const captureFlow = async (isRegion: boolean) => {
    try {
      await invoke('hide_window');
      await new Promise((resolve) => setTimeout(resolve, 400));

      const dataUrl = await invoke<string>('get_screen_capture');

      if (isRegion) {
        // Pass full data URL directly to Rust — crop_overlay_selection reads from OverlayState
        await invoke('start_region_capture', { dataUrl });
      } else {
        setImage(dataUrl);
        setAppState('has-image');
        setCaptureError(null);
        await invoke('show_window');
      }
    } catch (err: any) {
      console.error('Capture failed:', err);
      setCaptureError(err?.message || String(err));
      setAppState('no-permission');
      await invoke('show_window').catch(() => {});
    }
  };

  // ── Recording flows ──
  const recordFlow = async (isRegion: boolean) => {
    // Check FFmpeg first
    const hasFFmpeg = await invoke<boolean>('check_ffmpeg_installed');
    if (!hasFFmpeg) {
      setFfmpegMissing(true);
      return;
    }

    if (isRegion) {
      // For region recording: capture screen first for overlay, then user selects region
      try {
        await invoke('hide_window');
        await new Promise((resolve) => setTimeout(resolve, 400));
        const dataUrl = await invoke<string>('get_screen_capture');
        // Start overlay in "record" mode
        await invoke('start_region_capture', { dataUrl, mode: 'record' });
      } catch (err: any) {
        console.error('Record region capture failed:', err);
        await invoke('show_window').catch(() => {});
      }
    } else {
      // Full screen recording
      try {
        await invoke('hide_window');
        await new Promise((resolve) => setTimeout(resolve, 300));
        await invoke('start_recording_full');
        setIsRecording(true);
        // Show window so user can see recording bar
        await invoke('show_window');
      } catch (err: any) {
        console.error('Start recording failed:', err);
        await invoke('show_window').catch(() => {});
      }
    }
  };

  const stopRecording = async () => {
    try {
      const filePath = await invoke<string>('stop_recording');
      setIsRecording(false);
      setRecordedFilePath(filePath);
      await invoke('show_window').catch(() => {});
    } catch (err: any) {
      console.error('Stop recording failed:', err);
      setIsRecording(false);
    }
  };

  captureFlowRef.current = captureFlow;
  recordFlowRef.current = recordFlow;
  stopRecordRef.current = stopRecording;

  // On startup, actively request Screen Recording permission.
  useEffect(() => {
    invoke<boolean>('request_screen_recording_permission').then(granted => {
      if (!granted) {
        setCaptureError('macOS Screen Recording permission was not granted. Please enable it in System Settings → Privacy & Security → Screen Recording, then restart the app.');
        setAppState('no-permission');
      }
    }).catch(() => {
      invoke<boolean>('check_screen_recording_permission').then(ok => {
        if (!ok) {
          setCaptureError('macOS Screen Recording permission is not granted. Please enable in System Settings.');
          setAppState('no-permission');
        }
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistens: Array<() => void> = [];

      // Region captured event (from overlay window via Rust)
      unlistens.push(
        await listen<string>('region-captured', async (event) => {
          let url = event.payload;
          if (url === 'use-idb') {
            try { url = await fetchImage(); } catch (err) {
              console.error('Failed to load cropped image from DB', err);
              return;
            }
          }
          setImage(url);
          setAppState('has-image');
        })
      );

      // Region-record: user selected region in overlay, now start recording
      unlistens.push(
        await listen<{ x: number; y: number; width: number; height: number }>(
          'region-record-start',
          async (event) => {
            const { x, y, width, height } = event.payload;
            try {
              await invoke('start_recording_region', { x, y, width, height });
              setIsRecording(true);
              await invoke('show_window').catch(() => {});
            } catch (err: any) {
              console.error('Region recording start failed:', err);
              await invoke('show_window').catch(() => {});
            }
          }
        )
      );

      // Global shortcut events emitted by Rust backend
      unlistens.push(
        await listen('trigger-capture-region', () => captureFlowRef.current?.(true))
      );
      unlistens.push(
        await listen('trigger-capture-full', () => captureFlowRef.current?.(false))
      );
      unlistens.push(
        await listen('trigger-record-region', () => {
          if (isRecording) {
            stopRecordRef.current?.();
          } else {
            recordFlowRef.current?.(true);
          }
        })
      );
      unlistens.push(
        await listen('trigger-record-full', () => {
          if (isRecording) {
            stopRecordRef.current?.();
          } else {
            recordFlowRef.current?.(false);
          }
        })
      );
      unlistens.push(
        await listen('trigger-stop-recording', () => stopRecordRef.current?.())
      );
      unlistens.push(
        await listen('show-about', () => setShowAbout(true))
      );

      unlistenRefs.current = unlistens;
    };

    // Clipboard paste → load image directly into editor
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            setImage(dataUrl);
            setAppState('has-image');
            setCaptureError(null);
            invoke('show_window').catch(() => {});
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    window.addEventListener('paste', onPaste);
    setupListeners();
    return () => {
      unlistenRefs.current.forEach((u) => u());
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const handleCaptureRegion = async () => captureFlow(true);
  const handleCaptureFull = async () => captureFlow(false);
  const handleRecordRegion = async () => recordFlow(true);
  const handleRecordFull = async () => recordFlow(false);

  const handleSave = async () => {
    if (!editorRef || !image) return;
    const dataUrl = editorRef.exportImage();
    if (!dataUrl) return;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await invoke('save_image', { dataUrl, defaultName: `Screenshot-${dateStr}.png` });
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleCopy = async () => {
    if (!editorRef || !image) return;
    const dataUrl = editorRef.exportImage();
    if (dataUrl) {
      await invoke('copy_image', { dataUrl });
    }
  };

  if (appState === 'no-permission') {
    return (
      <PermissionGuide
        errorMessage={captureError}
        onRetry={() => { setAppState('idle'); handleCaptureRegion(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* ── macOS-style titlebar ─────────────────────────────────────── */}
      <div
        className="flex items-center h-8 px-3 gap-2 bg-gray-900 border-b border-gray-800 z-50 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Traffic light buttons */}
        <div
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Red — Close */}
          <button
            onClick={() => invoke('close_window')}
            title="Close"
            className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff3b30] border border-[#e0443e]/60 transition-colors cursor-pointer flex items-center justify-center group"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[#820005] leading-none" style={{ fontSize: 7, lineHeight: 1 }}>✕</span>
          </button>
          {/* Yellow — Minimize */}
          <button
            onClick={() => invoke('minimize_window')}
            title="Minimise"
            className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#ffb41a] border border-[#d79200]/60 transition-colors cursor-pointer flex items-center justify-center group"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[#985700] leading-none" style={{ fontSize: 9, lineHeight: 1 }}>−</span>
          </button>
          {/* Green — Fullscreen */}
          <button
            onClick={() => invoke('toggle_fullscreen')}
            title="Fullscreen"
            className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#1aad2b] border border-[#14a422]/60 transition-colors cursor-pointer flex items-center justify-center group"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[#006401] leading-none" style={{ fontSize: 7, lineHeight: 1 }}>⤢</span>
          </button>
        </div>
        {/* Drag area fills the rest of the title bar */}
        <div className="flex-1" />
        {/* About button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => setShowAbout(true)}
            title="About"
            className="text-gray-400 hover:text-white transition-colors cursor-pointer text-xs px-1.5"
          >
            ℹ️
          </button>
        </div>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={edukidsLogo} alt="Edukids Logo" className="w-20 h-20 mx-auto mb-3 object-contain" />
            <h2 className="text-lg font-bold text-white mb-1">Edukids Screenshot</h2>
            <p className="text-gray-400 text-sm mb-4">Version 1.0.0</p>
            <div className="border-t border-gray-700 pt-4 space-y-1">
              <p className="text-gray-300 text-sm font-medium">Tác giả</p>
              <p className="text-white font-semibold">Lê Hồng Sơn</p>
              <a
                href="mailto:tabletkindfire@gmail.com"
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                tabletkindfire@gmail.com
              </a>
            </div>
            <button
              onClick={() => setShowAbout(false)}
              className="mt-5 px-5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* FFmpeg missing modal */}
      {ffmpegMissing && (
        <FfmpegInstallModal onClose={() => setFfmpegMissing(false)} />
      )}

      {/* Recording preview modal */}
      {recordedFilePath && (
        <RecordingPreview
          filePath={recordedFilePath}
          onClose={() => setRecordedFilePath(null)}
        />
      )}

      {/* Show RecordingBar when recording, otherwise show Toolbar */}
      {isRecording ? (
        <RecordingBar onStop={() => stopRecording()} />
      ) : (
        <Toolbar
          onCaptureRegion={handleCaptureRegion}
          onCaptureFull={handleCaptureFull}
          onRecordRegion={handleRecordRegion}
          onRecordFull={handleRecordFull}
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
          onAspectRatio={(ratio) => editorRef?.resizeToAspectRatio(ratio)}
        />
      )}
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
      <div className="w-24 h-24 rounded-[28px] bg-slate-900 flex items-center justify-center border border-cyan-950 shadow-[0_24px_60px_rgba(7,18,32,0.45)]">
        <AppLogo size={68} />
      </div>
      <div className="text-center space-y-1">
        <div className="text-white font-semibold tracking-tight">Screenshot Tool</div>
        <div className="text-cyan-300/80 text-xs uppercase tracking-[0.24em]">Capture Better</div>
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
