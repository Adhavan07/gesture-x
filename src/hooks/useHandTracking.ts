import { useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { getHandLandmarker } from '../lib/mediapipe.ts';
import { VirtualMouseEngine } from '../engines/virtualMouse/VirtualMouseEngine.ts';
import {
  MouseActionDispatcher,
  type MouseActionHandlers,
} from '../engines/virtualMouse/MouseActionDispatcher.ts';
import { CursorEngine } from '../engines/CursorEngine.ts';
import type {
  GestureConfig,
  GestureFrameResult,
  GestureType,
  HandSide,
  Landmark,
  TrackedHandInput,
} from '../types/gesture.ts';
import type { CursorHoverTarget } from '../types/app.ts';

export interface SecondaryCursorSnapshot {
  x: number;
  y: number;
  side: HandSide;
  gesture: GestureType;
}

export interface TrackingSnapshot {
  landmarks: Landmark[] | null;
  allLandmarks: Landmark[][];
  primaryHandIndex: number;
  detectedHandsCount: number;
  frameResult: GestureFrameResult;
  cursorX: number;
  cursorY: number;
  secondaryCursor: SecondaryCursorSnapshot | null;
  hoverTarget: CursorHoverTarget;
  videoWidth: number;
  videoHeight: number;
}

export type TrackingSubscriber = (snapshot: TrackingSnapshot) => void;

export interface UseHandTrackingOptions extends MouseActionHandlers {
  enabled: boolean;
  paused: boolean;
  mirror: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  config: Partial<GestureConfig>;
  onGestureStateUpdate: (
    result: GestureFrameResult,
    detectedHandsCount: number
  ) => void;
  onHoverTargetChange: (target: CursorHoverTarget) => void;
}

export function useHandTracking(options: UseHandTrackingOptions) {
  const {
    enabled,
    paused,
    mirror,
    videoRef,
    stream,
    config,
    onGestureStateUpdate,
    onHoverTargetChange,
    onPinchStart,
    onLeftClick,
    onDoubleClick,
    onRightClick,
    onChooseSelect,
    onDragStart,
    onDrop,
    onCancel,
    onConfirm,
    onReject,
    onEmergencyStop,
    onScroll,
  } = options;

  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const engineRef = useRef(new VirtualMouseEngine(config));
  const dispatcherRef = useRef(new MouseActionDispatcher());
  const cursorEngineRef = useRef(new CursorEngine());
  const secondaryCursorEngineRef = useRef(new CursorEngine());
  const subscribersRef = useRef<Set<TrackingSubscriber>>(new Set());

  const callbacksRef = useRef({
    onGestureStateUpdate,
    onHoverTargetChange,
    onPinchStart,
    onLeftClick,
    onDoubleClick,
    onRightClick,
    onChooseSelect,
    onDragStart,
    onDrop,
    onCancel,
    onConfirm,
    onReject,
    onEmergencyStop,
    onScroll,
  });
  callbacksRef.current = {
    onGestureStateUpdate,
    onHoverTargetChange,
    onPinchStart,
    onLeftClick,
    onDoubleClick,
    onRightClick,
    onChooseSelect,
    onDragStart,
    onDrop,
    onCancel,
    onConfirm,
    onReject,
    onEmergencyStop,
    onScroll,
  };

  const settingsRef = useRef({ mirror, config });
  settingsRef.current = { mirror, config };

  useEffect(() => {
    engineRef.current.updateConfig(config);
  }, [config]);

  useEffect(() => {
    engineRef.current.setExternallyPaused(paused);
  }, [paused]);

  const subscribeTracking = (listener: TrackingSubscriber) => {
    subscribersRef.current.add(listener);
    return () => {
      subscribersRef.current.delete(listener);
    };
  };

  useEffect(() => {
    if (!enabled || !stream) {
      engineRef.current.reset();
      cursorEngineRef.current.reset();
      secondaryCursorEngineRef.current.reset();
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let landmarker: HandLandmarker | null = null;
    let lastVideoTime = -1;
    let lastUiSyncMs = 0;
    let lastStateKey = '';
    let lastHoverKey = '';
    let currentHover: CursorHoverTarget = { type: null, id: null };

    const cameraLoop = () => {
      if (cancelled) return;
      const video = videoRef.current;

      if (
        landmarker &&
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        const nowMs = performance.now();
        let detectedHands: TrackedHandInput[] = [];

        try {
          const detection = landmarker.detectForVideo(video, nowMs);
          if (detection.landmarks && detection.landmarks.length > 0) {
            detectedHands = detection.landmarks.map((hand, idx) => {
              const handednessEntry = detection.handednesses?.[idx]?.[0];
              return {
                landmarks: hand.map((lm) => ({
                  x: lm.x,
                  y: lm.y,
                  z: lm.z ?? 0,
                })),
                handedness: handednessEntry?.categoryName,
                handednessScore: handednessEntry?.score,
              };
            });
          }
        } catch {
          // Ignore transient video frame error
        }

        const { mirror: isMirrored, config: cfg } = settingsRef.current;
        const frameResult = engineRef.current.processDualHandFrame(
          detectedHands,
          Date.now(),
          isMirrored
        );

        const mappedHands = [frameResult.hands.left, frameResult.hands.right].filter(
          (h) => h.detected
        );
        const allLandmarks = mappedHands.map((h) => h.landmarks);
        const primaryHandIndex = mappedHands.findIndex((h) => h.isPrimary);
        const landmarks =
          primaryHandIndex >= 0 ? allLandmarks[primaryHandIndex] : null;
        const detectedHandsCount = mappedHands.length;

        let cursorPos = cursorEngineRef.current.getPosition();
        if (frameResult.handDetected) {
          cursorPos = cursorEngineRef.current.update(
            frameResult.cursorNormalized.x,
            frameResult.cursorNormalized.y,
            {
              mirror: isMirrored,
              sensitivity: cfg.sensitivity ?? 1.0,
              deadZone: cfg.deadZone ?? 0.004,
              smoothingFactor: cfg.smoothingFactor ?? 0.25,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              freeze:
                frameResult.state === 'PINCH_STARTED' ||
                frameResult.modifiers.cursorFrozen,
            }
          );

          currentHover = cursorEngineRef.current.detectHoverTarget(
            cursorPos.x,
            cursorPos.y
          );
        } else {
          currentHover = { type: null, id: null };
        }

        const secondaryHand = mappedHands.find((h) => !h.isPrimary);
        let secondaryCursor: SecondaryCursorSnapshot | null = null;
        if (frameResult.multiHandEnabled && secondaryHand) {
          const secPos = secondaryCursorEngineRef.current.update(
            secondaryHand.cursorNormalized.x,
            secondaryHand.cursorNormalized.y,
            {
              mirror: isMirrored,
              sensitivity: cfg.sensitivity ?? 1.0,
              deadZone: cfg.deadZone ?? 0.004,
              smoothingFactor: cfg.smoothingFactor ?? 0.25,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            }
          );
          secondaryCursor = {
            x: secPos.x,
            y: secPos.y,
            side: secondaryHand.side,
            gesture: secondaryHand.stableGesture,
          };
        } else {
          secondaryCursorEngineRef.current.reset();
        }

        const snapshot: TrackingSnapshot = {
          landmarks,
          allLandmarks,
          primaryHandIndex,
          detectedHandsCount,
          frameResult,
          cursorX: cursorPos.x,
          cursorY: cursorPos.y,
          secondaryCursor,
          hoverTarget: currentHover,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        };
        subscribersRef.current.forEach((sub) => sub(snapshot));

        dispatcherRef.current.dispatchFrame(frameResult, {
          hover: currentHover,
          cursorX: cursorPos.x,
          cursorY: cursorPos.y,
          findScrollableElement: (x, y) =>
            cursorEngineRef.current.findScrollableElement(x, y),
          handlers: callbacksRef.current,
        });

        const stateKey = [
          frameResult.state,
          frameResult.gesture,
          frameResult.primaryHandId ?? '',
          frameResult.secondaryHandId ?? '',
          frameResult.multiHandEnabled ? '2H' : '1H',
          frameResult.modifiers.activeModifierLabel ?? '',
          frameResult.hands.left.detected ? frameResult.hands.left.stableGesture : '-',
          frameResult.hands.right.detected ? frameResult.hands.right.stableGesture : '-',
        ].join(':');
        const hoverKey = `${currentHover.type ?? ''}:${currentHover.id ?? ''}`;

        if (hoverKey !== lastHoverKey) {
          lastHoverKey = hoverKey;
          callbacksRef.current.onHoverTargetChange(currentHover);
        }

        if (stateKey !== lastStateKey || nowMs - lastUiSyncMs > 120) {
          lastStateKey = stateKey;
          lastUiSyncMs = nowMs;
          callbacksRef.current.onGestureStateUpdate(
            frameResult,
            detectedHandsCount
          );
        }
      }

      rafId = requestAnimationFrame(cameraLoop);
    };

    setModelLoading(true);
    setModelError(null);

    getHandLandmarker()
      .then((instance) => {
        if (cancelled) return;
        landmarker = instance;
        setModelLoading(false);
        rafId = requestAnimationFrame(cameraLoop);
      })
      .catch((err) => {
        if (cancelled) return;
        setModelLoading(false);
        setModelError(
          err instanceof Error
            ? err.message
            : 'Failed to initialize MediaPipe Hand Landmarker.'
        );
      });

    return () => {
      cancelled = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [enabled, stream, videoRef]);

  return {
    modelLoading,
    modelError,
    subscribeTracking,
  };
}
