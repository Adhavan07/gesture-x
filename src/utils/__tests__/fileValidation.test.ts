import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  sanitizeFileName,
  sanitizeRelativePath,
  validateFileMetadata,
} from '../fileValidation.ts';
import { buildExplorerTreeFromFiles } from '../../services/fileService.ts';

describe('fileValidation', () => {
  it('accepts supported formats within size limit', () => {
    const res = validateFileMetadata(
      { name: 'quarterly_report.pdf', size: 1024 * 500, type: 'application/pdf' },
      50
    );
    expect(res.valid).toBe(true);
    expect(res.extension).toBe('pdf');
  });

  it('rejects unsupported or executable file types', () => {
    const res = validateFileMetadata(
      { name: 'payload.exe', size: 2048, type: 'application/x-msdownload' },
      50
    );
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Unsupported file type');
  });

  it('rejects oversized files', () => {
    const res = validateFileMetadata(
      { name: 'video.mp4', size: 60 * 1024 * 1024, type: 'video/mp4' },
      50
    );
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceeds');
  });

  it('rejects mismatched MIME types', () => {
    const res = validateFileMetadata(
      { name: 'photo.png', size: 1024, type: 'text/html' },
      50
    );
    expect(res.valid).toBe(false);
  });

  it('sanitizes path traversal attempts in filenames and relative paths', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\evil?.txt')).toBe('evil_.txt');
    expect(sanitizeRelativePath('../secret/./docs/file.pdf')).toBe('secret/docs/file.pdf');
  });

  it('formats byte sizes cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });

  it('builds a sorted explorer tree from dropped/mounted folder entries', () => {
    const fileA = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const fileB = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' });
    const tree = buildExplorerTreeFromFiles(
      [
        { file: fileA, relativePath: 'Desktop/notes.txt' },
        { file: fileB, relativePath: 'Desktop/sub/report.pdf' },
      ],
      'Desktop'
    );
    expect(tree.kind).toBe('directory');
    expect(tree.children?.map((c) => c.name)).toEqual(['sub', 'notes.txt']);
    expect(tree.children?.[0].kind).toBe('directory');
    expect(tree.children?.[0].children?.[0].name).toBe('report.pdf');
  });
});
