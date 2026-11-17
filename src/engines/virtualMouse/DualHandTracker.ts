import type {
  FingerStates,
  GestureType,
  HandSide,
  HandsMap,
  TrackedHandInput,
  TrackedHandState,
} from '../../types/gesture.ts';
import { computePalmCenter, recognizeGesture } from './GestureRecognizer.ts';

const EMPTY_FINGERS: FingerStates = {
  thumb: false,
  index: false,
  middle: false,
  ring: false,
  pinky: false,
};

export interface PerHandTrackerState {
  candidateGesture: GestureType;
  candidateCount: number;
  stableGesture: GestureType;
  lastTriggeredGesture: GestureType;
  discreteCooldownUntil: number;
  lastScrollX: number | null;
  lastScrollY: number | null;
  lastCursorNorm: { x: number; y: number };
  lostFrames: number;
}

function createPerHandTrackerState(): PerHandTrackerState {
  return {
    candidateGesture: 'NONE',
    candidateCount: 0,
    stableGesture: 'NONE',
    lastTriggeredGesture: 'NONE',
    discreteCooldownUntil: 0,
    lastScrollX: null,
    lastScrollY: null,
    lastCursorNorm: { x: 0.5, y: 0.5 },
    lostFrames: 0,
  };
}

export function createEmptyTrackedHand(side: HandSide): TrackedHandState {
  return {
    id: side === 'left' ? 'hand-left' : 'hand-right',
    side,
    detected: false,
    landmarks: [],
    palmCenter: { x: 0.5, y: 0.5 },
    gesture: 'NONE',
    stableGesture: 'NONE',
    confidence: 0,
    palmOrientation: 'front',
    fingerStates: { ...EMPTY_FINGERS },
    pinchDistance: 1,
    cursorNormalized: { x: 0.5, y: 0.5 },
    isPrimary: false,
    role: 'none',
  };
}

export function createEmptyHandsMap(): HandsMap {
  return {
    left: createEmptyTrackedHand('left'),
    right: createEmptyTrackedHand('right'),
  };
}

function normalizeMediaPipeSide(
  handedness: string | undefined
): HandSide | null {
  if (!handedness) return null;
  const lower = handedness.trim().toLowerCase();
  if (lower !== 'left' && lower !== 'right') return null;
  return lower;
}

/**
 * Maps up to 2 detected MediaPipe hands onto distinct, stable IDs ('hand-left' & 'hand-right')
 * using MediaPipe handedness classification with deterministic spatial disambiguation only on ties.
 */
export function mapDetectedHandsToIds(
  detectedHands: TrackedHandInput[],
  mirror = true,
  pinchThreshold = 0.30
): HandsMap {
  const handsMap = createEmptyHandsMap();
  const validHands = detectedHands
    .filter((h) => h.landmarks && h.landmarks.length >= 21)
    .slice(0, 2);

  if (validHands.length === 0) {
    return handsMap;
  }

  const enriched = validHands.map((entry, idx) => {
    const raw = recognizeGesture(entry.landmarks, pinchThreshold);
    const palmRaw = computePalmCenter(entry.landmarks);
    const wristX = mirror ? 1 - entry.landmarks[0].x : entry.landmarks[0].x;
    const tip =
      raw.gesture === 'PINCH'
        ? {
            x: (entry.landmarks[4].x + entry.landmarks[8].x) * 0.5,
            y: (entry.landmarks[4].y + entry.landmarks[8].y) * 0.5,
          }
        : raw.gesture === 'MIDDLE_PINCH'
          ? {
              x: (entry.landmarks[4].x + entry.landmarks[12].x) * 0.5,
              y: (entry.landmarks[4].y + entry.landmarks[12].y) * 0.5,
            }
          : { x: entry.landmarks[8].x, y: entry.landmarks[8].y };

    return {
      idx,
      entry,
      raw,
      wristX,
      palmCenter: {
        x: mirror ? 1 - palmRaw.x : palmRaw.x,
        y: palmRaw.y,
      },
      preferredSide: normalizeMediaPipeSide(entry.handedness),
      cursorNormalized: {
        x: mirror ? 1 - tip.x : tip.x,
        y: tip.y,
      },
    };
  });

  const assignSlot = (side: HandSide, item: (typeof enriched)[number]) => {
    handsMap[side] = {
      id: side === 'left' ? 'hand-left' : 'hand-right',
      side,
      detected: true,
      landmarks: item.entry.landmarks,
      palmCenter: item.palmCenter,
      gesture: item.raw.gesture,
      stableGesture: item.raw.gesture,
      confidence: item.raw.confidence,
      palmOrientation: item.raw.palmOrientation,
      fingerStates: item.raw.fingerStates,
      pinchDistance: item.raw.pinchDistance,
      cursorNormalized: item.cursorNormalized,
      isPrimary: false,
      role: 'none',
    };
  };

  if (enriched.length === 1) {
    const single = enriched[0];
    const side: HandSide =
      single.preferredSide ?? (single.wristX < 0.5 ? 'left' : 'right');
    assignSlot(side, single);
    return handsMap;
  }

  const [first, second] = enriched;
  if (
    first.preferredSide &&
    second.preferredSide &&
    first.preferredSide !== second.preferredSide
  ) {
    assignSlot(first.preferredSide, first);
    assignSlot(second.preferredSide, second);
  } else {
    const ordered = [...enriched].sort((a, b) => a.wristX - b.wristX);
    assignSlot('left', ordered[0]);
    assignSlot('right', ordered[1]);
  }

  return handsMap;
}

export class DualHandTracker {
  private trackers: Record<HandSide, PerHandTrackerState> = {
    left: createPerHandTrackerState(),
    right: createPerHandTrackerState(),
  };

  public reset(): void {
    this.trackers = {
      left: createPerHandTrackerState(),
      right: createPerHandTrackerState(),
    };
  }

  public getTracker(side: HandSide): PerHandTrackerState {
    return this.trackers[side];
  }

  public clearAllScrollAnchors(): void {
    this.trackers.left.lastScrollX = null;
    this.trackers.left.lastScrollY = null;
    this.trackers.right.lastScrollX = null;
    this.trackers.right.lastScrollY = null;
  }

  public trackFrame(
    detectedHands: TrackedHandInput[],
    options: {
      mirror: boolean;
      pinchThreshold: number;
      stabilityFrames: number;
      trackingLossGraceFrames: number;
    }
  ): HandsMap {
    const hands = mapDetectedHandsToIds(
      detectedHands,
      options.mirror,
      options.pinchThreshold
    );

    (['left', 'right'] as HandSide[]).forEach((side) => {
      const hand = hands[side];
      const tracker = this.trackers[side];

      if (!hand.detected || hand.landmarks.length < 21) {
        tracker.lostFrames += 1;
        tracker.lastScrollX = null;
        tracker.lastScrollY = null;
        if (tracker.lostFrames > options.trackingLossGraceFrames) {
          tracker.candidateGesture = 'NONE';
          tracker.candidateCount = 0;
          tracker.stableGesture = 'NONE';
          tracker.lastTriggeredGesture = 'NONE';
        }
        return;
      }

      tracker.lostFrames = 0;
      if (hand.gesture === tracker.candidateGesture) {
        tracker.candidateCount += 1;
      } else {
        tracker.candidateGesture = hand.gesture;
        tracker.candidateCount = 1;
      }

      if (tracker.candidateCount >= options.stabilityFrames) {
        tracker.stableGesture = tracker.candidateGesture;
      }

      if (tracker.stableGesture !== tracker.lastTriggeredGesture) {
        tracker.lastTriggeredGesture = 'NONE';
      }

      hand.stableGesture = tracker.stableGesture;
      tracker.lastCursorNorm = hand.cursorNormalized;
    });

    return hands;
  }
}
