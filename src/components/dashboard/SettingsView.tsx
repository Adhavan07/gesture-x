import React from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import { SERVER_ABSOLUTE_MAX_MB } from '../../utils/fileValidation.ts';
import {
  GESTURE_PRESETS,
  GESTURE_TRIGGER_LABELS,
  MOUSE_ACTION_META,
  type GestureTrigger,
  type GestureType,
  type MouseActionType,
  type PointerHandPreference,
} from '../../types/gesture.ts';

const TRIGGERS_BY_MODE: Record<
  'click' | 'hold' | 'continuous' | 'control',
  GestureTrigger[]
> = {
  click: [
    'MIDDLE_PINCH',
    'DOUBLE_MIDDLE_PINCH',
    'INDEX_PINCH',
    'DOUBLE_INDEX_PINCH',
    'RING_PINCH',
    'THREE_FINGER',
    'TWO_FINGER',
    'THUMBS_UP',
    'FIST',
  ],
  hold: ['MIDDLE_PINCH', 'INDEX_PINCH', 'RING_PINCH'],
  continuous: ['TWO_FINGER', 'THREE_FINGER', 'OPEN_PALM'],
  control: [
    'OPEN_PALM',
    'FIST',
    'THUMBS_UP',
    'THUMBS_DOWN',
    'THREE_FINGER',
    'RING_PINCH',
    'MIDDLE_PINCH',
  ],
};

function matchesLiveGesture(
  trigger: GestureTrigger,
  liveGesture: GestureType
): boolean {
  if (trigger === 'INDEX_PINCH' || trigger === 'DOUBLE_INDEX_PINCH') {
    return liveGesture === 'PINCH';
  }
  if (trigger === 'MIDDLE_PINCH' || trigger === 'DOUBLE_MIDDLE_PINCH') {
    return liveGesture === 'MIDDLE_PINCH';
  }
  return trigger === liveGesture;
}

export const SettingsView: React.FC = () => {
  const {
    settings,
    gestureModeEnabled,
    handDetected,
    recognizedGesture,
    updateSettings,
    updateGestureMapping,
    applyGesturePreset,
    resetGestureMappings,
    swapHandRoles,
  } = useAppStore();

  return (
    <section aria-label="Workspace Settings" className="mx-auto max-w-4xl space-y-6">
      <div className="border-b border-slate-800/80 pb-4">
        <h1 className="font-display text-xl font-semibold text-slate-100">
          Workspace Settings
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Configure two-hand virtual mouse roles, gesture-to-mouse commands, normalized calibration thresholds, and upload limits.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Upload & Hand Roles */}
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1628]/80 p-5">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Upload &amp; Two-Hand Role Manager
          </h2>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="max-file-size" className="font-medium text-slate-300">
                Maximum File Size Limit
              </label>
              <span className="font-mono tabular-nums text-cyan-300">
                {settings.maxFileSizeMB} MB
              </span>
            </div>
            <input
              id="max-file-size"
              type="range"
              min={1}
              max={SERVER_ABSOLUTE_MAX_MB}
              value={settings.maxFileSizeMB}
              onChange={(e) =>
                updateSettings({ maxFileSizeMB: Number(e.target.value) })
              }
              className="w-full accent-cyan-400"
            />
            <p className="text-[11px] text-slate-400">
              Enforced on both client staging and server upload validation (max {SERVER_ABSOLUTE_MAX_MB} MB).
            </p>
          </div>

          <label className="flex items-start justify-between gap-4 pt-2 cursor-pointer">
            <div>
              <span className="block text-xs font-medium text-slate-200">
                Auto-upload on gesture drop
              </span>
              <span className="block text-[11px] text-slate-400">
                Immediately start uploading when a pinched file is released over the drop zone.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.autoUploadOnDrop}
              onChange={(e) =>
                updateSettings({ autoUploadOnDrop: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-400"
            />
          </label>

          <div className="border-t border-slate-800/80 pt-3 space-y-3">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div>
                <span className="block text-xs font-medium text-slate-200">
                  Enable two-hand tracking &amp; modifier engine
                </span>
                <span className="block text-[11px] text-slate-400">
                  Track left and right hands independently for cursor freeze clutch, multi-select hold, two-hand scroll, and emergency stop.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.multiHandEnabled}
                onChange={(e) =>
                  updateSettings({ multiHandEnabled: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-400"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="preferred-pointer-hand"
                className="text-xs font-medium text-slate-300"
              >
                Primary Controller Hand
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="preferred-pointer-hand"
                  value={settings.preferredPointerHand}
                  onChange={(e) =>
                    updateSettings({
                      preferredPointerHand: e.target.value as PointerHandPreference,
                    })
                  }
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <option value="auto">Auto (Smart Lock)</option>
                  <option value="right">Right Primary / Left Secondary</option>
                  <option value="left">Left Primary / Right Secondary</option>
                </select>
                <button
                  type="button"
                  onClick={swapHandRoles}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Swap</span>
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 pt-1 cursor-pointer">
              <span className="text-xs font-medium text-slate-200">
                Mirror webcam preview horizontally
              </span>
              <input
                type="checkbox"
                checked={settings.mirrorPreview}
                onChange={(e) =>
                  updateSettings({ mirrorPreview: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-400"
              />
            </label>

            <label className="flex items-center justify-between gap-4 pt-1 cursor-pointer">
              <span className="text-xs font-medium text-slate-200">
                Spoken assistant voice responses
              </span>
              <input
                type="checkbox"
                checked={settings.voiceFeedbackEnabled}
                onChange={(e) =>
                  updateSettings({ voiceFeedbackEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-400"
              />
            </label>
          </div>
        </div>

        {/* Virtual Mouse Calibration */}
        <div className="space-y-3.5 rounded-xl border border-slate-800 bg-[#0D1628]/80 p-5">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Virtual Mouse Calibration
          </h2>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="cursor-sensitivity" className="font-medium text-slate-300">
                Cursor Sensitivity
              </label>
              <span className="font-mono tabular-nums text-cyan-300">
                {settings.cursorSensitivity.toFixed(2)}x
              </span>
            </div>
            <input
              id="cursor-sensitivity"
              type="range"
              min={0.6}
              max={1.6}
              step={0.05}
              value={settings.cursorSensitivity}
              onChange={(e) =>
                updateSettings({ cursorSensitivity: Number(e.target.value) })
              }
              className="w-full accent-cyan-400"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="cursor-smoothing" className="font-medium text-slate-300">
                Cursor Smoothing
              </label>
              <span className="font-mono tabular-nums text-cyan-300">
                {settings.cursorSmoothing.toFixed(2)}
              </span>
            </div>
            <input
              id="cursor-smoothing"
              type="range"
              min={0.1}
              max={0.65}
              step={0.05}
              value={settings.cursorSmoothing}
              onChange={(e) =>
                updateSettings({ cursorSmoothing: Number(e.target.value) })
              }
              className="w-full accent-cyan-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="pinch-threshold" className="font-medium text-slate-300">
                  Pinch Activate
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {settings.pinchThreshold.toFixed(2)}
                </span>
              </div>
              <input
                id="pinch-threshold"
                type="range"
                min={0.2}
                max={0.44}
                step={0.02}
                value={settings.pinchThreshold}
                onChange={(e) =>
                  updateSettings({ pinchThreshold: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="release-threshold" className="font-medium text-slate-300">
                  Pinch Release
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {settings.releaseThreshold.toFixed(2)}
                </span>
              </div>
              <input
                id="release-threshold"
                type="range"
                min={0.32}
                max={0.62}
                step={0.02}
                value={settings.releaseThreshold}
                onChange={(e) =>
                  updateSettings({ releaseThreshold: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="drag-activation" className="font-medium text-slate-300">
                  Drag Hold Delay
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {settings.dragActivationMs} ms
                </span>
              </div>
              <input
                id="drag-activation"
                type="range"
                min={160}
                max={600}
                step={20}
                value={settings.dragActivationMs}
                onChange={(e) =>
                  updateSettings({ dragActivationMs: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="double-click-window" className="font-medium text-slate-300">
                  Double-Click Window
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {settings.doubleClickWindowMs} ms
                </span>
              </div>
              <input
                id="double-click-window"
                type="range"
                min={220}
                max={750}
                step={20}
                value={settings.doubleClickWindowMs}
                onChange={(e) =>
                  updateSettings({ doubleClickWindowMs: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="gesture-cooldown" className="font-medium text-slate-300">
                  Gesture Cooldown
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {settings.gestureCooldownMs} ms
                </span>
              </div>
              <input
                id="gesture-cooldown"
                type="range"
                min={100}
                max={600}
                step={25}
                value={settings.gestureCooldownMs}
                onChange={(e) =>
                  updateSettings({ gestureCooldownMs: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="confidence-threshold" className="font-medium text-slate-300">
                  Recognition Confidence
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {Math.round(settings.gestureConfidenceThreshold * 100)}%
                </span>
              </div>
              <input
                id="confidence-threshold"
                type="range"
                min={0.5}
                max={0.92}
                step={0.02}
                value={settings.gestureConfidenceThreshold}
                onChange={(e) =>
                  updateSettings({
                    gestureConfidenceThreshold: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="scroll-speed" className="font-medium text-slate-300">
                2D Scroll Speed
              </label>
              <span className="font-mono tabular-nums text-cyan-300">
                {settings.scrollSpeed.toFixed(2)}x
              </span>
            </div>
            <input
              id="scroll-speed"
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={settings.scrollSpeed}
              onChange={(e) =>
                updateSettings({ scrollSpeed: Number(e.target.value) })
              }
              className="w-full accent-cyan-400"
            />
          </div>
        </div>
      </div>

      {/* Editable Gesture Command Mapping Table + Presets */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1628]/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Gesture Command Customization
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Assign unique finger combinations to each virtual mouse operation. Conflicting discrete triggers swap automatically to avoid ambiguity.
            </p>
          </div>
          <button
            type="button"
            onClick={resetGestureMappings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5 text-cyan-400" />
            <span>Reset Defaults</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {GESTURE_PRESETS.map((preset) => {
            const isCurrent = (
              Object.keys(preset.mappings) as MouseActionType[]
            ).every((k) => settings.gestureMappings[k] === preset.mappings[k]);

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyGesturePreset(preset.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  isCurrent
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">
                    {preset.label}
                  </span>
                  {isCurrent ? (
                    <span className="font-mono text-[11px] text-cyan-300">
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-400">
                  {preset.summary}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Mouse Operation</th>
                <th className="py-2.5 pr-4 font-medium">Behavior</th>
                <th className="py-2.5 font-medium text-right">Assigned Gesture</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {MOUSE_ACTION_META.map((meta) => {
                const currentTrigger = settings.gestureMappings[meta.action];
                const allowedTriggers = TRIGGERS_BY_MODE[meta.mode];
                const isLiveMatch =
                  gestureModeEnabled &&
                  handDetected &&
                  matchesLiveGesture(currentTrigger, recognizedGesture);

                return (
                  <tr
                    key={meta.action}
                    className={
                      isLiveMatch
                        ? 'bg-cyan-500/10'
                        : 'hover:bg-slate-900/40'
                    }
                  >
                    <td className="py-3 pr-4 font-medium text-slate-100 whitespace-nowrap">
                      {meta.label}
                      {isLiveMatch ? (
                        <span className="ml-2 font-mono text-[11px] text-cyan-300">
                          · Active
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{meta.description}</td>
                    <td className="py-3 text-right">
                      <select
                        aria-label={`Hand sign for ${meta.label}`}
                        value={currentTrigger}
                        onChange={(e) =>
                          updateGestureMapping(
                            meta.action as MouseActionType,
                            e.target.value as GestureTrigger
                          )
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
                      >
                        {allowedTriggers.map((trig) => (
                          <option key={trig} value={trig}>
                            {GESTURE_TRIGGER_LABELS[trig]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supported Voice Commands Reference */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1628]/80 p-5">
        <h2 className="font-display text-sm font-semibold text-slate-100">
          Voice Commands Reference
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
          <p>&ldquo;Browse files&rdquo; / &ldquo;Browse folders&rdquo;</p>
          <p>&ldquo;Select all files&rdquo; / &ldquo;Clear selection&rdquo;</p>
          <p>&ldquo;Select this&rdquo; / &ldquo;Remove this file&rdquo; (while pointing)</p>
          <p>&ldquo;Upload selected files&rdquo; / &ldquo;Upload everything&rdquo;</p>
          <p>&ldquo;Cancel upload&rdquo; / &ldquo;Retry failed uploads&rdquo;</p>
          <p>&ldquo;Pause gesture control&rdquo; / &ldquo;Resume gesture control&rdquo;</p>
          <p>&ldquo;Open upload history&rdquo; / &ldquo;Go to settings&rdquo;</p>
        </div>
      </div>
    </section>
  );
};
