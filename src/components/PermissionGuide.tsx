import { Monitor, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import EdukidsMark from './brand/EdukidsMark';

interface PermissionGuideProps {
  errorMessage?: string | null;
  onRetry: () => void;
  onBack?: () => void;
}

const isDev = import.meta.env.DEV;
const isMac = navigator.userAgent.includes('Mac');

export default function PermissionGuide({ errorMessage, onRetry, onBack }: PermissionGuideProps) {
  // Windows has no Screen Recording permission: show the real error instead
  // of macOS instructions.
  if (!isMac) {
    return (
      <div className="h-screen bg-[var(--ground)] text-white flex flex-col items-center justify-center p-8">
        <div className="w-24 h-24 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-6">
          <EdukidsMark size={64} />
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Không chụp được màn hình</h1>
        <p className="text-[var(--muted)] text-sm text-center max-w-sm mb-6">
          Đã xảy ra lỗi khi chụp. Hãy thử lại; nếu vẫn lỗi, gửi nội dung bên dưới cho nhóm phát triển.
        </p>
        <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 mb-6">
          <p className="text-[var(--muted)] text-xs uppercase tracking-wide mb-2">Chi tiết lỗi</p>
          <p className="text-red-300 text-sm break-words select-text">{errorMessage || 'Không rõ lỗi'}</p>
        </div>
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-6 py-3 bg-[var(--raised)] hover:bg-[var(--hover)] rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Quay lại
            </button>
          )}
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <RefreshCw size={16} />
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const handleOpenSettings = async () => {
    try {
      await invoke('open_screen_recording_settings');
    } catch (error) {
      console.error('Failed to open Screen Recording settings', error);
    }
  };

  return (
    <div className="h-screen bg-[var(--ground)] text-white flex flex-col items-center justify-center p-8">
      {/* Icon */}
      <div className="w-24 h-24 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-6">
        <EdukidsMark size={64} />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-white mb-2">
        Cần cấp quyền Screen Recording
      </h1>
      <p className="text-[var(--muted)] text-sm text-center max-w-sm mb-8">
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
        <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 mb-4">
          <p className="text-[var(--muted)] text-xs uppercase tracking-wide mb-2">Chi tiết lỗi</p>
          <p className="text-red-300 text-sm break-words">{errorMessage}</p>
        </div>
      )}

      {/* Steps */}
      <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden mb-6">
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
          className="flex items-center gap-2 px-6 py-3 bg-[var(--raised)] hover:bg-[var(--hover)] rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <Monitor size={16} />
          Mở Settings
        </button>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
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
    <div className={`flex items-start gap-4 p-4 ${!last ? 'border-b border-[var(--border)]' : ''}`}>
      <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5">
        {num}
      </div>
      <p className="text-[var(--text)] text-sm leading-relaxed">{text}</p>
    </div>
  );
}
