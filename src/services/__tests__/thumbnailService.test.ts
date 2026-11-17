import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/mock-pdf.worker.mjs',
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

import {
  getCachedThumbnail,
  revokeDynamicThumbnail,
  supportsDynamicPreview,
} from '../thumbnailService.ts';

describe('thumbnailService', () => {
  it('identifies previewable PDF, image, and text formats', () => {
    expect(supportsDynamicPreview('pdf')).toBe(true);
    expect(supportsDynamicPreview('PDF')).toBe(true);
    expect(supportsDynamicPreview('png')).toBe(true);
    expect(supportsDynamicPreview('jpg')).toBe(true);
    expect(supportsDynamicPreview('jpeg')).toBe(true);
    expect(supportsDynamicPreview('gif')).toBe(true);
    expect(supportsDynamicPreview('txt')).toBe(true);
    expect(supportsDynamicPreview('csv')).toBe(true);

    expect(supportsDynamicPreview('zip')).toBe(false);
    expect(supportsDynamicPreview('mp4')).toBe(false);
    expect(supportsDynamicPreview('docx')).toBe(false);
  });

  it('returns null when thumbnail is not cached and safely handles revoking missing IDs', () => {
    expect(getCachedThumbnail('missing-id')).toBeNull();
    expect(() => revokeDynamicThumbnail('missing-id')).not.toThrow();
  });
});
