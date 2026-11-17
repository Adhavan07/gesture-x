import type { SupportedFileExtension, ValidationResult } from '../types/files.ts';

export const ALLOWED_EXTENSIONS: ReadonlySet<SupportedFileExtension> = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'mp4',
  'mp3',
  'zip',
  'txt',
  'csv',
]);

export const EXTENSION_MIME_MAP: Record<SupportedFileExtension, readonly string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  mp4: ['video/mp4'],
  mp3: ['audio/mpeg', 'audio/mp3'],
  zip: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
};

export const DEFAULT_MAX_FILE_SIZE_MB = 50;
export const SERVER_ABSOLUTE_MAX_MB = 100;

export function getFileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? '';
  const lastDot = base.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === base.length - 1) {
    return '';
  }
  return base.slice(lastDot + 1).toLowerCase();
}

export function sanitizeFileName(filename: string): string {
  // Strip directory components and null bytes to prevent path traversal
  const withoutNulls = filename.replace(/\0/g, '');
  const base = withoutNulls.split(/[/\\]/).pop() ?? 'unnamed';
  const cleaned = base
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'upload_file';
  }
  return cleaned.slice(0, 180);
}

export function sanitizeRelativePath(rawPath: string | undefined): string {
  if (!rawPath) return '';
  const segments = rawPath
    .replace(/\0/g, '')
    .split(/[/\\]+/)
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._ -]/g, '_').trim())
    .filter(Boolean);
  return segments.join('/');
}

export function isSupportedExtension(ext: string): ext is SupportedFileExtension {
  return ALLOWED_EXTENSIONS.has(ext as SupportedFileExtension);
}

export function isMimeCompatible(ext: SupportedFileExtension, mimeType: string): boolean {
  const normalized = (mimeType || '').toLowerCase().trim();
  // Some OS/browsers report empty or generic octet-stream for office/archive/csv files
  if (!normalized || normalized === 'application/octet-stream') {
    return true;
  }
  const allowedMimes = EXTENSION_MIME_MAP[ext];
  return allowedMimes.includes(normalized);
}

export function validateFileMetadata(
  meta: { name: string; size: number; type?: string },
  maxSizeMB: number = DEFAULT_MAX_FILE_SIZE_MB
): ValidationResult {
  const safeName = sanitizeFileName(meta.name);
  const ext = getFileExtension(safeName);

  if (!ext || !isSupportedExtension(ext)) {
    return {
      valid: false,
      extension: ext,
      safeName,
      error: `Unsupported file type "${ext ? `.${ext}` : 'unknown'}". Allowed: PDF, Office docs, PNG/JPG/GIF, MP4/MP3, ZIP, TXT, CSV.`,
    };
  }

  if (!isMimeCompatible(ext, meta.type ?? '')) {
    return {
      valid: false,
      extension: ext,
      safeName,
      error: `MIME type "${meta.type}" does not match .${ext} file signature.`,
    };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (meta.size <= 0) {
    return {
      valid: false,
      extension: ext,
      safeName,
      error: 'File appears to be empty (0 bytes).',
    };
  }

  if (meta.size > maxBytes) {
    return {
      valid: false,
      extension: ext,
      safeName,
      error: `File size (${formatBytes(meta.size)}) exceeds the ${maxSizeMB} MB limit.`,
    };
  }

  return {
    valid: true,
    extension: ext,
    safeName,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
