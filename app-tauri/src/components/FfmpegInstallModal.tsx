import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type InstallState = 'idle' | 'installing' | 'success' | 'error';

export default function FfmpegInstallModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<InstallState>('idle');
  const [message, setMessage] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  const handleInstall = async () => {
    setState('installing');
    setMessage('');
    try {
      const result = await invoke<string>('install_ffmpeg');
      setMessage(result);
      setState('success');
    } catch (err: any) {
      setMessage(err?.message || String(err));
      setState('error');
    }
  };

  const handleRetry = async () => {
    const hasFFmpeg = await invoke<boolean>('check_ffmpeg_installed');
    if (hasFFmpeg) {
      setState('success');
      setMessage('FFmpeg đã sẵn sàng! ✓');
    } else {
      setMessage('Vẫn không tìm thấy FFmpeg.');
      setState('error');
    }
  };

  const handleDebug = async () => {
    const info = await invoke<string>('get_ffmpeg_debug_info');
    setDebugInfo(info);
    setShowDebug(true);
  };

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">
            {state === 'success' ? '✅' : state === 'installing' ? '⏳' : '🎬'}
          </div>
          <h2 className="text-lg font-bold text-white">
            {state === 'success' ? 'FFmpeg đã sẵn sàng!' : 'Cần cài FFmpeg'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {state === 'success'
              ? 'Bạn có thể quay video ngay bây giờ.'
              : 'Tính năng quay video cần FFmpeg để hoạt động.'}
          </p>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`rounded-lg p-3 text-sm font-mono mb-4 text-left whitespace-pre-wrap break-all max-h-32 overflow-auto ${
              state === 'success'
                ? 'bg-green-900/30 border border-green-700/50 text-green-400'
                : state === 'error'
                ? 'bg-red-900/30 border border-red-700/50 text-red-400'
                : 'bg-gray-800 text-gray-300'
            }`}
          >
            {message}
          </div>
        )}

        {/* Installing spinner */}
        {state === 'installing' && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-300 text-sm">Đang cài đặt FFmpeg...</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {state === 'success' ? (
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              Bắt đầu quay video
            </button>
          ) : state !== 'installing' ? (
            <>
              {/* Auto install button */}
              <button
                onClick={handleInstall}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12m0 0l-4-4m4 4l4-4" />
                </svg>
                Cài đặt tự động (Homebrew)
              </button>

              {/* Retry button */}
              <button
                onClick={handleRetry}
                className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M6.3 17.7A8 8 0 0119.7 6.3M17.7 6.3A8 8 0 016.3 17.7" />
                </svg>
                Đã cài rồi? Kiểm tra lại
              </button>

              {/* Manual instruction (collapsible) */}
              <div className="border-t border-gray-800 pt-3 mt-1">
                <p className="text-gray-500 text-xs text-center mb-2">
                  Hoặc cài thủ công qua Terminal:
                </p>
                <div className="bg-gray-800 rounded-lg p-2.5 text-xs text-green-400 font-mono text-center select-all">
                  brew install ffmpeg
                </div>
              </div>

              {/* Debug link */}
              <button
                onClick={handleDebug}
                className="text-gray-600 hover:text-gray-400 text-xs transition-colors cursor-pointer mt-1"
              >
                🔍 Chi tiết debug
              </button>
            </>
          ) : null}

          {/* Close button */}
          {state !== 'installing' && state !== 'success' && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors cursor-pointer mt-1"
            >
              Đóng
            </button>
          )}
        </div>

        {/* Debug info panel */}
        {showDebug && debugInfo && (
          <div className="mt-4 border-t border-gray-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 font-medium">Debug Info</span>
              <button
                onClick={() => setShowDebug(false)}
                className="text-gray-600 hover:text-gray-400 text-xs cursor-pointer"
              >
                Ẩn
              </button>
            </div>
            <pre className="bg-gray-950 rounded-lg p-3 text-xs text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-auto border border-gray-800">
              {debugInfo}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
