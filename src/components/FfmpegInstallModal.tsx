import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clapperboard, CheckCircle2, Download, RefreshCw, Loader2, Bug } from 'lucide-react';
import { Dialog, DialogClose } from './AboutDialog';
import { useT } from '../i18n';

type InstallState = 'idle' | 'installing' | 'success' | 'error';

export default function FfmpegInstallModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [state, setState] = useState<InstallState>('idle');
  const [message, setMessage] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  const isWindows = navigator.userAgent.toLowerCase().includes('windows');

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
      setMessage(t('ffmpeg.ready'));
    } else {
      setMessage(t('ffmpeg.stillMissing'));
      setState('error');
    }
  };

  const handleDebug = async () => {
    const info = await invoke<string>('get_ffmpeg_debug_info');
    setDebugInfo(info);
    setShowDebug(true);
  };

  const ok = state === 'success';

  return (
    <Dialog title={ok ? t('ffmpeg.ready') : t('ffmpeg.needTitle')} onClose={onClose} width={440}>
      <div className="flex justify-end p-3 pb-0"><DialogClose onClose={onClose} /></div>
      <div className="px-7 pb-7 -mt-2">
        <div className="text-center mb-5">
          <span className={ok ? 'text-[var(--positive)]' : 'text-[var(--accent)]'}>
            {ok ? <CheckCircle2 size={40} className="mx-auto" /> : <Clapperboard size={40} className="mx-auto" />}
          </span>
          <h2 className="mt-3 text-[20px] font-bold">{ok ? t('ffmpeg.ready') : t('ffmpeg.needTitle')}</h2>
          <p className="text-[var(--muted)] text-sm mt-1">{ok ? t('ffmpeg.readyBody') : t('ffmpeg.needBody')}</p>
        </div>

        {message && (
          <div
            role={state === 'error' ? 'alert' : undefined}
            className="rounded-[var(--radius-control)] p-3 text-sm mb-4 whitespace-pre-wrap break-words max-h-32 overflow-auto select-text"
            style={state === 'error' ? { background: '#2a1416', color: 'var(--rec-ink)' } : { background: 'var(--raised)', color: 'var(--text)' }}
          >
            {message}
          </div>
        )}

        {state === 'installing' && (
          <div className="flex items-center justify-center gap-3 py-4 text-sm">
            <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
            {t('ffmpeg.installing')}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {ok ? (
            <button type="button" onClick={onClose}
              className="w-full h-11 rounded-full text-[15px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]">
              {t('ffmpeg.startRecording')}
            </button>
          ) : state !== 'installing' ? (
            <>
              <button type="button" onClick={handleInstall}
                className="w-full h-11 rounded-full flex items-center justify-center gap-2 text-[15px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]">
                <Download size={17} />
                {isWindows ? t('ffmpeg.autoWin') : t('ffmpeg.autoMac')}
              </button>
              <button type="button" onClick={handleRetry}
                className="w-full h-11 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold cursor-pointer border bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--control)]">
                <RefreshCw size={16} />
                {t('ffmpeg.recheck')}
              </button>

              <div className="border-t border-[var(--border)] pt-4 mt-2">
                <p className="text-[var(--muted)] text-[13px] text-center mb-2">
                  {t('ffmpeg.manual', { via: isWindows ? t('ffmpeg.viaWin') : t('ffmpeg.viaMac') })}
                </p>
                {isWindows ? (
                  <p className="bg-[var(--raised)] rounded-[var(--radius-control)] p-3 text-[13px] text-[var(--text)] whitespace-pre-wrap select-text">
                    {t('ffmpeg.manualWin')}
                  </p>
                ) : (
                  <pre className="bg-[var(--raised)] rounded-[var(--radius-control)] p-3 text-[13px] text-[var(--text)] text-center select-all"><code>brew install ffmpeg</code></pre>
                )}
              </div>

              <button type="button" onClick={handleDebug}
                className="self-center inline-flex items-center gap-1.5 text-[13px] text-[var(--faint)] hover:text-[var(--text)] cursor-pointer mt-1">
                <Bug size={14} /> {t('ffmpeg.debug')}
              </button>
            </>
          ) : null}
        </div>

        {showDebug && debugInfo && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[var(--muted)] font-medium">{t('ffmpeg.debug')}</span>
              <button type="button" onClick={() => setShowDebug(false)} className="text-[13px] text-[var(--faint)] hover:text-[var(--text)] cursor-pointer">
                {t('common.hide')}
              </button>
            </div>
            <pre className="bg-[var(--ground)] rounded-[var(--radius-control)] p-3 text-xs text-[var(--muted)] whitespace-pre-wrap max-h-40 overflow-auto border border-[var(--border)] select-text"><code>{debugInfo}</code></pre>
          </div>
        )}
      </div>
    </Dialog>
  );
}
