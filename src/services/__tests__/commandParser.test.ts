import { describe, expect, it } from 'vitest';
import { parseVoiceCommand } from '../commandParser.ts';

describe('commandParser', () => {
  it('parses file management commands', () => {
    expect(parseVoiceCommand('Open file manager.').intent).toBe('NAV_FILES');
    expect(parseVoiceCommand('Browse files').intent).toBe('BROWSE_FILES');
    expect(parseVoiceCommand('Select all files').intent).toBe('SELECT_ALL');
    expect(parseVoiceCommand('Clear selection').intent).toBe('CLEAR_SELECTION');
    expect(parseVoiceCommand('Show selected files').intent).toBe('SHOW_SELECTED');
    expect(parseVoiceCommand('Remove this file').intent).toBe('REMOVE_TARGET');
    expect(parseVoiceCommand('Select this').intent).toBe('SELECT_TARGET');
  });

  it('parses upload commands', () => {
    expect(parseVoiceCommand('Upload selected files').intent).toBe('UPLOAD_SELECTED');
    expect(parseVoiceCommand('Upload these files').intent).toBe('UPLOAD_SELECTED');
    expect(parseVoiceCommand('Upload everything').intent).toBe('UPLOAD_ALL');
    expect(parseVoiceCommand('Cancel upload').intent).toBe('CANCEL_UPLOAD');
    expect(parseVoiceCommand('Retry failed uploads').intent).toBe('RETRY_FAILED');
    expect(parseVoiceCommand('Show upload progress').intent).toBe('SHOW_PROGRESS');
  });

  it('parses navigation, combined gesture control, and queries', () => {
    expect(parseVoiceCommand('Go to dashboard').intent).toBe('NAV_DASHBOARD');
    expect(parseVoiceCommand('Open upload history').intent).toBe('NAV_HISTORY');
    expect(parseVoiceCommand('Go to settings').intent).toBe('NAV_SETTINGS');
    expect(parseVoiceCommand('Pause gesture control').intent).toBe('PAUSE_GESTURE');
    expect(parseVoiceCommand('Resume gesture control').intent).toBe('RESUME_GESTURE');
    expect(parseVoiceCommand('What can you do?').intent).toBe('HELP');
    expect(parseVoiceCommand('What files are selected?').intent).toBe('QUERY_SELECTED');
    expect(parseVoiceCommand('How many files have been uploaded?').intent).toBe('QUERY_UPLOADED');
  });

  it('detects ambiguous single-word commands and prompts clarification', () => {
    const res = parseVoiceCommand('upload');
    expect(res.ambiguous).toBe(true);
    expect(res.clarificationPrompt).toBeTruthy();
  });

  it('returns UNKNOWN for unrecognized chatter', () => {
    const res = parseVoiceCommand('play some jazz music');
    expect(res.intent).toBe('UNKNOWN');
  });
});
