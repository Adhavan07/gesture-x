export type VoicePermissionStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export type VoiceListeningStatus = 'idle' | 'listening' | 'processing' | 'error';

export type VoiceIntent =
  | 'OPEN_FILE_MANAGER'
  | 'BROWSE_FILES'
  | 'BROWSE_FOLDERS'
  | 'SELECT_ALL'
  | 'CLEAR_SELECTION'
  | 'SHOW_SELECTED'
  | 'SELECT_TARGET'
  | 'REMOVE_TARGET'
  | 'UPLOAD_SELECTED'
  | 'UPLOAD_ALL'
  | 'CANCEL_UPLOAD'
  | 'RETRY_FAILED'
  | 'SHOW_PROGRESS'
  | 'NAV_DASHBOARD'
  | 'NAV_FILES'
  | 'NAV_HISTORY'
  | 'NAV_SETTINGS'
  | 'PAUSE_GESTURE'
  | 'RESUME_GESTURE'
  | 'HELP'
  | 'QUERY_SELECTED'
  | 'QUERY_UPLOADED'
  | 'CONFIRM'
  | 'CANCEL_ACTION'
  | 'UNKNOWN';

export interface ParsedCommand {
  rawText: string;
  normalizedText: string;
  intent: VoiceIntent;
  confidence: number;
  ambiguous?: boolean;
  clarificationPrompt?: string;
  entities?: {
    targetName?: string;
  };
}

export interface VoiceLogEntry {
  id: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'action' | 'error';
  text: string;
  intent?: VoiceIntent;
}
