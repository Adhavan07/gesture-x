import type {
  GestureConfig,
  GestureEventType,
  GestureType,
  HandSide,
  TrackedHandState,
  TwoHandModifierState,
} from '../../types/gesture.ts';
import type { PerHandTrackerState } from './DualHandTracker.ts';

export interface TwoHandEvaluationResult {
  modifiers: TwoHandModifierState;
  secondaryEvent?: GestureEventType;
  secondaryScrollDeltaX?: number;
  secondaryScrollDeltaY?: number;
  togglePauseRequested?: boolean;
}

function clampScrollStep(rawDelta: number): number {
  return Math.max(-90, Math.min(90, rawDelta));
}

function gestureTypeToTrigger(gesture: GestureType) {
  switch (gesture) {
    case 'PINCH':
      return 'INDEX_PINCH' as const;
    case 'MIDDLE_PINCH':
      return 'MIDDLE_PINCH' as const;
    case 'RING_PINCH':
      return 'RING_PINCH' as const;
    case 'TWO_FINGER':
      return 'TWO_FINGER' as const;
    case 'THREE_FINGER':
      return 'THREE_FINGER' as const;
    case 'OPEN_PALM':
      return 'OPEN_PALM' as const;
    case 'FIST':
      return 'FIST' as const;
    case 'THUMBS_UP':
      return 'THUMBS_UP' as const;
    case 'THUMBS_DOWN':
      return 'THUMBS_DOWN' as const;
    default:
      return null;
  }
}

export class TwoHandModifierEngine {
  private prevSecondaryStable: GestureType = 'NONE';
  private lastPauseToggleMs = 0;

  public reset(): void {
    this.prevSecondaryStable = 'NONE';
    this.lastPauseToggleMs = 0;
  }

  public evaluate(options: {
    primaryHand: TrackedHandState | null;
    secondaryHand: TrackedHandState | null;
    secondaryTracker: PerHandTrackerState | null;
    primaryTracker: PerHandTrackerState | null;
    config: GestureConfig;
    nowMs: number;
    isPaused: boolean;
  }): TwoHandEvaluationResult {
    const {
      primaryHand,
      secondaryHand,
      secondaryTracker,
      config,
      nowMs,
      isPaused,
    } = options;

    const modifiers: TwoHandModifierState = {
      cursorFrozen: false,
      multiSelectActive: false,
      secondaryScrollActive: false,
      bothHandsOpenPause: false,
      emergencyStopActive: false,
      activeModifierLabel: null,
    };

    if (!config.multiHandEnabled || !primaryHand || !secondaryHand || !secondaryTracker) {
      this.prevSecondaryStable = 'NONE';
      return { modifiers };
    }

    const pStable = primaryHand.stableGesture;
    const sStable = secondaryHand.stableGesture;

    // 1. Both hands FIST -> Emergency Interaction Stop
    if (pStable === 'FIST' && sStable === 'FIST') {
      modifiers.emergencyStopActive = true;
      modifiers.activeModifierLabel = 'Emergency Stop (Both Fists)';
      this.prevSecondaryStable = sStable;
      return {
        modifiers,
        secondaryEvent: 'EMERGENCY_STOP',
      };
    }

    // 2. Both hands OPEN_PALM -> Temporary Pause
    if (pStable === 'OPEN_PALM' && sStable === 'OPEN_PALM') {
      modifiers.bothHandsOpenPause = true;
      modifiers.activeModifierLabel = 'Paused (Both Palms Open)';
      this.prevSecondaryStable = sStable;
      return { modifiers };
    }

    // 3. Both hands THUMBS_UP -> Confirm pending operation / upload
    if (pStable === 'THUMBS_UP' && sStable === 'THUMBS_UP') {
      modifiers.activeModifierLabel = 'Confirm (Both Thumbs Up)';
      if (
        secondaryTracker.lastTriggeredGesture !== sStable &&
        nowMs >= secondaryTracker.discreteCooldownUntil
      ) {
        secondaryTracker.lastTriggeredGesture = sStable;
        secondaryTracker.discreteCooldownUntil = nowMs + Math.max(800, config.cooldownMs);
        this.prevSecondaryStable = sStable;
        return { modifiers, secondaryEvent: 'CONFIRM' };
      }
      this.prevSecondaryStable = sStable;
      return { modifiers };
    }

    // 4. Secondary OPEN_PALM edge-toggle (from an active gesture into OPEN_PALM)
    let togglePauseRequested = false;
    if (
      sStable === 'OPEN_PALM' &&
      this.prevSecondaryStable !== 'NONE' &&
      this.prevSecondaryStable !== 'OPEN_PALM' &&
      nowMs - this.lastPauseToggleMs >= 700
    ) {
      togglePauseRequested = true;
      this.lastPauseToggleMs = nowMs;
      modifiers.activeModifierLabel = isPaused ? 'Resuming' : 'Paused (Off-Hand Palm)';
    }
    this.prevSecondaryStable = sStable;

    if (isPaused) {
      return { modifiers, togglePauseRequested };
    }

    // 5. Secondary FIST -> Clutch / Freeze cursor movement
    if (sStable === 'FIST') {
      modifiers.cursorFrozen = true;
      modifiers.activeModifierLabel = 'Cursor Frozen (Off-Hand Fist)';
      secondaryTracker.lastScrollX = null;
      secondaryTracker.lastScrollY = null;
      return { modifiers, togglePauseRequested };
    }

    // 6. Secondary THUMB-INDEX PINCH -> Multi-select modifier (Ctrl-hold equivalent)
    if (sStable === 'PINCH') {
      modifiers.multiSelectActive = true;
      modifiers.activeModifierLabel = 'Multi-Select Hold';
      secondaryTracker.lastScrollX = null;
      secondaryTracker.lastScrollY = null;
      return { modifiers, togglePauseRequested };
    }

    // 7. Secondary TWO_FINGER -> Two-Hand 2D Scroll
    const sTrigger = gestureTypeToTrigger(sStable);
    if (sTrigger === config.mappings.SCROLL) {
      modifiers.secondaryScrollActive = true;
      modifiers.activeModifierLabel = 'Two-Hand Scroll';
      let secondaryScrollDeltaY: number | undefined;
      let secondaryScrollDeltaX: number | undefined;
      let secondaryEvent: GestureEventType | undefined;

      if (
        secondaryTracker.lastScrollY !== null &&
        secondaryTracker.lastScrollX !== null
      ) {
        const dy = secondaryHand.cursorNormalized.y - secondaryTracker.lastScrollY;
        const dx = secondaryHand.cursorNormalized.x - secondaryTracker.lastScrollX;
        if (Math.abs(dy) > 0.0045) {
          secondaryScrollDeltaY = clampScrollStep(dy * 720 * config.scrollSpeed);
          secondaryEvent = 'SCROLL';
        }
        if (Math.abs(dx) > 0.0045) {
          secondaryScrollDeltaX = clampScrollStep(dx * 720 * config.scrollSpeed);
          secondaryEvent = 'SCROLL';
        }
      }
      secondaryTracker.lastScrollY = secondaryHand.cursorNormalized.y;
      secondaryTracker.lastScrollX = secondaryHand.cursorNormalized.x;
      return {
        modifiers,
        secondaryEvent,
        secondaryScrollDeltaX,
        secondaryScrollDeltaY,
        togglePauseRequested,
      };
    }

    secondaryTracker.lastScrollX = null;
    secondaryTracker.lastScrollY = null;

    // 8. Secondary discrete triggers (Middle Pinch -> Click/Multi-select, Ring Pinch -> Double Click, Three Finger -> Multi-select, Thumbs Up/Down)
    if (
      sStable !== 'NONE' &&
      sStable !== 'POINTING' &&
      sStable !== 'OPEN_PALM' &&
      secondaryTracker.lastTriggeredGesture !== sStable &&
      nowMs >= secondaryTracker.discreteCooldownUntil
    ) {
      let evt: GestureEventType | undefined;
      if (sStable === 'MIDDLE_PINCH') {
        evt = 'LEFT_CLICK';
        modifiers.activeModifierLabel = 'Off-Hand Click';
      } else if (sStable === 'RING_PINCH') {
        evt = 'DOUBLE_CLICK';
        modifiers.activeModifierLabel = 'Off-Hand Double Click';
      } else if (sStable === 'THREE_FINGER') {
        evt = 'CHOOSE_SELECT';
        modifiers.activeModifierLabel = 'Off-Hand Multi-Select';
      } else if (sStable === 'THUMBS_UP') {
        evt = 'CONFIRM';
        modifiers.activeModifierLabel = 'Off-Hand Confirm';
      } else if (sStable === 'THUMBS_DOWN') {
        evt = 'REJECT';
        modifiers.activeModifierLabel = 'Off-Hand Reject';
      }

      if (evt) {
        secondaryTracker.lastTriggeredGesture = sStable;
        secondaryTracker.discreteCooldownUntil =
          nowMs + Math.max(config.cooldownMs, evt === 'CONFIRM' ? 900 : 320);
        return { modifiers, secondaryEvent: evt, togglePauseRequested };
      }
    }

    return { modifiers, togglePauseRequested };
  }
}

export function getSecondaryRoleHint(side: HandSide | null): string {
  if (!side) return 'Single-Hand';
  return side === 'left' ? 'Left Modifier' : 'Right Modifier';
}
