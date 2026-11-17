import React, { useState } from 'react';
import { CloudUpload, FilePlus2, FolderOpen, FolderPlus } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import { extractFilesFromDataTransfer } from '../../services/fileService.ts';

export const UploadZone: React.FC = () => {
  const {
    addFiles,
    openFilePicker,
    openFolderPicker,
    openGestureExplorer,
    openContextMenu,
    hoveredTarget,
    draggingItem,
    settings,
  } = useAppStore();

  const [nativeDragOver, setNativeDragOver] = useState(false);

  const isCarryingWorkspaceItem =
    draggingItem?.kind === 'file' || draggingItem?.kind === 'folder';
  const isGestureDropTargeted =
    hoveredTarget.type === 'dropzone' &&
    hoveredTarget.id === 'upload' &&
    isCarryingWorkspaceItem;
  const isGestureHovering =
    hoveredTarget.type === 'dropzone' && hoveredTarget.id === 'upload';

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setNativeDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setNativeDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setNativeDragOver(false);
    const extracted = await extractFilesFromDataTransfer(e.dataTransfer);
    await addFiles(extracted);
  };

  const activeHighlight = nativeDragOver || isGestureDropTargeted;

  return (
    <div
      data-gx-dropzone="upload"
      data-gx-label="Upload Drop Zone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
      onDoubleClick={openFilePicker}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu({
          x: e.clientX,
          y: e.clientY,
          targetType: 'dropzone',
          targetId: 'upload',
          label: 'Upload Drop Zone',
        });
      }}
      className={`rounded-xl border border-dashed p-6 transition-colors ${
        activeHighlight
          ? 'border-cyan-400 bg-cyan-500/10'
          : isGestureHovering
            ? 'border-blue-400/70 bg-blue-500/5'
            : 'border-slate-700/90 bg-[#0D1628]/70 hover:border-slate-600'
      }`}
    >
      <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
              activeHighlight
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 bg-slate-900/90 text-blue-400'
            }`}
          >
            <CloudUpload className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              {isGestureDropTargeted
                ? 'Open palm or release pinch to stage for upload'
                : 'Drop files or folders here'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              PDF · DOC / XLS / PPT · PNG / JPG / GIF · MP4 / MP3 · ZIP · TXT / CSV · Max{' '}
              <span className="font-mono tabular-nums text-slate-300">
                {settings.maxFileSizeMB} MB
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openFilePicker}
            data-gx-action="browse-files"
            data-gx-label="Browse Files"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            <span>Browse Files</span>
          </button>

          <button
            type="button"
            onClick={() => void openFolderPicker()}
            data-gx-action="browse-folders"
            data-gx-label="Browse Folders"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <FolderPlus className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            <span>Browse Folders</span>
          </button>

          <button
            type="button"
            onClick={openGestureExplorer}
            data-gx-action="open-gesture-explorer"
            data-gx-label="Gesture Explorer"
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 whitespace-nowrap shrink-0"
          >
            <FolderOpen className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <span>Gesture Explorer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
