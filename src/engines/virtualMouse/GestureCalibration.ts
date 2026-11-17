import {
  DEFAULT_GESTURE_MAPPINGS,
  type GestureConfig,
  type PointerHandPreference,
} from '../../types/gesture.ts';

export const DEFAULT_CALIBRATION: GestureConfig = {
  pinchThreshold: 0.30,
  releaseThreshold: 0.45,
  stabilityFrames: 2,
  clickStabilizationMs: 120,
  dragEngageFrames: 3,
  dragActivationMs: 300,
  cooldownMs: 250,
  doubleClickWindowMs: 350,
  scrollSpeed: 1.0,
  deadZone: 0.004,
  smoothingFactor: 0.25,
  sensitivity: 1.0,
  trackingLossGraceFrames: 10,
  handDetectionConfidence: 0.75,
  gestureConfidenceThreshold: 0.75,
  multiHandEnabled: true,
  preferredPointerHand: 'auto',
  mappings: { ...DEFAULT_GESTURE_MAPPINGS },
};

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mergeCalibration(
  base: GestureConfig,
  partial: Partial<GestureConfig> = {}
): GestureConfig {
  const pinchThreshold = clampNumber(
    partial.pinchThreshold ?? base.pinchThreshold,
    0.18,
    0.48
  );
  const releaseThreshold = clampNumber(
    partial.releaseThreshold ?? Math.max(base.releaseThreshold, pinchThreshold + 0.12),
    pinchThreshold + 0.06,
    0.68
  );

  return {
    ...base,
    ...partial,
    pinchThreshold,
    releaseThreshold,
    stabilityFrames: Math.round(
      clampNumber(partial.stabilityFrames ?? base.stabilityFrames, 1, 8)
    ),
    clickStabilizationMs: Math.round(
      clampNumber(partial.clickStabilizationMs ?? base.clickStabilizationMs, 40, 280)
    ),
    dragEngageFrames: Math.round(
      clampNumber(partial.dragEngageFrames ?? base.dragEngageFrames, 1, 15)
    ),
    dragActivationMs: Math.round(
      clampNumber(partial.dragActivationMs ?? base.dragActivationMs, 140, 800)
    ),
    cooldownMs: Math.round(
      clampNumber(partial.cooldownMs ?? base.cooldownMs, 0, 1000)
    ),
    doubleClickWindowMs: Math.round(
      clampNumber(partial.doubleClickWindowMs ?? base.doubleClickWindowMs, 200, 900)
    ),
    scrollSpeed: clampNumber(partial.scrollSpeed ?? base.scrollSpeed, 0.4, 2.5),
    deadZone: clampNumber(partial.deadZone ?? base.deadZone, 0.001, 0.03),
    smoothingFactor: clampNumber(
      partial.smoothingFactor ?? base.smoothingFactor,
      0.08,
      0.95
    ),
    sensitivity: clampNumber(partial.sensitivity ?? base.sensitivity, 0.5, 2.0),
    trackingLossGraceFrames: Math.round(
      clampNumber(
        partial.trackingLossGraceFrames ?? base.trackingLossGraceFrames,
        2,
        30
      )
    ),
    handDetectionConfidence: clampNumber(
      partial.handDetectionConfidence ?? base.handDetectionConfidence,
      0.35,
      0.95
    ),
    gestureConfidenceThreshold: clampNumber(
      partial.gestureConfidenceThreshold ?? base.gestureConfidenceThreshold,
      0.4,
      0.95
    ),
    preferredPointerHand: (partial.preferredPointerHand ??
      base.preferredPointerHand) as PointerHandPreference,
    mappings: partial.mappings
      ? { ...base.mappings, ...partial.mappings }
      : { ...base.mappings },
  };
}
