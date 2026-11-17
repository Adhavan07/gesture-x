import React, { useEffect, useRef } from 'react';
import { ArrowLeftRight, Hand } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import type { TrackingSnapshot } from '../../hooks/useHandTracking.ts';
import {
  GESTURE_TRIGGER_LABELS,
  type PointerHandPreference,
} from '../../types/gesture.ts';

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const POINTER_PREFERENCES: Array<{ id: PointerHandPreference; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'right', label: 'Right' },
  { id: 'left', label: 'Left' },
];

export const GestureEnginePanel: React.FC = () => {
  const {
    gestureModeEnabled,
    handDetected,
    detectedHandsCount,
    hands,
    twoHandModifiers,
    gestureState,
    recognizedGesture,
    gestureConfidence,
    palmOrientation,
    fingerStates,
    pinchDistance,
    hoveredTarget,
    settings,
    updateSettings,
    swapHandRoles,
    subscribeTracking,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawGrid = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 32; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 32; y < canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    drawGrid();

    if (!gestureModeEnabled) return;

    const unsubscribe = subscribeTracking((snapshot: TrackingSnapshot) => {
      drawGrid();
      const { frameResult } = snapshot;
      const trackedList = [frameResult.hands.left, frameResult.hands.right].filter(
        (h) => h.detected && h.landmarks.length >= 21
      );
      if (trackedList.length === 0) return;

      const mirror = settings.mirrorPreview;

      trackedList.forEach((hand) => {
        const toPx = (idx: number) => {
          const lm = hand.landmarks[idx];
          return {
            x: (mirror ? 1 - lm.x : lm.x) * canvas.width,
            y: lm.y * canvas.height,
          };
        };

        const strokeColor = !hand.isPrimary
          ? '#34D399'
          : frameResult.state === 'PAUSED'
            ? '#F59E0B'
            : frameResult.state === 'DRAGGING' || frameResult.state === 'PINCH_STARTED'
              ? '#3B82F6'
              : frameResult.state === 'CANCELLED'
                ? '#F43F5E'
                : '#22D3EE';

        ctx.lineWidth = hand.isPrimary ? 2.2 : 1.7;
        ctx.strokeStyle = strokeColor;
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = toPx(a);
          const pb = toPx(b);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }

        for (let i = 0; i < hand.landmarks.length; i += 1) {
          const p = toPx(i);
          const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
          ctx.beginPath();
          ctx.arc(p.x, p.y, isTip ? 4.5 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = !hand.isPrimary
            ? '#6EE7B7'
            : i === 8
              ? '#22D3EE'
              : i === 4
                ? '#60A5FA'
                : '#E2E8F0';
          ctx.fill();
        }

        // Draw palm center dot
        const palmX = hand.palmCenter.x * canvas.width;
        const palmY = hand.palmCenter.y * canvas.height;
        ctx.beginPath();
        ctx.arc(palmX, palmY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();

        const wrist = toPx(0);
        ctx.font = '600 10px monospace';
        ctx.fillStyle = strokeColor;
        const sideLabel = hand.side === 'left' ? 'L' : 'R';
        ctx.fillText(
          hand.isPrimary ? `${sideLabel}·PTR` : `${sideLabel}·MOD`,
          Math.max(4, Math.min(canvas.width - 36, wrist.x - 10)),
          Math.max(12, Math.min(canvas.height - 4, wrist.y + 14))
        );
      });
    });

    return unsubscribe;
  }, [gestureModeEnabled, settings.mirrorPreview, subscribeTracking]);

  const fingerList: Array<{ key: keyof typeof fingerStates; label: string }> = [
    { key: 'thumb', label: 'Thumb' },
    { key: 'index', label: 'Index' },
    { key: 'middle', label: 'Middle' },
    { key: 'ring', label: 'Ring' },
    { key: 'pinky', label: 'Pinky' },
  ];

  const m = settings.gestureMappings;

  return (
    <section
      aria-label="Gesture Engine and Hand Tracking"
      className="rounded-xl border border-slate-800/90 bg-[#0D1628]/85 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <Hand className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Two-Hand Virtual Mouse &amp; 21-Landmark Tracker
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              updateSettings({ multiHandEnabled: !settings.multiHandEnabled })
            }
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              settings.multiHandEnabled
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
            }`}
          >
            {settings.multiHandEnabled ? 'Multi-Hand: On (2 Hands)' : 'Multi-Hand: Off (1 Hand)'}
          </button>

          <div
            role="group"
            aria-label="Preferred pointer hand"
            className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5"
          >
            {POINTER_PREFERENCES.map((pref) => {
              const active = settings.preferredPointerHand === pref.id;
              return (
                <button
                  key={pref.id}
                  type="button"
                  onClick={() => updateSettings({ preferredPointerHand: pref.id })}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-800 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pref.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={swapHandRoles}
            title="Swap Primary and Secondary hand roles"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <ArrowLeftRight className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>Swap Hands</span>
          </button>

          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
            <span>
              Hands:{' '}
              <strong className="text-slate-200">
                {gestureModeEnabled
                  ? `${detectedHandsCount} / ${settings.multiHandEnabled ? 2 : 1}`
                  : '0'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              FSM: <strong className="text-cyan-300">{gestureState}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12 items-start">
        <div className="md:col-span-5">
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            <canvas
              ref={canvasRef}
              width={320}
              height={210}
              className="block h-[170px] w-full"
            />
            {!gestureModeEnabled ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                <p className="text-xs font-medium text-slate-300">
                  Camera hand tracking inactive
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Enable Camera above to track both left and right hands simultaneously.
                </p>
              </div>
            ) : !handDetected ? (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded bg-slate-950/80 px-2 py-1 text-center text-[11px] text-slate-300">
                Webcam active — place one or both hands in view of the camera
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 md:col-span-7">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <p className="text-[11px] text-slate-400">
                Left ({hands.left.role === 'primary' ? 'Primary' : hands.left.role === 'secondary' ? 'Modifier' : 'Idle'})
              </p>
              <p className="mt-0.5 font-mono font-semibold text-cyan-300 truncate">
                {hands.left.detected ? hands.left.stableGesture : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <p className="text-[11px] text-slate-400">
                Right ({hands.right.role === 'primary' ? 'Primary' : hands.right.role === 'secondary' ? 'Modifier' : 'Idle'})
              </p>
              <p className="mt-0.5 font-mono font-semibold text-emerald-300 truncate">
                {hands.right.detected ? hands.right.stableGesture : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <p className="text-[11px] text-slate-400">Confidence / Pinch</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-100 tabular-nums">
                {handDetected
                  ? `${Math.round(gestureConfidence * 100)}% · ${pinchDistance.toFixed(2)}`
                  : '--'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <p className="text-[11px] text-slate-400">
                {twoHandModifiers.activeModifierLabel ? 'Modifier' : 'Target / Palm'}
              </p>
              <p className="mt-0.5 font-mono font-medium text-slate-200 truncate">
                {twoHandModifiers.activeModifierLabel ||
                  hoveredTarget.label ||
                  (handDetected ? `${recognizedGesture} · ${palmOrientation}` : '—')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
            <span className="text-[11px] text-slate-400">Fingers:</span>
            {fingerList.map((f) => {
              const extended = handDetected && fingerStates[f.key];
              return (
                <span
                  key={f.key}
                  className={`font-mono text-[11px] ${
                    extended ? 'font-semibold text-cyan-300' : 'text-slate-500'
                  }`}
                >
                  {f.label}: {extended ? 'Up' : 'Fold'}
                </span>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Primary: <strong className="text-slate-200">Choose / Grab</strong> ({GESTURE_TRIGGER_LABELS[m.GRAB_CHOOSE]}) ·{' '}
            <strong className="text-slate-200">Drop</strong> ({GESTURE_TRIGGER_LABELS[m.DROP_RELEASE]}) ·{' '}
            <strong className="text-slate-200">Left Click</strong> ({GESTURE_TRIGGER_LABELS[m.LEFT_CLICK]}) ·{' '}
            <strong className="text-slate-200">Right Click</strong> ({GESTURE_TRIGGER_LABELS[m.RIGHT_CLICK]}) ·{' '}
            <strong className="text-slate-200">2D Scroll</strong> ({GESTURE_TRIGGER_LABELS[m.SCROLL]})
          </p>
          {settings.multiHandEnabled ? (
            <p className="text-[11px] text-slate-400">
              Secondary Modifier: Fist freezes cursor · Index Pinch holds Multi-Select · Two Fingers scrolls 2D · Open Palm toggles pause · Both Fists emergency stop.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
};
