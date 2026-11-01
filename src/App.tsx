import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type EventCallback } from '@tauri-apps/api/event';
import CanvasEditor, { type BackgroundOption } from './components/CanvasEditor';
import TitleBar from './components/TitleBar';
import HomeScreen from './components/HomeScreen';
import EditorTools, { TOOL_KEYS, type Tool } from './components/EditorTools';
import EditorPanel from './components/EditorPanel';
import AboutDialog from './components/AboutDialog';
import PermissionGuide from './components/PermissionGuide';
import OverlayEditor from './components/OverlayEditor';
import RecordingBar from './components/RecordingBar';
import FfmpegInstallModal from './components/FfmpegInstallModal';
import ShortcutSettings from './components/ShortcutSettings';
import RecordingPreview from './components/RecordingPreview';
import RecordingLivePreview from './components/RecordingLivePreview';
import RecordingScreenPicker, { type RecordingScreen } from './components/RecordingScreenPicker';
import { fetchImage } from './idb';
import { checkForUpdates } from './updater';
import { getVersion } from '@tauri-apps/api/app';
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
    stops: ['#1e3a8a', '#2563eb'],
    angle: 135,
  });
  const [tool, setTool] = useState<Tool>('select');
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    if (import.meta.env.DEV) return;
    // Silent background update check shortly after launch.
    const timer = window.setTimeout(() => {
      void checkForUpdates({ silent: true });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  const [ffmpegMissing, setFfmpegMissing] = useState(false);
  const [recordingScreens, setRecordingScreens] = useState<RecordingScreen[] | null>(null);

  // captureFlow defined before useEffect so the listener closures can call it
  const captureFlowRef = useRef<((isRegion: boolean) => Promise<void>) | undefined>(undefined);
  const recordFlowRef = useRef<((isRegion: boolean) => Promise<void>) | undefined>(undefined);
  const stopRecordRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const setRecordingActive = (active: boolean) => {
    isRecordingRef.current = active;
    setIsRecording(active);
  };

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

  const startFullRecording = async (screenIndex: string) => {
    try {
      await invoke('hide_window');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await invoke('start_recording_full', { screenIndex });
      setRecordingActive(true);
      await invoke('show_window');
    } catch (err: any) {
      console.error('Start recording failed:', err);
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
      try {
        const screens = await invoke<RecordingScreen[]>('list_recording_screens');
        if (screens.length === 0) {
          throw new Error('Không tìm thấy màn hình để quay');
        }
        setRecordingScreens(screens);
        await invoke('show_window');
      } catch (err: any) {
        console.error('List recording screens failed:', err);
        await invoke('show_window').catch(() => {});
      }
    }
  };

  const stopRecording = async () => {
    try {
      const filePath = await invoke<string>('stop_recording');
      setRecordingActive(false);
      setRecordedFilePath(filePath);
      await invoke('show_window').catch(() => {});
    } catch (err: any) {
      console.error('Stop recording failed:', err);
      setRecordingActive(false);
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
    let disposed = false;
    const unlistens: Array<() => void> = [];

    const register = async <T,>(eventName: string, handler: EventCallback<T>) => {
      const unlisten = await listen<T>(eventName, handler);
      if (disposed) {
        unlisten();
      } else {
        unlistens.push(unlisten);
      }
    };

    const setupListeners = async () => {
      // Region captured event (from overlay window via Rust)
      await register<string>('region-captured', async (event) => {
          let url = event.payload;
          if (url === 'use-idb') {
            try { url = await fetchImage(); } catch (err) {
              console.error('Failed to load cropped image from DB', err);
              return;
            }
          }
          setImage(url);
          setAppState('has-image');
        });

      // Region-record: user selected region in overlay, now start recording
      await register<{ x: number; y: number; width: number; height: number }>(
          'region-record-start',
          async (event) => {
              const { x, y, width, height } = event.payload;
              try {
                await invoke('start_recording_region', { x, y, width, height });
              setRecordingActive(true);
              await invoke('show_window').catch(() => {});
            } catch (err: any) {
              console.error('Region recording start failed:', err);
              await invoke('show_window').catch(() => {});
            }
          },
        );

      // Global shortcut events emitted by Rust backend
      await register('trigger-capture-region', () => captureFlowRef.current?.(true)
      );
      await register('trigger-capture-full', () => captureFlowRef.current?.(false)
      );
      await register('trigger-record-region', () => {
          if (isRecordingRef.current) {
            stopRecordRef.current?.();
          } else {
            recordFlowRef.current?.(true);
          }
        }
      );
      await register('trigger-record-full', () => {
          if (isRecordingRef.current) {
            stopRecordRef.current?.();
          } else {
            recordFlowRef.current?.(false);
          }
        }
      );
      await register('trigger-stop-recording', () => stopRecordRef.current?.()
      );
      await register('show-about', () => setShowAbout(true)
      );
      await register('show-shortcut-settings', () => setShowShortcuts(true)
      );
      await register('trigger-check-update', () => {
          void checkForUpdates({ silent: false });
        }
      );
      // Rust also announces a finished recording (e.g. stopped from the tray).
      await register<string>('recording-stopped', (event) => {
          if (event.payload) {
            setRecordingActive(false);
            setRecordedFilePath(event.payload);
          }
        }
      );
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
    void setupListeners().catch((error) => {
      console.error('Failed to set up app listeners:', error);
    });
    return () => {
      disposed = true;
      unlistens.splice(0).forEach((unlisten) => unlisten());
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const handleCaptureRegion = async () => captureFlow(true);
  const handleCaptureFull = async () => captureFlow(false);
  const handleRecordRegion = async () => recordFlow(true);
  const handleRecordFull = async () => recordFlow(false);

  const handleSave = async (): Promise<boolean> => {
    if (!editorRef || !image) return false;
    const dataUrl = editorRef.exportImage();
    if (!dataUrl) return false;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      return await invoke<boolean>('save_image', { dataUrl, defaultName: `EduKids-${dateStr}.png` });
    } catch (err) {
      console.error('Save failed:', err);
      return false;
    }
  };

  const handleCopy = async (): Promise<boolean> => {
    if (!editorRef || !image) return false;
    const dataUrl = editorRef.exportImage();
    if (!dataUrl) return false;
    try {
      return await invoke<boolean>('copy_image', { dataUrl });
    } catch (err) {
      console.error('Copy failed:', err);
      return false;
    }
  };

  const chooseTool = (t: Tool) => {
    setTool(t);
    editorRef?.setTool(t);
  };

  const goHome = () => {
    setImage(null);
    setEditorRef(null);
    setTool('select');
    setAppState('idle');
  };

  const openImage = (dataUrl: string) => {
    setImage(dataUrl);
    setAppState('has-image');
    setCaptureError(null);
  };

  // Editor keyboard: tool letters, undo/redo, save. Ignored while typing in a text box.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    if (appState !== 'has-image' || !editorRef) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); editorRef.undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); editorRef.redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveRef.current(); return; }
      if (!mod && !e.altKey) {
        const t = TOOL_KEYS[e.key.toLowerCase()];
        if (t) { setTool(t); editorRef.setTool(t); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appState, editorRef]);

  if (appState === 'no-permission') {
    return (
      <PermissionGuide
        errorMessage={captureError}
        onRetry={() => { setAppState('idle'); handleCaptureRegion(); }}
        onBack={() => { setCaptureError(null); setAppState(image ? 'has-image' : 'idle'); }}
      />
    );
  }

  const modals = (
    <>
      {showShortcuts && <ShortcutSettings onClose={() => setShowShortcuts(false)} />}
      {showAbout && <AboutDialog version={appVersion} onClose={() => setShowAbout(false)} />}
      {ffmpegMissing && <FfmpegInstallModal onClose={() => setFfmpegMissing(false)} />}
      {recordedFilePath && (
        <RecordingPreview filePath={recordedFilePath} onClose={() => setRecordedFilePath(null)} />
      )}
      {recordingScreens && (
        <RecordingScreenPicker
          screens={recordingScreens}
          onSelect={(screen) => {
            setRecordingScreens(null);
            void startFullRecording(screen.deviceIndex);
          }}
          onCancel={() => setRecordingScreens(null)}
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--ground)', color: 'var(--text)' }}>
      <TitleBar
        onHome={image && !isRecording ? goHome : undefined}
        onShortcuts={() => setShowShortcuts(true)}
        onAbout={() => setShowAbout(true)}
      />
      {modals}

      {isRecording ? (
        <>
          <RecordingBar onStop={() => stopRecording()} />
          <main className="flex-1 flex overflow-auto p-6">
            <RecordingLivePreview />
          </main>
        </>
      ) : image ? (
        <div className="flex-1 flex min-h-0">
          <EditorTools
            tool={tool}
            onTool={chooseTool}
            color={drawColor}
            onColor={setDrawColor}
            size={drawSize}
            onSize={setDrawSize}
          />
          <main className="flex-1 min-w-0 flex overflow-auto p-6" aria-label="Ảnh đang chỉnh">
            <h1 className="sr-only">Chỉnh ảnh chụp</h1>
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
          </main>
          <EditorPanel
            background={background}
            onBackground={setBackground}
            onAspectRatio={(ratio) => editorRef?.resizeToAspectRatio(ratio)}
            onUndo={() => editorRef?.undo()}
            onRedo={() => editorRef?.redo()}
            onClear={() => editorRef?.clearAll()}
            onCopy={handleCopy}
            onSave={handleSave}
          />
        </div>
      ) : (
        <main className="flex-1 min-h-0">
          <HomeScreen
            onCaptureRegion={handleCaptureRegion}
            onCaptureFull={handleCaptureFull}
            onRecordRegion={handleRecordRegion}
            onRecordFull={handleRecordFull}
            onOpenImage={openImage}
            onShortcuts={() => setShowShortcuts(true)}
          />
        </main>
      )}
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
