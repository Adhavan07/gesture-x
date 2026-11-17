interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export interface VoiceEngineCallbacks {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (errorCode: string, humanMessage: string) => void;
}

export class VoiceEngine {
  private recognition: SpeechRecognitionInstance | null = null;
  private shouldKeepListening = false;
  private isSpeaking = false;
  private callbacks: VoiceEngineCallbacks;

  constructor(callbacks: VoiceEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public static isRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as Record<string, unknown>;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  public static isSynthesisSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private getConstructor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
  }

  public start(): boolean {
    const Ctor = this.getConstructor();
    if (!Ctor) {
      this.callbacks.onError(
        'unsupported',
        'Web Speech API is not supported in this browser. Use Chrome or Edge for microphone voice commands, or type commands in the Assistant input.'
      );
      return false;
    }

    if (this.shouldKeepListening && this.recognition) {
      return true;
    }

    this.shouldKeepListening = true;
    this.initAndStartRecognition(Ctor);
    return true;
  }

  private initAndStartRecognition(Ctor: SpeechRecognitionCtor): void {
    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this.callbacks.onListeningChange(true);
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        if (this.isSpeaking) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript?.trim() ?? '';
          if (!transcript) continue;
          if (result.isFinal) {
            this.callbacks.onInterimTranscript?.('');
            this.callbacks.onFinalTranscript(transcript);
          } else {
            interim += `${transcript} `;
          }
        }
        if (interim.trim()) {
          this.callbacks.onInterimTranscript?.(interim.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        const code = event.error;
        if (code === 'no-speech' || code === 'aborted') {
          return;
        }
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          this.shouldKeepListening = false;
          this.callbacks.onListeningChange(false);
          this.callbacks.onError(
            'not-allowed',
            'Microphone permission was denied. Enable microphone access in browser settings or use text commands.'
          );
          return;
        }
        if (code === 'audio-capture') {
          this.shouldKeepListening = false;
          this.callbacks.onListeningChange(false);
          this.callbacks.onError(
            'audio-capture',
            'No microphone was detected. Connect a microphone or use the text command input.'
          );
          return;
        }
        this.callbacks.onError(code, `Speech recognition error: ${code}`);
      };

      recognition.onend = () => {
        if (this.shouldKeepListening && !this.isSpeaking) {
          // Restart automatically for continuous voice mode
          window.setTimeout(() => {
            if (this.shouldKeepListening && !this.isSpeaking) {
              try {
                recognition.start();
              } catch {
                // Ignore rapid-restart races
              }
            }
          }, 180);
        } else {
          this.callbacks.onListeningChange(false);
        }
      };

      this.recognition = recognition;
      recognition.start();
    } catch (err) {
      this.shouldKeepListening = false;
      this.callbacks.onListeningChange(false);
      this.callbacks.onError(
        'start-failed',
        err instanceof Error ? err.message : 'Unable to start speech recognition.'
      );
    }
  }

  public stop(): void {
    this.shouldKeepListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors if already stopped
      }
      this.recognition = null;
    }
    this.callbacks.onListeningChange(false);
    this.callbacks.onInterimTranscript?.('');
  }

  public speak(text: string, enabled: boolean = true): void {
    if (!enabled || !VoiceEngine.isSynthesisSupported() || !text.trim()) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.04;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;

      this.isSpeaking = true;
      utterance.onend = () => {
        this.isSpeaking = false;
      };
      utterance.onerror = () => {
        this.isSpeaking = false;
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.isSpeaking = false;
    }
  }

  public destroy(): void {
    this.stop();
    if (VoiceEngine.isSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }
}
