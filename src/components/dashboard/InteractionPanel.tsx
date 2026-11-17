import React, { useState } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Pause,
  Play,
  AlertCircle,
  Hand,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';

export const InteractionPanel: React.FC = () => {
  const {
    gestureModeEnabled,
    gesturePaused,
    cameraStatus,
    cameraError,
    cameraDevices,
    selectedCameraId,
    isInIframe,
    selectCameraDevice,
    modelLoading,
    modelError,
    handDetected,
    gestureState,
    recognizedGesture,
    gestureConfidence,
    toggleGestureMode,
    retryCamera,
    pauseGestureMode,
    resumeGestureMode,
    voiceModeEnabled,
    voiceSupported,
    voicePermission,
    voiceListeningStatus,
    voiceError,
    toggleVoiceMode,
  } = useAppStore();

  const [copiedUrl, setCopiedUrl] = useState(false);

  const directUrl =
    typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyUrl = async () => {
    if (!directUrl || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const cameraStatusText = (() => {
    if (cameraStatus === 'requesting') return 'Requesting camera access';
    if (modelLoading) return 'Loading local MediaPipe hand model';
    if (cameraStatus === 'denied') return 'Camera permission blocked or denied';
    if (cameraStatus === 'unavailable') return 'Camera unavailable';
    if (!gestureModeEnabled) return 'Inactive — physical webcam tracking';
    if (gesturePaused) return 'Paused — interactions suspended';
    if (handDetected) {
      return `Hand tracked · ${recognizedGesture} (${Math.round(
        gestureConfidence * 100
      )}%)`;
    }
    return 'Webcam active · show hand to camera';
  })();

  const voiceStatusText = (() => {
    if (voiceModeEnabled && !voiceSupported) {
      return 'Active (TTS + Console — browser lacks Web Speech STT)';
    }
    if (!voiceSupported) return 'Command Console + TTS ready (no native STT)';
    if (voicePermission === 'denied') return 'Microphone permission denied';
    if (!voiceModeEnabled) return 'Inactive — microphone standby';
    if (voiceListeningStatus === 'listening') return 'Listening for commands';
    if (voiceListeningStatus === 'processing') return 'Processing command';
    if (voiceListeningStatus === 'error') return 'Microphone error';
    return 'Ready';
  })();

  return (
    <section
      aria-label="Interaction Controls"
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      {/* Gesture Mode Control Card (Camera-Only) */}
      <div className="rounded-xl border border-slate-800/90 bg-[#0D1628]/85 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                gestureModeEnabled
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700/80 bg-slate-900 text-slate-400'
              }`}
            >
              {gestureModeEnabled ? (
                <Hand className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Camera className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span>Camera Gesture Control</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="font-mono text-xs font-medium text-cyan-300 tabular-nums">
                  {gestureState}
                </span>
              </div>
              <p className="truncate text-xs text-slate-400">{cameraStatusText}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {gestureModeEnabled ? (
              <button
                type="button"
                onClick={gesturePaused ? resumeGestureMode : pauseGestureMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {gesturePaused ? (
                  <>
                    <Play className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void toggleGestureMode()}
              disabled={cameraStatus === 'requesting'}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                gestureModeEnabled
                  ? 'border border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              } disabled:opacity-60`}
            >
              {gestureModeEnabled ? (
                <>
                  <CameraOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Disable Camera</span>
                </>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Enable Camera</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Camera Device Selector + Standalone Tab Link */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="camera-device-select"
              className="text-xs text-slate-400 whitespace-nowrap"
            >
              Camera:
            </label>
            <select
              id="camera-device-select"
              aria-label="Select camera device"
              value={selectedCameraId}
              onChange={(e) => void selectCameraDevice(e.target.value)}
              disabled={cameraDevices.length === 0}
              className="max-w-[230px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
            >
              {cameraDevices.length === 0 ? (
                <option value="">Default Webcam (grant access to list)</option>
              ) : (
                cameraDevices.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label}
                  </option>
                ))
              )}
            </select>
          </div>

          {isInIframe && directUrl ? (
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-500/50 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Open in New Tab</span>
              </a>
              <button
                type="button"
                onClick={() => void handleCopyUrl()}
                aria-label="Copy app URL"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 whitespace-nowrap shrink-0"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>

        <p className="mt-2.5 text-xs text-slate-400">
          {gestureModeEnabled
            ? 'Point index to move · Thumb+Middle pinch: Left click (2x = Double, Hold = Drag) · Thumb+Index pinch: Right click · 2 Fingers: 2D Scroll · Off-hand Fist freezes cursor.'
            : 'Camera permission is requested only when enabled. All 21-landmark dual-hand tracking runs locally via MediaPipe.'}
        </p>

        {cameraError || modelError ? (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{cameraError || modelError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void retryCamera()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800 whitespace-nowrap"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Retry Camera</span>
              </button>
              {directUrl ? (
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span>Open in New Tab</span>
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Voice Mode Control Card */}
      <div className="rounded-xl border border-slate-800/90 bg-[#0D1628]/85 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                voiceModeEnabled
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                  : 'border-slate-700/80 bg-slate-900 text-slate-400'
              }`}
            >
              {voiceModeEnabled ? (
                <Mic className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MicOff className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span>Voice Assistant</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="font-mono text-xs font-medium text-blue-300 capitalize">
                  {voiceModeEnabled ? voiceListeningStatus : 'Standby'}
                </span>
              </div>
              <p className="truncate text-xs text-slate-400">{voiceStatusText}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void toggleVoiceMode()}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              voiceModeEnabled
                ? 'border border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {voiceModeEnabled ? (
              <>
                <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Stop Voice</span>
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Enable Voice</span>
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Run Voice alongside camera Gesture Control: point at a file and say &ldquo;Select this&rdquo; or &ldquo;Upload selected files&rdquo;.
        </p>

        {voiceError ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <span>{voiceError}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
};
