import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';

export const ConfirmationModal: React.FC = () => {
  const { pendingConfirmation, confirmPendingAction, cancelPendingAction } =
    useAppStore();

  useEffect(() => {
    if (!pendingConfirmation) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelPendingAction();
      } else if (e.key === 'Enter') {
        confirmPendingAction();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelPendingAction, confirmPendingAction, pendingConfirmation]);

  if (!pendingConfirmation) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0D1628] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="confirm-title"
              className="font-display text-base font-semibold text-slate-100"
            >
              {pendingConfirmation.title}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {pendingConfirmation.description}
            </p>
            <p className="mt-2 text-[11px] text-cyan-300">
              Tip: Confirm with click, &ldquo;Confirm&rdquo; by voice, or Thumbs Up gesture.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            data-gx-action="confirm-cancel"
            onClick={cancelPendingAction}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            data-gx-action="confirm-accept"
            onClick={confirmPendingAction}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 whitespace-nowrap shrink-0"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
