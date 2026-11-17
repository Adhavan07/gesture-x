import type { ParsedCommand, VoiceIntent } from '../types/voice.ts';

interface CommandRule {
  intent: VoiceIntent;
  patterns: RegExp[];
  confidence: number;
}

const COMMAND_RULES: CommandRule[] = [
  // Gesture control overrides
  {
    intent: 'PAUSE_GESTURE',
    patterns: [
      /\b(pause|stop|freeze|disable|suspend)\b.*\b(gesture|hand|tracking|cursor)\b/,
      /\bpause gestures?\b/,
    ],
    confidence: 0.96,
  },
  {
    intent: 'RESUME_GESTURE',
    patterns: [
      /\b(resume|start|enable|unpause|activate)\b.*\b(gesture|hand|tracking|cursor)\b/,
      /\bresume gestures?\b/,
    ],
    confidence: 0.96,
  },

  // Navigation
  {
    intent: 'NAV_DASHBOARD',
    patterns: [/\b(go to|open|show|switch to)\b.*\bdashboard\b/, /^dashboard$/],
    confidence: 0.94,
  },
  {
    intent: 'NAV_FILES',
    patterns: [/\b(go to|open|show|switch to)\b.*\bfile manager\b/, /\bgo to files\b/, /^files$/],
    confidence: 0.94,
  },
  {
    intent: 'NAV_HISTORY',
    patterns: [
      /\b(go to|open|show|view|switch to)\b.*\b(upload history|activity|history)\b/,
      /^history$/,
    ],
    confidence: 0.94,
  },
  {
    intent: 'NAV_SETTINGS',
    patterns: [/\b(go to|open|show|switch to)\b.*\bsettings\b/, /^settings$/],
    confidence: 0.94,
  },

  // File browsing
  {
    intent: 'BROWSE_FOLDERS',
    patterns: [/\b(browse|select|pick|choose|open|add)\b.*\bfolders?\b/],
    confidence: 0.94,
  },
  {
    intent: 'BROWSE_FILES',
    patterns: [
      /\b(browse|pick|choose|add)\b.*\bfiles?\b/,
      /\bopen file picker\b/,
      /\bupload new files?\b/,
    ],
    confidence: 0.92,
  },

  // Selection
  {
    intent: 'SELECT_ALL',
    patterns: [/\bselect all( files)?\b/, /\bhighlight all( files)?\b/, /\bcheck all\b/],
    confidence: 0.96,
  },
  {
    intent: 'CLEAR_SELECTION',
    patterns: [
      /\bclear (all )?selection\b/,
      /\bdeselect (all|everything)\b/,
      /\bunselect (all|everything)\b/,
    ],
    confidence: 0.95,
  },
  {
    intent: 'SHOW_SELECTED',
    patterns: [/\bshow selected( files)?\b/, /\bfilter selected\b/],
    confidence: 0.92,
  },
  {
    intent: 'SELECT_TARGET',
    patterns: [/\bselect this( file)?\b/, /\bpick this( one| file)?\b/, /\bchoose this\b/],
    confidence: 0.93,
  },
  {
    intent: 'REMOVE_TARGET',
    patterns: [
      /\bremove this( file)?\b/,
      /\bdelete this( file)?\b/,
      /\bremove selected( files)?\b/,
    ],
    confidence: 0.93,
  },

  // Uploads
  {
    intent: 'UPLOAD_ALL',
    patterns: [/\bupload everything\b/, /\bupload all( files)?\b/],
    confidence: 0.96,
  },
  {
    intent: 'UPLOAD_SELECTED',
    patterns: [
      /\bupload (the )?(selected|these|highlighted)( files)?\b/,
      /\bstart upload(ing)?\b/,
      /\bsend (selected|these) files\b/,
    ],
    confidence: 0.96,
  },
  {
    intent: 'CANCEL_UPLOAD',
    patterns: [/\bcancel (the )?uploads?\b/, /\bstop (the )?uploads?\b/, /\babort uploads?\b/],
    confidence: 0.95,
  },
  {
    intent: 'RETRY_FAILED',
    patterns: [/\bretry (all )?(failed|errored)( uploads?)?\b/, /\bretry uploads?\b/],
    confidence: 0.95,
  },
  {
    intent: 'SHOW_PROGRESS',
    patterns: [/\bshow (upload )?progress\b/, /\bupload status\b/],
    confidence: 0.9,
  },

  // Queries & Help
  {
    intent: 'HELP',
    patterns: [
      /\bwhat can you do\b/,
      /\bhelp\b/,
      /\blist commands\b/,
      /\bavailable commands\b/,
    ],
    confidence: 0.95,
  },
  {
    intent: 'QUERY_SELECTED',
    patterns: [
      /\bwhat files are selected\b/,
      /\bwhich files are selected\b/,
      /\bhow many files are selected\b/,
    ],
    confidence: 0.94,
  },
  {
    intent: 'QUERY_UPLOADED',
    patterns: [
      /\bhow many files (have been |are )?uploaded\b/,
      /\bupload count\b/,
    ],
    confidence: 0.94,
  },

  // Confirmation / cancellation
  {
    intent: 'CONFIRM',
    patterns: [/^(yes|confirm|proceed|do it|go ahead|okay|ok)$/],
    confidence: 0.9,
  },
  {
    intent: 'CANCEL_ACTION',
    patterns: [/^(no|cancel|never mind|abort|stop)$/],
    confidence: 0.9,
  },
];

export function normalizeSpokenText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVoiceCommand(rawText: string): ParsedCommand {
  const normalizedText = normalizeSpokenText(rawText);

  if (!normalizedText) {
    return {
      rawText,
      normalizedText,
      intent: 'UNKNOWN',
      confidence: 0,
    };
  }

  for (const rule of COMMAND_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedText))) {
      return {
        rawText,
        normalizedText,
        intent: rule.intent,
        confidence: rule.confidence,
      };
    }
  }

  // Handle ambiguous single-verb commands safely instead of guessing destructively
  if (/^(upload|send)$/.test(normalizedText)) {
    return {
      rawText,
      normalizedText,
      intent: 'UNKNOWN',
      confidence: 0.4,
      ambiguous: true,
      clarificationPrompt:
        'Did you mean "upload selected files" or "upload everything"?',
    };
  }

  if (/^(remove|delete|clear)$/.test(normalizedText)) {
    return {
      rawText,
      normalizedText,
      intent: 'UNKNOWN',
      confidence: 0.4,
      ambiguous: true,
      clarificationPrompt:
        'Please specify "clear selection" or "remove this file" while pointing at a file.',
    };
  }

  if (/^open$/.test(normalizedText)) {
    return {
      rawText,
      normalizedText,
      intent: 'UNKNOWN',
      confidence: 0.4,
      ambiguous: true,
      clarificationPrompt:
        'What would you like to open: "browse files", "upload history", or "settings"?',
    };
  }

  return {
    rawText,
    normalizedText,
    intent: 'UNKNOWN',
    confidence: 0.15,
  };
}
