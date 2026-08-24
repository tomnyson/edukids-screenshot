/**
 * Pure layout math for the editor canvas.
 * Single source of truth so that init, background changes, aspect-ratio
 * changes and clear/reload all position the screenshot identically.
 */

export const PADDING = 60;

export type CanvasLayout = {
  canvasW: number;
  canvasH: number;
  /** Screenshot position (top-left) inside the canvas */
  left: number;
  top: number;
  /** Uniform scale applied to the screenshot */
  scale: number;
};

export type LayoutInput = {
  imgW: number;
  imgH: number;
  /** Max canvas size available in the viewport */
  maxW: number;
  maxH: number;
  /** Padding around the screenshot (0 when no background) */
  pad: number;
  /** Aspect ratio [w, h] or null for "original" */
  ratio: [number, number] | null;
};

/** Fit the screenshot into the viewport, keeping its original aspect ratio */
function fitOriginal({ imgW, imgH, maxW, maxH, pad }: LayoutInput): CanvasLayout {
  const innerMaxW = Math.max(1, maxW - pad * 2);
  const innerMaxH = Math.max(1, maxH - pad * 2);
  const scale = Math.min(1, innerMaxW / imgW, innerMaxH / imgH);
  const scaledW = Math.round(imgW * scale);
  const scaledH = Math.round(imgH * scale);
  return {
    canvasW: scaledW + pad * 2,
    canvasH: scaledH + pad * 2,
    left: pad,
    top: pad,
    scale,
  };
}

/** Fit the canvas to a fixed aspect ratio and center the screenshot inside */
function fitRatio(input: LayoutInput, ratio: [number, number]): CanvasLayout {
  const { imgW, imgH, maxW, maxH, pad } = input;
  const [rw, rh] = ratio;

  let canvasW: number;
  let canvasH: number;
  if ((maxW / rw) * rh <= maxH) {
    canvasW = maxW;
    canvasH = Math.round((maxW / rw) * rh);
  } else {
    canvasH = maxH;
    canvasW = Math.round((maxH / rh) * rw);
  }

  const innerW = Math.max(1, canvasW - pad * 2);
  const innerH = Math.max(1, canvasH - pad * 2);
  const scale = Math.min(innerW / imgW, innerH / imgH);
  const scaledW = imgW * scale;
  const scaledH = imgH * scale;

  return {
    canvasW,
    canvasH,
    left: pad + (innerW - scaledW) / 2,
    top: pad + (innerH - scaledH) / 2,
    scale,
  };
}

export function computeLayout(input: LayoutInput): CanvasLayout {
  return input.ratio ? fitRatio(input, input.ratio) : fitOriginal(input);
}
