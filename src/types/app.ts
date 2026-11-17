export type NavTab = 'dashboard' | 'files' | 'history' | 'settings';

export interface AppNotification {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

export interface PendingConfirmation {
  id: string;
  title: string;
  description: string;
  actionType:
    | 'REMOVE_SELECTED'
    | 'REMOVE_SINGLE_FILE'
    | 'CLEAR_ALL_FILES'
    | 'DELETE_UPLOAD_RECORD';
  payload?: string;
}

export interface RenameModalState {
  open: boolean;
  fileId: string | null;
  currentName: string;
}

export interface CursorHoverTarget {
  type: 'file' | 'folder' | 'dropzone' | 'action' | 'overlay' | null;
  id: string | null;
  label?: string;
  explorerPath?: string;
  explorerKind?: 'file' | 'directory';
}

export interface DraggedItemState {
  kind: 'file' | 'folder' | 'overlay' | 'explorer-node';
  id: string;
  label: string;
  count?: number;
  explorerPath?: string;
  explorerKind?: 'file' | 'directory';
  grabSource: 'FIST' | 'PINCH';
  startX: number;
  startY: number;
}

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  targetType: 'file' | 'folder' | 'dropzone' | 'workspace';
  targetId: string | null;
  label?: string;
}

export interface PreviewModalState {
  open: boolean;
  mode: 'file' | 'folder';
  fileId?: string;
  folderId?: string;
}
