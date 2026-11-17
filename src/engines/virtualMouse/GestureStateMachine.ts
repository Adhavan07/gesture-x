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
  grabSource?: 'FIST' | 'PINCH';
  event?: GestureEventType;
  scrollDeltaX?: number;
  scrollDeltaY?: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class GestureStateMachine {
  private state: GestureState = 'IDLE';
  private externallyPaused = false;
  private bimanualPaused = false;
  private activePinchGesture: GestureType | null = null;
  private activeGrabType: 'FIST' | 'PINCH' | null = null;
  private latchedInstantPinch: GestureType | null = null;
  private hasCursorPosition = false;
  private fistAnchorOffset: { x: number; y: number } | null = null;
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

  public completeInstantGrab(nowMs: number = Date.now(), cooldownMs = 220): void {
    this.state = 'IDLE';
    this.activeGrabType = null;
    this.activePinchGesture = null;
    this.latchedInstantPinch = null;
    this.fistAnchorOffset = null;
    this.pinchFrames = 0;
    this.releaseFrames = 0;
    this.cooldownUntil = nowMs + cooldownMs;
  }

  private enterPausedState(): void {
    this.state = 'PAUSED';
    this.pinchFrames = 0;
    this.releaseFrames = 0;
    this.activePinchGesture = null;
    this.activeGrabType = null;
    this.latchedInstantPinch = null;
    this.fistAnchorOffset = null;
  }

  public reset(): void {
    this.bimanualPaused = false;
    this.state = this.externallyPaused ? 'PAUSED' : 'IDLE';
    this.activePinchGesture = null;
    this.activeGrabType = null;
    this.latchedInstantPinch = null;
    this.hasCursorPosition = false;
    this.fistAnchorOffset = null;
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
      'REJECT_ACTION',
      'CANCEL_ACTION',
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

  private isInstantOnMeetPinchTrigger(
    trigger: GestureTrigger | null,
    gesture: GestureType,
    config: GestureConfig
  ): boolean {
    if (!trigger || !isPinchGestureType(gesture)) return false;
    const m = config.mappings;
    if (trigger === m.DRAG_DROP || trigger === m.RIGHT_BUTTON_HOLD) {
      return false;
    }
    return trigger === m.LEFT_CLICK || trigger === m.RIGHT_CLICK;
  }

  private isPinchTapOrHoldTrigger(
    trigger: GestureTrigger | null,
    gesture: GestureType,
    config: GestureConfig
  ): boolean {
    if (!trigger || !isPinchGestureType(gesture)) return false;
    const m = config.mappings;
    return trigger === m.DRAG_DROP || trigger === m.RIGHT_BUTTON_HOLD;
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
          this.activeGrabType = null;
          this.latchedInstantPinch = null;
          this.fistAnchorOffset = null;
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
        this.activeGrabType = null;
        this.latchedInstantPinch = null;
        this.fistAnchorOffset = null;
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
    const knuckleNorm = {
      x: mirror ? 1 - landmarks[5].x : landmarks[5].x,
      y: landmarks[5].y,
    };

    // Re-arm instant pinch click as soon as fingers separate past releaseThreshold
    // (evaluated before cooldown early-return so rapid double-pinch unlocks cleanly).
    if (
      this.latchedInstantPinch &&
      !this.isPinchHeldWithHysteresis(
        raw,
        this.latchedInstantPinch,
        config.releaseThreshold
      ) &&
      raw.gesture !== this.latchedInstantPinch
    ) {
      this.latchedInstantPinch = null;
    }

    // Freeze cursor coordinates during PINCH_STARTED, instant pinch contact, or Secondary Fist clutch.
    // During FIST grab (or when closing into a FIST), track via Index MCP knuckle[5] + anchor
    // offset so curling fingers never jerks the virtual cursor off target.
    if (this.state !== 'PINCH_STARTED' && !modifiers.cursorFrozen) {
      if (this.state === 'DRAGGING' && this.activeGrabType === 'FIST') {
        if (raw.gesture === 'OPEN_PALM') {
          // Freeze cursor on drop-initiation frame so opening fingers does not drift off target
        } else {
          if (!this.fistAnchorOffset) {
            this.fistAnchorOffset = {
              x: this.lastCursorNorm.x - knuckleNorm.x,
              y: this.lastCursorNorm.y - knuckleNorm.y,
            };
          }
          this.lastCursorNorm = {
            x: clamp01(knuckleNorm.x + this.fistAnchorOffset.x),
            y: clamp01(knuckleNorm.y + this.fistAnchorOffset.y),
          };
          this.hasCursorPosition = true;
        }
      } else if (raw.gesture === 'FIST') {
        if (!this.fistAnchorOffset) {
          this.fistAnchorOffset = {
            x: this.lastCursorNorm.x - knuckleNorm.x,
            y: this.lastCursorNorm.y - knuckleNorm.y,
          };
        }
        this.lastCursorNorm = {
          x: clamp01(knuckleNorm.x + this.fistAnchorOffset.x),
          y: clamp01(knuckleNorm.y + this.fistAnchorOffset.y),
        };
        this.hasCursorPosition = true;
      } else if (
        this.hasCursorPosition &&
        this.state !== 'DRAGGING' &&
        (raw.gesture === 'PINCH' ||
          raw.gesture === 'MIDDLE_PINCH' ||
          raw.gesture === 'RING_PINCH')
      ) {
        this.fistAnchorOffset = null;
        // Keep cursor steady on the aimed target while thumb & fingertip meet
      } else {
        this.fistAnchorOffset = null;
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
        this.hasCursorPosition = true;
      }
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

    // 1. Cancel trigger (default THUMBS_DOWN; cancels active drag/pinch/hold)
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
        this.activeGrabType = null;
        this.fistAnchorOffset = null;
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

      if (stableTrigger !== mappings.REJECT_ACTION) {
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
    }

    // 2. Pause trigger (default RING_PINCH; never shadows DROP_RELEASE while carrying)
    if (
      stableTrigger &&
      stableTrigger === mappings.PAUSE_TRACKING &&
      !(this.state === 'DRAGGING' && stableTrigger === mappings.DROP_RELEASE)
    ) {
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
        } else if (
          isConfidenceAdequate &&
          this.latchedInstantPinch === null &&
          this.isInstantOnMeetPinchTrigger(stableTrigger, stableGesture, config) &&
          nowMs >= this.cooldownUntil
        ) {
          this.latchedInstantPinch = stableGesture;
          tracker.lastTriggeredGesture = stableGesture;
          tracker.lastScrollX = null;
          tracker.lastScrollY = null;

          const matchesDoubleIndex =
            mappings.DOUBLE_CLICK === 'DOUBLE_INDEX_PINCH' &&
            stableTrigger === 'INDEX_PINCH';
          const matchesDoubleMiddle =
            mappings.DOUBLE_CLICK === 'DOUBLE_MIDDLE_PINCH' &&
            stableTrigger === 'MIDDLE_PINCH';
          const withinDoubleWindow =
            (matchesDoubleIndex || matchesDoubleMiddle) &&
            this.lastQuickTapMs > 0 &&
            this.lastQuickTapTrigger === stableTrigger &&
            nowMs - this.lastQuickTapMs <= config.doubleClickWindowMs;

          if (withinDoubleWindow) {
            this.lastQuickTapMs = 0;
            this.lastQuickTapTrigger = null;
            this.cooldownUntil = nowMs + Math.min(180, config.cooldownMs);
            this.state = 'DOUBLE_CLICK';
            event = 'DOUBLE_CLICK';
          } else {
            this.lastQuickTapMs = nowMs;
            this.lastQuickTapTrigger = stableTrigger;
            this.cooldownUntil = nowMs + Math.min(45, config.cooldownMs);

            if (stableTrigger === mappings.LEFT_CLICK) {
              if (modifiers.multiSelectActive) {
                this.state = 'MULTI_SELECT';
                event = 'CHOOSE_SELECT';
              } else {
                this.state = 'LEFT_CLICK';
                event = 'LEFT_CLICK';
              }
            } else if (stableTrigger === mappings.RIGHT_CLICK) {
              this.state = 'RIGHT_CLICK';
              event = 'RIGHT_CLICK';
            }
          }
        } else if (
          isConfidenceAdequate &&
          stableTrigger &&
          (stableTrigger === mappings.GRAB_CHOOSE ||
            (stableTrigger === mappings.DRAG_DROP &&
              !isPinchGestureType(stableGesture))) &&
          tracker.lastTriggeredGesture !== stableGesture &&
          nowMs >= tracker.discreteCooldownUntil
        ) {
          this.state = 'DRAGGING';
          this.activeGrabType = 'FIST';
          this.activePinchGesture = null;
          this.pinchFrames = 1;
          this.releaseFrames = 0;
          if (!this.fistAnchorOffset) {
            this.fistAnchorOffset = {
              x: this.lastCursorNorm.x - knuckleNorm.x,
              y: this.lastCursorNorm.y - knuckleNorm.y,
            };
          }
          tracker.lastScrollX = null;
          tracker.lastScrollY = null;
          tracker.lastTriggeredGesture = stableGesture;
          tracker.discreteCooldownUntil = nowMs + Math.max(160, config.cooldownMs);
          event = 'DRAG_START';
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
            !this.isInstantOnMeetPinchTrigger(stableTrigger, stableGesture, config) &&
            this.latchedInstantPinch !== stableGesture &&
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
            this.activeGrabType = 'PINCH';
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
        if (stableTrigger && stableTrigger === mappings.DROP_RELEASE) {
          this.state = 'DROPPING';
          this.activeGrabType = null;
          this.fistAnchorOffset = null;
          this.pinchFrames = 0;
          this.releaseFrames = 0;
          this.activePinchGesture = null;
          this.lastQuickTapMs = 0;
          this.lastQuickTapTrigger = null;
          this.cooldownUntil = nowMs + config.cooldownMs;
          tracker.lastTriggeredGesture = stableGesture;
          event = 'DROP';
        } else if (this.activeGrabType === 'FIST') {
          // Stay latched carrying across all screens until OPEN_PALM drop or THUMBS_DOWN cancel
          this.releaseFrames = 0;
        } else if (isPinchActiveWithHysteresis) {
          this.releaseFrames = 0;
        } else {
          this.releaseFrames += 1;
          if (this.releaseFrames >= 2) {
            this.state = 'DROPPING';
            this.activeGrabType = null;
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
      grabSource:
        this.state === 'DRAGGING' || event === 'DRAG_START'
          ? (this.activeGrabType ?? 'PINCH')
          : undefined,
      event,
      scrollDeltaX,
      scrollDeltaY,
    };
  }
}
