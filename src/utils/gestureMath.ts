export {
  computeFingerStates,
  computePalmCenter,
  computePalmOrientation,
  distance2D,
  distance3D,
  getPalmScale,
  normalizeMiddlePinchDistance,
  normalizePinchDistance,
  normalizeRingPinchDistance,
  recognizeGesture as classifyRawGesture,
  type RawGestureClassification,
} from '../engines/virtualMouse/GestureRecognizer.ts';
