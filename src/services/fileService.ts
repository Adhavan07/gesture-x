import type { ExplorerNode, FileItem, FolderGroup } from '../types/files.ts';
import {
  getFileExtension,
  sanitizeRelativePath,
  validateFileMetadata,
} from '../utils/fileValidation.ts';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif']);
const TEXT_EXTS = new Set(['txt', 'csv']);

export async function createFileItemsFromFiles(
  files: Array<{ file: File; relativePath?: string }>,
  maxFileSizeMB: number
): Promise<FileItem[]> {
  const results: FileItem[] = [];

  for (const entry of files) {
    const { file } = entry;
    const rawRel =
      entry.relativePath ||
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const relativePath = sanitizeRelativePath(rawRel) || file.name;
    const parts = relativePath.split('/');
    const folderName = parts.length > 1 ? parts[0] : null;
    const folderId = folderName ? `folder:${folderName}` : null;

    const validation = validateFileMetadata(
      { name: file.name, size: file.size, type: file.type },
      maxFileSizeMB
    );
    const ext = validation.extension || getFileExtension(file.name);

    let previewUrl: string | undefined;
    if (IMAGE_EXTS.has(ext) && typeof URL !== 'undefined') {
      previewUrl = URL.createObjectURL(file);
    }

    let textSnippet: string | undefined;
    if (TEXT_EXTS.has(ext) && file.size > 0 && file.size < 2 * 1024 * 1024) {
      try {
        const text = await file.slice(0, 400).text();
        textSnippet = text.trim().slice(0, 220);
      } catch {
        // Ignore preview read failure
      }
    }

    results.push({
      id: generateId(),
      file,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      extension: ext,
      relativePath,
      folderId,
      folderName,
      previewUrl,
      textSnippet,
      selected: false,
      status: validation.valid ? 'ready' : 'failed',
      progress: 0,
      error: validation.valid ? undefined : validation.error,
    });
  }

  return results;
}

export function deriveFolderGroups(files: FileItem[]): FolderGroup[] {
  const map = new Map<string, FolderGroup>();
  for (const item of files) {
    if (!item.folderId || !item.folderName) continue;
    const existing = map.get(item.folderId);
    if (existing) {
      existing.fileIds.push(item.id);
      existing.totalSize += item.size;
      existing.selected = existing.selected && item.selected;
    } else {
      map.set(item.id ? item.folderId : item.folderName, {
        id: item.folderId,
        name: item.folderName,
        path: item.folderName,
        fileIds: [item.id],
        totalSize: item.size,
        selected: item.selected,
      });
    }
  }
  return Array.from(map.values());
}

export function revokeFilePreview(item: FileItem): void {
  if (item.previewUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(item.previewUrl);
  }
}

export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<Array<{ file: File; relativePath?: string }>> {
  const items = dataTransfer.items;
  if (!items || items.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ file }));
  }

  const collected: Array<{ file: File; relativePath?: string }> = [];

  const readEntry = async (entry: FileSystemEntry, parentPath = ''): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      await new Promise<void>((resolve) => {
        fileEntry.file(
          (file) => {
            const relPath = parentPath ? `${parentPath}/${file.name}` : file.name;
            collected.push({ file, relativePath: relPath });
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const nextParent = parentPath ? `${parentPath}/${dirEntry.name}` : dirEntry.name;

      const readAllEntries = async (): Promise<FileSystemEntry[]> => {
        const all: FileSystemEntry[] = [];
        while (true) {
          const batch = await new Promise<FileSystemEntry[]>((resolve) => {
            reader.readEntries(
              (entries) => resolve(entries),
              () => resolve([])
            );
          });
          if (batch.length === 0) break;
          all.push(...batch);
        }
        return all;
      };

      const childEntries = await readAllEntries();
      for (const child of childEntries) {
        await readEntry(child, nextParent);
      }
    }
  };

  let usedEntries = false;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const webkitEntry = (
      item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }
    ).webkitGetAsEntry?.();
    if (webkitEntry) {
      usedEntries = true;
      await readEntry(webkitEntry);
    }
  }

  if (!usedEntries) {
    return Array.from(dataTransfer.files).map((file) => ({ file }));
  }

  return collected;
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function requestDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  const win = window as unknown as {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (!win.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser.');
  }
  return win.showDirectoryPicker();
}

export async function readDirectoryChildren(
  dirHandle: FileSystemDirectoryHandle,
  parentPath: string
): Promise<ExplorerNode[]> {
  const iterable = dirHandle as unknown as {
    values: () => AsyncIterable<FileSystemHandle>;
  };
  const dirs: ExplorerNode[] = [];
  const files: ExplorerNode[] = [];

  for await (const handle of iterable.values()) {
    const childPath = parentPath ? `${parentPath}/${handle.name}` : handle.name;
    if (handle.kind === 'directory') {
      dirs.push({
        id: `dir:${childPath}`,
        name: handle.name,
        path: childPath,
        kind: 'directory',
        dirHandle: handle as FileSystemDirectoryHandle,
      });
    } else if (handle.kind === 'file') {
      const fh = handle as FileSystemFileHandle;
      let size = 0;
      try {
        const f = await fh.getFile();
        size = f.size;
      } catch {
        // Ignore unreadable metadata
      }
      files.push({
        id: `file:${childPath}`,
        name: handle.name,
        path: childPath,
        kind: 'file',
        size,
        extension: getFileExtension(handle.name),
        fileHandle: fh,
      });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

export function buildExplorerTreeFromFiles(
  entries: Array<{ file: File; relativePath?: string }>,
  rootName = 'Mounted Folder'
): ExplorerNode {
  const root: ExplorerNode = {
    id: `dir:${rootName}`,
    name: rootName,
    path: rootName,
    kind: 'directory',
    children: [],
  };

  for (const entry of entries) {
    const rawPath = sanitizeRelativePath(
      entry.relativePath ||
        (entry.file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        entry.file.name
    );
    const segments = rawPath.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    // Strip matching root segment if present
    const startIdx = segments.length > 1 && segments[0] === rootName ? 1 : 0;
    let cursor = root;
    let currentPath = rootName;

    for (let i = startIdx; i < segments.length; i += 1) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = `${currentPath}/${seg}`;
      cursor.children = cursor.children ?? [];

      if (isLast) {
        cursor.children.push({
          id: `file:${currentPath}`,
          name: seg,
          path: currentPath,
          kind: 'file',
          size: entry.file.size,
          extension: getFileExtension(seg),
          file: entry.file,
        });
      } else {
        let dirNode = cursor.children.find(
          (c) => c.kind === 'directory' && c.name === seg
        );
        if (!dirNode) {
          dirNode = {
            id: `dir:${currentPath}`,
            name: seg,
            path: currentPath,
            kind: 'directory',
            children: [],
          };
          cursor.children.push(dirNode);
        }
        cursor = dirNode;
      }
    }
  }

  const sortTree = (node: ExplorerNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  };
  sortTree(root);
  return root;
}

export async function pickFolderViaFileSystemAccess(): Promise<
  Array<{ file: File; relativePath?: string }>
> {
  const rootHandle = await requestDirectoryHandle();
  const collected: Array<{ file: File; relativePath?: string }> = [];

  const walk = async (dirHandle: FileSystemDirectoryHandle, prefix: string) => {
    const iterable = dirHandle as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    };
    for await (const handle of iterable.values()) {
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        collected.push({
          file,
          relativePath: `${prefix}/${file.name}`,
        });
      } else if (handle.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandle, `${prefix}/${handle.name}`);
      }
    }
  };

  await walk(rootHandle, rootHandle.name);
  return collected;
}
