import React from 'react';
import {
  Folder,
  Upload,
  Trash2,
  RotateCw,
  CheckSquare,
  Square,
  Ban,
  FolderPlus,
} from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import { formatBytes } from '../../utils/fileValidation.ts';
import { FileCard } from './FileCard.tsx';

export const FileList: React.FC = () => {
  const {
    files,
    folders,
    selectedCount,
    fileFilter,
    setFileFilter,
    hoveredTarget,
    draggingFileId,
    draggingItem,
    toggleFileSelection,
    selectFolder,
    selectAllFiles,
    clearSelection,
    removeFile,
    requestRemoveSelected,
    requestClearAllFiles,
    uploadSelectedFiles,
    cancelUpload,
    retryFailedUploads,
    openFilePicker,
    openFilePreview,
    openFolderPreview,
    openContextMenu,
  } = useAppStore();

  const filteredFiles = files.filter((item) => {
    if (fileFilter === 'selected') return item.selected;
    if (fileFilter === 'failed')
      return item.status === 'failed' || item.status === 'cancelled';
    return true;
  });

  const activeUploadingCount = files.filter(
    (f) => f.status === 'uploading' || f.status === 'queued'
  ).length;
  const failedCount = files.filter(
    (f) => f.status === 'failed' || f.status === 'cancelled'
  ).length;
  const uploadedCount = files.filter((f) => f.status === 'uploaded').length;
  const totalSelectedBytes = files
    .filter((f) => f.selected)
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="space-y-6">
      {/* Selected Folders section */}
      {folders.length > 0 ? (
        <section aria-label="Selected Folders" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-200">
              Selected Folders ({folders.length})
            </h3>
            <span className="text-xs text-slate-400">
              Drop a file onto a folder, click to select, or double-click to inspect
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => {
              const isHovered =
                hoveredTarget.type === 'folder' && hoveredTarget.id === folder.id;
              const isGrabbed =
                draggingItem?.kind === 'folder' && draggingItem.id === folder.id;
              const isValidDropTarget =
                draggingItem &&
                (draggingItem.kind === 'file' ||
                  (draggingItem.kind === 'folder' && draggingItem.id !== folder.id));
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => selectFolder(folder.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openFolderPreview(folder.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      targetType: 'folder',
                      targetId: folder.id,
                      label: folder.name,
                    });
                  }}
                  data-gx-folder-id={folder.id}
                  data-gx-label={folder.name}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                    isGrabbed
                      ? 'border-cyan-400 bg-cyan-500/20 opacity-75'
                      : isHovered && isValidDropTarget
                        ? 'border-cyan-400 bg-cyan-500/20 ring-1 ring-cyan-400/50'
                        : isHovered
                          ? 'border-cyan-400 bg-cyan-500/10'
                          : isValidDropTarget
                            ? 'border-cyan-500/40 bg-cyan-500/5'
                            : folder.selected
                              ? 'border-blue-500/70 bg-blue-500/10'
                              : 'border-slate-800 bg-[#0D1628]/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900 text-cyan-300">
                      <Folder className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {folder.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono tabular-nums">
                        {isHovered && isValidDropTarget
                          ? 'Open Palm to move here'
                          : `${folder.fileIds.length} files · ${formatBytes(folder.totalSize)}`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {draggingItem &&
      (draggingItem.kind === 'file' || draggingItem.kind === 'folder') &&
      folders.length > 0 ? (
        <div
          data-gx-dropzone="queue-root"
          data-gx-label="Workspace Root (Ungroup)"
          className={`rounded-xl border border-dashed px-4 py-3 text-center text-xs transition-colors ${
            hoveredTarget.type === 'dropzone' && hoveredTarget.id === 'queue-root'
              ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
              : 'border-slate-700 bg-slate-900/50 text-slate-400'
          }`}
        >
          Open Palm here to move item out of its folder to Workspace Root
        </div>
      ) : null}

      {/* Selected / Staged Files section */}
      <section aria-label="Staged Files" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Staged Files ({files.length})
            </h3>

            {/* Segmented Filter Tabs */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
              {(
                [
                  { id: 'all', label: `All (${files.length})` },
                  { id: 'selected', label: `Selected (${selectedCount})` },
                  { id: 'failed', label: `Failed (${failedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFileFilter(tab.id)}
                  data-gx-action={`filter-${tab.id}`}
                  data-gx-label={tab.label}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    fileFilter === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {files.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={selectedCount === files.length ? clearSelection : selectAllFiles}
                  data-gx-action="toggle-select-all"
                  data-gx-label={
                    selectedCount === files.length ? 'Clear Selection' : 'Select All'
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {selectedCount === files.length ? (
                    <>
                      <Square className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>Clear Selection</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                      <span>Select All</span>
                    </>
                  )}
                </button>

                {selectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={requestRemoveSelected}
                    data-gx-action="remove-selected"
                    data-gx-label="Remove Selected"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/20 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Remove Selected</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={requestClearAllFiles}
                    data-gx-action="clear-all"
                    data-gx-label="Clear All"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-rose-200 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Clear All</span>
                  </button>
                )}

                {failedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void retryFailedUploads()}
                    data-gx-action="retry-failed"
                    data-gx-label="Retry Failed"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 whitespace-nowrap shrink-0"
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Retry Failed</span>
                  </button>
                ) : null}

                {activeUploadingCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => cancelUpload()}
                    data-gx-action="cancel-uploads"
                    data-gx-label="Cancel Uploads"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/25 whitespace-nowrap shrink-0"
                  >
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Cancel Uploads</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={() => void uploadSelectedFiles()}
                  data-gx-action="upload-selected"
                  data-gx-label="Upload Selected"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    Upload Selected ({selectedCount}
                    {selectedCount > 0 ? ` · ${formatBytes(totalSelectedBytes)}` : ''})
                  </span>
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Summary bar when files are active */}
        {files.length > 0 ? (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono tabular-nums">
            <span>Selected: {selectedCount}</span>
            <span aria-hidden="true">·</span>
            <span>Uploading: {activeUploadingCount}</span>
            <span aria-hidden="true">·</span>
            <span>Completed: {uploadedCount}</span>
            <span aria-hidden="true">·</span>
            <span>Failed: {failedCount}</span>
          </div>
        ) : null}

        {/* Populated or Empty State */}
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800/80 bg-[#0D1628]/50 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900 text-slate-400">
              <FolderPlus className="h-6 w-6" aria-hidden="true" />
            </div>
            <h4 className="mt-4 font-display text-sm font-semibold text-slate-200">
              {files.length === 0
                ? 'No files staged yet'
                : 'No files match the current filter'}
            </h4>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              {files.length === 0
                ? 'Select files or folders above, drag items onto the drop zone, or say "Browse files" with Voice Mode enabled.'
                : 'Switch back to All to inspect every staged file in your workspace.'}
            </p>
            {files.length === 0 ? (
              <button
                type="button"
                onClick={openFilePicker}
                data-gx-action="empty-select-files"
                data-gx-label="Select Files"
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Select Files
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setFileFilter('all')}
                data-gx-action="show-all-files"
                data-gx-label="Show All Files"
                className="mt-4 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Show All Files
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredFiles.map((item) => (
              <FileCard
                key={item.id}
                item={item}
                isHoveredByCursor={
                  hoveredTarget.type === 'file' && hoveredTarget.id === item.id
                }
                isDraggingByGesture={draggingFileId === item.id}
                onToggleSelect={toggleFileSelection}
                onDoubleClick={openFilePreview}
                onContextMenu={(e, fileItem) =>
                  openContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'file',
                    targetId: fileItem.id,
                    label: fileItem.name,
                  })
                }
                onRemove={removeFile}
                onRetry={() => void retryFailedUploads()}
                onCancelUpload={cancelUpload}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
