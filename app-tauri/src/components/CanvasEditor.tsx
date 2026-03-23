import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';

export type BackgroundOption =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; stops: string[]; angle: number }
  | { type: 'image'; dataUrl: string };

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

/** Draw the wallpaper background onto a canvas 2D context */
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
    // Cover-fill: scale image to cover entire canvas
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
  // gradient
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

const PADDING = 60; // px padding around screenshot when a bg is applied

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

  // ── Canvas init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: false,
      selection:     true,
      enableRetinaScaling: false,
    });
    setFabricCanvas(canvas);

    const htmlImg  = new Image();
    htmlImg.onload = async () => {
      const imgW = htmlImg.naturalWidth;
      const imgH = htmlImg.naturalHeight;
      const maxW = window.innerWidth  - 100;
      const maxH = window.innerHeight - 200;
      let scale  = 1;
      if (imgW > maxW || imgH > maxH) scale = Math.min(maxW / imgW, maxH / imgH);

      const hasBackground = bgRef.current.type !== 'none';
      const pad = hasBackground ? PADDING : 0;
      const canvasW = Math.round(imgW * scale) + pad * 2;
      const canvasH = Math.round(imgH * scale) + pad * 2;

      canvas.setDimensions({ width: canvasW, height: canvasH });

      // ── Background only (no screenshot baked in) ──
      const offscreen = document.createElement('canvas');
      offscreen.width  = canvasW;
      offscreen.height = canvasH;
      const offCtx = offscreen.getContext('2d')!;

      let bgImage: HTMLImageElement | null = null;
      if (bgRef.current.type === 'image') {
        bgImage = await loadImage((bgRef.current as any).dataUrl).catch(() => null);
      }
      drawBackground(offCtx, bgRef.current, canvasW, canvasH, bgImage);

      const bgComposite = new Image();
      bgComposite.onload = () => {
        const bgFi = new fabric.FabricImage(bgComposite, {
          left: 0, top: 0, originX: 'left', originY: 'top',
          scaleX: 1, scaleY: 1, selectable: false, evented: false,
        });
        canvas.backgroundImage = bgFi;

        // ── Screenshot as selectable, resizable object ──
        const screenshotFi = new fabric.FabricImage(htmlImg, {
          left: pad, top: pad,
          scaleX: scale, scaleY: scale,
          originX: 'left', originY: 'top',
          cornerColor: '#4facfe',
          cornerStrokeColor: '#fff',
          cornerSize: 10,
          transparentCorners: false,
          lockUniScaling: true,
        });
        canvas.add(screenshotFi);
        canvas.sendObjectToBack(screenshotFi);
        canvas.renderAll();
        saveHistory(canvas);
      };
      bgComposite.src = offscreen.toDataURL('image/png');
    };
    htmlImg.src = imageUrl;

    canvas.on('object:modified', () => saveHistory(canvas));
    canvas.on('object:added',    () => saveHistory(canvas));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = canvas.getActiveObject();
      if (!active || (active as any).isEditing) return;
      const selected = canvas.getActiveObjects();
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

  // ── Re-render background when `background` prop changes ───────────────────
  useEffect(() => {
    if (!fabricCanvas) return;
    const canvas = fabricCanvas;

    const htmlImg = new Image();
    htmlImg.onload = async () => {
      const imgW = htmlImg.naturalWidth;
      const imgH = htmlImg.naturalHeight;
      const maxW = window.innerWidth  - 100;
      const maxH = window.innerHeight - 200;
      let scale  = 1;
      if (imgW > maxW || imgH > maxH) scale = Math.min(maxW / imgW, maxH / imgH);

      const hasBackground = background.type !== 'none';
      const pad = hasBackground ? PADDING : 0;
      const canvasW = Math.round(imgW * scale) + pad * 2;
      const canvasH = Math.round(imgH * scale) + pad * 2;

      canvas.setDimensions({ width: canvasW, height: canvasH });

      // Background-only rendering
      const offscreen = document.createElement('canvas');
      offscreen.width  = canvasW;
      offscreen.height = canvasH;
      const offCtx = offscreen.getContext('2d')!;

      let bgImage: HTMLImageElement | null = null;
      if (background.type === 'image') {
        bgImage = await loadImage((background as any).dataUrl).catch(() => null);
      }
      drawBackground(offCtx, background, canvasW, canvasH, bgImage);

      const bgComposite = new Image();
      bgComposite.onload = () => {
        const bgFi = new fabric.FabricImage(bgComposite, {
          left: 0, top: 0, originX: 'left', originY: 'top',
          scaleX: 1, scaleY: 1, selectable: false, evented: false,
        });
        canvas.backgroundImage = bgFi;
        canvas.renderAll();
      };
      bgComposite.src = offscreen.toDataURL('image/png');
    };
    htmlImg.src = imageUrl;
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

    if (isDraw) {
      // Fabric.js v6: freeDrawingBrush is NOT auto-created — must instantiate manually
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
        const text = new fabric.IText('Nhập chữ...', {
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

    const reloadBackground = (canvas: fabric.Canvas) => {
      const img  = new Image();
      img.onload = async () => {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const maxW = window.innerWidth  - 100;
        const maxH = window.innerHeight - 200;
        let scale  = 1;
        if (imgW > maxW || imgH > maxH) scale = Math.min(maxW / imgW, maxH / imgH);

        const hasBackground = bgRef.current.type !== 'none';
        const pad = hasBackground ? PADDING : 0;
        const canvasW = Math.round(imgW * scale) + pad * 2;
        const canvasH = Math.round(imgH * scale) + pad * 2;

        canvas.setDimensions({ width: canvasW, height: canvasH });

        const offscreen = document.createElement('canvas');
        offscreen.width  = canvasW;
        offscreen.height = canvasH;
        const offCtx = offscreen.getContext('2d')!;

        let bgImage: HTMLImageElement | null = null;
        if (bgRef.current.type === 'image') {
          bgImage = await loadImage((bgRef.current as any).dataUrl).catch(() => null);
        }
        drawBackground(offCtx, bgRef.current, canvasW, canvasH, bgImage);

        const ci = new Image();
        ci.onload = () => {
          const bgFi = new fabric.FabricImage(ci, {
            left: 0, top: 0, originX: 'left', originY: 'top',
            scaleX: 1, scaleY: 1, selectable: false, evented: false,
          });
          canvas.backgroundImage = bgFi;

          // Re-add the screenshot as a selectable object
          const screenshotFi = new fabric.FabricImage(img, {
            left: pad, top: pad,
            scaleX: scale, scaleY: scale,
            originX: 'left', originY: 'top',
            cornerColor: '#4facfe',
            cornerStrokeColor: '#fff',
            cornerSize: 10,
            transparentCorners: false,
            lockUniScaling: true,
          });
          canvas.add(screenshotFi);
          canvas.sendObjectToBack(screenshotFi);
          canvas.renderAll();
          saveHistory(canvas);
        };
        ci.src = offscreen.toDataURL('image/png');
      };
      img.src = imageUrl;
    };

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
        reloadBackground(fabricCanvas);
      },
      exportImage: () => {
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        return fabricCanvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
      },
    });
  }, [fabricCanvas, onReady, imageUrl]);

  return (
    <div className="shadow-2xl rounded-xl overflow-hidden border border-gray-700">
      <canvas ref={canvasRef} />
    </div>
  );
}
