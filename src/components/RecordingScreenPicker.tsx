import { Monitor } from 'lucide-react';
import { Dialog, DialogClose } from './AboutDialog';
import { useT } from '../i18n';

export interface RecordingScreen {
  deviceIndex: string;
  label: string;
}

interface RecordingScreenPickerProps {
  screens: RecordingScreen[];
  onSelect: (screen: RecordingScreen) => void;
  onCancel: () => void;
}

export default function RecordingScreenPicker({ screens, onSelect, onCancel }: RecordingScreenPickerProps) {
  const t = useT();
  return (
    <Dialog title={t('picker.title')} onClose={onCancel} width={420}>
      <div className="flex items-center gap-2.5 px-6 pt-5">
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--rec)]" aria-hidden />
        <h2 className="text-[18px] font-bold">{t('picker.title')}</h2>
        <span className="ml-auto"><DialogClose onClose={onCancel} /></span>
      </div>
      <p className="px-6 mt-1 text-sm text-[var(--muted)]">{t('picker.hint')}</p>
      <div className="p-4 pt-4 space-y-2">
        {screens.map((screen) => (
          <button
            key={screen.deviceIndex}
            type="button"
            onClick={() => onSelect(screen)}
            className="w-full h-14 px-4 flex items-center gap-3 rounded-[var(--radius-control)] text-left text-[15px] font-semibold cursor-pointer border
              bg-[var(--raised)] hover:bg-[var(--hover)] border-[var(--border)] hover:border-[var(--rec)]"
          >
            <Monitor size={20} className="text-[var(--rec-ink)]" />
            {screen.label}
            <span className="ml-auto text-[13px] font-medium text-[var(--muted)]">{t('picker.start')}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
