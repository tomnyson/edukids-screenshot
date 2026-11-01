import { Monitor, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import EdukidsMark from './brand/EdukidsMark';
import { useT } from '../i18n';

interface PermissionGuideProps {
  errorMessage?: string | null;
  onRetry: () => void;
  onBack?: () => void;
}

const isDev = import.meta.env.DEV;
const isMac = navigator.userAgent.includes('Mac');

export default function PermissionGuide({ errorMessage, onRetry, onBack }: PermissionGuideProps) {
  const t = useT();

  const details = (msg: string | null | undefined) => (
    <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 mb-6">
      <p className="text-[var(--muted)] text-[13px] font-semibold mb-2">{t('common.errorDetails')}</p>
      <p className="text-[var(--rec-ink)] text-sm break-words select-text">{msg || t('common.unknownError')}</p>
    </div>
  );

  const retryButton = (
    <button
      type="button"
      onClick={onRetry}
      className="h-11 px-6 rounded-full flex items-center gap-2 text-[15px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
    >
      <RefreshCw size={16} />
      {t('common.retry')}
    </button>
  );

  // Windows has no Screen Recording permission: show the real error instead
  // of macOS instructions.
  if (!isMac) {
    return (
      <div className="h-screen bg-[var(--ground)] text-[var(--text)] flex flex-col items-center justify-center p-8">
        <div className="w-24 h-24 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-6">
          <EdukidsMark size={64} />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('error.captureTitle')}</h1>
        <p className="text-[var(--muted)] text-sm text-center max-w-sm mb-6">{t('error.captureBody')}</p>
        {details(errorMessage)}
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-11 px-6 rounded-full text-[15px] font-semibold cursor-pointer border bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--control)]"
            >
              {t('common.back')}
            </button>
          )}
          {retryButton}
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
    <div className="h-screen bg-[var(--ground)] text-[var(--text)] flex flex-col items-center justify-center p-8">
      <div className="w-24 h-24 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-6">
        <EdukidsMark size={64} />
      </div>

      <h1 className="text-2xl font-bold mb-2">{t('perm.title')}</h1>
      <p className="text-[var(--muted)] text-sm text-center max-w-sm mb-8">{t('perm.body')}</p>

      {isDev && (
        <div className="w-full max-w-md rounded-2xl p-4 mb-4 text-sm leading-relaxed" style={{ background: '#2a2210', color: 'var(--moon)' }}>
          {t('perm.dev')}
        </div>
      )}

      {errorMessage && details(errorMessage)}

      <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden mb-6">
        <Step num={1} text={t('perm.step1')} />
        <Step num={2} text={t('perm.step2')} />
        <Step num={3} text={t('perm.step3')} />
        <Step num={4} text={isDev ? t('perm.step4dev') : t('perm.step4')} />
        <Step num={5} text={t('perm.step5')} last />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleOpenSettings}
          className="h-11 px-6 rounded-full flex items-center gap-2 text-[15px] font-semibold cursor-pointer border bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--control)]"
        >
          <Monitor size={16} />
          {t('perm.openSettings')}
        </button>
        {retryButton}
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
