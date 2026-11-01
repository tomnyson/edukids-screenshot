import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { computeLayout, PADDING, type CanvasLayout } from './canvasLayout';
import { tStatic } from '../i18n';

export type BackgroundOption =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; stops: string[]; angle: number }
  | { type: 'image'; dataUrl: string };

export type AspectRatio = {
  label: string;
  value: [number, number] | null; // null = free / original
};

export const ASPECT_RATIOS: AspectRatio[] = [
  { label: 'original', value: null }, // shown as t('panel.frameOriginal')
  { label: '16:9', value: [16, 9] },
  { label: '9:16', value: [9, 16] },
  { label: '4:3', value: [4, 3] },
  { label: '3:2', value: [3, 2] },
  { label: '1:1', value: [1, 1] },
  { label: '21:9', value: [21, 9] },
];

interface CanvasEditorProps {
  imageUrl: string;
  onReady: (methods: any) => void;
  drawColor: string;
  drawSize: number;
  onDrawSizeChange: (size: number) => void;
  background: BackgroundOption;
}

/** Build a proper arrow (line + filled triangle arrowhead) as a Fabric Group */
function makeArrow(
  x1: number, y1: number, x2: number, y2: number,
  color: string, strokeWidth: number
): fabric.Group {
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
  const headLen = Math.max(strokeWidth * 4, 16);
  const headW  = Math.max(strokeWidth * 2.5, 10);

  const line = new fabric.Line([x1, y1, x2, y2], {
    stroke: color,
    strokeWidth,
    selectable: false,
    evented: false,
  });

  const head = new fabric.Triangle({
    width: headW,
    height: headLen,
    fill: color,
    left: x2,
    top: y2,
    originX: 'center',
    originY: 'center',
    angle: angle + 90,
    selectable: false,
    evented: false,
  });

  return new fabric.Group([line, head], {
    selectable: true,
    evented: true,
  });
}

/** Draw the wallpaper background into a canvas 2D context */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: BackgroundOption,
  width: number,
  height: number,
  bgImage?: HTMLImageElement | null,
) {
  if (bg.type === 'none') {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (bg.type === 'image' && bgImage) {
    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
    const canvasRatio = width / height;
    let sx = 0, sy = 0, sw = bgImage.naturalWidth, sh = bgImage.naturalHeight;
    if (imgRatio > canvasRatio) {
      sw = bgImage.naturalHeight * canvasRatio;
      sx = (bgImage.naturalWidth - sw) / 2;
    } else {
      sh = bgImage.naturalWidth / canvasRatio;
      sy = (bgImage.naturalHeight - sh) / 2;
    }
    ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, width, height);
    return;
  }
  if (bg.type === 'gradient') {
    const rad = (bg.angle * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const half = Math.sqrt(cx * cx + cy * cy);
    const x0 = cx - Math.cos(rad) * half;
    const y0 = cy - Math.sin(rad) * half;
    const x1 = cx + Math.cos(rad) * half;
    const y1 = cy + Math.sin(rad) * half;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    bg.stops.forEach((color, i) => {
      grad.addColorStop(i / (bg.stops.length - 1), color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

/** Load an image from a data URL */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Custom property name to tag the screenshot object
const SCREENSHOT_TAG = '__isScreenshot';

export default function CanvasEditor({
  imageUrl, onReady, drawColor, drawSize, onDrawSizeChange, background,
}: CanvasEditorProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [currentTool, setCurrentTool]   = useState<string>('select');

  const historyRef      = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const colorRef = useRef(drawColor);
  const sizeRef  = useRef(drawSize);
  const bgRef    = useRef(background);
  useEffect(() => { colorRef.current = drawColor; }, [drawColor]);
  useEffect(() => { sizeRef.current  = drawSize;  }, [drawSize]);
  useEffect(() => { bgRef.current    = background; }, [background]);

  const saveHistory = (canvas: fabric.Canvas) => {
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.stringify(canvas.toJSON()));
    historyIndexRef.current = historyRef.current.length - 1;
  };

  /** Find the screenshot FabricImage on the canvas */
  const findScreenshot = (canvas: fabric.Canvas): fabric.FabricImage | null => {
    return canvas.getObjects().find((o: any) => (o as any)[SCREENSHOT_TAG]) as fabric.FabricImage | null ?? null;
  };

  /** Toggle screenshot selectability based on tool */
  const setScreenshotInteractive = (canvas: fabric.Canvas, interactive: boolean) => {
    const ss = findScreenshot(canvas);
    if (!ss) return;
    ss.set({
      selectable: interactive,
      evented: interactive,
      hasControls: interactive,
      hasBorders: interactive,
    });
    if (!interactive) {
      canvas.discardActiveObject();
    }
    canvas.renderAll();
  };

  const ratioRef = useRef<[number, number] | null>(null);
  // Incremented per layout pass so a slow, stale backdrop build never wins
  const layoutGenRef = useRef(0);

  // Space left for the picture: the window minus the tool rail (92), the side
  // panel (276), the title bar (48) and the canvas area's padding (2 × 24).
  const viewportMax = () => ({
    maxW: Math.max(320, window.innerWidth  - 92 - 276 - 48 - 8),
    maxH: Math.max(240, window.innerHeight - 48 - 48 - 8),
  });

  /** Rebuild the backdrop image for the current canvas size + background */
  const rebuildBackground = async (canvas: fabric.Canvas, bg: BackgroundOption) => {
    const gen = ++layoutGenRef.current;
    const canvasW = canvas.getWidth();
    const canvasH = canvas.getHeight();
    const offscreen = document.createElement('canvas');
    offscreen.width  = canvasW;
    offscreen.height = canvasH;
    const offCtx = offscreen.getContext('2d')!;

    let bgImage: HTMLImageElement | null = null;
    if (bg.type === 'image') {
      bgImage = await loadImage(bg.dataUrl).catch(() => null);
    }
    drawBackground(offCtx, bg, canvasW, canvasH, bgImage);
    if (gen !== layoutGenRef.current) return; // superseded by a newer layout

    if (bg.type === 'none') {
      canvas.backgroundImage = undefined;
      canvas.renderAll();
      return;
    }
    const composite = await loadImage(offscreen.toDataURL('image/png'));
    if (gen !== layoutGenRef.current) return; // superseded by a newer layout
    canvas.backgroundImage = new fabric.FabricImage(composite, {
      left: 0, top: 0, originX: 'left', originY: 'top',
      scaleX: 1, scaleY: 1, selectable: false, evented: false,
    });
    canvas.renderAll();
  };

  /**
   * Single source of truth for positioning: resize the canvas, place the
   * screenshot, move annotations along with it, then redraw the backdrop.
   */
  const applyLayout = async (canvas: fabric.Canvas, bg: BackgroundOption) => {
    const ss = findScreenshot(canvas);
    if (!ss) return;
    const el = (ss as any)._element ?? ss.getElement?.();
    const imgW = el?.naturalWidth || ss.width;
    const imgH = el?.naturalHeight || ss.height;

    const pad = bg.type === 'none' ? 0 : PADDING;
    const layout: CanvasLayout = computeLayout({
      imgW, imgH, ...viewportMax(), pad, ratio: ratioRef.current,
    });

    // Move/scale annotations relative to the screenshot so they stay attached
    const prevLeft  = ss.left ?? 0;
    const prevTop   = ss.top ?? 0;
    const prevScale = ss.scaleX || 1;
    const k = layout.scale / prevScale;
    canvas.getObjects().forEach((o: any) => {
      if (o[SCREENSHOT_TAG]) return;
      o.set({
        left:   layout.left + ((o.left ?? 0) - prevLeft) * k,
        top:    layout.top  + ((o.top  ?? 0) - prevTop)  * k,
        scaleX: (o.scaleX ?? 1) * k,
        scaleY: (o.scaleY ?? 1) * k,
      });
      o.setCoords();
    });

    canvas.setDimensions({ width: layout.canvasW, height: layout.canvasH });
    ss.set({ left: layout.left, top: layout.top, scaleX: layout.scale, scaleY: layout.scale });
    ss.setCoords();
    canvas.renderAll();
    await rebuildBackground(canvas, bg);
  };

  /** Create the screenshot object (not selectable by default) and lay it out */
  const addScreenshot = async (canvas: fabric.Canvas, img: HTMLImageElement, bg: BackgroundOption) => {
    const screenshotFi = new fabric.FabricImage(img, {
      left: 0, top: 0,
      originX: 'left', originY: 'top',
      cornerColor: '#4facfe',
      cornerStrokeColor: '#fff',
      cornerSize: 10,
      transparentCorners: false,
      lockUniScaling: true,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
    });
    (screenshotFi as any)[SCREENSHOT_TAG] = true;
    canvas.add(screenshotFi);
    canvas.sendObjectToBack(screenshotFi);
    await applyLayout(canvas, bg);
    saveHistory(canvas);
  };

  // ── Canvas init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: false,
      selection:     true,
      enableRetinaScaling: false,
    });
    setFabricCanvas(canvas);
    ratioRef.current = null;

    loadImage(imageUrl)
      .then((img) => addScreenshot(canvas, img, bgRef.current))
      .catch((err) => console.error('Failed to load screenshot into editor', err));

    canvas.on('object:modified', () => saveHistory(canvas));
    canvas.on('object:added',    () => saveHistory(canvas));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = canvas.getActiveObject();
      if (!active || (active as any).isEditing) return;
      // Prevent deleting the screenshot
      if ((active as any)[SCREENSHOT_TAG]) return;
      const selected = canvas.getActiveObjects().filter((o: any) => !(o as any)[SCREENSHOT_TAG]);
      canvas.discardActiveObject();
      canvas.remove(...selected);
      saveHistory(canvas);
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.target as HTMLElement).closest('canvas')) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const next  = Math.min(50, Math.max(1, sizeRef.current + delta));
      onDrawSizeChange(next);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel',   onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel',   onWheel);
      canvas.dispose();
    };
  }, [imageUrl]);

  // ── Re-layout when `background` changes (padding + backdrop) ─────────────
  useEffect(() => {
    if (!fabricCanvas) return;
    applyLayout(fabricCanvas, background)
      .catch((err) => console.error('Failed to apply background', err));
  }, [background, fabricCanvas]);

  // ── Sync brush color/size in real-time while in draw mode ─────────────────
  useEffect(() => {
    if (!fabricCanvas || currentTool !== 'draw') return;
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.color = drawColor;
    fabricCanvas.freeDrawingBrush.width = drawSize;
  }, [drawColor, drawSize, currentTool, fabricCanvas]);

  // ── Tool mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fabricCanvas) return;

    const isDraw = currentTool === 'draw';
    fabricCanvas.isDrawingMode = isDraw;

    // Toggle screenshot interactivity based on tool
    const isSelectMode = currentTool === 'select';
    setScreenshotInteractive(fabricCanvas, isSelectMode);

    if (isDraw) {
      if (!fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      }
      fabricCanvas.freeDrawingBrush.color = colorRef.current;
      fabricCanvas.freeDrawingBrush.width = sizeRef.current;
      fabricCanvas.selection = false;
    }

    let isDrawing = false;
    let startX    = 0;
    let startY    = 0;
    let previewGroup: fabric.Group | null = null;

    const onMouseDown = (o: any) => {
      if (!o.e) return;
      isDrawing = true;
      const pt  = fabricCanvas.getScenePoint(o.e);
      startX    = pt.x;
      startY    = pt.y;

      if (currentTool === 'rect') {
        const r = new fabric.Rect({
          left: startX, top: startY, width: 0, height: 0,
          fill: 'transparent', stroke: colorRef.current, strokeWidth: sizeRef.current,
        });
        fabricCanvas.add(r);
        (onMouseDown as any)._shape = r;
      } else if (currentTool === 'arrow') {
        previewGroup = makeArrow(startX, startY, startX + 1, startY, colorRef.current, sizeRef.current);
        fabricCanvas.add(previewGroup);
      } else if (currentTool === 'text') {
        const text = new fabric.IText(tStatic('canvas.textPlaceholder'), {
          left: pt.x, top: pt.y,
          fill: colorRef.current, fontSize: sizeRef.current * 3 || 24,
          fontFamily: 'sans-serif',
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        isDrawing = false;
      }
    };

    const onMouseMove = (o: any) => {
      if (!isDrawing || !o.e) return;
      const pt = fabricCanvas.getScenePoint(o.e);

      if (currentTool === 'rect') {
        const shape = (onMouseDown as any)._shape as fabric.Rect | undefined;
        if (!shape) return;
        shape.set({
          width:  Math.abs(pt.x - startX),
          height: Math.abs(pt.y - startY),
          left:   Math.min(pt.x, startX),
          top:    Math.min(pt.y, startY),
        });
      } else if (currentTool === 'arrow' && previewGroup) {
        fabricCanvas.remove(previewGroup);
        previewGroup = makeArrow(startX, startY, pt.x, pt.y, colorRef.current, sizeRef.current);
        fabricCanvas.add(previewGroup);
        fabricCanvas.off('object:added', () => saveHistory(fabricCanvas));
      }
      fabricCanvas.renderAll();
    };

    const onMouseUp = () => {
      if (currentTool === 'text') return;
      isDrawing  = false;
      previewGroup = null;
      (onMouseDown as any)._shape = null;
      fabricCanvas.on('object:added', () => saveHistory(fabricCanvas));
    };

    if (['rect', 'arrow', 'text'].includes(currentTool)) {
      fabricCanvas.selection = false;
      fabricCanvas.on('mouse:down', onMouseDown);
      fabricCanvas.on('mouse:move', onMouseMove);
      fabricCanvas.on('mouse:up',   onMouseUp);
    } else if (!isDraw) {
      // select mode — allow normal object selection
      fabricCanvas.selection = true;
    }

    if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = colorRef.current;
      fabricCanvas.freeDrawingBrush.width = sizeRef.current;
    }

    return () => {
      fabricCanvas.off('mouse:down', onMouseDown);
      fabricCanvas.off('mouse:move', onMouseMove);
      fabricCanvas.off('mouse:up',   onMouseUp);
    };
  }, [currentTool, fabricCanvas, drawColor, drawSize]);

  // ── onReady API ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!onReady || !fabricCanvas) return;

    onReady({
      setTool: (tool: string) => setCurrentTool(tool),
      undo: () => {
        if (historyIndexRef.current > 0) {
          historyIndexRef.current -= 1;
          fabricCanvas.loadFromJSON(historyRef.current[historyIndexRef.current])
            .then(() => fabricCanvas.renderAll());
        }
      },
      redo: () => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current += 1;
          fabricCanvas.loadFromJSON(historyRef.current[historyIndexRef.current])
            .then(() => fabricCanvas.renderAll());
        }
      },
      clearAll: () => {
        fabricCanvas.clear();
        historyRef.current      = [];
        historyIndexRef.current = -1;
        loadImage(imageUrl)
          .then((img) => addScreenshot(fabricCanvas, img, bgRef.current))
          .catch((err) => console.error('Failed to reload screenshot', err));
      },
      exportImage: () => {
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        return fabricCanvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
      },
      /** Resize canvas to match a specific aspect ratio (null = original) */
      resizeToAspectRatio: (ratio: [number, number] | null) => {
        ratioRef.current = ratio;
        applyLayout(fabricCanvas, bgRef.current)
          .catch((err) => console.error('Failed to apply aspect ratio', err));
      },
    });
  }, [fabricCanvas, onReady, imageUrl]);

  return (
    <div className="rounded-[10px] overflow-hidden" style={{ boxShadow: '0 0 0 1px var(--border)' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
