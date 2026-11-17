import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';

export const NotificationToast: React.FC = () => {
  const { notifications, dismissNotification } = useAppStore();

  if (notifications.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 flex w-full max-w-sm flex-col gap-2 pointer-events-none"
    >
      {notifications.map((note) => {
        const Icon =
          note.level === 'success'
            ? CheckCircle2
            : note.level === 'error'
              ? AlertCircle
              : note.level === 'warning'
                ? AlertTriangle
                : Info;

        const accentClass =
          note.level === 'success'
            ? 'border-emerald-500/40 text-emerald-300'
            : note.level === 'error'
              ? 'border-rose-500/40 text-rose-300'
              : note.level === 'warning'
                ? 'border-amber-500/40 text-amber-300'
                : 'border-cyan-500/40 text-cyan-300';

        return (
          <div
            key={note.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-[#0A1222]/95 p-3.5 shadow-xl backdrop-blur-md ${accentClass}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-100">{note.title}</p>
              <p className="mt-0.5 text-xs text-slate-300">{note.message}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissNotification(note.id)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
