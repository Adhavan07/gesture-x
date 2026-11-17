import React, { useEffect, useRef, useState } from 'react';
import { Minimize2, Maximize2, Move, CameraOff, Loader2 } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import type { TrackingSnapshot } from '../../hooks/useHandTracking.ts';

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const CameraPreview: React.FC = () => {
  const {
    gestureModeEnabled,
    gesturePaused,
    videoRef,
    cameraStream,
    modelLoading,
    handDetected,
    detectedHandsCount,
    gestureState,
    recognizedGesture,
    gestureConfidence,
    palmOrientation,
    settings,
    subscribeTracking,
    toggleGestureMode,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState(() => ({
    x:
      typeof window !== 'undefined'
        ? Math.max(12, window.innerWidth - 314)
        : 920,
    y:
      typeof window !== 'undefined'
        ? Math.max(88, window.innerHeight - 305)
        : 380,
  }));
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

  // Bind live MediaStream to <video> whenever stream or element mounts
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraStream) return;
    if (video.srcObject !== cameraStream) {
      video.srcObject = cameraStream;
    }
    void video.play().catch(() => undefined);
  }, [cameraStream, gestureModeEnabled, minimized, videoRef]);

  // Draw both distinct left/right tracked hands at 60fps directly on canvas
  useEffect(() => {
    if (!gestureModeEnabled) return;

    const unsubscribe = subscribeTracking((snapshot: TrackingSnapshot) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

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
            x: (mirror ? 1 - lm.x : lm.x) * width,
            y: lm.y * height,
          };
        };

        const strokeColor = !hand.isPrimary
          ? '#34D399'
          : frameResult.state === 'PAUSED'
            ? '#F59E0B'
            : frameResult.state === 'DRAGGING' || frameResult.state === 'PINCH_STARTED'
              ? '#3B82F6'
              : '#22D3EE';

        ctx.lineWidth = hand.isPrimary ? 2.1 : 1.7;
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
          ctx.arc(p.x, p.y, isTip ? 4.2 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = !hand.isPrimary
            ? '#6EE7B7'
            : i === 8
              ? '#22D3EE'
              : i === 4
                ? '#60A5FA'
                : '#E2E8F0';
          ctx.fill();
        }

        const wrist = toPx(0);
        ctx.font = '600 10px monospace';
        ctx.fillStyle = strokeColor;
        ctx.fillText(
          hand.side === 'left' ? 'L' : 'R',
          Math.max(4, Math.min(width - 14, wrist.x - 4)),
          Math.max(12, Math.min(height - 4, wrist.y + 14))
        );
      });
    });

    return unsubscribe;
  }, [gestureModeEnabled, settings.mirrorPreview, subscribeTracking]);

  // Window pointer drag to reposition overlay cleanly
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragOffsetRef.current) return;
      const nextX = Math.max(
        12,
        Math.min(window.innerWidth - 300, e.clientX - dragOffsetRef.current.dx)
      );
      const nextY = Math.max(
        72,
        Math.min(window.innerHeight - 160, e.clientY - dragOffsetRef.current.dy)
      );
      setPosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      dragOffsetRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const clampOnResize = () => {
      setPosition((prev) => ({
        x: Math.max(12, Math.min(window.innerWidth - 300, prev.x)),
        y: Math.max(72, Math.min(window.innerHeight - 160, prev.y)),
      }));
    };
    window.addEventListener('resize', clampOnResize);
    return () => window.removeEventListener('resize', clampOnResize);
  }, []);

  if (!gestureModeEnabled) return null;

  return (
    <aside
      aria-label="Gesture Tracking Overlay"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
      className="fixed left-0 top-0 z-30 w-[290px] overflow-hidden rounded-xl border border-slate-700/90 bg-[#0A1222]/95 shadow-2xl backdrop-blur-md"
    >
      {/* Draggable header */}
      <div
        onPointerDown={(e) => {
          dragOffsetRef.current = {
            dx: e.clientX - position.x,
            dy: e.clientY - position.y,
          };
        }}
        className="flex cursor-grab items-center justify-between border-b border-slate-800 px-3 py-2 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <Move className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span>Hand Tracker</span>
          {detectedHandsCount > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-cyan-300">
              · {detectedHandsCount} {detectedHandsCount === 1 ? 'hand' : 'hands'}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={minimized ? 'Expand camera preview' : 'Minimize camera preview'}
            onClick={() => setMinimized((m) => !m)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            {minimized ? (
              <Maximize2 className="h-3.5 w-3.5" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            aria-label="Disable gesture camera"
            onClick={() => void toggleGestureMode()}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-300"
          >
            <CameraOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Live Video + Landmark Canvas (hidden visually when minimized while keeping video alive!) */}
      <div
        className={`relative bg-slate-950 ${
          minimized ? 'h-0 overflow-hidden' : 'aspect-[4/3] w-full'
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${
            settings.mirrorPreview ? '-scale-x-100' : ''
          }`}
        />
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {modelLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-xs text-cyan-300">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Initializing hand model...</span>
          </div>
        ) : null}

        {gesturePaused ? (
          <div className="absolute inset-x-2 bottom-2 rounded-md border border-amber-500/40 bg-slate-950/85 px-2.5 py-1 text-center text-[11px] font-medium text-amber-300">
            Tracking Paused
          </div>
        ) : null}
      </div>

      {/* Gesture Telemetry Readout */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="min-w-0">
          <p className="truncate font-mono font-medium text-cyan-300">
            {handDetected ? recognizedGesture : 'NO HAND'}
          </p>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            {gestureState} · {palmOrientation}
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <p className="text-xs font-medium text-slate-200">
            {handDetected ? `${Math.round(gestureConfidence * 100)}%` : '--'}
          </p>
          <p className="text-[11px] text-slate-500">conf</p>
        </div>
      </div>
    </aside>
  );
};
