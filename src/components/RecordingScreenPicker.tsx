import { Monitor } from 'lucide-react';

export interface RecordingScreen {
  deviceIndex: string;
  label: string;
}

interface RecordingScreenPickerProps {
  screens: RecordingScreen[];
  onSelect: (screen: RecordingScreen) => void;
  onCancel: () => void;
}

export default function RecordingScreenPicker({
  screens,
  onSelect,
  onCancel,
}: RecordingScreenPickerProps) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-white">Chọn màn hình cần quay</h2>
        <p className="mt-1 text-sm text-gray-400">
          Video sẽ bắt đầu sau khi bạn chọn một màn hình.
        </p>

        <div className="mt-4 space-y-2">
          {screens.map((screen) => (
            <button
              key={screen.deviceIndex}
              onClick={() => onSelect(screen)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-left text-sm text-gray-200 transition-colors hover:border-red-500 hover:bg-gray-700"
            >
              <Monitor size={18} className="text-red-400" />
              <span>{screen.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-4 w-full rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
