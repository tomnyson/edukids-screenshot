import { useState } from 'react';
import {
  Camera, Crop, Save, Copy, Square, ArrowUpRight,
  PenTool, Type, Undo, Redo, Trash2, MousePointer2,
  Minus, Plus, ImagePlus,
} from 'lucide-react';
import type { BackgroundOption } from './CanvasEditor';

interface ToolbarProps {
  onCaptureFull:    () => void;
  onCaptureRegion:  () => void;
  onSave:           () => void;
  onCopy:           () => void;
  onToolSelect:     (tool: string) => void;
  onUndo:           () => void;
  onRedo:           () => void;
  onClear:          () => void;
  hasImage:         boolean;
  drawColor:        string;
  drawSize:         number;
  onColorChange:    (c: string) => void;
  onSizeChange:     (s: number) => void;
  background:       BackgroundOption;
  onBgChange:       (bg: BackgroundOption) => void;
}

const ToolBtn = ({ icon: Icon, label, onClick, disabled = false, primary = false, active = false }: any) => (
  <button
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`p-2 rounded-md flex items-center justify-center transition-colors z-10 cursor-pointer pointer-events-auto ${
      active   ? 'bg-blue-600 text-white' :
      primary  ? 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50' :
                 'hover:bg-gray-800 text-gray-300 disabled:opacity-30'
    }`}
  >
    <Icon size={18} />
  </button>
);

const Sep = () => <div className="w-px h-6 bg-gray-700 mx-1" />;

// ── Background presets ──────────────────────────────────────────────────────
type BgPreset = { label: string; bg: BackgroundOption; preview: string };

const BG_PRESETS: BgPreset[] = [
  {
    label: 'Không nền',
    bg: { type: 'none' },
    preview: 'repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0 / 12px 12px',
  },
  {
    label: 'Sunset',
    bg: { type: 'gradient', stops: ['#FF6B6B', '#FFE66D'], angle: 135 },
    preview: 'linear-gradient(135deg, #FF6B6B, #FFE66D)',
  },
  {
    label: 'Ocean',
    bg: { type: 'gradient', stops: ['#667eea', '#764ba2'], angle: 135 },
    preview: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  {
    label: 'Mint',
    bg: { type: 'gradient', stops: ['#11998e', '#38ef7d'], angle: 135 },
    preview: 'linear-gradient(135deg, #11998e, #38ef7d)',
  },
  {
    label: 'Night',
    bg: { type: 'gradient', stops: ['#0f0c29', '#302b63', '#24243e'], angle: 135 },
    preview: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  },
  {
    label: 'Peach',
    bg: { type: 'gradient', stops: ['#f093fb', '#f5576c'], angle: 135 },
    preview: 'linear-gradient(135deg, #f093fb, #f5576c)',
  },
  {
    label: 'Sky',
    bg: { type: 'gradient', stops: ['#4facfe', '#00f2fe'], angle: 135 },
    preview: 'linear-gradient(135deg, #4facfe, #00f2fe)',
  },
  {
    label: 'Trắng',
    bg: { type: 'solid', color: '#ffffff' },
    preview: '#ffffff',
  },
  {
    label: 'Đen',
    bg: { type: 'solid', color: '#1a1a2e' },
    preview: '#1a1a2e',
  },
];

function isSameBg(a: BackgroundOption, b: BackgroundOption) {
  if (a.type !== b.type) return false;
  if (a.type === 'none') return true;
  if (a.type === 'solid' && b.type === 'solid') return a.color === b.color;
  if (a.type === 'gradient' && b.type === 'gradient')
    return a.stops.join(',') === b.stops.join(',');
  if (a.type === 'image' && b.type === 'image')
    return a.dataUrl === b.dataUrl;
  return false;
}

function BackgroundPicker({ background, onBgChange }: { background: BackgroundOption; onBgChange: (bg: BackgroundOption) => void }) {
  const handleImagePick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onBgChange({ type: 'image', dataUrl });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-1.5">
      {BG_PRESETS.map((preset) => {
        const isActive = isSameBg(background, preset.bg);
        return (
          <button
            key={preset.label}
            title={preset.label}
            onClick={() => onBgChange(preset.bg)}
            className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer flex-shrink-0 ${
              isActive ? 'border-blue-400 scale-110 shadow-lg' : 'border-gray-600 hover:border-gray-400'
            }`}
            style={{ background: preset.preview }}
          />
        );
      })}
      {/* Custom image background */}
      <button
        title="Chọn ảnh nền"
        onClick={handleImagePick}
        className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer flex-shrink-0 flex items-center justify-center ${
          background.type === 'image'
            ? 'border-blue-400 scale-110 shadow-lg bg-blue-600'
            : 'border-gray-600 hover:border-gray-400 bg-gray-800'
        }`}
      >
        <ImagePlus size={12} className="text-gray-300" />
      </button>
    </div>
  );
}

export default function Toolbar({
  onCaptureFull, onCaptureRegion, onSave, onCopy,
  onToolSelect, onUndo, onRedo, onClear, hasImage,
  drawColor, drawSize, onColorChange, onSizeChange,
  background, onBgChange,
}: ToolbarProps) {
  const [activeTool, setActiveTool] = useState<string>('select');

  const selectTool = (tool: string) => {
    setActiveTool(tool);
    onToolSelect(tool);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 z-10">
      <div className="flex items-center space-x-1 flex-wrap gap-y-1">
        {/* Capture buttons */}
        <ToolBtn icon={Crop}   label="Chụp vùng (Area)"          onClick={onCaptureRegion} primary />
        <ToolBtn icon={Camera} label="Chụp Toàn màn hình (Full)" onClick={onCaptureFull} />

        {hasImage && (
          <>
            <Sep />
            {/* Drawing tools */}
            <ToolBtn icon={MousePointer2} label="Select / Move"  onClick={() => selectTool('select')} active={activeTool === 'select'} />
            <ToolBtn icon={Type}          label="Text"            onClick={() => selectTool('text')}   active={activeTool === 'text'} />
            <ToolBtn icon={Square}        label="Rectangle"       onClick={() => selectTool('rect')}   active={activeTool === 'rect'} />
            <ToolBtn icon={ArrowUpRight}  label="Arrow"           onClick={() => selectTool('arrow')}  active={activeTool === 'arrow'} />
            <ToolBtn icon={PenTool}       label="Draw"            onClick={() => selectTool('draw')}   active={activeTool === 'draw'} />

            <Sep />

            {/* Color picker */}
            <label title="Màu nét vẽ / chữ" className="relative cursor-pointer flex items-center">
              <div
                className="w-6 h-6 rounded-full border-2 border-gray-500 overflow-hidden"
                style={{ background: drawColor }}
              />
              <input
                type="color"
                value={drawColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>

            {/* Size control */}
            <div className="flex items-center gap-1 ml-1">
              <button
                title="Giảm kích thước"
                onClick={() => onSizeChange(Math.max(1, drawSize - 1))}
                className="p-1 rounded hover:bg-gray-800 text-gray-300 cursor-pointer"
              ><Minus size={14} /></button>
              <span className="text-gray-300 text-xs w-6 text-center select-none">{drawSize}</span>
              <button
                title="Tăng kích thước"
                onClick={() => onSizeChange(Math.min(50, drawSize + 1))}
                className="p-1 rounded hover:bg-gray-800 text-gray-300 cursor-pointer"
              ><Plus size={14} /></button>
            </div>

            <Sep />

            {/* Background picker */}
            <span className="text-gray-500 text-xs mr-1 select-none">Nền:</span>
            <BackgroundPicker background={background} onBgChange={onBgChange} />

            <Sep />

            {/* History / clear */}
            <ToolBtn icon={Undo}   label="Undo"      onClick={onUndo} />
            <ToolBtn icon={Redo}   label="Redo"      onClick={onRedo} />
            <ToolBtn icon={Trash2} label="Clear All" onClick={onClear} />
          </>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <ToolBtn icon={Copy} label="Copy Image" onClick={onCopy} disabled={!hasImage} />
        <ToolBtn icon={Save} label="Save File"  onClick={onSave} disabled={!hasImage} primary />
      </div>
    </div>
  );
}
