import React, { useEffect, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode2,
  Check,
  X,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Ban,
  Eye,
} from 'lucide-react';
import type { DynamicThumbnail, FileItem } from '../../types/files.ts';
import { formatBytes } from '../../utils/fileValidation.ts';
import {
  generateDynamicThumbnail,
  getCachedThumbnail,
  supportsDynamicPreview,
} from '../../services/thumbnailService.ts';

interface FileCardProps {
  item: FileItem;
  isHoveredByCursor: boolean;
  isDraggingByGesture: boolean;
  onToggleSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>, item: FileItem) => void;
  onRemove: (id: string) => void;
  onRetry: () => void;
  onCancelUpload: (id: string) => void;
}

function getFileIcon(ext: string) {
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return FileImage;
  if (ext === 'mp4') return FileVideo;
  if (ext === 'mp3') return FileAudio;
  if (ext === 'zip') return FileArchive;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['txt'].includes(ext)) return FileCode2;
  return FileText;
}

export const FileCard: React.FC<FileCardProps> = ({
  item,
  isHoveredByCursor,
  isDraggingByGesture,
  onToggleSelect,
  onDoubleClick,
  onContextMenu,
  onRemove,
  onRetry,
  onCancelUpload,
}) => {
  const Icon = getFileIcon(item.extension);
  const [pointerHovered, setPointerHovered] = useState(false);
  const [thumbnail, setThumbnail] = useState<DynamicThumbnail | null>(() =>
    getCachedThumbnail(item.id)
  );
  const [thumbLoading, setThumbLoading] = useState(false);

  const previewCapable = supportsDynamicPreview(item.extension);
  const isActivelyHovered = isHoveredByCursor || pointerHovered;

  // Generate Canvas / Web Worker mini-thumbnail dynamically on virtual cursor or pointer hover
  useEffect(() => {
    if (!isActivelyHovered || !previewCapable) return;

    const cached = getCachedThumbnail(item.id);
    if (cached) {
      setThumbnail(cached);
      return;
    }

    let cancelled = false;
    setThumbLoading(true);

    void generateDynamicThumbnail(item).then((result) => {
      if (cancelled) return;
      setThumbLoading(false);
      if (result) {
        setThumbnail(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isActivelyHovered, item, previewCapable]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggleSelect(item.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemove(item.id);
    }
  };

  const renderStatus = () => {
    switch (item.status) {
      case 'uploaded':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Uploaded</span>
          </span>
        );
      case 'uploading':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 font-mono tabular-nums">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>{item.progress}%</span>
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
            <Loader2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Queued</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Failed</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cancelled</span>
          </span>
        );
      default:
        return (
          <span className="text-xs text-slate-400">
            {item.selected ? 'Selected' : 'Ready'}
          </span>
        );
    }
  };

  return (
    <div
      role="checkbox"
      aria-checked={item.selected}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => onToggleSelect(item.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(item.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, item);
      }}
      onMouseEnter={() => setPointerHovered(true)}
      onMouseLeave={() => setPointerHovered(false)}
      onFocus={() => setPointerHovered(true)}
      onBlur={() => setPointerHovered(false)}
      data-gx-file-id={item.id}
      data-gx-label={item.name}
      className={`group relative flex flex-col gap-3 rounded-xl border p-3.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
        isDraggingByGesture
          ? 'border-cyan-400/70 bg-cyan-500/10 opacity-60'
          : isHoveredByCursor
            ? 'border-cyan-400 bg-blue-500/10'
            : item.selected
              ? 'border-blue-500/70 bg-blue-500/10'
              : 'border-slate-800 bg-[#0D1628]/80 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {item.previewUrl ? (
            <img
              src={item.previewUrl}
              alt={item.name}
              className="h-11 w-11 shrink-0 rounded-lg border border-slate-700/80 object-cover bg-slate-900"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900 text-cyan-300">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0">
            <p
              title={item.name}
              className="truncate text-sm font-medium text-slate-100"
            >
              {item.name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span className="font-mono uppercase">{item.extension || 'file'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatBytes(item.size)}</span>
              {item.folderName ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[120px] text-slate-300">
                    {item.folderName}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
              item.selected
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-slate-600 bg-slate-900 text-transparent group-hover:border-slate-500'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
          </span>

          {item.status === 'uploading' ? (
            <button
              type="button"
              aria-label={`Cancel upload for ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCancelUpload(item.id);
              }}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-amber-300"
            >
              <Ban className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Canvas / Web Worker Mini-Thumbnail rendered on Virtual Cursor or Pointer Hover */}
      {isActivelyHovered && previewCapable ? (
        <div
          aria-label={`Dynamic preview for ${item.name}`}
          className="overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/90 p-2"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 font-medium text-cyan-300">
              <Eye className="h-3 w-3" aria-hidden="true" />
              <span>
                {isHoveredByCursor ? 'Virtual Cursor Preview' : 'Canvas Preview'}
              </span>
            </span>
            <span className="font-mono tabular-nums text-slate-400">
              {thumbnail?.metaLabel || (thumbLoading ? 'Rendering...' : '')}
            </span>
          </div>

          {thumbLoading && !thumbnail ? (
            <div className="flex h-28 items-center justify-center rounded bg-slate-900 text-xs text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-400" />
              <span>Rendering mini-thumbnail...</span>
            </div>
          ) : thumbnail ? (
            <div
              className={`flex items-center justify-center overflow-hidden rounded border border-slate-800 ${
                thumbnail.kind === 'pdf' ? 'bg-slate-100 p-1' : 'bg-[#0B1324]'
              }`}
            >
              <img
                src={thumbnail.url}
                alt={`Preview of ${item.name}`}
                className="max-h-36 w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Progress & Status row */}
      <div className="flex items-center justify-between gap-3">
        {renderStatus()}
        {item.status === 'failed' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
          >
            <RotateCw className="h-3 w-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
        ) : null}
      </div>

      {item.status === 'uploading' || item.status === 'uploaded' ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-150 ${
              item.status === 'uploaded' ? 'bg-emerald-500' : 'bg-cyan-400'
            }`}
            style={{ width: `${item.progress}%` }}
          />
        </div>
      ) : null}

      {item.error ? (
        <p className="text-xs text-rose-300 leading-snug">{item.error}</p>
      ) : null}
    </div>
  );
};
