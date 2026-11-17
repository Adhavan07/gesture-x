import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraPermissionStatus } from '../types/gesture.ts';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  status: CameraPermissionStatus;
  errorMessage: string | null;
  devices: CameraDeviceInfo[];
  selectedDeviceId: string;
  isInIframe: boolean;
  startCamera: (overrideDeviceId?: string) => Promise<boolean>;
  stopCamera: () => void;
  selectDevice: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
}

export function useCamera(onCameraDisconnected?: () => void): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraPermissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isInIframe] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });

  const selectedDeviceIdRef = useRef(selectedDeviceId);
  selectedDeviceIdRef.current = selectedDeviceId;

  const refreshDevices = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.enumerateDevices
    ) {
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label?.trim() || `Camera ${idx + 1}`,
        }));
      setDevices(videoInputs);
      if (
        videoInputs.length > 0 &&
        (!selectedDeviceIdRef.current ||
          !videoInputs.some((d) => d.deviceId === selectedDeviceIdRef.current))
      ) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch {
      // Ignore enumerateDevices failures when permissions are restricted
    }
  }, []);

  const stopCamera = useCallback(() => {
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setStatus((prev) => (prev === 'denied' || prev === 'unavailable' ? prev : 'idle'));
  }, []);

  const startCamera = useCallback(
    async (overrideDeviceId?: string): Promise<boolean> => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setStatus('unavailable');
        setErrorMessage(
          'Camera access (navigator.mediaDevices.getUserMedia) is unavailable in this browser context.'
        );
        return false;
      }

      // Cleanly stop any previous tracks before acquiring a new stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        streamRef.current = null;
      }

      setStatus('requesting');
      setErrorMessage(null);

      const targetDeviceId = overrideDeviceId ?? selectedDeviceIdRef.current;
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
        ...(targetDeviceId
          ? { deviceId: { exact: targetDeviceId } }
          : { facingMode: 'user' }),
      };

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setStatus('granted');

        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.deviceId) {
            setSelectedDeviceId(settings.deviceId);
          }
          videoTrack.onended = () => {
            stopCamera();
            setStatus('unavailable');
            setErrorMessage('Camera disconnected during active tracking.');
            onCameraDisconnected?.();
          };
        }

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => undefined);
        }

        await refreshDevices();
        return true;
      } catch (err) {
        const domErr = err as DOMException;
        if (
          domErr?.name === 'NotAllowedError' ||
          domErr?.name === 'PermissionDeniedError'
        ) {
          setStatus('denied');
          setErrorMessage(
            isInIframe
              ? 'Camera permission was blocked or denied in this embedded preview frame. Allow camera access in browser site settings or open GESTUREX directly in a new tab.'
              : 'Camera permission was denied. Allow camera access in your browser site settings and retry.'
          );
        } else if (
          domErr?.name === 'NotFoundError' ||
          domErr?.name === 'DevicesNotFoundError' ||
          domErr?.name === 'OverconstrainedError'
        ) {
          setStatus('unavailable');
          setErrorMessage(
            'No matching webcam was found. Connect a camera or select another device.'
          );
        } else {
          setStatus('unavailable');
          setErrorMessage(
            domErr?.message ||
              'Unable to start camera stream. Ensure no other application is locking the webcam.'
          );
        }
        await refreshDevices();
        return false;
      }
    },
    [isInIframe, onCameraDisconnected, refreshDevices, stopCamera]
  );

  const selectDevice = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      if (streamRef.current) {
        await startCamera(deviceId);
      }
    },
    [startCamera]
  );

  useEffect(() => {
    void refreshDevices();
    const mediaDevices =
      typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || !mediaDevices.addEventListener) return;

    const handleDeviceChange = () => {
      void refreshDevices();
    };
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    stream,
    status,
    errorMessage,
    devices,
    selectedDeviceId,
    isInIframe,
    startCamera,
    stopCamera,
    selectDevice,
    refreshDevices,
  };
}
