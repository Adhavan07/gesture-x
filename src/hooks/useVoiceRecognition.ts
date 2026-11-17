import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceEngine } from '../engines/VoiceEngine.ts';
import type {
  VoiceListeningStatus,
  VoicePermissionStatus,
} from '../types/voice.ts';

export interface UseVoiceRecognitionOptions {
  voiceFeedbackEnabled: boolean;
  onTranscriptCommand: (transcript: string) => void;
  onErrorNotification?: (message: string) => void;
}

export function useVoiceRecognition(options: UseVoiceRecognitionOptions) {
  const { voiceFeedbackEnabled, onTranscriptCommand, onErrorNotification } = options;

  const [supported] = useState(() => VoiceEngine.isRecognitionSupported());
  const [permissionStatus, setPermissionStatus] = useState<VoicePermissionStatus>(() =>
    VoiceEngine.isRecognitionSupported() ? 'prompt' : 'unsupported'
  );
  const [listeningStatus, setListeningStatus] = useState<VoiceListeningStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const engineRef = useRef<VoiceEngine | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const callbacksRef = useRef({ onTranscriptCommand, onErrorNotification });
  callbacksRef.current = { onTranscriptCommand, onErrorNotification };

  useEffect(() => {
    const engine = new VoiceEngine({
      onInterimTranscript: (text) => {
        setInterimTranscript(text);
      },
      onFinalTranscript: (text) => {
        setInterimTranscript('');
        setListeningStatus('processing');
        callbacksRef.current.onTranscriptCommand(text);
        window.setTimeout(() => {
          setListeningStatus((prev) => (prev === 'processing' ? 'listening' : prev));
        }, 250);
      },
      onListeningChange: (listening) => {
        setListeningStatus(listening ? 'listening' : 'idle');
      },
      onError: (code, msg) => {
        if (code === 'not-allowed') {
          setPermissionStatus('denied');
        } else if (code === 'unsupported') {
          setPermissionStatus('unsupported');
        }
        setListeningStatus('error');
        setErrorMessage(msg);
        callbacksRef.current.onErrorNotification?.(msg);
      },
    });

    engineRef.current = engine;
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const startListening = useCallback(async (): Promise<boolean> => {
    if (!engineRef.current) return false;
    setErrorMessage(null);

    // Check microphone permission when available
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = audioStream;
        setPermissionStatus('granted');
      } catch (err) {
        const domErr = err as DOMException;
        if (
          domErr?.name === 'NotAllowedError' ||
          domErr?.name === 'PermissionDeniedError'
        ) {
          setPermissionStatus('denied');
          // In browsers without SpeechRecognition (e.g. Firefox) or restricted iframes,
          // keep command console + TTS voice feedback active rather than blocking completely.
          if (!VoiceEngine.isRecognitionSupported()) {
            setListeningStatus('idle');
            setErrorMessage(
              'Speech-to-text is unavailable in this browser and mic permission was denied. Spoken TTS responses and Assistant text commands remain active.'
            );
            return true;
          }
          setListeningStatus('error');
          setErrorMessage(
            'Microphone permission denied. Allow microphone access in browser settings or use the Assistant command console.'
          );
          return false;
        }
      }
    }

    if (!VoiceEngine.isRecognitionSupported()) {
      setPermissionStatus('unsupported');
      setListeningStatus('listening');
      setErrorMessage(
        'Voice Assistant active (TTS + Command Console). Continuous speech-to-text requires Chrome/Edge; use quick commands or type below in Firefox.'
      );
      return true;
    }

    const started = engineRef.current.start();
    if (started) {
      setPermissionStatus('granted');
      setListeningStatus('listening');
    }
    return started;
  }, []);

  const stopListening = useCallback(() => {
    engineRef.current?.stop();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setListeningStatus('idle');
    setInterimTranscript('');
  }, []);

  const speak = useCallback(
    (text: string) => {
      engineRef.current?.speak(text, voiceFeedbackEnabled);
    },
    [voiceFeedbackEnabled]
  );

  return {
    supported,
    permissionStatus,
    listeningStatus,
    interimTranscript,
    errorMessage,
    startListening,
    stopListening,
    speak,
  };
}
