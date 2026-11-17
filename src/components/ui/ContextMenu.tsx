import React, { useEffect, useRef } from 'react';
import {
  CheckSquare,
  Download,
  Eye,
  FilePlus2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  Square,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    files,
    folders,
    selectedCount,
    openFilePreview,
    openFolderPreview,
    openRenameModal,
    downloadFile,
    toggleFileSelection,
    selectFolder,
    moveFileToFolder,
    uploadSingleFile,
    uploadSelectedFiles,
    requestRemoveSingleFile,
    openFilePicker,
    openFolderPicker,
    openGestureExplorer,
    selectAllFiles,
    clearSelection,
  } = useAppStore();

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu.open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeContextMenu, contextMenu.open]);

  if (!contextMenu.open) return null;

  const menuWidth = 248;
  const estimatedHeight = 380;
  const clampedX = Math.max(
    12,
    Math.min(
      contextMenu.x,
      (typeof window !== 'undefined' ? window.innerWidth : 1280) - menuWidth - 12
    )
  );
  const clampedY = Math.max(
    12,
    Math.min(
      contextMenu.y,
      (typeof window !== 'undefined' ? window.innerHeight : 720) - estimatedHeight - 12
    )
  );

  const fileItem =
    contextMenu.targetType === 'file' && contextMenu.targetId
      ? files.find((f) => f.id === contextMenu.targetId) ?? null
      : null;

  const folderItem =
    contextMenu.targetType === 'folder' && contextMenu.targetId
      ? folders.find((fld) => fld.id === contextMenu.targetId) ?? null
      : null;

  const targetFolders = fileItem
    ? folders.filter((fld) => fld.id !== fileItem.folderId).slice(0, 3)
    : [];

  const rowClass =
    'flex w-full min-h-[42px] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-blue-600/20 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-400 whitespace-nowrap';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context Actions"
      style={{ left: `${clampedX}px`, top: `${clampedY}px`, width: `${menuWidth}px` }}
      className="fixed z-50 rounded-xl border border-slate-700/90 bg-[#0D1628]/95 p-1.5 shadow-2xl backdrop-blur-md"
    >
      <div className="mb-1 flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="truncate text-[11px] font-medium text-slate-400">
          {fileItem?.name || folderItem?.name || contextMenu.label || 'Workspace'}
        </span>
        <button
          type="button"
          onClick={closeContextMenu}
          data-gx-action="ctx-close"
          data-gx-label="Close Menu"
          aria-label="Close context menu"
          className="ml-2 rounded p-0.5 text-slate-500 hover:text-slate-200"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {fileItem ? (
        <div className="space-y-0.5">
          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-open-preview"
            data-gx-label="Open / Preview"
            onClick={() => openFilePreview(fileItem.id)}
            className={rowClass}
          >
            <Eye className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>Open / Preview</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-toggle-file"
            data-gx-label={fileItem.selected ? 'Deselect File' : 'Select File'}
            onClick={() => {
              toggleFileSelection(fileItem.id);
              closeContextMenu();
            }}
            className={rowClass}
          >
            {fileItem.selected ? (
              <Square className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <CheckSquare className="h-4 w-4 text-blue-400 shrink-0" />
            )}
            <span>{fileItem.selected ? 'Deselect File' : 'Select File'}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-rename-file"
            data-gx-label="Rename"
            onClick={() => openRenameModal(fileItem.id)}
            className={rowClass}
          >
            <Pencil className="h-4 w-4 text-slate-300 shrink-0" />
            <span>Rename</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-download-file"
            data-gx-label="Download"
            onClick={() => {
              downloadFile(fileItem.id);
              closeContextMenu();
            }}
            className={rowClass}
          >
            <Download className="h-4 w-4 text-slate-300 shrink-0" />
            <span>Download</span>
          </button>

          {fileItem.status !== 'uploaded' && fileItem.status !== 'uploading' ? (
            <button
              type="button"
              role="menuitem"
              data-gx-action="ctx-upload-file"
              data-gx-label="Upload"
              onClick={() => {
                closeContextMenu();
                void uploadSingleFile(fileItem.id);
              }}
              className={rowClass}
            >
              <Upload className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>Upload</span>
            </button>
          ) : null}

          {targetFolders.length > 0 ? (
            <div className="my-1 border-t border-slate-800/80 pt-1">
              {targetFolders.map((fld) => (
                <button
                  key={fld.id}
                  type="button"
                  role="menuitem"
                  data-gx-action={`ctx-move-${fld.id}`}
                  data-gx-label={`Move to ${fld.name}`}
                  onClick={() => {
                    moveFileToFolder(fileItem.id, fld.id);
                    closeContextMenu();
                  }}
                  className={rowClass}
                >
                  <FolderInput className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="truncate">Move to {fld.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="my-1 border-t border-slate-800/80 pt-1">
            <button
              type="button"
              role="menuitem"
              data-gx-action="ctx-delete-file"
              data-gx-label="Delete"
              onClick={() => requestRemoveSingleFile(fileItem.id)}
              className="flex w-full min-h-[42px] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/15 whitespace-nowrap"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      ) : folderItem ? (
        <div className="space-y-0.5">
          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-inspect-folder"
            data-gx-label="Open Folder"
            onClick={() => openFolderPreview(folderItem.id)}
            className={rowClass}
          >
            <FolderOpen className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>Open Folder ({folderItem.fileIds.length})</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-toggle-folder"
            data-gx-label={folderItem.selected ? 'Deselect Folder' : 'Select Folder'}
            onClick={() => {
              selectFolder(folderItem.id);
              closeContextMenu();
            }}
            className={rowClass}
          >
            {folderItem.selected ? (
              <Square className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <CheckSquare className="h-4 w-4 text-blue-400 shrink-0" />
            )}
            <span>{folderItem.selected ? 'Deselect Folder' : 'Select All in Folder'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-0.5">
          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-browse-files"
            data-gx-label="Browse Files"
            onClick={() => {
              closeContextMenu();
              openFilePicker();
            }}
            className={rowClass}
          >
            <FilePlus2 className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Browse Files</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-browse-folders"
            data-gx-label="Browse Folders"
            onClick={() => {
              closeContextMenu();
              void openFolderPicker();
            }}
            className={rowClass}
          >
            <FolderPlus className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>Browse Folders</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-gx-action="ctx-gesture-explorer"
            data-gx-label="Gesture File Explorer"
            onClick={() => {
              closeContextMenu();
              openGestureExplorer();
            }}
            className={rowClass}
          >
            <FolderOpen className="h-4 w-4 text-cyan-300 shrink-0" />
            <span>Gesture File Explorer</span>
          </button>

          {files.length > 0 ? (
            <button
              type="button"
              role="menuitem"
              data-gx-action="ctx-select-all"
              data-gx-label="Select All"
              onClick={() => {
                selectAllFiles();
                closeContextMenu();
              }}
              className={rowClass}
            >
              <CheckSquare className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>Select All Files</span>
            </button>
          ) : null}

          {selectedCount > 0 ? (
            <>
              <button
                type="button"
                role="menuitem"
                data-gx-action="ctx-clear-selection"
                data-gx-label="Clear Selection"
                onClick={() => {
                  clearSelection();
                  closeContextMenu();
                }}
                className={rowClass}
              >
                <Square className="h-4 w-4 text-slate-400 shrink-0" />
                <span>Clear Selection</span>
              </button>

              <button
                type="button"
                role="menuitem"
                data-gx-action="ctx-upload-selected"
                data-gx-label="Upload Selected"
                onClick={() => {
                  closeContextMenu();
                  void uploadSelectedFiles();
                }}
                className={rowClass}
              >
                <Upload className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Upload Selected ({selectedCount})</span>
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
