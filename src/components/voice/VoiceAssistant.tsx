import React, { useState } from 'react';
import { Mic, MicOff, Send, Terminal, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';

const QUICK_COMMANDS = [
  'Browse files',
  'Select all files',
  'Upload selected files',
  'Pause gesture control',
  'What can you do?',
];

export const VoiceAssistant: React.FC = () => {
  const {
    voiceModeEnabled,
    voiceSupported,
    voiceListeningStatus,
    interimTranscript,
    voiceLogs,
    recentActions,
    voiceError,
    toggleVoiceMode,
    dispatchVoiceCommand,
  } = useAppStore();

  const [commandInput, setCommandInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    dispatchVoiceCommand(commandInput);
    setCommandInput('');
  };

  return (
    <aside
      aria-label="Voice and Action Assistant"
      className="flex flex-col gap-4 rounded-xl border border-slate-800/90 bg-[#0D1628]/85 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Assistant Console
          </h3>
          <p className="text-xs text-slate-400">
            {voiceModeEnabled
              ? voiceListeningStatus === 'listening'
                ? 'Listening for voice commands'
                : 'Voice assistant active'
              : 'Speak or enter a command'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void toggleVoiceMode()}
          aria-label={voiceModeEnabled ? 'Stop voice assistant' : 'Start voice assistant'}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            voiceModeEnabled
              ? 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
              : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {voiceModeEnabled ? (
            <>
              <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Listen</span>
            </>
          )}
        </button>
      </div>

      {/* Live Interim Transcript */}
      {interimTranscript ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
          <span className="font-medium text-cyan-300">Hearing: </span>
          <span>{interimTranscript}</span>
        </div>
      ) : null}

      {/* Voice Error Notice */}
      {voiceError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {voiceError}
        </div>
      ) : null}

      {/* Conversation & Command Log */}
      <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
        {voiceLogs.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
              entry.type === 'user'
                ? 'ml-6 border border-blue-500/30 bg-blue-500/10 text-blue-100'
                : entry.type === 'error'
                  ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200'
                  : 'mr-4 border border-slate-800 bg-slate-900/90 text-slate-200'
            }`}
          >
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="font-medium">
                {entry.type === 'user'
                  ? 'You'
                  : entry.type === 'error'
                    ? 'Error'
                    : 'Assistant'}
              </span>
              <span className="font-mono tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p>{entry.text}</p>
          </div>
        ))}
      </div>

      {/* Quick Command Suggestions */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Quick commands</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => dispatchVoiceCommand(cmd)}
              className="rounded-md border border-slate-700/80 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Text Command Input Fallback */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Terminal
            className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Type a voice command..."
            aria-label="Type a voice command"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          aria-label="Send command"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>

      {/* Recent Actions Audit Feed */}
      {recentActions.length > 0 ? (
        <div className="border-t border-slate-800/80 pt-3">
          <h4 className="mb-2 text-xs font-semibold text-slate-300">
            Recent Actions
          </h4>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] font-mono tabular-nums text-slate-400">
            {recentActions.map((act, idx) => (
              <li key={`${act}-${idx}`} className="truncate">
                {act}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
};
