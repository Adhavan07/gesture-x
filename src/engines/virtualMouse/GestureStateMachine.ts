import type {
  GestureConfig,
  GestureEventType,
  GestureState,
  GestureTrigger,
  GestureType,
  Landmark,
  MouseActionType,
  TwoHandModifierState,
} from '../../types/gesture.ts';
import type { PerHandTrackerState } from './DualHandTracker.ts';
import { recognizeGesture } from './GestureRecognizer.ts';

function gestureTypeToTrigger(gesture: GestureType): GestureTrigger | null {
  switch (gesture) {
    case 'PINCH':
      return 'INDEX_PINCH';
    case 'MIDDLE_PINCH':
      return 'MIDDLE_PINCH';
    case 'RING_PINCH':
      return 'RING_PINCH';
    case 'TWO_FINGER':
      return 'TWO_FINGER';
    case 'THREE_FINGER':
      return 'THREE_FINGER';
    case 'OPEN_PALM':
      return 'OPEN_PALM';
    case 'FIST':
      return 'FIST';
    case 'THUMBS_UP':
      return 'THUMBS_UP';
    case 'THUMBS_DOWN':
      return 'THUMBS_DOWN';
    default:
      return null;
  }
}

function isPinchGestureType(gesture: GestureType): boolean {
  return gesture === 'PINCH' || gesture === 'MIDDLE_PINCH' || gesture === 'RING_PINCH';
}

function clampScrollStep(rawDelta: number): number {
  return Math.max(-90, Math.min(90, rawDelta));
}

function actionToEvent(action: MouseActionType): GestureEventType | undefined {
  switch (action) {
    case 'LEFT_CLICK':
      return 'LEFT_CLICK';
    case 'DOUBLE_CLICK':
      return 'DOUBLE_CLICK';
    case 'RIGHT_CLICK':
      return 'RIGHT_CLICK';
    case 'CHOOSE_SELECT':
      return 'CHOOSE_SELECT';
    case 'CANCEL_ACTION':
      return 'CANCEL';
    case 'CONFIRM_ACTION':
      return 'CONFIRM';
    case 'REJECT_ACTION':
      return 'REJECT';
    default:
      return undefined;
  }
}

export interface StateMachineStepOutput {
  state: GestureState;
  stableGesture: GestureType;
  confidence: number;
  palmOrientation: 'front' | 'back' | 'side';
  fingerStates: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
  cursorNormalized: { x: number; y: number };
  pinchDistance: number;
  event?: GestureEventType;
  scrollDeltaX?: number;
  scrollDeltaY?: number;
}

export class GestureStateMachine {
  private state: GestureState = 'IDLE';
  private externallyPaused = false;
  private bimanualPaused = false;
  private activePinchGesture: GestureType | null = null;
  private pinchStartMs = 0;
  private pinchFrames = 0;
  private releaseFrames = 0;
  private lostFrames = 0;
  private cooldownUntil = 0;
  private lastQuickTapMs = 0;
  private lastQuickTapTrigger: GestureTrigger | null = null;
  private lastCursorNorm = { x: 0.5, y: 0.5 };

  public getState(): GestureState {
    return this.state;
  }

  public isPaused(): boolean {
    return this.externallyPaused || this.bimanualPaused || this.state === 'PAUSED';
  }

  public setExternallyPaused(paused: boolean): void {
    this.externallyPaused = paused;
    if (paused) {
      this.enterPausedState();
    } else if (this.state === 'PAUSED' && !this.bimanualPaused) {
      this.state = 'IDLE';
    }
  }

  public toggleBimanualPause(): void {
    this.bimanualPaused = !this.bimanualPaused;
    if (this.bimanualPaused) {
      this.enterPausedState();
    } else if (!this.externallyPaused && this.state === 'PAUSED') {
      this.state = 'IDLE';
    }
  }

  public forceEmergencyStop(): void {
    this.bimanualPaused = true;
    this.enterPausedState();
    this.state = 'CANCELLED';
  }

  private enterPausedState(): void {
    this.state = 'PAUSED';
    this.pinchFrames = 0;
    this.releaseFrames = 0;
    this.activePinchGesture = null;
  }

  public reset(): void {
    this.bimanualPaused = false;
    this.state = this.externallyPaused ? 'PAUSED' : 'IDLE';
    this.activePinchGesture = null;
    this.pinchStartMs = 0;
    this.pinchFrames = 0;
    this.releaseFrames = 0;
    this.lostFrames = 0;
    this.cooldownUntil = 0;
    this.lastQuickTapMs = 0;
    this.lastQuickTapTrigger = null;
  }

  private isPinchHeldWithHysteresis(
    raw: ReturnType<typeof recognizeGesture>,
    gesture: GestureType | null,
    releaseThreshold: number
  ): boolean {
    if (gesture === 'MIDDLE_PINCH') {
      return (
        raw.middlePinchDistance <= releaseThreshold && raw.middleReachRatio > 1.05
      );
    }
    if (gesture === 'RING_PINCH') {
      return raw.ringPinchDistance <= releaseThreshold && raw.ringReachRatio > 1.05;
    }
    return raw.pinchDistance <= releaseThreshold && raw.indexReachRatio > 1.05;
  }

  private resolveDiscreteActionForTrigger(
    trigger: GestureTrigger | null,
    config: GestureConfig
  ): MouseActionType | null {
    if (!trigger) return null;
    const m = config.mappings;
    const priority: MouseActionType[] = [
      'PAUSE_TRACKING',
      'CANCEL_ACTION',
      'REJECT_ACTION',
      'RIGHT_CLICK',
      'DOUBLE_CLICK',
      'CHOOSE_SELECT',
      'LEFT_CLICK',
      'CONFIRM_ACTION',
    ];
    for (const action of priority) {
      if (m[action] === trigger) {
        return action;
      }
    }
    return null;
  }

  private isPinchTapOrHoldTrigger(
    trigger: GestureTrigger | null,
    gesture: GestureType,
    config: GestureConfig
  ): boolean {
    if (!trigger || !isPinchGestureType(gesture)) return false;
    const m = config.mappings;
    return (
      trigger === m.DRAG_DROP ||
      trigger === m.LEFT_CLICK ||
      trigger === m.RIGHT_CLICK ||
      trigger === m.RIGHT_BUTTON_HOLD
    );
  }

  public step(options: {
    landmarks: Landmark[] | null;
    tracker: PerHandTrackerState | null;
    modifiers: TwoHandModifierState;
    config: GestureConfig;
    nowMs: number;
    mirror: boolean;
  }): StateMachineStepOutput {
    const { landmarks, tracker, modifiers, config, nowMs, mirror } = options;

    // Tracking loss handling
    if (!landmarks || landmarks.length < 21 || !tracker) {
      this.lostFrames += 1;
      if (this.lostFrames > config.trackingLossGraceFrames) {
        if (
          this.state === 'DRAGGING' ||
          this.state === 'PINCH_STARTED' ||
          this.state === 'RIGHT_BUTTON_HOLD'
        ) {
          this.state = 'CANCELLED';
          this.pinchFrames = 0;
          this.activePinchGesture = null;
          return {
            state: this.state,
            stableGesture: 'NONE',
            confidence: 0,
            palmOrientation: 'front',
            fingerStates: {
              thumb: false,
              index: false,
              middle: false,
              ring: false,
              pinky: false,
            },
            cursorNormalized: this.lastCursorNorm,
            pinchDistance: 1,
            event: 'CANCEL',
          };
        }
        this.state =
          this.externallyPaused || this.bimanualPaused ? 'PAUSED' : 'IDLE';
      }

      return {
        state: this.state,
        stableGesture: 'NONE',
        confidence: 0,
        palmOrientation: 'front',
        fingerStates: {
          thumb: false,
          index: false,
          middle: false,
          ring: false,
          pinky: false,
        },
        cursorNormalized: this.lastCursorNorm,
        pinchDistance: 1,
      };
    }

    this.lostFrames = 0;
    const raw = recognizeGesture(landmarks, config.pinchThreshold);
    const stableGesture = tracker.stableGesture;

    // Freeze cursor coordinates during PINCH_STARTED or Secondary Fist cursor-freeze clutch
    if (this.state !== 'PINCH_STARTED' && !modifiers.cursorFrozen) {
      const tip =
        raw.gesture === 'PINCH' && this.state === 'DRAGGING'
          ? {
              x: (landmarks[4].x + landmarks[8].x) * 0.5,
              y: (landmarks[4].y + landmarks[8].y) * 0.5,
            }
          : raw.gesture === 'MIDDLE_PINCH' && this.state === 'DRAGGING'
            ? {
                x: (landmarks[4].x + landmarks[12].x) * 0.5,
                y: (landmarks[4].y + landmarks[12].y) * 0.5,
              }
            : { x: landmarks[8].x, y: landmarks[8].y };

      this.lastCursorNorm = {
        x: mirror ? 1 - tip.x : tip.x,
        y: tip.y,
      };
    }

    if (modifiers.emergencyStopActive) {
      this.enterPausedState();
      this.state = 'CANCELLED';
      return {
        state: this.state,
        stableGesture,
        confidence: raw.confidence,
        palmOrientation: raw.palmOrientation,
        fingerStates: raw.fingerStates,
        cursorNormalized: this.lastCursorNorm,
        pinchDistance: raw.pinchDistance,
        event: 'EMERGENCY_STOP',
      };
    }

    if (
      this.externallyPaused ||
      this.bimanualPaused ||
      modifiers.bothHandsOpenPause
    ) {
      this.enterPausedState();
      return {
        state: this.state,
        stableGesture,
        confidence: raw.confidence,
        palmOrientation: raw.palmOrientation,
        fingerStates: raw.fingerStates,
        cursorNormalized: this.lastCursorNorm,
        pinchDistance: raw.pinchDistance,
      };
    }

    if (
      nowMs < this.cooldownUntil &&
      this.state !== 'DRAGGING' &&
      this.state !== 'RIGHT_BUTTON_HOLD'
    ) {
      if (
        this.state === 'DROPPING' ||
        this.state === 'CANCELLED' ||
        this.state === 'LEFT_CLICK' ||
        this.state === 'RIGHT_CLICK' ||
        this.state === 'DOUBLE_CLICK'
      ) {
        this.state = 'IDLE';
      }
      return {
        state: this.state,
        stableGesture,
        confidence: raw.confidence,
        palmOrientation: raw.palmOrientation,
        fingerStates: raw.fingerStates,
        cursorNormalized: this.lastCursorNorm,
        pinchDistance: raw.pinchDistance,
      };
    }

    let event: GestureEventType | undefined;
    let scrollDeltaX: number | undefined;
    let scrollDeltaY: number | undefined;

    const stableTrigger = gestureTypeToTrigger(stableGesture);
    const mappings = config.mappings;

    // 1. Cancel trigger (default FIST)
    if (stableTrigger && stableTrigger === mappings.CANCEL_ACTION) {
      if (
        this.state === 'PINCH_STARTED' ||
        this.state === 'DRAGGING' ||
        this.state === 'RIGHT_BUTTON_HOLD'
      ) {
        this.state = 'CANCELLED';
        this.pinchFrames = 0;
        this.releaseFrames = 0;
        this.activePinchGesture = null;
        this.cooldownUntil = nowMs + config.cooldownMs;
        tracker.lastTriggeredGesture = stableGesture;
        return {
          state: this.state,
          stableGesture,
          confidence: raw.confidence,
          palmOrientation: raw.palmOrientation,
          fingerStates: raw.fingerStates,
          cursorNormalized: this.lastCursorNorm,
          pinchDistance: raw.pinchDistance,
          event: 'CANCEL',
        };
      }

      tracker.lastScrollX = null;
      tracker.lastScrollY = null;
      this.state = 'CANCELLED';
      return {
        state: this.state,
        stableGesture,
        confidence: raw.confidence,
        palmOrientation: raw.palmOrientation,
        fingerStates: raw.fingerStates,
        cursorNormalized: this.lastCursorNorm,
        pinchDistance: raw.pinchDistance,
        event,
      };
    }

    // 2. Pause trigger (default OPEN_PALM)
    if (stableTrigger && stableTrigger === mappings.PAUSE_TRACKING) {
      if (
        this.state === 'DRAGGING' ||
        this.state === 'PINCH_STARTED' ||
        this.state === 'RIGHT_BUTTON_HOLD'
      ) {
        event = 'CANCEL';
      }
      this.enterPausedState();
      tracker.lastScrollX = null;
      tracker.lastScrollY = null;
      return {
        state: this.state,
        stableGesture,
        confidence: raw.confidence,
        palmOrientation: raw.palmOrientation,
        fingerStates: raw.fingerStates,
        cursorNormalized: this.lastCursorNorm,
        pinchDistance: raw.pinchDistance,
        event,
      };
    }

    const isConfidenceAdequate =
      raw.confidence >= Math.min(0.7, config.gestureConfidenceThreshold) ||
      this.state === 'PINCH_STARTED' ||
      this.state === 'DRAGGING' ||
      this.state === 'RIGHT_BUTTON_HOLD';

    const pinchRequested =
      isConfidenceAdequate &&
      this.isPinchTapOrHoldTrigger(stableTrigger, stableGesture, config);

    const isPinchActiveWithHysteresis =
      this.state === 'PINCH_STARTED' ||
      this.state === 'DRAGGING' ||
      this.state === 'RIGHT_BUTTON_HOLD'
        ? this.isPinchHeldWithHysteresis(
            raw,
            this.activePinchGesture,
            config.releaseThreshold
          )
        : pinchRequested;

    switch (this.state) {
      case 'PAUSED':
      case 'DROPPING':
      case 'CANCELLED':
      case 'LEFT_CLICK':
      case 'RIGHT_CLICK':
      case 'DOUBLE_CLICK':
      case 'MULTI_SELECT':
      case 'SCROLLING':
      case 'IDLE':
      case 'POINTING': {
        if (isPinchActiveWithHysteresis) {
          this.state = 'PINCH_STARTED';
          this.activePinchGesture = stableGesture;
          this.pinchStartMs = nowMs;
          this.pinchFrames = 1;
          this.releaseFrames = 0;
          tracker.lastScrollX = null;
          tracker.lastScrollY = null;
          event = 'PINCH_START';
        } else if (stableTrigger && stableTrigger === mappings.SCROLL) {
          this.state = 'SCROLLING';
          if (tracker.lastScrollY !== null && tracker.lastScrollX !== null) {
            const dy = this.lastCursorNorm.y - tracker.lastScrollY;
            const dx = this.lastCursorNorm.x - tracker.lastScrollX;
            if (Math.abs(dy) > 0.0045) {
              scrollDeltaY = clampScrollStep(dy * 720 * config.scrollSpeed);
              event = 'SCROLL';
            }
            if (Math.abs(dx) > 0.0045) {
              scrollDeltaX = clampScrollStep(dx * 720 * config.scrollSpeed);
              event = 'SCROLL';
            }
          }
          tracker.lastScrollY = this.lastCursorNorm.y;
          tracker.lastScrollX = this.lastCursorNorm.x;
        } else if (stableGesture === 'POINTING') {
          this.state = modifiers.multiSelectActive ? 'MULTI_SELECT' : 'POINTING';
          tracker.lastScrollX = null;
          tracker.lastScrollY = null;
        } else {
          tracker.lastScrollX = null;
          tracker.lastScrollY = null;
          const mappedAction = this.resolveDiscreteActionForTrigger(
            stableTrigger,
            config
          );
          if (
            mappedAction &&
            tracker.lastTriggeredGesture !== stableGesture &&
            nowMs >= tracker.discreteCooldownUntil
          ) {
            tracker.lastTriggeredGesture = stableGesture;
            tracker.discreteCooldownUntil =
              nowMs +
              Math.max(config.cooldownMs, mappedAction === 'CONFIRM_ACTION' ? 900 : 320);
            event = actionToEvent(mappedAction);
            this.state =
              mappedAction === 'CHOOSE_SELECT'
                ? 'MULTI_SELECT'
                : mappedAction === 'LEFT_CLICK'
                  ? 'LEFT_CLICK'
                  : mappedAction === 'RIGHT_CLICK'
                    ? 'RIGHT_CLICK'
                    : mappedAction === 'DOUBLE_CLICK'
                      ? 'DOUBLE_CLICK'
                      : 'IDLE';
          } else {
            this.state = modifiers.multiSelectActive ? 'MULTI_SELECT' : 'IDLE';
          }
        }
        break;
      }

      case 'PINCH_STARTED': {
        if (isPinchActiveWithHysteresis) {
          this.pinchFrames += 1;
          this.releaseFrames = 0;
          const activeTrigger = gestureTypeToTrigger(
            this.activePinchGesture ?? 'PINCH'
          );
          const holdElapsed = nowMs - this.pinchStartMs;
          const holdThresholdMet =
            this.pinchFrames >= config.dragEngageFrames &&
            holdElapsed >= config.dragActivationMs;

          if (holdThresholdMet && activeTrigger === mappings.DRAG_DROP) {
            this.state = 'DRAGGING';
            event = 'DRAG_START';
          } else if (
            holdThresholdMet &&
            activeTrigger === mappings.RIGHT_BUTTON_HOLD
          ) {
            this.state = 'RIGHT_BUTTON_HOLD';
            event = 'RIGHT_HOLD_START';
          }
        } else {
          this.releaseFrames += 1;
          const cleanTapRelease =
            this.releaseFrames >= 1 &&
            (raw.gesture === 'POINTING' ||
              raw.gesture === 'TWO_FINGER' ||
              raw.gesture === 'OPEN_PALM' ||
              this.releaseFrames >= 2);
          if (cleanTapRelease) {
            const releasedTrigger = gestureTypeToTrigger(
              this.activePinchGesture ?? 'PINCH'
            );
            this.pinchFrames = 0;
            this.releaseFrames = 0;
            this.activePinchGesture = null;

            const matchesDoubleMiddle =
              mappings.DOUBLE_CLICK === 'DOUBLE_MIDDLE_PINCH' &&
              releasedTrigger === 'MIDDLE_PINCH';
            const matchesDoubleIndex =
              mappings.DOUBLE_CLICK === 'DOUBLE_INDEX_PINCH' &&
              releasedTrigger === 'INDEX_PINCH';
            const withinDoubleWindow =
              (matchesDoubleMiddle || matchesDoubleIndex) &&
              this.lastQuickTapMs > 0 &&
              this.lastQuickTapTrigger === releasedTrigger &&
              nowMs - this.lastQuickTapMs <= config.doubleClickWindowMs;

            if (withinDoubleWindow) {
              this.lastQuickTapMs = 0;
              this.lastQuickTapTrigger = null;
              this.cooldownUntil = nowMs + config.cooldownMs;
              this.state = 'DOUBLE_CLICK';
              event = 'DOUBLE_CLICK';
            } else {
              this.lastQuickTapMs = nowMs;
              this.lastQuickTapTrigger = releasedTrigger;
              this.cooldownUntil = nowMs + Math.min(85, config.cooldownMs);

              if (releasedTrigger === mappings.LEFT_CLICK) {
                if (modifiers.multiSelectActive) {
                  this.state = 'MULTI_SELECT';
                  event = 'CHOOSE_SELECT';
                } else {
                  this.state = 'LEFT_CLICK';
                  event = 'LEFT_CLICK';
                }
              } else if (releasedTrigger === mappings.RIGHT_CLICK) {
                this.state = 'RIGHT_CLICK';
                event = 'RIGHT_CLICK';
              } else if (releasedTrigger === mappings.CHOOSE_SELECT) {
                this.state = 'MULTI_SELECT';
                event = 'CHOOSE_SELECT';
              } else {
                this.state = 'DROPPING';
                event = 'DROP';
              }
            }
          }
        }
        break;
      }

      case 'DRAGGING': {
        if (isPinchActiveWithHysteresis) {
          this.releaseFrames = 0;
        } else {
          this.releaseFrames += 1;
          if (this.releaseFrames >= 2) {
            this.state = 'DROPPING';
            this.pinchFrames = 0;
            this.releaseFrames = 0;
            this.activePinchGesture = null;
            this.lastQuickTapMs = 0;
            this.lastQuickTapTrigger = null;
            this.cooldownUntil = nowMs + config.cooldownMs;
            event = 'DROP';
          }
        }
        break;
      }

      case 'RIGHT_BUTTON_HOLD': {
        if (isPinchActiveWithHysteresis) {
          this.releaseFrames = 0;
        } else {
          this.releaseFrames += 1;
          if (this.releaseFrames >= 2) {
            this.state = 'RIGHT_CLICK';
            this.pinchFrames = 0;
            this.releaseFrames = 0;
            this.activePinchGesture = null;
            this.cooldownUntil = nowMs + config.cooldownMs;
            event = 'RIGHT_CLICK';
          }
        }
        break;
      }
    }

    return {
      state: this.state,
      stableGesture,
      confidence: raw.confidence,
      palmOrientation: raw.palmOrientation,
      fingerStates: raw.fingerStates,
      cursorNormalized: this.lastCursorNorm,
      pinchDistance: raw.pinchDistance,
      event,
      scrollDeltaX,
      scrollDeltaY,
    };
  }
}
