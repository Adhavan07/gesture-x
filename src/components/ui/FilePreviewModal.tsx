import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Maximize2,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import { formatBytes } from '../../utils/fileValidation.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif']);
const TEXT_EXTS = new Set(['txt', 'csv']);

export const FilePreviewModal: React.FC = () => {
  const {
    previewModal,
    closePreviewModal,
    openFilePreview,
    files,
    folders,
    toggleFileSelection,
    selectFolder,
    uploadSingleFile,
    removeFile,
  } = useAppStore();

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // PDF multi-page state
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeFile =
    previewModal.open && previewModal.mode === 'file' && previewModal.fileId
      ? files.find((f) => f.id === previewModal.fileId) ?? null
      : null;

  const activeFolder =
    previewModal.open && previewModal.mode === 'folder' && previewModal.folderId
      ? folders.find((fld) => fld.id === previewModal.folderId) ?? null
      : null;

  useEffect(() => {
    if (!previewModal.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePreviewModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePreviewModal, previewModal.open]);

  // Reset per-file viewer state when switching files
  useEffect(() => {
    setZoomed(false);
    setTextContent(null);
    setErrorMsg(null);
    setPdfPage(1);
    setPdfTotalPages(0);

    if (!activeFile) {
      setObjectUrl(null);
      return;
    }

    const ext = activeFile.extension.toLowerCase();

    if (IMAGE_EXTS.has(ext) || ext === 'mp4' || ext === 'mp3') {
      if (activeFile.previewUrl) {
        setObjectUrl(activeFile.previewUrl);
        return;
      }
      const created = URL.createObjectURL(activeFile.file);
      setObjectUrl(created);
      return () => {
        URL.revokeObjectURL(created);
      };
    }

    setObjectUrl(null);

    if (TEXT_EXTS.has(ext)) {
      let cancelled = false;
      setLoading(true);
      activeFile.file
        .slice(0, 262144)
        .text()
        .then((txt) => {
          if (cancelled) return;
          setTextContent(txt.replace(/\r\n/g, '\n'));
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setErrorMsg('Unable to read text contents.');
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [activeFile]);

  // Render requested PDF page cleanly
  useEffect(() => {
    if (!activeFile || activeFile.extension.toLowerCase() !== 'pdf') return;
    let cancelled = false;
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null;

    const renderPage = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const bytes = new Uint8Array(await activeFile.file.arrayBuffer());
        if (cancelled) return;
        task = pdfjsLib.getDocument({ data: bytes });
        const pdf = await task.promise;
        if (cancelled) return;

        setPdfTotalPages(pdf.numPages);
        const safePage = Math.max(1, Math.min(pdfPage, pdf.numPages));
        const page = await pdf.getPage(safePage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setErrorMsg('This PDF is encrypted or cannot be rendered in preview.');
          setLoading(false);
        }
      } finally {
        if (task) {
          void task.destroy().catch(() => undefined);
        }
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [activeFile, pdfPage]);

  if (!previewModal.open) return null;
  if (previewModal.mode === 'file' && !activeFile) return null;
  if (previewModal.mode === 'folder' && !activeFolder) return null;

  const ext = activeFile?.extension.toLowerCase() ?? '';
  const folderFiles = activeFolder
    ? files.filter((f) => f.folderId === activeFolder.id)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={activeFile ? `Preview ${activeFile.name}` : `Folder ${activeFolder?.name}`}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700/90 bg-[#0D1628] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold text-slate-100">
              {activeFile ? activeFile.name : activeFolder?.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
              {activeFile ? (
                <>
                  {activeFile.extension.toUpperCase()} · {formatBytes(activeFile.size)}
                  {activeFile.folderName ? ` · ${activeFile.folderName}` : ''}
                </>
              ) : (
                <>
                  Folder · {folderFiles.length} file{folderFiles.length === 1 ? '' : 's'} ·{' '}
                  {formatBytes(activeFolder?.totalSize ?? 0)}
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={closePreviewModal}
            data-gx-action="modal-close"
            data-gx-label="Close Preview"
            aria-label="Close preview modal"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Area (supports Two-Finger Hand Scrolling) */}
        <div className="flex-1 overflow-y-auto bg-slate-950/60 p-5">
          {activeFile ? (
            <>
              {IMAGE_EXTS.has(ext) && objectUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex w-full justify-end">
                    <button
                      type="button"
                      onClick={() => setZoomed((z) => !z)}
                      data-gx-action="preview-zoom"
                      data-gx-label={zoomed ? 'Fit Image' : 'Zoom 100%'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Maximize2 className="h-3.5 w-3.5 text-cyan-400" />
                      <span>{zoomed ? 'Fit to Modal' : 'Inspect Actual Size'}</span>
                    </button>
                  </div>
                  <img
                    src={objectUrl}
                    alt={activeFile.name}
                    className={`rounded-lg border border-slate-800 bg-slate-900 ${
                      zoomed ? 'max-w-none' : 'max-h-[55vh] w-auto object-contain'
                    }`}
                  />
                </div>
              ) : ext === 'pdf' ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5">
                    <button
                      type="button"
                      disabled={pdfPage <= 1}
                      onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                      data-gx-action="pdf-prev"
                      data-gx-label="Previous Page"
                      className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Prev</span>
                    </button>
                    <span className="font-mono text-xs tabular-nums text-slate-300">
                      Page {pdfPage} / {pdfTotalPages || '—'}
                    </span>
                    <button
                      type="button"
                      disabled={pdfTotalPages === 0 || pdfPage >= pdfTotalPages}
                      onClick={() => setPdfPage((p) => Math.min(pdfTotalPages, p + 1))}
                      data-gx-action="pdf-next"
                      data-gx-label="Next Page"
                      className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {errorMsg ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-xs text-slate-300">
                      {errorMsg}
                    </div>
                  ) : (
                    <div className="relative flex justify-center overflow-auto rounded-lg border border-slate-800 bg-white p-2">
                      {loading ? (
                        <div className="flex h-64 w-80 items-center justify-center text-xs text-slate-600">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" />
                          <span>Rendering PDF page...</span>
                        </div>
                      ) : null}
                      <canvas
                        ref={pdfCanvasRef}
                        className={loading ? 'hidden' : 'block max-w-full'}
                      />
                    </div>
                  )}
                </div>
              ) : TEXT_EXTS.has(ext) ? (
                loading ? (
                  <div className="flex h-48 items-center justify-center text-xs text-slate-400">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-400" />
                    <span>Loading file contents...</span>
                  </div>
                ) : errorMsg ? (
                  <p className="text-xs text-rose-300">{errorMsg}</p>
                ) : ext === 'csv' && textContent ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B1324]">
                    <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
                      <tbody>
                        {textContent
                          .split('\n')
                          .slice(0, 120)
                          .map((row, rowIdx) => (
                            <tr
                              key={rowIdx}
                              className={
                                rowIdx === 0
                                  ? 'border-b border-slate-700 bg-slate-900 font-semibold text-cyan-300'
                                  : 'border-b border-slate-800/60 text-slate-300'
                              }
                            >
                              <td className="px-2.5 py-1.5 text-slate-500">{rowIdx + 1}</td>
                              {row.split(',').map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B1324] p-4 font-mono text-xs leading-relaxed text-slate-200">
                    {textContent || '(Empty file)'}
                  </pre>
                )
              ) : ext === 'mp4' && objectUrl ? (
                <video
                  src={objectUrl}
                  controls
                  className="mx-auto max-h-[55vh] rounded-lg border border-slate-800 bg-black"
                />
              ) : ext === 'mp3' && objectUrl ? (
                <div className="flex flex-col items-center justify-center gap-4 py-10">
                  <FileText className="h-10 w-10 text-cyan-400" />
                  <audio src={objectUrl} controls className="w-full max-w-md" />
                </div>
              ) : (
                <div className="mx-auto max-w-md rounded-xl border border-slate-800 bg-[#0D1628] p-6 text-center">
                  <FileText className="mx-auto h-10 w-10 text-cyan-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-100">
                    {activeFile.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Inline canvas rendering is available for PDF, PNG, JPG, GIF, TXT, CSV, MP4, and MP3 files. This{' '}
                    <span className="font-mono uppercase text-slate-200">
                      {activeFile.extension}
                    </span>{' '}
                    file is ready for upload.
                  </p>
                  <p className="mt-3 font-mono text-xs text-slate-400">
                    Path: {activeFile.relativePath}
                  </p>
                </div>
              )}
            </>
          ) : activeFolder ? (
            <div className="space-y-2">
              {folderFiles.map((f) => (
                <div
                  key={f.id}
                  data-gx-file-id={f.id}
                  data-gx-label={f.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1628] px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FolderOpen className="h-4 w-4 shrink-0 text-cyan-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {f.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono tabular-nums">
                        {f.extension.toUpperCase()} · {formatBytes(f.size)} ·{' '}
                        {f.selected ? 'Selected' : 'Unselected'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openFilePreview(f.id)}
                      data-gx-action={`folder-preview-${f.id}`}
                      data-gx-label={`Preview ${f.name}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Eye className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFileSelection(f.id)}
                      data-gx-action={`folder-select-${f.id}`}
                      data-gx-label={f.selected ? 'Deselect' : 'Select'}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                    >
                      {f.selected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-blue-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span>{f.selected ? 'Selected' : 'Select'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3.5">
          {activeFile ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleFileSelection(activeFile.id)}
                  data-gx-action="modal-toggle-select"
                  data-gx-label={activeFile.selected ? 'Deselect File' : 'Select File'}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                >
                  {activeFile.selected ? (
                    <CheckSquare className="h-4 w-4 text-blue-400" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-400" />
                  )}
                  <span>{activeFile.selected ? 'Selected' : 'Select File'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeFile(activeFile.id);
                    closePreviewModal();
                  }}
                  data-gx-action="modal-remove-file"
                  data-gx-label="Remove File"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 text-xs font-medium text-rose-200 hover:bg-rose-500/20 whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Remove</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {activeFile.status !== 'uploaded' && activeFile.status !== 'uploading' ? (
                  <button
                    type="button"
                    onClick={() => {
                      closePreviewModal();
                      void uploadSingleFile(activeFile.id);
                    }}
                    data-gx-action="modal-upload-file"
                    data-gx-label="Upload File"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload File</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closePreviewModal}
                  data-gx-action="modal-done"
                  data-gx-label="Close"
                  className="inline-flex h-10 items-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                >
                  Close
                </button>
              </div>
            </>
          ) : activeFolder ? (
            <>
              <button
                type="button"
                onClick={() => selectFolder(activeFolder.id)}
                data-gx-action="modal-toggle-folder"
                data-gx-label={activeFolder.selected ? 'Deselect Folder' : 'Select Folder'}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
              >
                {activeFolder.selected ? (
                  <CheckSquare className="h-4 w-4 text-blue-400" />
                ) : (
                  <Square className="h-4 w-4 text-slate-400" />
                )}
                <span>
                  {activeFolder.selected ? 'Deselect All in Folder' : 'Select All in Folder'}
                </span>
              </button>

              <button
                type="button"
                onClick={closePreviewModal}
                data-gx-action="modal-done"
                data-gx-label="Close"
                className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
              >
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
