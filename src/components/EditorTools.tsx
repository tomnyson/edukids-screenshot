import { MousePointer2, Type, Square, ArrowUpRight, PenLine, Minus, Plus } from 'lucide-react';

export type Tool = 'select' | 'text' | 'rect' | 'arrow' | 'draw';

const TOOLS: { id: Tool; label: string; key: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'select', label: 'Chọn', key: 'V', icon: MousePointer2 },
  { id: 'text', label: 'Chữ', key: 'T', icon: Type },
  { id: 'rect', label: 'Khung', key: 'R', icon: Square },
  { id: 'arrow', label: 'Mũi tên', key: 'A', icon: ArrowUpRight },
  { id: 'draw', label: 'Bút vẽ', key: 'P', icon: PenLine },
];

/** Annotation colours chosen to read on screenshots of lessons and code. */
const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827', '#ffffff'];

interface EditorToolsProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  color: string;
  onColor: (c: string) => void;
  size: number;
  onSize: (n: number) => void;
}

export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

/** Left rail: the drawing tools, each with its name, then colour and stroke size. */
export default function EditorTools({ tool, onTool, color, onColor, size, onSize }: EditorToolsProps) {
  return (
    <aside
      aria-label="Công cụ vẽ"
      className="w-[92px] flex-shrink-0 border-r flex flex-col items-stretch gap-1 p-2 overflow-y-auto"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            aria-pressed={active}
            title={`${t.label} (phím ${t.key})`}
            className={`h-[62px] rounded-[var(--radius-control)] flex flex-col items-center justify-center gap-1 cursor-pointer
              ${active ? 'bg-[var(--active)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}
          >
            <span className={active ? 'text-[var(--accent)]' : ''}><Icon size={21} strokeWidth={1.8} /></span>
            <span className="text-[12.5px] font-medium">{t.label}</span>
          </button>
        );
      })}

      <div className="h-px my-2" style={{ background: 'var(--border)' }} />

      <div className="px-1">
        <div className="text-[12px] font-medium text-[var(--muted)] mb-2 text-center">Màu</div>
        <div className="grid grid-cols-3 gap-1.5 justify-items-center">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Màu ${c}`}
              aria-pressed={color.toLowerCase() === c}
              onClick={() => onColor(c)}
              className="w-[22px] h-[22px] rounded-full cursor-pointer"
              style={{
                background: c,
                boxShadow: color.toLowerCase() === c
                  ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)'
                  : 'inset 0 0 0 1px rgba(255,255,255,.18)',
              }}
            />
          ))}
        </div>
        <label className="mt-2 h-8 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-medium cursor-pointer text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] relative" title="Chọn màu khác">
          <span className="w-3.5 h-3.5 rounded-full" style={{ background: color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' }} />
          Khác
          <input type="color" value={color} onChange={(e) => onColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Chọn màu khác" />
        </label>
      </div>

      <div className="h-px my-2" style={{ background: 'var(--border)' }} />

      <div className="px-1">
        <div className="text-[12px] font-medium text-[var(--muted)] mb-1.5 text-center">Cỡ nét</div>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Nét nhỏ hơn" onClick={() => onSize(Math.max(1, size - 1))}
            className="w-7 h-7 grid place-items-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"><Minus size={14} /></button>
          <span className="num text-sm font-semibold w-6 text-center">{size}</span>
          <button type="button" aria-label="Nét lớn hơn" onClick={() => onSize(Math.min(50, size + 1))}
            className="w-7 h-7 grid place-items-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"><Plus size={14} /></button>
        </div>
        <div className="mt-2 h-6 grid place-items-center" aria-hidden>
          <span className="rounded-full" style={{ width: Math.min(40, Math.max(4, size * 2)), height: Math.min(20, Math.max(2, size)), background: color }} />
        </div>
      </div>
    </aside>
  );
}
