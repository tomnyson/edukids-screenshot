import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

interface RecordingPreviewProps {
  filePath: string;
  onClose: () => void;
}

export default function RecordingPreview({ filePath, onClose }: RecordingPreviewProps) {
  const [saving, setSaving] = useState(false);
  const videoSrc = convertFileSrc(filePath);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const saved = await invoke<boolean>('save_recording', {
        sourcePath: filePath,
        defaultName: `Recording-${dateStr}.mp4`,
      });
      if (saved) {
        onClose();
      }
    } catch (err) {
      console.error('Save recording failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    try {
      await invoke('discard_recording', { sourcePath: filePath });
    } catch (err) {
      console.error('Discard failed:', err);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⏺</span>
            <h3 className="text-white font-semibold text-sm">Xem lại video</h3>
          </div>
          <button
            onClick={handleDiscard}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer text-lg leading-none"
            title="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Video player */}
        <div className="p-4">
          <video
            src={videoSrc}
            controls
            autoPlay
            className="w-full rounded-lg border border-gray-700 bg-black"
            style={{ maxHeight: '400px' }}
          />
        </div>

        {/* File info */}
        <div className="px-5 pb-2">
          <p className="text-gray-500 text-xs truncate" title={filePath}>
            📁 {filePath}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={handleDiscard}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            🗑️ Bỏ đi
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? '⏳ Đang lưu...' : '💾 Lưu video'}
          </button>
        </div>
      </div>
    </div>
  );
}
