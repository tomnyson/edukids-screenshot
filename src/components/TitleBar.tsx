import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, Keyboard, Info, Minus, Square, X } from 'lucide-react';
import EdukidsMark, { Wordmark } from './brand/EdukidsMark';
import { isMac } from '../hooks/useShortcutLabels';
import { useT, useLang, LANGS } from '../i18n';

interface TitleBarProps {
  /** Shown in the editor: go back to the home screen. */
  onHome?: () => void;
  onShortcuts: () => void;
  onAbout: () => void;
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

function IconButton({ label, onClick, children, danger = false }: {
  label: string; onClick: () => void; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={noDrag}
      className={`h-8 w-9 grid place-items-center rounded-lg cursor-pointer text-[var(--muted)] hover:text-[var(--text)]
        ${danger ? 'hover:bg-[#c42b1c] hover:text-white' : 'hover:bg-[var(--hover)]'}`}
    >
      {children}
    </button>
  );
}

/** VI | EN: one click switches the whole app, the overlay and the tray. */
export function LanguageSwitch() {
  const [lang, setLang] = useLang();
  const t = useT();
  return (
    <div role="group" aria-label={t('title.language')} style={noDrag}
      className="flex items-center h-7 p-0.5 rounded-full bg-[var(--raised)] border border-[var(--border)]">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          aria-label={l.name}
          title={l.name}
          onClick={() => setLang(l.code)}
          className={`h-6 px-2.5 rounded-full text-[12px] font-bold cursor-pointer
            ${lang === l.code ? 'bg-[var(--active)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

/** Custom title bar: the product's mark and name, language, help actions, and the OS's window controls. */
export default function TitleBar({ onHome, onShortcuts, onAbout }: TitleBarProps) {
  const t = useT();
  return (
    <header
      className="h-12 flex items-center gap-2 px-2 flex-shrink-0 border-b"
      style={{ WebkitAppRegion: 'drag', background: 'var(--surface)', borderColor: 'var(--border)' } as React.CSSProperties}
    >
      {isMac && (
        <div className="flex items-center gap-2 pl-2 pr-1" style={noDrag}>
          <button aria-label={t('common.close')} title={t('common.close')} onClick={() => invoke('close_window')} className="w-3 h-3 rounded-full bg-[#ff5f57] cursor-pointer" />
          <button aria-label={t('title.minimize')} title={t('title.minimize')} onClick={() => invoke('minimize_window')} className="w-3 h-3 rounded-full bg-[#febc2e] cursor-pointer" />
          <button aria-label={t('title.fullscreen')} title={t('title.fullscreen')} onClick={() => invoke('toggle_fullscreen')} className="w-3 h-3 rounded-full bg-[#28c840] cursor-pointer" />
        </div>
      )}

      <div className="flex items-center gap-2 pl-2">
        <EdukidsMark size={26} />
        <Wordmark />
      </div>

      {onHome && (
        <button
          type="button"
          onClick={onHome}
          style={noDrag}
          className="ml-3 h-8 pl-2.5 pr-3.5 flex items-center gap-1.5 rounded-full text-sm font-medium cursor-pointer
            text-[var(--text)] bg-[var(--raised)] hover:bg-[var(--hover)]"
        >
          <ArrowLeft size={16} />
          {t('title.newCapture')}
        </button>
      )}

      <div className="flex-1 h-full" />

      <LanguageSwitch />
      <span className="w-1" />
      <IconButton label={t('title.shortcuts')} onClick={onShortcuts}><Keyboard size={17} strokeWidth={1.75} /></IconButton>
      <IconButton label={t('title.about')} onClick={onAbout}><Info size={17} strokeWidth={1.75} /></IconButton>

      {!isMac && (
        <div className="flex items-center ml-1 pl-1 border-l h-6" style={{ borderColor: 'var(--border)' }}>
          <IconButton label={t('title.minimize')} onClick={() => invoke('minimize_window')}><Minus size={16} /></IconButton>
          <IconButton label={t('title.maximize')} onClick={() => invoke('toggle_fullscreen')}><Square size={13} /></IconButton>
          <IconButton label={t('title.closeToTray')} onClick={() => invoke('close_window')} danger><X size={17} /></IconButton>
        </div>
      )}
    </header>
  );
}
