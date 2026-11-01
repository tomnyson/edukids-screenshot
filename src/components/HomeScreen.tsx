import { Crop, Monitor, SquareDashed, MonitorPlay, ImageUp, Keyboard } from 'lucide-react';
import { useShortcutLabels, isMac } from '../hooks/useShortcutLabels';
import { useT } from '../i18n';

interface HomeScreenProps {
  onCaptureRegion: () => void;
  onCaptureFull: () => void;
  onRecordRegion: () => void;
  onRecordFull: () => void;
  onOpenImage: (dataUrl: string) => void;
  onShortcuts: () => void;
}

type Action = {
  event: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  onClick: () => void;
  primary?: boolean;
  record?: boolean;
};

function Key({ children, onPrimary = false }: { children: React.ReactNode; onPrimary?: boolean }) {
  return (
    <kbd
      className="num inline-flex items-center h-7 px-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap"
      style={onPrimary
        ? { background: 'rgba(255,255,255,.16)', color: '#fff' }
        : { background: 'var(--ground)', color: 'var(--muted)', border: '1px solid var(--control)' }}
    >
      {children}
    </kbd>
  );
}

function ActionTile({ a, keyLabel }: { a: Action; keyLabel?: string }) {
  const Icon = a.icon;
  return (
    <button
      type="button"
      onClick={a.onClick}
      className={`group text-left rounded-[var(--radius-panel)] p-5 min-h-[148px] flex flex-col cursor-pointer border
        ${a.primary
          ? 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] border-transparent text-white'
          : 'bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--border)] hover:border-[var(--control)]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={a.primary ? 'text-white' : a.record ? 'text-[var(--rec-ink)]' : 'text-[var(--accent)]'}>
          <Icon size={30} strokeWidth={1.75} />
        </span>
        {keyLabel && <Key onPrimary={a.primary}>{keyLabel}</Key>}
      </div>
      <div className="mt-auto pt-6">
        <div className="text-[19px] font-semibold leading-tight flex items-center gap-2">
          {a.record && <span className="w-2.5 h-2.5 rounded-full bg-[var(--rec)]" aria-hidden />}
          {a.title}
        </div>
        <div className={`mt-1.5 text-sm leading-snug ${a.primary ? 'text-white/85' : 'text-[var(--muted)]'}`}>{a.hint}</div>
      </div>
    </button>
  );
}

/** The home screen: the four things this app does, each one click (or one shortcut) away. */
export default function HomeScreen(p: HomeScreenProps) {
  const keys = useShortcutLabels();
  const t = useT();

  const capture: Action[] = [
    { event: 'trigger-capture-region', title: t('home.captureRegion'), hint: t('home.captureRegionHint'), icon: Crop, onClick: p.onCaptureRegion, primary: true },
    { event: 'trigger-capture-full', title: t('home.captureFull'), hint: t('home.captureFullHint'), icon: Monitor, onClick: p.onCaptureFull },
  ];
  const record: Action[] = [
    { event: 'trigger-record-region', title: t('home.recordRegion'), hint: t('home.recordRegionHint'), icon: SquareDashed, onClick: p.onRecordRegion, record: true },
    { event: 'trigger-record-full', title: t('home.recordFull'), hint: t('home.recordFullHint'), icon: MonitorPlay, onClick: p.onRecordFull, record: true },
  ];

  const openImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => p.onOpenImage(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const pasteKey = isMac ? '⌘V' : 'Ctrl+V';

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[920px] mx-auto px-8 pt-12 pb-10">
        <h1 className="text-[30px] font-bold tracking-tight leading-tight">{t('home.title')}</h1>
        <p className="mt-2 text-[15px] text-[var(--muted)]">
          {t('home.subtitle')}
        </p>

        <section aria-labelledby="h-capture" className="mt-9">
          <h2 id="h-capture" className="text-[15px] font-semibold text-[var(--muted)] mb-3">{t('home.sectionCapture')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capture.map((a) => <ActionTile key={a.event} a={a} keyLabel={keys[a.event]} />)}
          </div>
        </section>

        <section aria-labelledby="h-record" className="mt-8">
          <h2 id="h-record" className="text-[15px] font-semibold text-[var(--muted)] mb-3">{t('home.sectionRecord')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {record.map((a) => <ActionTile key={a.event} a={a} keyLabel={keys[a.event]} />)}
          </div>
        </section>

        <section aria-label={t('home.other')} className="mt-8 rounded-[var(--radius-panel)] border flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <button type="button" onClick={openImage}
            className="h-10 px-4 rounded-full flex items-center gap-2 text-sm font-semibold cursor-pointer bg-[var(--raised)] hover:bg-[var(--hover)] border border-[var(--control)]">
            <ImageUp size={17} /> {t('home.openImage')}
          </button>
          <span className="text-sm text-[var(--muted)]">
            {t('home.paste')} <Key>{pasteKey}</Key>
          </span>
          <button type="button" onClick={p.onShortcuts}
            className="ml-auto text-sm font-medium flex items-center gap-1.5 cursor-pointer text-[var(--accent)] hover:underline underline-offset-4">
            <Keyboard size={16} /> {t('home.changeShortcuts')}
          </button>
        </section>
      </div>
    </div>
  );
}
