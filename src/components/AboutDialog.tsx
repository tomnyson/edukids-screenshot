import { useEffect } from 'react';
import { RefreshCw, X, Globe, Mail } from 'lucide-react';
import { Wordmark } from './brand/EdukidsMark';
import appIcon from '../assets/edukids-app-icon.png';
import { checkForUpdates } from '../updater';

/** Shared dialog frame: one tone step above the ground, the only surface with a shadow (it floats). */
export function Dialog({ title, onClose, children, width = 420 }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full rounded-[20px] border shadow-[0_24px_64px_rgba(0,0,0,.5)]"
        style={{ maxWidth: width, background: 'var(--surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Đóng" title="Đóng"
      className="w-8 h-8 grid place-items-center rounded-full cursor-pointer text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
      <X size={17} />
    </button>
  );
}

export default function AboutDialog({ version, onClose }: { version: string; onClose: () => void }) {
  return (
    <Dialog title="Giới thiệu" onClose={onClose} width={400}>
      <div className="flex justify-end p-3 pb-0"><DialogClose onClose={onClose} /></div>
      <div className="px-7 pb-7 -mt-2 text-center">
        <img src={appIcon} alt="" width={84} height={84} className="mx-auto rounded-[20px]" />
        <h1 className="mt-4 text-[22px]"><Wordmark /></h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Chụp, ghi chú và quay màn hình cho lớp học lập trình tại EduKids Tây Nguyên, Buôn Ma Thuột.
        </p>
        <p className="mt-3 num text-sm text-[var(--faint)]">Phiên bản {version || '—'}</p>

        <button
          type="button"
          onClick={() => void checkForUpdates({ silent: false })}
          className="mt-5 h-11 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-bold cursor-pointer text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
        >
          <RefreshCw size={17} /> Kiểm tra cập nhật
        </button>

        <div className="mt-7 pt-5 border-t text-sm space-y-2" style={{ borderColor: 'var(--border)' }}>
          <p><span className="text-[var(--muted)]">Tác giả:</span> <span className="font-semibold">Lê Hồng Sơn</span></p>
          <p className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="mailto:tabletkindfire@gmail.com" className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline underline-offset-4">
              <Mail size={15} /> tabletkindfire@gmail.com
            </a>
            <a href="https://edukidstaynguyen.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline underline-offset-4">
              <Globe size={15} /> edukidstaynguyen.com
            </a>
          </p>
        </div>
      </div>
    </Dialog>
  );
}
