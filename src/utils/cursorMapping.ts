export interface Point2D {
  x: number;
  y: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Maps normalized webcam coordinates [0..1] into normalized viewport coordinates [0..1]
 * using an active margin box so users can reach screen edges comfortably without leaving camera view.
 */
export function normalizeWebcamPoint(
  rawX: number,
  rawY: number,
  mirror: boolean = true,
  sensitivity: number = 1.0
): Point2D {
  const xSource = mirror ? 1 - rawX : rawX;
  const marginX = clamp(0.18 / Math.max(0.5, sensitivity), 0.04, 0.28);
  const marginY = clamp(0.16 / Math.max(0.5, sensitivity), 0.04, 0.26);

  const mappedX = (xSource - marginX) / (1 - 2 * marginX);
  const mappedY = (rawY - marginY) / (1 - 2 * marginY);

  return {
    x: clamp(mappedX, 0, 1),
    y: clamp(mappedY, 0, 1),
  };
}

export function mapNormalizedToViewport(
  norm: Point2D,
  viewportWidth: number,
  viewportHeight: number
): Point2D {
  return {
    x: clamp(norm.x * viewportWidth, 4, Math.max(4, viewportWidth - 4)),
    y: clamp(norm.y * viewportHeight, 4, Math.max(4, viewportHeight - 4)),
  };
}

export function applyDeadZone(prev: Point2D, next: Point2D, deadZone: number): Point2D {
  const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
  if (dist < deadZone) {
    return prev;
  }
  return next;
}

export function smoothCursor(prev: Point2D, target: Point2D, alpha: number): Point2D {
  const clampedAlpha = clamp(alpha, 0.05, 1);
  return {
    x: prev.x + (target.x - prev.x) * clampedAlpha,
    y: prev.y + (target.y - prev.y) * clampedAlpha,
  };
}

/**
 * Velocity-adaptive smoothing (One-Euro inspired):
 * Keeps slow hover movements ultra-steady on small buttons/menus while scaling
 * responsiveness upward during fast cross-screen cursor sweeps.
 */
export function computeAdaptiveAlpha(
  prev: Point2D,
  target: Point2D,
  baseAlpha: number
): number {
  const speed = Math.hypot(target.x - prev.x, target.y - prev.y);
  const t = clamp((speed - 0.006) / 0.055, 0, 1);
  const minAlpha = clamp(baseAlpha * 0.45, 0.14, 0.34);
  const maxAlpha = clamp(baseAlpha * 1.75, 0.45, 0.78);
  return minAlpha + (maxAlpha - minAlpha) * t;
}

export function smoothCursorAdaptive(
  prev: Point2D,
  target: Point2D,
  baseAlpha: number
): Point2D {
  const alpha = computeAdaptiveAlpha(prev, target, baseAlpha);
  return smoothCursor(prev, target, alpha);
}
