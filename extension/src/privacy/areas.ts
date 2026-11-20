/**
 * Areas the user marks by hand to hide in a safe copy of a capture ("Hide part of the image"), for private details the
 * detector didn't find. Areas are fractions of the image (0–1), so they don't depend on how large the image is shown.
 */
import type { Box } from '../detect/table';

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest area kept (1 % of the image each way); anything smaller is a stray click. */
export const MIN_AREA = 0.01;
/** One arrow-key press moves or resizes an area by this much (Shift+arrow resizes). */
export const STEP = 0.01;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Keeps an area inside the image and at least MIN_AREA in size. */
export function clampArea(a: Area): Area {
  const w = Math.min(1, Math.max(MIN_AREA, a.w));
  const h = Math.min(1, Math.max(MIN_AREA, a.h));
  return { x: Math.min(clamp01(a.x), 1 - w), y: Math.min(clamp01(a.y), 1 - h), w, h };
}

/** The area between two points (fractions), or null when it's too small to mean anything. */
export function areaBetween(a: { x: number; y: number }, b: { x: number; y: number }): Area | null {
  const x0 = clamp01(Math.min(a.x, b.x));
  const y0 = clamp01(Math.min(a.y, b.y));
  const w = clamp01(Math.max(a.x, b.x)) - x0;
  const h = clamp01(Math.max(a.y, b.y)) - y0;
  return w < MIN_AREA || h < MIN_AREA ? null : { x: x0, y: y0, w, h };
}

/** A new area in the middle of the image, for adding one with the keyboard. */
export const centreArea = (): Area => ({ x: 0.35, y: 0.425, w: 0.3, h: 0.15 });

/** Arrow keys move an area; with Shift they make it wider/narrower and taller/shorter. Other keys: null. */
export function nudgeArea(a: Area, key: string, resize: boolean): Area | null {
  const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[key];
  if (!d) return null;
  const [dx, dy] = d as [number, number];
  return clampArea(resize ? { ...a, w: a.w + dx, h: a.h + dy } : { ...a, x: a.x + dx, y: a.y + dy });
}

/** The area in image pixels, for redaction. */
export function areaToBox(a: Area, width: number, height: number): Box {
  const c = clampArea(a);
  return { x0: Math.floor(c.x * width), y0: Math.floor(c.y * height), x1: Math.ceil((c.x + c.w) * width), y1: Math.ceil((c.y + c.h) * height) };
}

/** A detected detail's box (image pixels) as an area, to show it next to the hand-drawn ones. */
export function boxToArea(b: Box, width: number, height: number): Area {
  return { x: b.x0 / width, y: b.y0 / height, w: (b.x1 - b.x0) / width, h: (b.y1 - b.y0) / height };
}
