import { Monitor, Shield, ChevronRight, RefreshCw } from 'lucide-react';

interface PermissionGuideProps {
  reason: 'no-electron' | 'no-permission';
  onRetry: () => void;
}

export default function PermissionGuide({ reason, onRetry }: PermissionGuideProps) {
  const isElectronMissing = reason === 'no-electron';

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      {/* Icon */}
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${
        isElectronMissing ? 'bg-blue-900/40 border border-blue-700' : 'bg-amber-900/40 border border-amber-700'
      }`}>
        {isElectronMissing 
          ? <Monitor className="w-10 h-10 text-blue-400" />
          : <Shield className="w-10 h-10 text-amber-400" />
        }
      </div>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-white mb-2">
        {isElectronMissing ? 'Cần chạy dưới dạng Desktop App' : 'Cần cấp quyền Screen Recording'}
      </h1>
      <p className="text-gray-400 text-sm text-center max-w-sm mb-8">
        {isElectronMissing
          ? 'Chức năng chụp màn hình chỉ hoạt động khi mở app bằng file .dmg hoặc lệnh yarn dev trong terminal.'
          : 'macOS yêu cầu cấp quyền Screen Recording trước khi ứng dụng có thể chụp màn hình.'}
      </p>

      {/* Steps */}
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
        {isElectronMissing ? (
          <>
            <Step num={1} text='Đóng trình duyệt web này lại.' />
            <Step num={2} text='Mở Terminal và cd vào thư mục dự án.' />
            <Step num={3} text='Chạy lệnh: yarn dev' />
            <Step num={4} text='Hoặc cài file .dmg từ thư mục dist/' last />
          </>
        ) : (
          <>
            <Step num={1} text='Mở System Settings (⌘ + Space → "System Settings").' />
            <Step num={2} text='Chọn mục Privacy & Security ở thanh bên trái.' />
            <Step num={3} text='Cuộn xuống và chọn "Screen & System Audio Recording".' />
            <Step num={4} text='Bật toggle cho ứng dụng "Screenshot Tool".' />
            <Step num={5} text='⚠️ Quan trọng: Quit app (⌘Q) và mở lại — macOS yêu cầu restart để quyền có hiệu lực!' last />
          </>
        )}
      </div>

      {/* Retry button (only for permission issue) */}
      {!isElectronMissing && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <RefreshCw size={16} />
          Thử lại sau khi cấp quyền
        </button>
      )}
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
