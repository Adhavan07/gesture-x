/// <reference lib="webworker" />

export interface ThumbnailWorkerRequest {
  id: string;
  file: File;
  extension: string;
  name: string;
  maxWidth: number;
  maxHeight: number;
}

export interface ThumbnailWorkerResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  kind?: 'image' | 'text' | 'generic';
  metaLabel?: string;
  error?: string;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv']);

async function renderImageThumbnail(
  req: ThumbnailWorkerRequest
): Promise<ThumbnailWorkerResponse> {
  const bitmap = await createImageBitmap(req.file);
  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const scale = Math.min(req.maxWidth / srcW, req.maxHeight / srcH, 1);
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = new OffscreenCanvas(outW, outH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D OffscreenCanvas context unavailable');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, outW, outH);

    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
    return {
      id: req.id,
      ok: true,
      blob,
      width: outW,
      height: outH,
      kind: 'image',
      metaLabel: `${srcW} × ${srcH} · ${req.extension.toUpperCase()}`,
    };
  } finally {
    bitmap.close();
  }
}

async function renderTextThumbnail(
  req: ThumbnailWorkerRequest
): Promise<ThumbnailWorkerResponse> {
  const sliceText = await req.file.slice(0, 16384).text();
  const normalized = sliceText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const maxLines = 10;
  const visibleLines = lines.slice(0, maxLines);

  const w = req.maxWidth;
  const h = req.maxHeight;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D OffscreenCanvas context unavailable');
  }

  // Dark code/document sheet background
  ctx.fillStyle = '#0B1324';
  ctx.fillRect(0, 0, w, h);

  // Subtle top bar
  ctx.fillStyle = '#111C33';
  ctx.fillRect(0, 0, w, 24);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 24, w, 1);

  ctx.font = '600 10px monospace';
  ctx.fillStyle = '#22D3EE';
  ctx.fillText(req.extension.toUpperCase(), 10, 16);

  ctx.font = '400 10px monospace';
  ctx.fillStyle = '#94A3B8';
  const truncatedName =
    req.name.length > 26 ? `${req.name.slice(0, 23)}...` : req.name;
  ctx.fillText(truncatedName, 44, 16);

  // Render lines with line numbers or CSV column hints
  const startY = 40;
  const lineHeight = 12;
  const isCsv = req.extension === 'csv';

  for (let i = 0; i < visibleLines.length; i += 1) {
    const y = startY + i * lineHeight;
    if (y > h - 8) break;

    ctx.font = '400 9px monospace';
    ctx.fillStyle = '#475569';
    ctx.fillText(String(i + 1).padStart(2, ' '), 8, y);

    const rawLine = visibleLines[i] ?? '';
    const content = isCsv ? rawLine.split(',').slice(0, 4).join('  |  ') : rawLine;
    const clipped = content.length > 36 ? `${content.slice(0, 33)}...` : content;

    ctx.fillStyle = i === 0 && isCsv ? '#7DD3FC' : '#CBD5E1';
    ctx.fillText(clipped || ' ', 30, y);
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const approxSuffix = req.file.size > 16384 ? '+' : '';
  return {
    id: req.id,
    ok: true,
    blob,
    width: w,
    height: h,
    kind: 'text',
    metaLabel: `${lines.length}${approxSuffix} lines · ${req.extension.toUpperCase()}`,
  };
}

self.onmessage = async (event: MessageEvent<ThumbnailWorkerRequest>) => {
  const req = event.data;
  try {
    if (IMAGE_EXTENSIONS.has(req.extension)) {
      const res = await renderImageThumbnail(req);
      self.postMessage(res);
      return;
    }

    if (TEXT_EXTENSIONS.has(req.extension)) {
      const res = await renderTextThumbnail(req);
      self.postMessage(res);
      return;
    }

    self.postMessage({
      id: req.id,
      ok: false,
      error: `Worker does not handle .${req.extension}`,
    } satisfies ThumbnailWorkerResponse);
  } catch (err) {
    self.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Worker thumbnail error',
    } satisfies ThumbnailWorkerResponse);
  }
};
