import { useState } from 'react';
import { Undo2, Redo2, Trash2, Copy, Download, ImagePlus, Check } from 'lucide-react';
import { ASPECT_RATIOS, type BackgroundOption } from './CanvasEditor';
import { isMac } from '../hooks/useShortcutLabels';
import { useT, type Key } from '../i18n';

// Background presets are user content (they are drawn into the exported image),
// so gradients are allowed here; the app chrome itself stays flat.
type BgPreset = { label: Key; bg: BackgroundOption; preview: string };
const BG_PRESETS: BgPreset[] = [
  { label: 'panel.bg.none', bg: { type: 'none' }, preview: 'repeating-conic-gradient(#3a4256 0% 25%, #232a3b 0% 50%) 0 0 / 10px 10px' },
  { label: 'panel.bg.edukids', bg: { type: 'gradient', stops: ['#1e3a8a', '#2563eb'], angle: 135 }, preview: 'linear-gradient(135deg,#1e3a8a,#2563eb)' },
  { label: 'panel.bg.ocean', bg: { type: 'gradient', stops: ['#667eea', '#764ba2'], angle: 135 }, preview: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { label: 'panel.bg.sunset', bg: { type: 'gradient', stops: ['#FF6B6B', '#FFE66D'], angle: 135 }, preview: 'linear-gradient(135deg,#FF6B6B,#FFE66D)' },
  { label: 'panel.bg.mint', bg: { type: 'gradient', stops: ['#11998e', '#38ef7d'], angle: 135 }, preview: 'linear-gradient(135deg,#11998e,#38ef7d)' },
  { label: 'panel.bg.peach', bg: { type: 'gradient', stops: ['#f093fb', '#f5576c'], angle: 135 }, preview: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  { label: 'panel.bg.sky', bg: { type: 'gradient', stops: ['#4facfe', '#00f2fe'], angle: 135 }, preview: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
  { label: 'panel.bg.night', bg: { type: 'gradient', stops: ['#0f0c29', '#302b63', '#24243e'], angle: 135 }, preview: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' },
  { label: 'panel.bg.white', bg: { type: 'solid', color: '#ffffff' }, preview: '#ffffff' },
];

function sameBg(a: BackgroundOption, b: BackgroundOption) {
  if (a.type !== b.type) return false;
  if (a.type === 'none') return true;
  if (a.type === 'solid' && b.type === 'solid') return a.color === b.color;
  if (a.type === 'gradient' && b.type === 'gradient') return a.stops.join(',') === b.stops.join(',');
  if (a.type === 'image' && b.type === 'image') return a.dataUrl === b.dataUrl;
  return false;
}

function bgName(bg: BackgroundOption): Key {
  if (bg.type === 'image') return 'panel.bg.yours';
  return BG_PRESETS.find((p) => sameBg(p.bg, bg))?.label ?? 'panel.bg.custom';
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-2.5">
      <h2 className="text-[13px] font-semibold text-[var(--text)]">{children}</h2>
      {aside && <span className="text-[12px] text-[var(--muted)] truncate ml-2">{aside}</span>}
    </div>
  );
}

interface EditorPanelProps {
  background: BackgroundOption;
  onBackground: (bg: BackgroundOption) => void;
  onAspectRatio: (r: [number, number] | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onCopy: () => Promise<boolean>;
  onSave: () => Promise<boolean>;
}

/** Right panel: how the picture is framed, history, and the two ways out (copy, save). */
export default function EditorPanel(p: EditorPanelProps) {
  const t = useT();
  const [ratio, setRatio] = useState('original');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const mod = isMac ? '⌘' : 'Ctrl+';

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => p.onBackground({ type: 'image', dataUrl: r.result as string });
      r.readAsDataURL(f);
    };
    input.click();
  };

  const flash = (set: (v: boolean) => void) => { set(true); window.setTimeout(() => set(false), 1800); };

  return (
    <aside
      aria-label={t('panel.aria')}
      className="w-[276px] flex-shrink-0 border-l flex flex-col"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex-1 overflow-y-auto p-5 space-y-7">
        <section>
          <SectionTitle aside={t(bgName(p.background))}>{t('panel.background')}</SectionTitle>
          <div className="grid grid-cols-5 gap-2">
            {BG_PRESETS.map((preset) => {
              const active = sameBg(p.background, preset.bg);
              return (
                <button
                  key={preset.label}
                  type="button"
                  title={t(preset.label)}
                  aria-label={t(preset.label)}
                  aria-pressed={active}
                  onClick={() => p.onBackground(preset.bg)}
                  className="aspect-square rounded-[10px] cursor-pointer"
                  style={{
                    background: preset.preview,
                    boxShadow: active ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(255,255,255,.12)',
                  }}
                />
              );
            })}
            <button
              type="button"
              title={t('panel.bg.pick')}
              aria-label={t('panel.bg.pick')}
              aria-pressed={p.background.type === 'image'}
              onClick={pickImage}
              className="aspect-square rounded-[10px] grid place-items-center cursor-pointer text-[var(--muted)] hover:text-[var(--text)] bg-[var(--raised)] hover:bg-[var(--hover)]"
              style={{ boxShadow: p.background.type === 'image' ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px var(--control)' }}
            >
              <ImagePlus size={17} />
            </button>
          </div>
        </section>

        <section>
          <SectionTitle aside={ratio === 'original' ? t('panel.frameFollow') : ratio}>{t('panel.frame')}</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {ASPECT_RATIOS.map((ar) => {
              const active = ratio === ar.label;
              const w = ar.value ? (ar.value[0] >= ar.value[1] ? 22 : Math.round(22 * ar.value[0] / ar.value[1])) : 18;
              const h = ar.value ? (ar.value[1] >= ar.value[0] ? 22 : Math.round(22 * ar.value[1] / ar.value[0])) : 14;
              return (
                <button
                  key={ar.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setRatio(ar.label); p.onAspectRatio(ar.value); }}
                  className={`h-[58px] rounded-[var(--radius-control)] flex flex-col items-center justify-center gap-1.5 cursor-pointer text-[12px] font-medium
                    ${active ? 'bg-[var(--active)] text-[var(--text)]' : 'bg-[var(--raised)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}
                >
                  <span className="rounded-[3px]" style={{ width: w, height: h, border: `1.5px solid ${active ? 'var(--accent)' : 'currentColor'}`, borderStyle: ar.value ? 'solid' : 'dashed' }} />
                  {ar.value ? ar.label : t('panel.frameOriginal')}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle>{t('panel.edit')}</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('panel.undo'), title: t('panel.undoTitle', { key: mod }), icon: Undo2, on: p.onUndo },
              { label: t('panel.redo'), title: t('panel.redoTitle', { key: mod }), icon: Redo2, on: p.onRedo },
              { label: t('panel.clear'), title: t('panel.clearTitle'), icon: Trash2, on: p.onClear },
            ].map((b) => {
              const Icon = b.icon;
              return (
                <button key={b.label} type="button" title={b.title} onClick={b.on}
                  className="h-[58px] rounded-[var(--radius-control)] flex flex-col items-center justify-center gap-1 cursor-pointer text-[12px] font-medium bg-[var(--raised)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]">
                  <Icon size={18} strokeWidth={1.8} />
                  {b.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="p-5 pt-4 border-t space-y-2.5" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={async () => { if (await p.onCopy()) flash(setCopied); }}
          className="w-full h-11 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold cursor-pointer border bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--control)]"
        >
          {copied ? <><Check size={18} className="text-[var(--positive)]" /> {t('panel.copied')}</> : <><Copy size={17} /> {t('panel.copy')}</>}
        </button>
        <button
          type="button"
          onClick={async () => { if (await p.onSave()) flash(setSaved); }}
          className="w-full h-11 rounded-full flex items-center justify-center gap-2 text-[15px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
        >
          {saved ? <><Check size={18} /> {t('panel.saved')}</> : <><Download size={17} /> {t('panel.save')}</>}
        </button>
        <p className="text-[12px] text-center text-[var(--faint)]">
          {copied ? t('panel.pasteHint', { key: isMac ? '⌘V' : 'Ctrl+V' }) : t('panel.saveHint', { key: mod })}
        </p>
      </div>
    </aside>
  );
}
