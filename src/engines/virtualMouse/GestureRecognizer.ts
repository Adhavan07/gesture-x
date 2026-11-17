import type {
  FingerStates,
  GestureType,
  Landmark,
  PalmOrientation,
} from '../../types/gesture.ts';

export function distance2D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function distance3D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

/**
 * Scale reference: distance between wrist (0) and middle finger MCP (9).
 * Prevents camera distance from breaking pinch or extension thresholds.
 */
export function getPalmScale(landmarks: Landmark[]): number {
  if (landmarks.length < 21) return 0.1;
  const scale = distance2D(landmarks[0], landmarks[9]);
  return Math.max(scale, 0.04);
}

export function computePalmCenter(landmarks: Landmark[]): { x: number; y: number } {
  if (landmarks.length < 21) return { x: 0.5, y: 0.5 };
  const indices = [0, 5, 9, 13, 17];
  let sumX = 0;
  let sumY = 0;
  for (const idx of indices) {
    sumX += landmarks[idx].x;
    sumY += landmarks[idx].y;
  }
  return {
    x: sumX / indices.length,
    y: sumY / indices.length,
  };
}

/**
 * Compute whether each finger is extended using wrist-relative radial ratios
 * so detection works regardless of hand rotation or mirroring.
 */
export function computeFingerStates(landmarks: Landmark[]): FingerStates {
  if (landmarks.length < 21) {
    return { thumb: false, index: false, middle: false, ring: false, pinky: false };
  }

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const scale = getPalmScale(landmarks);

  const thumbTipDistToPinkyMcp = distance2D(landmarks[4], pinkyMcp);
  const thumbIpDistToPinkyMcp = distance2D(landmarks[3], pinkyMcp);
  const thumbTipDistToIndexMcp = distance2D(landmarks[4], indexMcp);
  const thumbExtended =
    thumbTipDistToPinkyMcp > thumbIpDistToPinkyMcp * 1.08 &&
    thumbTipDistToIndexMcp > scale * 0.42;

  const isFingerExtended = (tipIdx: number, pipIdx: number, mcpIdx: number): boolean => {
    const tipToWrist = distance2D(landmarks[tipIdx], wrist);
    const pipToWrist = distance2D(landmarks[pipIdx], wrist);
    const mcpToWrist = distance2D(landmarks[mcpIdx], wrist);
    return tipToWrist > pipToWrist * 1.08 && tipToWrist > mcpToWrist * 1.25;
  };

  return {
    thumb: thumbExtended,
    index: isFingerExtended(8, 6, 5),
    middle: isFingerExtended(12, 10, 9),
    ring: isFingerExtended(16, 14, 13),
    pinky: isFingerExtended(20, 18, 17),
  };
}

export function computePalmOrientation(landmarks: Landmark[]): PalmOrientation {
  if (landmarks.length < 21) return 'front';
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  const v1x = indexMcp.x - wrist.x;
  const v1y = indexMcp.y - wrist.y;
  const v2x = pinkyMcp.x - wrist.x;
  const v2y = pinkyMcp.y - wrist.y;
  const crossZ = v1x * v2y - v1y * v2x;
  const palmWidth = distance2D(indexMcp, pinkyMcp);
  const scale = getPalmScale(landmarks);

  if (palmWidth < scale * 0.35) {
    return 'side';
  }
  return crossZ >= 0 ? 'front' : 'back';
}

export function normalizePinchDistance(landmarks: Landmark[]): number {
  if (landmarks.length < 21) return 1;
  const scale = getPalmScale(landmarks);
  return distance2D(landmarks[4], landmarks[8]) / scale;
}

export function normalizeMiddlePinchDistance(landmarks: Landmark[]): number {
  if (landmarks.length < 21) return 1;
  const scale = getPalmScale(landmarks);
  return distance2D(landmarks[4], landmarks[12]) / scale;
}

export function normalizeRingPinchDistance(landmarks: Landmark[]): number {
  if (landmarks.length < 21) return 1;
  const scale = getPalmScale(landmarks);
  return distance2D(landmarks[4], landmarks[16]) / scale;
}

export interface RawGestureClassification {
  gesture: GestureType;
  confidence: number;
  fingerStates: FingerStates;
  pinchDistance: number;
  middlePinchDistance: number;
  ringPinchDistance: number;
  indexReachRatio: number;
  middleReachRatio: number;
  ringReachRatio: number;
  palmOrientation: PalmOrientation;
}

export function recognizeGesture(
  landmarks: Landmark[],
  pinchThreshold = 0.30
): RawGestureClassification {
  const fingerStates = computeFingerStates(landmarks);
  const pinchDistance = normalizePinchDistance(landmarks);
  const middlePinchDistance = normalizeMiddlePinchDistance(landmarks);
  const ringPinchDistance = normalizeRingPinchDistance(landmarks);
  const palmOrientation = computePalmOrientation(landmarks);

  if (landmarks.length < 21) {
    return {
      gesture: 'NONE',
      confidence: 0,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio: 1,
      middleReachRatio: 1,
      ringReachRatio: 1,
      palmOrientation,
    };
  }

  const { thumb, index, middle, ring, pinky } = fingerStates;
  const scale = getPalmScale(landmarks);
  const reachRatio = (tipIdx: number, mcpIdx: number) =>
    distance2D(landmarks[tipIdx], landmarks[0]) /
    Math.max(distance2D(landmarks[mcpIdx], landmarks[0]), 0.01);

  const indexReachRatio = reachRatio(8, 5);
  const middleReachRatio = reachRatio(12, 9);
  const ringReachRatio = reachRatio(16, 13);

  // 1. INDEX PINCH: Thumb tip (4) & index tip (8) meet in a pinch loop
  if (
    pinchDistance <= pinchThreshold &&
    indexReachRatio > 1.16 &&
    pinchDistance <= middlePinchDistance * 1.1 &&
    pinchDistance <= ringPinchDistance * 1.1
  ) {
    const closeness = Math.max(0, Math.min(1, 1 - pinchDistance / (pinchThreshold * 1.4)));
    return {
      gesture: 'PINCH',
      confidence: Math.round((0.76 + closeness * 0.23) * 100) / 100,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 2. MIDDLE PINCH: Thumb tip (4) & middle tip (12) meet while middle finger reaches forward
  if (
    middlePinchDistance <= pinchThreshold &&
    middleReachRatio > 1.16 &&
    middlePinchDistance < pinchDistance &&
    middlePinchDistance <= ringPinchDistance * 1.1
  ) {
    const closeness = Math.max(
      0,
      Math.min(1, 1 - middlePinchDistance / (pinchThreshold * 1.4))
    );
    return {
      gesture: 'MIDDLE_PINCH',
      confidence: Math.round((0.76 + closeness * 0.22) * 100) / 100,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 3. RING PINCH: Thumb tip (4) & ring tip (16) meet while ring finger reaches forward
  if (
    ringPinchDistance <= pinchThreshold &&
    ringReachRatio > 1.16 &&
    ringPinchDistance < pinchDistance &&
    ringPinchDistance < middlePinchDistance
  ) {
    const closeness = Math.max(
      0,
      Math.min(1, 1 - ringPinchDistance / (pinchThreshold * 1.4))
    );
    return {
      gesture: 'RING_PINCH',
      confidence: Math.round((0.74 + closeness * 0.22) * 100) / 100,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 4. OPEN_PALM: All five fingers extended
  if (index && middle && ring && pinky && thumb) {
    return {
      gesture: 'OPEN_PALM',
      confidence: 0.94,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 5. THUMBS_UP / THUMBS_DOWN: Thumb extended vertically while four fingers are folded
  if (thumb && !index && !middle && !ring && !pinky) {
    const thumbTip = landmarks[4];
    const thumbMcp = landmarks[2];
    if (thumbTip.y < thumbMcp.y - scale * 0.22) {
      return {
        gesture: 'THUMBS_UP',
        confidence: 0.9,
        fingerStates,
        pinchDistance,
        middlePinchDistance,
        ringPinchDistance,
        indexReachRatio,
        middleReachRatio,
        ringReachRatio,
        palmOrientation,
      };
    }
    if (thumbTip.y > thumbMcp.y + scale * 0.22) {
      return {
        gesture: 'THUMBS_DOWN',
        confidence: 0.89,
        fingerStates,
        pinchDistance,
        middlePinchDistance,
        ringPinchDistance,
        indexReachRatio,
        middleReachRatio,
        ringReachRatio,
        palmOrientation,
      };
    }
  }

  // 6. FIST: All four fingers folded
  if (!index && !middle && !ring && !pinky) {
    return {
      gesture: 'FIST',
      confidence: 0.9,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 7. THREE_FINGER: Index, middle & ring extended; pinky folded
  if (index && middle && ring && !pinky) {
    return {
      gesture: 'THREE_FINGER',
      confidence: 0.9,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 8. TWO_FINGER: Index & middle extended; ring & pinky folded
  if (index && middle && !ring && !pinky) {
    return {
      gesture: 'TWO_FINGER',
      confidence: 0.91,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // 9. POINTING: Index extended; middle, ring, pinky folded
  if (index && !middle && !ring && !pinky) {
    return {
      gesture: 'POINTING',
      confidence: 0.93,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  // Fallback: 4 main fingers extended even if thumb is slightly tucked
  if (index && middle && ring && pinky) {
    return {
      gesture: 'OPEN_PALM',
      confidence: 0.84,
      fingerStates,
      pinchDistance,
      middlePinchDistance,
      ringPinchDistance,
      indexReachRatio,
      middleReachRatio,
      ringReachRatio,
      palmOrientation,
    };
  }

  return {
    gesture: 'NONE',
    confidence: 0.45,
    fingerStates,
    pinchDistance,
    middlePinchDistance,
    ringPinchDistance,
    indexReachRatio,
    middleReachRatio,
    ringReachRatio,
    palmOrientation,
  };
}
