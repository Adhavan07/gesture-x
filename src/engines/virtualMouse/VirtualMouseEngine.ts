import type {
  GestureConfig,
  GestureFrameResult,
  GestureState,
  HandsMap,
  Landmark,
  TrackedHandInput,
} from '../../types/gesture.ts';
import {
  DualHandTracker,
  createEmptyTrackedHand,
} from './DualHandTracker.ts';
import { DEFAULT_CALIBRATION, mergeCalibration } from './GestureCalibration.ts';
import { GestureStateMachine } from './GestureStateMachine.ts';
import { HandRoleManager } from './HandRoleManager.ts';
import { TwoHandModifierEngine } from './TwoHandModifierEngine.ts';

export class VirtualMouseEngine {
  private config: GestureConfig;
  private dualTracker = new DualHandTracker();
  private roleManager = new HandRoleManager();
  private modifierEngine = new TwoHandModifierEngine();
  private fsm = new GestureStateMachine();

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = mergeCalibration(DEFAULT_CALIBRATION, config);
  }

  public updateConfig(partial: Partial<GestureConfig>): void {
    this.config = mergeCalibration(this.config, partial);
  }

  public getConfig(): GestureConfig {
    return this.config;
  }

  public getState(): GestureState {
    return this.fsm.getState();
  }

  public mapHandsToIds(
    detectedHands: TrackedHandInput[],
    mirror = true
  ): HandsMap {
    return this.dualTracker.trackFrame(detectedHands, {
      mirror,
      pinchThreshold: this.config.pinchThreshold,
      stabilityFrames: this.config.stabilityFrames,
      trackingLossGraceFrames: this.config.trackingLossGraceFrames,
    });
  }

  public setExternallyPaused(paused: boolean): void {
    this.fsm.setExternallyPaused(paused);
    if (paused) {
      this.dualTracker.clearAllScrollAnchors();
    }
  }

  public reset(): void {
    this.dualTracker.reset();
    this.roleManager.reset();
    this.modifierEngine.reset();
    this.fsm.reset();
  }

  public processDualHandFrame(
    detectedHands: TrackedHandInput[],
    nowMs: number = Date.now(),
    mirror: boolean = true
  ): GestureFrameResult {
    const hands = this.dualTracker.trackFrame(detectedHands, {
      mirror,
      pinchThreshold: this.config.pinchThreshold,
      stabilityFrames: this.config.stabilityFrames,
      trackingLossGraceFrames: this.config.trackingLossGraceFrames,
    });

    const { primarySide, secondarySide } = this.roleManager.assignRoles(hands, {
      multiHandEnabled: this.config.multiHandEnabled,
      preferredPointerHand: this.config.preferredPointerHand,
      fsmState: this.fsm.getState(),
    });

    if (!this.config.multiHandEnabled && primarySide) {
      const inactiveSide = primarySide === 'left' ? 'right' : 'left';
      hands[inactiveSide] = createEmptyTrackedHand(inactiveSide);
    }

    const primaryHand = primarySide ? hands[primarySide] : null;
    const secondaryHand = secondarySide ? hands[secondarySide] : null;

    const modEval = this.modifierEngine.evaluate({
      primaryHand,
      secondaryHand,
      primaryTracker: primarySide ? this.dualTracker.getTracker(primarySide) : null,
      secondaryTracker: secondarySide
        ? this.dualTracker.getTracker(secondarySide)
        : null,
      config: this.config,
      nowMs,
      isPaused: this.fsm.isPaused(),
    });

    if (modEval.modifiers.emergencyStopActive) {
      this.fsm.forceEmergencyStop();
      this.dualTracker.clearAllScrollAnchors();
    } else if (modEval.togglePauseRequested) {
      this.fsm.toggleBimanualPause();
      this.dualTracker.clearAllScrollAnchors();
    }

    const stepOut = this.fsm.step({
      landmarks: primaryHand ? primaryHand.landmarks : null,
      tracker: primarySide ? this.dualTracker.getTracker(primarySide) : null,
      modifiers: modEval.modifiers,
      config: this.config,
      nowMs,
      mirror,
    });

    return {
      state: stepOut.state,
      gesture: stepOut.stableGesture,
      confidence: stepOut.confidence,
      handDetected: Boolean(primaryHand),
      palmOrientation: stepOut.palmOrientation,
      fingerStates: stepOut.fingerStates,
      cursorNormalized: stepOut.cursorNormalized,
      pinchDistance: stepOut.pinchDistance,
      primaryHandId: primaryHand ? primaryHand.id : null,
      secondaryHandId: secondaryHand ? secondaryHand.id : null,
      multiHandEnabled: this.config.multiHandEnabled,
      hands,
      modifiers: modEval.modifiers,
      event: modEval.modifiers.emergencyStopActive
        ? 'EMERGENCY_STOP'
        : stepOut.event,
      scrollDeltaX: stepOut.scrollDeltaX,
      scrollDeltaY: stepOut.scrollDeltaY,
      secondaryEvent: modEval.modifiers.emergencyStopActive
        ? undefined
        : modEval.secondaryEvent,
      secondaryScrollDeltaX: modEval.secondaryScrollDeltaX,
      secondaryScrollDeltaY: modEval.secondaryScrollDeltaY,
    };
  }

  public processFrame(
    landmarks: Landmark[] | null,
    nowMs: number = Date.now(),
    mirror: boolean = true
  ): GestureFrameResult {
    const detectedHands: TrackedHandInput[] =
      landmarks && landmarks.length >= 21 ? [{ landmarks }] : [];
    return this.processDualHandFrame(detectedHands, nowMs, mirror);
  }
}
