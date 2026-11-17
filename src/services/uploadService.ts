import type { FileItem, UploadRecord } from '../types/files.ts';
import type { StorageStats } from '../../server/storage.ts';

export interface UploadTaskHandle {
  abort: () => void;
  promise: Promise<UploadRecord>;
}

export function uploadFileWithProgress(
  item: FileItem,
  maxSizeMB: number,
  onProgress: (percent: number) => void
): UploadTaskHandle {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<UploadRecord>((resolve, reject) => {
    const formData = new FormData();
    formData.append('maxSizeMB', String(maxSizeMB));
    formData.append('relativePath', item.relativePath || item.name);
    formData.append('file', item.file, item.name);

    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && payload.record) {
          onProgress(100);
          resolve(payload.record as UploadRecord);
        } else {
          reject(new Error(payload.error || `Upload failed (HTTP ${xhr.status}).`));
        }
      } catch {
        reject(new Error(`Upload failed with status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading file.'));
    };

    xhr.onabort = () => {
      reject(new Error('UPLOAD_ABORTED'));
    };

    xhr.send(formData);
  });

  return {
    abort: () => xhr.abort(),
    promise,
  };
}

export async function fetchUploadHistory(): Promise<{
  records: UploadRecord[];
  stats: StorageStats;
}> {
  const res = await fetch('/api/uploads');
  if (!res.ok) {
    throw new Error('Failed to load upload history.');
  }
  return res.json();
}

export async function deleteUploadHistoryRecord(id: string): Promise<void> {
  const res = await fetch(`/api/uploads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete upload record.');
  }
}
