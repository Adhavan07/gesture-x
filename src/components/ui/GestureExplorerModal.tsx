import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckSquare,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import type { ExplorerNode } from '../../types/files.ts';
import {
  buildExplorerTreeFromFiles,
  extractFilesFromDataTransfer,
  readDirectoryChildren,
} from '../../services/fileService.ts';
import { formatBytes } from '../../utils/fileValidation.ts';

export const GestureExplorerModal: React.FC = () => {
  const {
    explorerOpen,
    explorerRoot,
    closeGestureExplorer,
    openFolderPicker,
    openFilePicker,
    mountFolderTreeFromEntries,
    addFiles,
    files: stagedFiles,
    toggleFileSelection,
    hoveredTarget,
    draggingItem,
    gestureModeEnabled,
    isInIframe,
  } = useAppStore();

  const [pathStack, setPathStack] = useState<ExplorerNode[]>([]);
  const [entries, setEntries] = useState<ExplorerNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [stagingBusy, setStagingBusy] = useState(false);

  const fallbackStagedRoot = useMemo<ExplorerNode | null>(() => {
    if (explorerRoot || stagedFiles.length === 0) return null;
    return buildExplorerTreeFromFiles(
      stagedFiles.map((f) => ({
        file: f.file,
        relativePath: f.relativePath || f.name,
      })),
      'Staged Workspace'
    );
  }, [explorerRoot, stagedFiles]);

  const activeRoot = explorerRoot ?? fallbackStagedRoot;
  const currentDir =
    pathStack.length > 0 ? pathStack[pathStack.length - 1] : activeRoot;

  useEffect(() => {
    if (!explorerOpen) {
      setPathStack([]);
      setSelectedPaths(new Set());
      return;
    }
    if (activeRoot) {
      setPathStack([activeRoot]);
    } else {
      setPathStack([]);
      setEntries([]);
    }
  }, [activeRoot, explorerOpen]);

  useEffect(() => {
    if (!explorerOpen || !currentDir) {
      setEntries([]);
      return;
    }

    if (currentDir.children) {
      setEntries(currentDir.children);
      return;
    }

    if (currentDir.dirHandle) {
      let cancelled = false;
      setLoading(true);
      void readDirectoryChildren(currentDir.dirHandle, currentDir.path)
        .then((children) => {
          if (cancelled) return;
          currentDir.children = children;
          setEntries(children);
        })
        .catch(() => {
          if (!cancelled) setEntries([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    setEntries([]);
  }, [currentDir, explorerOpen]);

  useEffect(() => {
    if (!explorerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGestureExplorer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeGestureExplorer, explorerOpen]);

  const navigateUp = useCallback(() => {
    setPathStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const enterDirectory = useCallback((dir: ExplorerNode) => {
    if (dir.kind !== 'directory') return;
    setPathStack((prev) => [...prev, dir]);
  }, []);

  const toggleNodeSelect = useCallback((node: ExplorerNode) => {
    if (node.kind !== 'file') return;
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  }, []);

  const fileEntriesInView = useMemo(
    () => entries.filter((e) => e.kind === 'file'),
    [entries]
  );

  const selectAllInView = useCallback(() => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      fileEntriesInView.forEach((f) => next.add(f.path));
      return next;
    });
  }, [fileEntriesInView]);

  const clearExplorerSelection = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  const stageSelectedNodes = useCallback(async () => {
    if (selectedPaths.size === 0 || !activeRoot) return;
    setStagingBusy(true);

    try {
      // Collect matching ExplorerNodes by walking cached nodes
      const matched: ExplorerNode[] = [];
      const walkCached = (node: ExplorerNode) => {
        if (node.kind === 'file' && selectedPaths.has(node.path)) {
          matched.push(node);
        }
        node.children?.forEach(walkCached);
      };
      walkCached(activeRoot);

      const resolved: Array<{ file: File; relativePath?: string }> = [];
      for (const item of matched) {
        if (item.file) {
          resolved.push({ file: item.file, relativePath: item.path });
        } else if (item.fileHandle) {
          const file = await item.fileHandle.getFile();
          resolved.push({ file, relativePath: item.path });
        }
      }

      if (resolved.length > 0) {
        // If browsing already-staged workspace mirror, toggle selection directly
        if (!explorerRoot && fallbackStagedRoot) {
          const namesToSelect = new Set(resolved.map((r) => r.relativePath || r.file.name));
          stagedFiles.forEach((sf) => {
            if (namesToSelect.has(sf.relativePath || sf.name) && !sf.selected) {
              toggleFileSelection(sf.id);
            }
          });
        } else {
          await addFiles(resolved);
        }
        closeGestureExplorer();
      }
    } finally {
      setStagingBusy(false);
    }
  }, [
    activeRoot,
    addFiles,
    closeGestureExplorer,
    explorerRoot,
    fallbackStagedRoot,
    selectedPaths,
    stagedFiles,
    toggleFileSelection,
  ]);

  const handleDropInsideExplorer = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const extracted = await extractFilesFromDataTransfer(e.dataTransfer);
    if (extracted.length > 0) {
      mountFolderTreeFromEntries(extracted);
    }
  };

  if (!explorerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gesture File Explorer"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(e) => void handleDropInsideExplorer(e)}
        className={`flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-[#0D1628] shadow-2xl transition-colors ${
          dragActive ? 'border-cyan-400' : 'border-slate-700/90'
        }`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-slate-100">
                Gesture File &amp; Folder Explorer
              </h2>
              <p className="truncate font-mono text-xs text-slate-400">
                {currentDir
                  ? currentDir.path
                  : 'Mount a local folder or drop files here to browse with your hand cursor'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void openFolderPicker()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              <span>Mount Local Folder</span>
            </button>

            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
            >
              <span>OS File Dialog</span>
            </button>

            <button
              type="button"
              onClick={closeGestureExplorer}
              data-gx-action="explorer-close"
              data-gx-label="Close Explorer"
              aria-label="Close Gesture File Explorer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation / Selection Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/40 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pathStack.length <= 1}
              onClick={navigateUp}
              data-gx-action="explorer-up"
              data-gx-label="Up Folder"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-cyan-500/50 disabled:opacity-40 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Up</span>
            </button>

            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
              {pathStack.map((node, idx) => (
                <React.Fragment key={node.id}>
                  {idx > 0 ? <span aria-hidden="true">/</span> : null}
                  <button
                    type="button"
                    onClick={() => setPathStack((prev) => prev.slice(0, idx + 1))}
                    data-gx-action={`explorer-crumb-${idx}`}
                    data-gx-label={node.name}
                    className={`rounded px-2 py-1 font-medium hover:bg-slate-800 ${
                      idx === pathStack.length - 1
                        ? 'text-cyan-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {node.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {fileEntriesInView.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllInView}
                data-gx-action="explorer-select-all"
                data-gx-label="Select All Files"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-cyan-500/50 whitespace-nowrap"
              >
                <CheckSquare className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                <span>Select All ({fileEntriesInView.length})</span>
              </button>
              {selectedPaths.size > 0 ? (
                <button
                  type="button"
                  onClick={clearExplorerSelection}
                  data-gx-action="explorer-clear"
                  data-gx-label="Clear Selection"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                >
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Scrollable Explorer Grid */}
        <div className="flex-1 overflow-y-auto bg-slate-950/50 p-5">
          {gestureModeEnabled ? (
            <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-xs text-slate-300">
              <strong>AR/VR Gesture Navigation:</strong> Close Fist on any file, folder, or button to choose/grab it; move and <strong>Open Palm</strong> to drop directly onto the Workspace (or tap with pinch).{' '}
              {!explorerRoot ? (
                <span className="text-slate-400">
                  (Browser security blocks virtual cursors inside OS native popups—click{' '}
                  <strong className="text-cyan-300">Mount Local Folder</strong> once with your mouse or drag a folder here to select disk files hands-free.)
                </span>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="flex h-52 items-center justify-center text-xs text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-cyan-400" />
              <span>Reading directory contents...</span>
            </div>
          ) : !activeRoot ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center">
              <Folder className="h-10 w-10 text-cyan-400" aria-hidden="true" />
              <h3 className="mt-3 font-display text-sm font-semibold text-slate-100">
                No Local Folder Mounted Yet
              </h3>
              <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-400">
                {isInIframe
                  ? 'Drag and drop a folder (like Desktop or Downloads) anywhere into this window, or click "Mount Local Folder" with your mouse once. After mounting, browse folders and select individual files 100% with your virtual hand cursor.'
                  : 'Click "Mount Local Folder" once with your mouse (or drop a folder here) to grant browser permission, then browse and select files 100% hands-free with your virtual cursor.'}
              </p>
              <button
                type="button"
                onClick={() => void openFolderPicker()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <FolderPlus className="h-4 w-4" aria-hidden="true" />
                <span>Mount Local Folder</span>
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center text-xs text-slate-400">
              This folder is empty.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry, idx) => {
                const actionId =
                  entry.kind === 'directory'
                    ? `explorer-dir-${idx}`
                    : `explorer-file-${idx}`;
                const isSelected = selectedPaths.has(entry.path);
                const isHovered =
                  hoveredTarget.type === 'action' && hoveredTarget.id === actionId;
                const isGrabbed =
                  draggingItem?.kind === 'explorer-node' &&
                  draggingItem.explorerPath === entry.path;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    data-gx-action={actionId}
                    data-gx-label={entry.name}
                    data-gx-explorer-path={entry.path}
                    data-gx-explorer-kind={entry.kind}
                    onClick={() =>
                      entry.kind === 'directory'
                        ? enterDirectory(entry)
                        : toggleNodeSelect(entry)
                    }
                    className={`flex min-h-[56px] items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isGrabbed
                        ? 'border-cyan-400 bg-cyan-500/20 opacity-85'
                        : isHovered
                          ? 'border-cyan-400 bg-cyan-500/15'
                          : isSelected
                            ? 'border-blue-500 bg-blue-500/15'
                            : 'border-slate-800 bg-[#0B1324] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                          entry.kind === 'directory'
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                            : 'border-slate-700 bg-slate-900 text-slate-300'
                        }`}
                      >
                        {entry.kind === 'directory' ? (
                          <Folder className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          title={entry.name}
                          className="truncate text-xs font-medium text-slate-100"
                        >
                          {entry.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                          {entry.kind === 'directory'
                            ? 'Folder · Click to open'
                            : `${(entry.extension || 'file').toUpperCase()} · ${formatBytes(
                                entry.size ?? 0
                              )}`}
                        </p>
                      </div>
                    </div>

                    {entry.kind === 'file' ? (
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-600 bg-slate-900 text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3.5">
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Selected: <strong className="text-slate-100">{selectedPaths.size}</strong>
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={closeGestureExplorer}
              data-gx-action="explorer-cancel"
              data-gx-label="Cancel"
              className="inline-flex h-10 items-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
            >
              Close
            </button>
            <button
              type="button"
              disabled={selectedPaths.size === 0 || stagingBusy}
              onClick={() => void stageSelectedNodes()}
              data-gx-action="explorer-stage-selected"
              data-gx-label="Stage Selected Files"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
            >
              {stagingBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {!explorerRoot && fallbackStagedRoot
                  ? `Apply Selection (${selectedPaths.size})`
                  : `Stage Selected (${selectedPaths.size})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
