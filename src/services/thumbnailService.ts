import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DynamicThumbnail, FileItem } from '../types/files.ts';
import type {
  ThumbnailWorkerRequest,
  ThumbnailWorkerResponse,
} from '../workers/thumbnailWorker.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const THUMB_WIDTH = 260;
const THUMB_HEIGHT = 156;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv']);

const thumbnailCache = new Map<string, DynamicThumbnail>();
const inFlightRequests = new Map<string, Promise<DynamicThumbnail | null>>();

let workerInstance: Worker | null = null;
const pendingWorkerCallbacks = new Map<
  string,
  {
    resolve: (res: ThumbnailWorkerResponse) => void;
    reject: (err: Error) => void;
  }
>();

function getWorker(): Worker | null {
  if (
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    return null;
  }

  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/thumbnailWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerInstance.onmessage = (e: MessageEvent<ThumbnailWorkerResponse>) => {
      const msg = e.data;
      const pending = pendingWorkerCallbacks.get(msg.id);
      if (pending) {
        pendingWorkerCallbacks.delete(msg.id);
        pending.resolve(msg);
      }
    };

    workerInstance.onerror = (err) => {
      pendingWorkerCallbacks.forEach((cb) =>
        cb.reject(new Error(err.message || 'Thumbnail worker failed'))
      );
      pendingWorkerCallbacks.clear();
    };
  }

  return workerInstance;
}

function runWorkerRequest(
  req: ThumbnailWorkerRequest
): Promise<ThumbnailWorkerResponse> {
  const worker = getWorker();
  if (!worker) {
    return Promise.reject(new Error('OffscreenCanvas Worker unavailable'));
  }

  return new Promise((resolve, reject) => {
    pendingWorkerCallbacks.set(req.id, { resolve, reject });
    worker.postMessage(req);
  });
}

async function renderImageOnMainCanvas(
  item: FileItem
): Promise<DynamicThumbnail> {
  const sourceUrl = item.previewUrl || URL.createObjectURL(item.file);
  const shouldRevokeSource = !item.previewUrl;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image'));
      el.src = sourceUrl;
    });

    const scale = Math.min(
      THUMB_WIDTH / img.naturalWidth,
      THUMB_HEIGHT / img.naturalHeight,
      1
    );
    const outW = Math.max(1, Math.round(img.naturalWidth * scale));
    const outH = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');

    ctx.drawImage(img, 0, 0, outW, outH);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas blob failed'))),
        'image/png'
      );
    });

    return {
      url: URL.createObjectURL(blob),
      width: outW,
      height: outH,
      kind: 'image',
      metaLabel: `${img.naturalWidth} × ${img.naturalHeight} · ${item.extension.toUpperCase()}`,
    };
  } finally {
    if (shouldRevokeSource) {
      URL.revokeObjectURL(sourceUrl);
    }
  }
}

async function renderTextOnMainCanvas(item: FileItem): Promise<DynamicThumbnail> {
  const text = (await item.file.slice(0, 16384).text()).replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  ctx.fillStyle = '#0B1324';
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  ctx.fillStyle = '#111C33';
  ctx.fillRect(0, 0, THUMB_WIDTH, 24);
  ctx.font = '600 10px monospace';
  ctx.fillStyle = '#22D3EE';
  ctx.fillText(item.extension.toUpperCase(), 10, 16);

  ctx.font = '400 10px monospace';
  ctx.fillStyle = '#CBD5E1';
  lines.slice(0, 9).forEach((line, i) => {
    const clipped = line.length > 36 ? `${line.slice(0, 33)}...` : line;
    ctx.fillText(clipped || ' ', 12, 40 + i * 12);
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Text canvas blob failed'))),
      'image/png'
    );
  });

  return {
    url: URL.createObjectURL(blob),
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    kind: 'text',
    metaLabel: `${lines.length} lines · ${item.extension.toUpperCase()}`,
  };
}

async function renderPdfThumbnail(item: FileItem): Promise<DynamicThumbnail> {
  const bytes = new Uint8Array(await item.file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });

  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });

    const scale = Math.min(
      THUMB_WIDTH / baseViewport.width,
      THUMB_HEIGHT / baseViewport.height
    );
    const viewport = page.getViewport({ scale: Math.max(0.2, scale) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PDF canvas 2D unavailable');

    // Crisp white paper backdrop before PDF vector/text render
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PDF blob export failed'))),
        'image/png'
      );
    });

    const pagesLabel = pdf.numPages === 1 ? '1 page' : `${pdf.numPages} pages`;
    return {
      url: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
      kind: 'pdf',
      metaLabel: `${pagesLabel} · PDF`,
    };
  } catch {
    // Graceful fallback canvas thumbnail for encrypted/unsupported PDFs
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(1, 1, THUMB_WIDTH - 2, THUMB_HEIGHT - 2);
    ctx.fillStyle = '#38BDF8';
    ctx.font = '600 12px sans-serif';
    ctx.fillText('PDF DOCUMENT', 18, 42);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 11px monospace';
    ctx.fillText('Preview protected or unreadable', 18, 66);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Fallback blob failed'))),
        'image/png'
      );
    });

    return {
      url: URL.createObjectURL(blob),
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      kind: 'pdf',
      metaLabel: 'PDF Document',
    };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export function supportsDynamicPreview(extension: string): boolean {
  const ext = extension.toLowerCase();
  return (
    ext === 'pdf' || IMAGE_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(ext)
  );
}

export function getCachedThumbnail(fileId: string): DynamicThumbnail | null {
  return thumbnailCache.get(fileId) ?? null;
}

export function revokeDynamicThumbnail(fileId: string): void {
  const cached = thumbnailCache.get(fileId);
  if (cached) {
    URL.revokeObjectURL(cached.url);
    thumbnailCache.delete(fileId);
  }
}

export function clearAllDynamicThumbnails(): void {
  thumbnailCache.forEach((thumb) => URL.revokeObjectURL(thumb.url));
  thumbnailCache.clear();
}

export async function generateDynamicThumbnail(
  item: FileItem
): Promise<DynamicThumbnail | null> {
  const ext = item.extension.toLowerCase();
  if (!supportsDynamicPreview(ext)) return null;

  const cached = thumbnailCache.get(item.id);
  if (cached) return cached;

  const existingPromise = inFlightRequests.get(item.id);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<DynamicThumbnail | null> => {
    try {
      let result: DynamicThumbnail;

      if (ext === 'pdf') {
        result = await renderPdfThumbnail(item);
      } else if (IMAGE_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(ext)) {
        try {
          const workerRes = await runWorkerRequest({
            id: item.id,
            file: item.file,
            extension: ext,
            name: item.name,
            maxWidth: THUMB_WIDTH,
            maxHeight: THUMB_HEIGHT,
          });
          if (!workerRes.ok || !workerRes.blob) {
            throw new Error(workerRes.error || 'Worker fallback');
          }
          result = {
            url: URL.createObjectURL(workerRes.blob),
            width: workerRes.width ?? THUMB_WIDTH,
            height: workerRes.height ?? THUMB_HEIGHT,
            kind: workerRes.kind === 'image' ? 'image' : 'text',
            metaLabel: workerRes.metaLabel ?? ext.toUpperCase(),
          };
        } catch {
          result = IMAGE_EXTENSIONS.has(ext)
            ? await renderImageOnMainCanvas(item)
            : await renderTextOnMainCanvas(item);
        }
      } else {
        return null;
      }

      thumbnailCache.set(item.id, result);
      return result;
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(item.id);
    }
  })();

  inFlightRequests.set(item.id, task);
  return task;
}
