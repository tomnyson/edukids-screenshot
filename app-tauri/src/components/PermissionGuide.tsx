import { Monitor, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import AppLogo from './AppLogo';

interface PermissionGuideProps {
  errorMessage?: string | null;
  onRetry: () => void;
}

const isDev = import.meta.env.DEV;

export default function PermissionGuide({ errorMessage, onRetry }: PermissionGuideProps) {
  const handleOpenSettings = async () => {
    try {
      await invoke('open_screen_recording_settings');
    } catch (error) {
      console.error('Failed to open Screen Recording settings', error);
    }
  };

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      {/* Icon */}
      <div className="w-24 h-24 rounded-[28px] bg-slate-900 border border-cyan-900/60 flex items-center justify-center mb-6 shadow-[0_24px_60px_rgba(7,18,32,0.45)]">
        <AppLogo size={64} />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-white mb-2">
        Cần cấp quyền Screen Recording
      </h1>
      <p className="text-gray-400 text-sm text-center max-w-sm mb-8">
        macOS yêu cầu cấp quyền Screen Recording trước khi ứng dụng có thể chụp màn hình.
      </p>

      {isDev && (
        <div className="w-full max-w-md bg-amber-950/50 border border-amber-800 rounded-2xl p-4 mb-4">
          <p className="text-amber-200 text-sm leading-relaxed">
            Bạn đang chạy bằng <code>yarn dev</code>. Trên macOS, đôi khi cần cấp quyền cho
            <span className="font-semibold"> Terminal</span> hoặc app host đang chạy Tauri, không chỉ riêng
            <span className="font-semibold"> Screenshot Tool</span>.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Chi tiết lỗi</p>
          <p className="text-red-300 text-sm break-words">{errorMessage}</p>
        </div>
      )}

      {/* Steps */}
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
        <Step num={1} text='Mở System Settings (⌘ + Space → "System Settings").' />
        <Step num={2} text='Chọn mục Privacy & Security ở thanh bên trái.' />
        <Step num={3} text='Cuộn xuống và chọn "Screen & System Audio Recording".' />
        <Step
          num={4}
          text={
            isDev
              ? 'Bật toggle cho "Screenshot Tool" và cả "Terminal" (hoặc iTerm / app host đang chạy yarn dev).'
              : 'Bật toggle cho ứng dụng "Screenshot Tool".'
          }
        />
        <Step num={5} text='⚠️ Quan trọng: Quit app hoàn toàn và mở lại. Nếu bạn vừa bật Terminal, hãy restart cả Terminal.' last />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleOpenSettings}
          className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <Monitor size={16} />
          Mở Settings
        </button>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <RefreshCw size={16} />
          Thử lại
        </button>
      </div>
    </div>
  );
}

function Step({ num, text, last = false }: { num: number; text: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-4 p-4 ${!last ? 'border-b border-gray-800' : ''}`}>
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5">
        {num}
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
    </div>
  );
}
