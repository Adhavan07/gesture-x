import React, { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import type { TrackingSnapshot } from '../../hooks/useHandTracking.ts';
import type { GestureEventType } from '../../types/gesture.ts';

function getEventBadgeLabel(
  event?: GestureEventType,
  isSecondary = false
): string | null {
  const prefix = isSecondary ? '2H ' : '';
  switch (event) {
    case 'LEFT_CLICK':
      return `${prefix}Left Click`;
    case 'DOUBLE_CLICK':
      return `${prefix}Double Click`;
    case 'RIGHT_CLICK':
      return `${prefix}Right Click`;
    case 'RIGHT_HOLD_START':
      return `${prefix}Right Hold`;
    case 'CHOOSE_SELECT':
      return `${prefix}Multi-Select`;
    case 'DROP':
      return 'Dropped';
    case 'CANCEL':
      return 'Cancelled';
    case 'CONFIRM':
      return 'Confirmed';
    case 'REJECT':
      return 'Rejected / Undo';
    case 'EMERGENCY_STOP':
      return 'Emergency Stop';
    case 'SCROLL':
      return `${prefix}Scroll`;
    default:
      return null;
  }
}

export const VirtualCursor: React.FC = () => {
  const {
    gestureModeEnabled,
    gestureState,
    twoHandModifiers,
    handDetected,
    draggingFileId,
    files,
    pendingConfirmation,
    contextMenu,
    previewModal,
    subscribeTracking,
  } = useAppStore();

  const cursorRef = useRef<HTMLDivElement | null>(null);
  const secondaryCursorRef = useRef<HTMLDivElement | null>(null);
  const secondaryLabelRef = useRef<HTMLSpanElement | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const [pulseAction, setPulseAction] = useState<{
    label: string;
    tone: 'cyan' | 'blue' | 'amber' | 'rose';
  } | null>(null);

  const actionStateRef = useRef({
    hasConfirmable: false,
    hasCancellable: false,
    hasRejectable: false,
  });
  actionStateRef.current = {
    hasConfirmable: Boolean(pendingConfirmation),
    hasCancellable: Boolean(
      draggingFileId || contextMenu.open || previewModal.open || pendingConfirmation
    ),
    hasRejectable: Boolean(
      pendingConfirmation ||
        contextMenu.open ||
        previewModal.open ||
        files.some((f) => f.selected)
    ),
  };

  useEffect(() => {
    if (!gestureModeEnabled || gestureState === 'PAUSED') {
      setPulseAction(null);
    }
  }, [gestureModeEnabled, gestureState]);

  useEffect(() => {
    if (!gestureModeEnabled) return;

    const unsubscribe = subscribeTracking((snapshot: TrackingSnapshot) => {
      const el = cursorRef.current;
      if (el) {
        if (!snapshot.frameResult.handDetected) {
          el.style.opacity = '0';
        } else {
          el.style.opacity = '1';
          el.style.transform = `translate3d(${snapshot.cursorX}px, ${snapshot.cursorY}px, 0)`;
        }
      }

      const secEl = secondaryCursorRef.current;
      if (secEl) {
        if (!snapshot.secondaryCursor) {
          secEl.style.opacity = '0';
        } else {
          secEl.style.opacity = '0.9';
          secEl.style.transform = `translate3d(${snapshot.secondaryCursor.x}px, ${snapshot.secondaryCursor.y}px, 0)`;
          if (secondaryLabelRef.current) {
            secondaryLabelRef.current.textContent =
              snapshot.secondaryCursor.side === 'left' ? 'L' : 'R';
          }
        }
      }

      const activeEvent =
        snapshot.frameResult.event ?? snapshot.frameResult.secondaryEvent;
      const isSecondary =
        !snapshot.frameResult.event && Boolean(snapshot.frameResult.secondaryEvent);

      // Suppress Confirm/Cancel/Reject pulse pills unless a real target/modal/drag existed
      const suppressIdleControlBadge =
        (activeEvent === 'CONFIRM' && !actionStateRef.current.hasConfirmable) ||
        (activeEvent === 'CANCEL' && !actionStateRef.current.hasCancellable) ||
        (activeEvent === 'REJECT' && !actionStateRef.current.hasRejectable);

      const label = suppressIdleControlBadge
        ? null
        : getEventBadgeLabel(activeEvent, isSecondary);
      if (label) {
        const tone =
          activeEvent === 'EMERGENCY_STOP' || activeEvent === 'CANCEL' || activeEvent === 'REJECT'
            ? 'rose'
            : activeEvent === 'RIGHT_CLICK' || activeEvent === 'RIGHT_HOLD_START'
              ? 'amber'
              : activeEvent === 'DOUBLE_CLICK'
                ? 'blue'
                : 'cyan';
        setPulseAction({ label, tone });
        if (pulseTimerRef.current) {
          window.clearTimeout(pulseTimerRef.current);
        }
        pulseTimerRef.current = window.setTimeout(() => {
          setPulseAction(null);
        }, 440);
      }
    });

    return () => {
      unsubscribe();
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, [gestureModeEnabled, subscribeTracking]);

  if (!gestureModeEnabled || !handDetected) return null;

  const draggedFile = draggingFileId
    ? files.find((f) => f.id === draggingFileId)
    : null;

  const ringClass = (() => {
    if (pulseAction?.tone === 'rose') {
      return 'h-8 w-8 border-rose-400 bg-rose-500/30 scale-110';
    }
    if (pulseAction?.tone === 'amber') {
      return 'h-8 w-8 border-amber-400 bg-amber-400/25 scale-110';
    }
    if (pulseAction?.tone === 'blue') {
      return 'h-9 w-9 border-blue-400 bg-blue-500/35 scale-110';
    }
    if (pulseAction?.tone === 'cyan') {
      return 'h-8 w-8 border-cyan-300 bg-cyan-400/30 scale-105';
    }
    if (twoHandModifiers.cursorFrozen) {
      return 'h-7 w-7 border-amber-300 bg-amber-400/20';
    }
    if (twoHandModifiers.multiSelectActive || gestureState === 'MULTI_SELECT') {
      return 'h-8 w-8 border-emerald-400 bg-emerald-400/20';
    }
    switch (gestureState) {
      case 'DRAGGING':
      case 'PINCH_STARTED':
        return 'h-7 w-7 border-blue-400 bg-blue-500/30 scale-95';
      case 'RIGHT_BUTTON_HOLD':
        return 'h-8 w-8 border-amber-400 bg-amber-500/25';
      case 'SCROLLING':
        return 'h-7 w-7 border-cyan-300 bg-cyan-500/20';
      case 'PAUSED':
        return 'h-8 w-8 border-amber-400 bg-amber-500/20';
      case 'CANCELLED':
        return 'h-7 w-7 border-rose-400 bg-rose-500/25';
      default:
        return 'h-6 w-6 border-cyan-400 bg-cyan-400/15';
    }
  })();

  const persistentStatusLabel = twoHandModifiers.cursorFrozen
    ? 'Cursor Frozen'
    : twoHandModifiers.multiSelectActive
      ? 'Multi-Select Mode'
      : gestureState === 'SCROLLING'
        ? 'Scrolling'
        : gestureState === 'RIGHT_BUTTON_HOLD'
          ? 'Right Hold'
          : null;

  return (
    <>
      <div
        ref={cursorRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-50 -ml-3 -mt-3 transition-opacity duration-100 will-change-transform"
      >
        <div
          className={`flex items-center justify-center rounded-full border-2 shadow-lg transition-transform duration-100 ${ringClass}`}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-white" />
        </div>

        {pulseAction || persistentStatusLabel ? (
          <div className="mt-1.5 ml-4 rounded border border-slate-700 bg-[#0A1222]/95 px-2 py-0.5 text-[11px] font-medium text-cyan-200 shadow-lg whitespace-nowrap">
            {pulseAction?.label ?? persistentStatusLabel}
          </div>
        ) : null}

        {draggedFile ? (
          <div className="mt-2 ml-4 flex max-w-[200px] items-center gap-2 rounded-lg border border-cyan-400/70 bg-[#0A1222]/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-xl">
            <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <span className="truncate font-medium">{draggedFile.name}</span>
          </div>
        ) : null}
      </div>

      {/* Secondary Off-Hand Reticle in Multi-Hand Mode */}
      <div
        ref={secondaryCursorRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none fixed left-0 top-0 z-40 -ml-2.5 -mt-2.5 transition-opacity duration-100 will-change-transform"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/80 bg-emerald-400/15 shadow-md">
          <span
            ref={secondaryLabelRef}
            className="font-mono text-[9px] font-semibold text-emerald-200"
          >
            L
          </span>
        </div>
      </div>
    </>
  );
};
