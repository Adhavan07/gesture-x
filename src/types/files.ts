import type { GestureMappingConfig, PointerHandPreference } from './gesture.ts';

export type SupportedFileExtension =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'xls'
  | 'xlsx'
  | 'ppt'
  | 'pptx'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'gif'
  | 'mp4'
  | 'mp3'
  | 'zip'
  | 'txt'
  | 'csv';

export type FileUploadStatus =
  | 'ready'
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'cancelled';

export interface DynamicThumbnail {
  url: string;
  width: number;
  height: number;
  kind: 'image' | 'pdf' | 'text' | 'generic';
  metaLabel: string;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  relativePath: string;
  folderId: string | null;
  folderName: string | null;
  previewUrl?: string;
  textSnippet?: string;
  selected: boolean;
  status: FileUploadStatus;
  progress: number;
  error?: string;
  uploadedAt?: string;
  serverId?: string;
  serverSafeName?: string;
}

export interface FolderGroup {
  id: string;
  name: string;
  path: string;
  fileIds: string[];
  totalSize: number;
  selected: boolean;
}

export interface ExplorerNode {
  id: string;
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size?: number;
  extension?: string;
  file?: File;
  dirHandle?: FileSystemDirectoryHandle;
  fileHandle?: FileSystemFileHandle;
  children?: ExplorerNode[];
}

export interface UploadRecord {
  id: string;
  originalName: string;
  safeName: string;
  size: number;
  mimeType: string;
  extension: string;
  relativePath: string;
  folderName: string | null;
  status: 'uploaded' | 'failed';
  uploadedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  extension: string;
  safeName: string;
}

export interface AppSettings {
  maxFileSizeMB: number;
  autoUploadOnDrop: boolean;
  voiceFeedbackEnabled: boolean;
  cursorSensitivity: number;
  cursorSmoothing: number;
  pinchThreshold: number;
  releaseThreshold: number;
  clickStabilizationMs: number;
  dragActivationMs: number;
  doubleClickWindowMs: number;
  gestureCooldownMs: number;
  gestureConfidenceThreshold: number;
  scrollSpeed: number;
  mirrorPreview: boolean;
  multiHandEnabled: boolean;
  preferredPointerHand: PointerHandPreference;
  gestureMappings: GestureMappingConfig;
  gestureMappingVersion?: number;
}
