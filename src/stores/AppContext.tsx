import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AppSettings,
  ExplorerNode,
  FileItem,
  FolderGroup,
  UploadRecord,
} from '../types/files.ts';
import {
  DEFAULT_GESTURE_MAPPINGS,
  GESTURE_MAPPING_VERSION,
  GESTURE_PRESETS,
  GESTURE_TRIGGER_LABELS,
  MOUSE_ACTION_META,
  type CameraPermissionStatus,
  type FingerStates,
  type GestureFrameResult,
  type GestureMappingConfig,
  type GesturePresetId,
  type GestureState,
  type GestureTrigger,
  type GestureType,
  type HandId,
  type HandsMap,
  type MouseActionType,
  type TwoHandModifierState,
} from '../types/gesture.ts';
import { createEmptyHandsMap } from '../engines/GestureEngine.ts';
import type {
  VoiceListeningStatus,
  VoiceLogEntry,
  VoicePermissionStatus,
} from '../types/voice.ts';
import type {
  AppNotification,
  ContextMenuState,
  CursorHoverTarget,
  DraggedItemState,
  NavTab,
  PendingConfirmation,
  PreviewModalState,
  RenameModalState,
} from '../types/app.ts';
import type { StorageStats } from '../../server/storage.ts';
import {
  buildExplorerTreeFromFiles,
  createFileItemsFromFiles,
  deriveFolderGroups,
  readDirectoryChildren,
  requestDirectoryHandle,
  revokeFilePreview,
} from '../services/fileService.ts';
import {
  clearAllDynamicThumbnails,
  revokeDynamicThumbnail,
} from '../services/thumbnailService.ts';
import {
  deleteUploadHistoryRecord,
  fetchUploadHistory,
  uploadFileWithProgress,
  type UploadTaskHandle,
} from '../services/uploadService.ts';
import { parseVoiceCommand } from '../services/commandParser.ts';
import { DEFAULT_MAX_FILE_SIZE_MB } from '../utils/fileValidation.ts';
import { useCamera, type CameraDeviceInfo } from '../hooks/useCamera.ts';
import {
  useHandTracking,
  type TrackingSubscriber,
} from '../hooks/useHandTracking.ts';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition.ts';

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_SETTINGS: AppSettings = {
  maxFileSizeMB: DEFAULT_MAX_FILE_SIZE_MB,
  autoUploadOnDrop: false,
  voiceFeedbackEnabled: true,
  cursorSensitivity: 1.0,
  cursorSmoothing: 0.25,
  pinchThreshold: 0.30,
  releaseThreshold: 0.45,
  clickStabilizationMs: 120,
  dragActivationMs: 300,
  doubleClickWindowMs: 350,
  gestureCooldownMs: 250,
  gestureConfidenceThreshold: 0.75,
  scrollSpeed: 1.0,
  mirrorPreview: true,
  multiHandEnabled: true,
  preferredPointerHand: 'auto',
  gestureMappings: { ...DEFAULT_GESTURE_MAPPINGS },
  gestureMappingVersion: GESTURE_MAPPING_VERSION,
};

const DEFAULT_MODIFIERS: TwoHandModifierState = {
  cursorFrozen: false,
  multiSelectActive: false,
  secondaryScrollActive: false,
  bothHandsOpenPause: false,
  emergencyStopActive: false,
  activeModifierLabel: null,
};

const DEFAULT_FINGERS: FingerStates = {
  thumb: false,
  index: false,
  middle: false,
  ring: false,
  pinky: false,
};

const CLOSED_CONTEXT_MENU: ContextMenuState = {
  open: false,
  x: 0,
  y: 0,
  targetType: 'workspace',
  targetId: null,
};

const CLOSED_PREVIEW_MODAL: PreviewModalState = {
  open: false,
  mode: 'file',
};

const CLOSED_RENAME_MODAL: RenameModalState = {
  open: false,
  fileId: null,
  currentName: '',
};

export interface AppContextValue {
  // Navigation & View
  activeTab: NavTab;
  navigate: (tab: NavTab) => void;
  fileFilter: 'all' | 'selected' | 'failed';
  setFileFilter: (filter: 'all' | 'selected' | 'failed') => void;

  // Files & Folders
  files: FileItem[];
  folders: FolderGroup[];
  selectedCount: number;
  uploadHistory: UploadRecord[];
  storageStats: StorageStats;
  historyLoading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  addFiles: (incoming: Array<{ file: File; relativePath?: string }>) => Promise<void>;
  openFilePicker: () => void;
  openFolderPicker: () => Promise<void>;
  selectFile: (fileId: string) => void;
  deselectFile: (fileId: string) => void;
  toggleFileSelection: (fileId: string) => void;
  selectFolder: (folderId: string) => void;
  selectAllFiles: () => void;
  clearSelection: () => void;
  removeFile: (fileId: string) => void;
  requestRemoveSingleFile: (fileId: string) => void;
  renameFile: (fileId: string, newName: string) => void;
  downloadFile: (fileId: string) => void;
  requestRemoveSelected: () => void;
  requestClearAllFiles: () => void;
  moveFileToFolder: (fileId: string, folderId: string) => void;
  moveFileOutOfFolder: (fileId: string) => void;
  moveFolderToFolder: (sourceFolderId: string, targetFolderId: string) => void;
  reorderFileInQueue: (sourceFileId: string, targetFileId: string) => void;
  uploadSingleFile: (fileId: string) => Promise<void>;
  uploadSelectedFiles: () => Promise<void>;
  uploadAllFiles: () => Promise<void>;
  cancelUpload: (fileId?: string) => void;
  retryFailedUploads: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  deleteHistoryRecord: (id: string) => Promise<void>;

  // Gesture & Camera (Camera-only)
  gestureModeEnabled: boolean;
  gesturePaused: boolean;
  cameraStatus: CameraPermissionStatus;
  cameraError: string | null;
  cameraDevices: CameraDeviceInfo[];
  selectedCameraId: string;
  isInIframe: boolean;
  selectCameraDevice: (deviceId: string) => Promise<void>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraStream: MediaStream | null;
  modelLoading: boolean;
  modelError: string | null;
  handDetected: boolean;
  detectedHandsCount: number;
  primaryHandId: HandId | null;
  secondaryHandId: HandId | null;
  hands: HandsMap;
  twoHandModifiers: TwoHandModifierState;
  gestureState: GestureState;
  recognizedGesture: GestureType;
  gestureConfidence: number;
  palmOrientation: 'front' | 'back' | 'side';
  fingerStates: FingerStates;
  pinchDistance: number;
  hoveredTarget: CursorHoverTarget;
  draggingFileId: string | null;
  draggingItem: DraggedItemState | null;
  toggleGestureMode: () => Promise<void>;
  retryCamera: () => Promise<void>;
  pauseGestureMode: () => void;
  resumeGestureMode: () => void;
  swapHandRoles: () => void;
  subscribeTracking: (listener: TrackingSubscriber) => () => void;

  // Context Menu, Preview & Rename Modals (Mouse & Hand Gesture parity)
  contextMenu: ContextMenuState;
  openContextMenu: (menu: Omit<ContextMenuState, 'open'>) => void;
  closeContextMenu: () => void;
  previewModal: PreviewModalState;
  openFilePreview: (fileId: string) => void;
  openFolderPreview: (folderId: string) => void;
  closePreviewModal: () => void;
  renameModal: RenameModalState;
  openRenameModal: (fileId: string) => void;
  closeRenameModal: () => void;
  explorerOpen: boolean;
  explorerRoot: ExplorerNode | null;
  openGestureExplorer: () => void;
  closeGestureExplorer: () => void;
  mountFolderTreeFromEntries: (
    entries: Array<{ file: File; relativePath?: string }>,
    rootName?: string
  ) => void;

  // Voice Assistant
  voiceModeEnabled: boolean;
  voiceSupported: boolean;
  voicePermission: VoicePermissionStatus;
  voiceListeningStatus: VoiceListeningStatus;
  voiceError: string | null;
  interimTranscript: string;
  voiceLogs: VoiceLogEntry[];
  recentActions: string[];
  toggleVoiceMode: () => Promise<void>;
  dispatchVoiceCommand: (text: string) => void;

  // Settings, Notifications & Confirmations
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  updateGestureMapping: (action: MouseActionType, trigger: GestureTrigger) => void;
  applyGesturePreset: (presetId: GesturePresetId) => void;
  resetGestureMappings: () => void;
  notifications: AppNotification[];
  dismissNotification: (id: string) => void;
  pendingConfirmation: PendingConfirmation | null;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [fileFilter, setFileFilter] = useState<'all' | 'selected' | 'failed'>('all');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats>({
    totalFiles: 0,
    totalBytes: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(true);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('gesturex_settings');
      if (!saved) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(saved) as Partial<AppSettings>;
      const rawMappings = (parsed.gestureMappings ?? {}) as Record<string, string>;
      const savedVersion =
        typeof parsed.gestureMappingVersion === 'number'
          ? parsed.gestureMappingVersion
          : 1;
      const isLegacyPreArVr = !('GRAB_CHOOSE' in rawMappings);
      const isPreV2ClickDefault = savedVersion < GESTURE_MAPPING_VERSION;
      const migratedMappings: GestureMappingConfig = {
        ...DEFAULT_GESTURE_MAPPINGS,
      };
      (Object.keys(DEFAULT_GESTURE_MAPPINGS) as MouseActionType[]).forEach((k) => {
        const val = rawMappings[k];
        if (!val) return;
        if (val === 'DOUBLE_PINCH') {
          migratedMappings[k] = 'DOUBLE_INDEX_PINCH';
        } else if (val in GESTURE_TRIGGER_LABELS) {
          migratedMappings[k] = val as GestureTrigger;
        }
      });

      if (isLegacyPreArVr || isPreV2ClickDefault) {
        migratedMappings.GRAB_CHOOSE = DEFAULT_GESTURE_MAPPINGS.GRAB_CHOOSE;
        migratedMappings.DROP_RELEASE = DEFAULT_GESTURE_MAPPINGS.DROP_RELEASE;
        migratedMappings.LEFT_CLICK = DEFAULT_GESTURE_MAPPINGS.LEFT_CLICK;
        migratedMappings.DOUBLE_CLICK = DEFAULT_GESTURE_MAPPINGS.DOUBLE_CLICK;
        migratedMappings.RIGHT_CLICK = DEFAULT_GESTURE_MAPPINGS.RIGHT_CLICK;
        migratedMappings.DRAG_DROP = DEFAULT_GESTURE_MAPPINGS.DRAG_DROP;
        migratedMappings.RIGHT_BUTTON_HOLD =
          DEFAULT_GESTURE_MAPPINGS.RIGHT_BUTTON_HOLD;
        if (
          !rawMappings.PAUSE_TRACKING ||
          rawMappings.PAUSE_TRACKING === 'OPEN_PALM'
        ) {
          migratedMappings.PAUSE_TRACKING = DEFAULT_GESTURE_MAPPINGS.PAUSE_TRACKING;
        }
        if (
          !rawMappings.CANCEL_ACTION ||
          rawMappings.CANCEL_ACTION === 'FIST'
        ) {
          migratedMappings.CANCEL_ACTION = DEFAULT_GESTURE_MAPPINGS.CANCEL_ACTION;
        }
      }

      const upgraded: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        gestureMappings: migratedMappings,
        gestureMappingVersion: GESTURE_MAPPING_VERSION,
      };
      if (isPreV2ClickDefault) {
        try {
          localStorage.setItem('gesturex_settings', JSON.stringify(upgraded));
        } catch {
          // Ignore storage error
        }
      }
      return upgraded;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [gestureModeEnabled, setGestureModeEnabled] = useState(false);
  const [gesturePaused, setGesturePaused] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [detectedHandsCount, setDetectedHandsCount] = useState(0);
  const [primaryHandId, setPrimaryHandId] = useState<HandId | null>(null);
  const [secondaryHandId, setSecondaryHandId] = useState<HandId | null>(null);
  const [hands, setHands] = useState<HandsMap>(() => createEmptyHandsMap());
  const [twoHandModifiers, setTwoHandModifiers] =
    useState<TwoHandModifierState>(DEFAULT_MODIFIERS);
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [recognizedGesture, setRecognizedGesture] = useState<GestureType>('NONE');
  const [gestureConfidence, setGestureConfidence] = useState(0);
  const [palmOrientation, setPalmOrientation] = useState<'front' | 'back' | 'side'>('front');
  const [fingerStates, setFingerStates] = useState<FingerStates>(DEFAULT_FINGERS);
  const [pinchDistance, setPinchDistance] = useState(1);
  const [hoveredTarget, setHoveredTarget] = useState<CursorHoverTarget>({
    type: null,
    id: null,
  });
  const [draggingItem, setDraggingItem] = useState<DraggedItemState | null>(null);
  const draggingFileId =
    draggingItem?.kind === 'file' ? draggingItem.id : null;

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(CLOSED_CONTEXT_MENU);
  const [previewModal, setPreviewModal] = useState<PreviewModalState>(CLOSED_PREVIEW_MODAL);
  const [renameModal, setRenameModal] = useState<RenameModalState>(CLOSED_RENAME_MODAL);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerRoot, setExplorerRoot] = useState<ExplorerNode | null>(null);

  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLogEntry[]>([
    {
      id: uid(),
      timestamp: new Date().toISOString(),
      type: 'assistant',
      text: 'Voice Assistant ready. Say "What can you do?" or type a command below.',
    },
  ]);
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadsRef = useRef<Map<string, UploadTaskHandle>>(new Map());
  const filesRef = useRef<FileItem[]>(files);
  filesRef.current = files;

  const activeTabRef = useRef<NavTab>(activeTab);
  activeTabRef.current = activeTab;

  const explorerRootRef = useRef<ExplorerNode | null>(explorerRoot);
  explorerRootRef.current = explorerRoot;

  const hoveredTargetRef = useRef<CursorHoverTarget>(hoveredTarget);
  hoveredTargetRef.current = hoveredTarget;

  const draggingItemRef = useRef<DraggedItemState | null>(draggingItem);
  draggingItemRef.current = draggingItem;

  const pendingConfirmationRef = useRef<PendingConfirmation | null>(pendingConfirmation);
  pendingConfirmationRef.current = pendingConfirmation;

  const contextMenuRef = useRef<ContextMenuState>(contextMenu);
  contextMenuRef.current = contextMenu;

  const previewModalRef = useRef<PreviewModalState>(previewModal);
  previewModalRef.current = previewModal;

  const completeInstantGrabRef = useRef<() => void>(() => undefined);

  const folders = useMemo(() => deriveFolderGroups(files), [files]);
  const selectedCount = useMemo(
    () => files.filter((f) => f.selected).length,
    [files]
  );

  const pushNotification = useCallback(
    (level: AppNotification['level'], title: string, message: string) => {
      const entry: AppNotification = {
        id: uid(),
        level,
        title,
        message,
        timestamp: new Date().toISOString(),
      };
      setNotifications((prev) => [entry, ...prev].slice(0, 5));
      window.setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== entry.id));
      }, 6000);
    },
    []
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const recordAction = useCallback((summary: string) => {
    const stamped = `${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })} · ${summary}`;
    setRecentActions((prev) => [stamped, ...prev].slice(0, 12));
  }, []);

  const appendVoiceLog = useCallback(
    (type: VoiceLogEntry['type'], text: string, intent?: VoiceLogEntry['intent']) => {
      setVoiceLogs((prev) =>
        [
          ...prev,
          {
            id: uid(),
            timestamp: new Date().toISOString(),
            type,
            text,
            intent,
          },
        ].slice(-40)
      );
    },
    []
  );

  const refreshHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await fetchUploadHistory();
      setUploadHistory(data.records);
      setStorageStats(data.stats);
    } catch {
      // Keep existing history if transient fetch error
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach(revokeFilePreview);
      clearAllDynamicThumbnails();
      activeUploadsRef.current.forEach((handle) => handle.abort());
    };
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        ...partial,
        gestureMappingVersion: GESTURE_MAPPING_VERSION,
        gestureMappings: partial.gestureMappings
          ? { ...prev.gestureMappings, ...partial.gestureMappings }
          : prev.gestureMappings,
      };
      try {
        localStorage.setItem('gesturex_settings', JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const updateGestureMapping = useCallback(
    (action: MouseActionType, trigger: GestureTrigger) => {
      setSettings((prev) => {
        const nextMappings = { ...prev.gestureMappings };
        const previousTrigger = nextMappings[action];

        // Allow tap/hold pairs (LEFT_CLICK + DRAG_DROP, RIGHT_CLICK + RIGHT_BUTTON_HOLD) to share a pinch;
        // otherwise swap any conflicting discrete assignment so triggers never shadow silently.
        const isTapHoldPair = (a: MouseActionType, b: MouseActionType) =>
          (a === 'LEFT_CLICK' && b === 'DRAG_DROP') ||
          (a === 'DRAG_DROP' && b === 'LEFT_CLICK') ||
          (a === 'RIGHT_CLICK' && b === 'RIGHT_BUTTON_HOLD') ||
          (a === 'RIGHT_BUTTON_HOLD' && b === 'RIGHT_CLICK');

        let swappedLabel: string | null = null;
        (Object.keys(nextMappings) as MouseActionType[]).forEach((otherAction) => {
          if (
            otherAction !== action &&
            !isTapHoldPair(action, otherAction) &&
            nextMappings[otherAction] === trigger
          ) {
            nextMappings[otherAction] = previousTrigger;
            const meta = MOUSE_ACTION_META.find((m) => m.action === otherAction);
            swappedLabel = meta?.label ?? otherAction;
          }
        });

        nextMappings[action] = trigger;
        const next: AppSettings = {
          ...prev,
          gestureMappingVersion: GESTURE_MAPPING_VERSION,
          gestureMappings: nextMappings,
        };
        try {
          localStorage.setItem('gesturex_settings', JSON.stringify(next));
        } catch {
          // Ignore storage error
        }

        const actionLabel =
          MOUSE_ACTION_META.find((m) => m.action === action)?.label ?? action;
        const triggerLabel = GESTURE_TRIGGER_LABELS[trigger];
        recordAction(`Mapped ${actionLabel} → ${triggerLabel}`);
        if (swappedLabel) {
          pushNotification(
            'info',
            'Gesture mapping swapped',
            `${triggerLabel} moved to ${actionLabel}; ${swappedLabel} received ${GESTURE_TRIGGER_LABELS[previousTrigger]}.`
          );
        }
        return next;
      });
    },
    [pushNotification, recordAction]
  );

  const applyGesturePreset = useCallback(
    (presetId: GesturePresetId) => {
      const preset = GESTURE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      updateSettings({
        gestureMappings: { ...preset.mappings },
        multiHandEnabled:
          presetId === 'virtual_mouse' ? true : settings.multiHandEnabled,
      });
      recordAction(`Applied gesture preset: ${preset.label}`);
      pushNotification('info', `${preset.label} preset applied`, preset.summary);
    },
    [pushNotification, recordAction, settings.multiHandEnabled, updateSettings]
  );

  const resetGestureMappings = useCallback(() => {
    updateSettings({
      gestureMappings: { ...DEFAULT_GESTURE_MAPPINGS },
      gestureMappingVersion: GESTURE_MAPPING_VERSION,
      cursorSmoothing: 0.25,
      pinchThreshold: 0.30,
      releaseThreshold: 0.45,
      clickStabilizationMs: 120,
      dragActivationMs: 300,
      doubleClickWindowMs: 350,
      gestureCooldownMs: 250,
      gestureConfidenceThreshold: 0.75,
      scrollSpeed: 1.0,
      multiHandEnabled: true,
      preferredPointerHand: 'auto',
    });
    recordAction('Reset gesture-to-mouse mappings and calibration to defaults');
    pushNotification(
      'info',
      'Default mappings restored',
      'All hand signs, calibration sliders, and two-hand virtual mouse defaults were restored.'
    );
  }, [pushNotification, recordAction, updateSettings]);

  // Context Menu & Preview Modal controls
  const openContextMenu = useCallback(
    (menu: Omit<ContextMenuState, 'open'>) => {
      setContextMenu({ ...menu, open: true });
      recordAction(`Opened context menu (${menu.label || menu.targetType})`);
    },
    [recordAction]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(CLOSED_CONTEXT_MENU);
  }, []);

  const openFilePreview = useCallback(
    (fileId: string) => {
      const target = filesRef.current.find((f) => f.id === fileId);
      if (!target) return;
      setContextMenu(CLOSED_CONTEXT_MENU);
      setPreviewModal({ open: true, mode: 'file', fileId });
      recordAction(`Previewing ${target.name}`);
    },
    [recordAction]
  );

  const openFolderPreview = useCallback(
    (folderId: string) => {
      setContextMenu(CLOSED_CONTEXT_MENU);
      setPreviewModal({ open: true, mode: 'folder', folderId });
      recordAction('Inspecting folder contents');
    },
    [recordAction]
  );

  const closePreviewModal = useCallback(() => {
    setPreviewModal(CLOSED_PREVIEW_MODAL);
  }, []);

  const openRenameModal = useCallback((fileId: string) => {
    const target = filesRef.current.find((f) => f.id === fileId);
    if (!target) return;
    setContextMenu(CLOSED_CONTEXT_MENU);
    setRenameModal({ open: true, fileId, currentName: target.name });
  }, []);

  const closeRenameModal = useCallback(() => {
    setRenameModal(CLOSED_RENAME_MODAL);
  }, []);

  const openGestureExplorer = useCallback(() => {
    setContextMenu(CLOSED_CONTEXT_MENU);
    setExplorerOpen(true);
    recordAction('Opened Gesture File Explorer');
  }, [recordAction]);

  const closeGestureExplorer = useCallback(() => {
    setExplorerOpen(false);
  }, []);

  const mountFolderTreeFromEntries = useCallback(
    (entries: Array<{ file: File; relativePath?: string }>, rootName?: string) => {
      if (entries.length === 0) return;
      const inferredRoot =
        rootName ||
        entries[0].relativePath?.split('/')[0] ||
        (entries[0].file as File & { webkitRelativePath?: string })
          .webkitRelativePath?.split('/')[0] ||
        'Local Folder';
      const tree = buildExplorerTreeFromFiles(entries, inferredRoot);
      setExplorerRoot(tree);
      setExplorerOpen(true);
      recordAction(`Mounted folder "${inferredRoot}" in Gesture Explorer`);
    },
    [recordAction]
  );

  const renameFile = useCallback(
    (fileId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                name: trimmed,
                relativePath: f.folderName
                  ? `${f.folderName}/${trimmed}`
                  : trimmed,
              }
            : f
        )
      );
      setRenameModal(CLOSED_RENAME_MODAL);
      recordAction(`Renamed file to ${trimmed}`);
    },
    [recordAction]
  );

  const downloadFile = useCallback(
    (fileId: string) => {
      const target = filesRef.current.find((f) => f.id === fileId);
      if (!target) return;
      const url = URL.createObjectURL(target.file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = target.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      recordAction(`Downloaded ${target.name}`);
    },
    [recordAction]
  );

  // File & Folder Actions
  const addFiles = useCallback(
    async (incoming: Array<{ file: File; relativePath?: string }>) => {
      if (incoming.length === 0) return;
      const created = await createFileItemsFromFiles(incoming, settings.maxFileSizeMB);
      setFiles((prev) => [...prev, ...created]);
      const invalidCount = created.filter((c) => c.status === 'failed').length;
      recordAction(`Added ${created.length} file(s) to workspace`);
      if (invalidCount > 0) {
        pushNotification(
          'warning',
          'Some files failed validation',
          `${invalidCount} of ${created.length} file(s) exceeded limits or had an unsupported format.`
        );
      } else {
        pushNotification(
          'info',
          'Files staged',
          `${created.length} file(s) ready for selection or upload.`
        );
      }
    },
    [pushNotification, recordAction, settings.maxFileSizeMB]
  );

  const selectFile = useCallback(
    (fileId: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, selected: true } : f))
      );
      const target = filesRef.current.find((f) => f.id === fileId);
      if (target) recordAction(`Selected ${target.name}`);
    },
    [recordAction]
  );

  const deselectFile = useCallback((fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, selected: false } : f))
    );
  }, []);

  const toggleFileSelection = useCallback(
    (fileId: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, selected: !f.selected } : f))
      );
      const target = filesRef.current.find((f) => f.id === fileId);
      if (target) {
        recordAction(`${target.selected ? 'Deselected' : 'Selected'} ${target.name}`);
      }
    },
    [recordAction]
  );

  const selectFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((fld) => fld.id === folderId);
      if (!folder) return;
      const allSelected = folder.selected;
      setFiles((prev) =>
        prev.map((f) =>
          f.folderId === folderId ? { ...f, selected: !allSelected } : f
        )
      );
      recordAction(
        `${allSelected ? 'Deselected' : 'Selected'} folder ${folder.name}`
      );
    },
    [folders, recordAction]
  );

  const selectAllFiles = useCallback(() => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected: true })));
    recordAction('Selected all staged files');
  }, [recordAction]);

  const clearSelection = useCallback(() => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected: false })));
    recordAction('Cleared file selection');
  }, [recordAction]);

  const removeFile = useCallback(
    (fileId: string) => {
      const activeHandle = activeUploadsRef.current.get(fileId);
      if (activeHandle) {
        activeHandle.abort();
        activeUploadsRef.current.delete(fileId);
      }
      const target = filesRef.current.find((f) => f.id === fileId);
      if (target) {
        revokeFilePreview(target);
        revokeDynamicThumbnail(fileId);
        recordAction(`Removed ${target.name}`);
      }
      if (previewModalRef.current.fileId === fileId) {
        setPreviewModal(CLOSED_PREVIEW_MODAL);
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    },
    [recordAction]
  );

  const moveFileToFolder = useCallback(
    (fileId: string, folderId: string) => {
      const currentFolders = deriveFolderGroups(filesRef.current);
      const targetFolder = currentFolders.find((fld) => fld.id === folderId);
      if (!targetFolder) return;
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                folderId: targetFolder.id,
                folderName: targetFolder.name,
                relativePath: `${targetFolder.name}/${f.name}`,
              }
            : f
        )
      );
      recordAction(`Moved file into folder ${targetFolder.name}`);
    },
    [recordAction]
  );

  const moveFileOutOfFolder = useCallback(
    (fileId: string) => {
      const target = filesRef.current.find((f) => f.id === fileId);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                folderId: null,
                folderName: null,
                relativePath: f.name,
              }
            : f
        )
      );
      if (target) {
        recordAction(`Moved ${target.name} to workspace root`);
      }
    },
    [recordAction]
  );

  const moveFolderToFolder = useCallback(
    (sourceFolderId: string, targetFolderId: string) => {
      if (sourceFolderId === targetFolderId) return;
      const currentFolders = deriveFolderGroups(filesRef.current);
      const sourceFolder = currentFolders.find((fld) => fld.id === sourceFolderId);
      const targetFolder = currentFolders.find((fld) => fld.id === targetFolderId);
      if (!sourceFolder || !targetFolder) return;
      setFiles((prev) =>
        prev.map((f) =>
          f.folderId === sourceFolderId
            ? {
                ...f,
                folderId: targetFolder.id,
                folderName: targetFolder.name,
                relativePath: `${targetFolder.name}/${f.name}`,
              }
            : f
        )
      );
      recordAction(`Moved folder ${sourceFolder.name} into ${targetFolder.name}`);
      pushNotification(
        'info',
        'Folder moved',
        `Merged ${sourceFolder.fileIds.length} file(s) from "${sourceFolder.name}" into "${targetFolder.name}".`
      );
    },
    [pushNotification, recordAction]
  );

  const reorderFileInQueue = useCallback(
    (sourceFileId: string, targetFileId: string) => {
      if (sourceFileId === targetFileId) return;
      setFiles((prev) => {
        const fromIdx = prev.findIndex((f) => f.id === sourceFileId);
        const toIdx = prev.findIndex((f) => f.id === targetFileId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
      const movedItem = filesRef.current.find((f) => f.id === sourceFileId);
      if (movedItem) {
        recordAction(`Moved ${movedItem.name} in queue`);
      }
    },
    [recordAction]
  );

  const stageExplorerPath = useCallback(
    async (explorerPath: string) => {
      const root =
        explorerRootRef.current ??
        (filesRef.current.length > 0
          ? buildExplorerTreeFromFiles(
              filesRef.current.map((f) => ({
                file: f.file,
                relativePath: f.relativePath || f.name,
              })),
              'Staged Workspace'
            )
          : null);
      if (!root) return;

      let matchedNode: ExplorerNode | null = null;
      const findNode = (node: ExplorerNode) => {
        if (node.path === explorerPath) {
          matchedNode = node;
          return;
        }
        node.children?.forEach(findNode);
      };
      findNode(root);

      const resolvedNode = matchedNode as ExplorerNode | null;
      if (!resolvedNode) return;

      const collected: Array<{ file: File; relativePath?: string }> = [];
      const collectNode = async (node: ExplorerNode) => {
        if (node.kind === 'file') {
          if (node.file) {
            collected.push({ file: node.file, relativePath: node.path });
          } else if (node.fileHandle) {
            const file = await node.fileHandle.getFile();
            collected.push({ file, relativePath: node.path });
          }
          return;
        }
        const children =
          node.children ??
          (node.dirHandle
            ? await readDirectoryChildren(node.dirHandle, node.path)
            : []);
        for (const child of children) {
          await collectNode(child);
        }
      };

      await collectNode(resolvedNode);
      if (collected.length > 0) {
        await addFiles(collected);
        setExplorerOpen(false);
        recordAction(
          `Dropped ${resolvedNode.name} (${collected.length} file${collected.length > 1 ? 's' : ''}) into Workspace`
        );
      }
    },
    [addFiles, recordAction]
  );

  const runUploadBatch = useCallback(
    async (targets: FileItem[]) => {
      const uploadable = targets.filter(
        (item) =>
          item.status === 'ready' ||
          item.status === 'failed' ||
          item.status === 'cancelled'
      );

      if (uploadable.length === 0) {
        pushNotification(
          'warning',
          'Nothing to upload',
          'Select valid staged files first before uploading.'
        );
        return;
      }

      const targetIds = new Set(uploadable.map((u) => u.id));
      setFiles((prev) =>
        prev.map((f) =>
          targetIds.has(f.id)
            ? { ...f, status: 'queued', progress: 0, error: undefined }
            : f
        )
      );

      recordAction(`Started uploading ${uploadable.length} file(s)`);

      let successCount = 0;
      let failCount = 0;

      const queue = [...uploadable];
      const worker = async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;

          setFiles((prev) =>
            prev.map((f) =>
              f.id === next.id ? { ...f, status: 'uploading', progress: 5 } : f
            )
          );

          const task = uploadFileWithProgress(
            next,
            settings.maxFileSizeMB,
            (percent) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === next.id ? { ...f, progress: percent } : f
                )
              );
            }
          );

          activeUploadsRef.current.set(next.id, task);

          try {
            const record = await task.promise;
            activeUploadsRef.current.delete(next.id);
            successCount += 1;
            setFiles((prev) =>
              prev.map((f) =>
                f.id === next.id
                  ? {
                      ...f,
                      status: 'uploaded',
                      progress: 100,
                      uploadedAt: record.uploadedAt,
                      serverId: record.id,
                      serverSafeName: record.safeName,
                      error: undefined,
                    }
                  : f
              )
            );
          } catch (err) {
            activeUploadsRef.current.delete(next.id);
            const msg = err instanceof Error ? err.message : 'Upload failed.';
            if (msg === 'UPLOAD_ABORTED') {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === next.id
                    ? { ...f, status: 'cancelled', progress: 0, error: 'Cancelled by user' }
                    : f
                )
              );
            } else {
              failCount += 1;
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === next.id
                    ? { ...f, status: 'failed', error: msg }
                    : f
                )
              );
            }
          }
        }
      };

      await Promise.all([worker(), worker()]);
      await refreshHistory();

      if (successCount > 0 && failCount === 0) {
        pushNotification(
          'success',
          'Upload complete',
          `${successCount} file(s) uploaded successfully.`
        );
        recordAction(`Uploaded ${successCount} file(s)`);
      } else if (failCount > 0) {
        pushNotification(
          'error',
          'Upload finished with errors',
          `${successCount} uploaded, ${failCount} failed. You can retry failed uploads.`
        );
      }
    },
    [pushNotification, recordAction, refreshHistory, settings.maxFileSizeMB]
  );

  const uploadSingleFile = useCallback(
    async (fileId: string) => {
      const target = filesRef.current.find((f) => f.id === fileId);
      if (!target) return;
      await runUploadBatch([target]);
    },
    [runUploadBatch]
  );

  const uploadSelectedFiles = useCallback(async () => {
    const selected = filesRef.current.filter((f) => f.selected);
    await runUploadBatch(selected);
  }, [runUploadBatch]);

  const uploadAllFiles = useCallback(async () => {
    await runUploadBatch(filesRef.current);
  }, [runUploadBatch]);

  const cancelUpload = useCallback(
    (fileId?: string) => {
      if (fileId) {
        const handle = activeUploadsRef.current.get(fileId);
        if (handle) {
          handle.abort();
          activeUploadsRef.current.delete(fileId);
          recordAction('Cancelled active file upload');
        }
        return;
      }

      if (activeUploadsRef.current.size === 0) {
        setFiles((prev) =>
          prev.map((f) =>
            f.status === 'queued'
              ? { ...f, status: 'cancelled', error: 'Cancelled by user' }
              : f
          )
        );
        return;
      }

      activeUploadsRef.current.forEach((handle) => handle.abort());
      activeUploadsRef.current.clear();
      setFiles((prev) =>
        prev.map((f) =>
          f.status === 'uploading' || f.status === 'queued'
            ? { ...f, status: 'cancelled', progress: 0, error: 'Cancelled by user' }
            : f
        )
      );
      recordAction('Cancelled active uploads');
      pushNotification('info', 'Uploads cancelled', 'Pending uploads were cancelled.');
    },
    [pushNotification, recordAction]
  );

  const retryFailedUploads = useCallback(async () => {
    const failed = filesRef.current.filter(
      (f) => f.status === 'failed' || f.status === 'cancelled'
    );
    if (failed.length === 0) {
      pushNotification('info', 'No failed uploads', 'There are no failed uploads to retry.');
      return;
    }
    await runUploadBatch(failed);
  }, [pushNotification, runUploadBatch]);

  const openFilePicker = useCallback(() => {
    if (gestureModeEnabled) {
      pushNotification(
        'info',
        'OS File Dialog Active',
        'Browser security blocks virtual cursors inside native OS dialogs. Use mouse/Enter there, or use Gesture Explorer after mounting a folder.'
      );
    }
    fileInputRef.current?.click();
  }, [gestureModeEnabled, pushNotification]);

  const openFolderPicker = useCallback(async () => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    if ('showDirectoryPicker' in window && !inIframe) {
      try {
        const rootHandle = await requestDirectoryHandle();
        setExplorerRoot({
          id: `dir:${rootHandle.name}`,
          name: rootHandle.name,
          path: rootHandle.name,
          kind: 'directory',
          dirHandle: rootHandle,
        });
        setExplorerOpen(true);
        recordAction(`Mounted folder "${rootHandle.name}" in Gesture Explorer`);
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    folderInputRef.current?.click();
  }, [recordAction]);

  const deleteHistoryRecord = useCallback(
    async (id: string) => {
      await deleteUploadHistoryRecord(id);
      await refreshHistory();
      recordAction('Deleted upload history record');
    },
    [refreshHistory, recordAction]
  );

  // Destructive action confirmation flow
  const requestRemoveSingleFile = useCallback((fileId: string) => {
    const target = filesRef.current.find((f) => f.id === fileId);
    if (!target) return;
    setContextMenu(CLOSED_CONTEXT_MENU);
    setPendingConfirmation({
      id: uid(),
      title: `Delete "${target.name}"?`,
      description:
        'This removes the file from your staging queue. Uploaded server records remain in Upload History.',
      actionType: 'REMOVE_SINGLE_FILE',
      payload: fileId,
    });
  }, []);

  const requestRemoveSelected = useCallback(() => {
    const count = filesRef.current.filter((f) => f.selected).length;
    if (count === 0) return;
    setPendingConfirmation({
      id: uid(),
      title: `Remove ${count} selected file${count > 1 ? 's' : ''}?`,
      description:
        'This removes the selected files from your local staging queue. Already uploaded server copies remain in Upload History.',
      actionType: 'REMOVE_SELECTED',
    });
  }, []);

  const requestClearAllFiles = useCallback(() => {
    if (filesRef.current.length === 0) return;
    setPendingConfirmation({
      id: uid(),
      title: 'Clear entire staging workspace?',
      description: `All ${filesRef.current.length} staged files will be removed from the queue.`,
      actionType: 'CLEAR_ALL_FILES',
    });
  }, []);

  const confirmPendingAction = useCallback(() => {
    const pending = pendingConfirmationRef.current;
    if (!pending) return;

    if (pending.actionType === 'REMOVE_SINGLE_FILE' && pending.payload) {
      removeFile(pending.payload);
    } else if (pending.actionType === 'REMOVE_SELECTED') {
      const toRemove = filesRef.current.filter((f) => f.selected);
      toRemove.forEach((f) => {
        activeUploadsRef.current.get(f.id)?.abort();
        activeUploadsRef.current.delete(f.id);
        revokeFilePreview(f);
        revokeDynamicThumbnail(f.id);
      });
      setFiles((prev) => prev.filter((f) => !f.selected));
      recordAction(`Removed ${toRemove.length} selected file(s)`);
    } else if (pending.actionType === 'CLEAR_ALL_FILES') {
      filesRef.current.forEach((f) => {
        activeUploadsRef.current.get(f.id)?.abort();
        revokeFilePreview(f);
      });
      clearAllDynamicThumbnails();
      activeUploadsRef.current.clear();
      setFiles([]);
      recordAction('Cleared staging workspace');
    } else if (pending.actionType === 'DELETE_UPLOAD_RECORD' && pending.payload) {
      void deleteHistoryRecord(pending.payload);
    }

    setPendingConfirmation(null);
  }, [deleteHistoryRecord, recordAction, removeFile]);

  const cancelPendingAction = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  // Camera & Hand Tracking Integration (Camera-only)
  const handleCameraDisconnect = useCallback(() => {
    setGestureModeEnabled(false);
    setHandDetected(false);
    setDetectedHandsCount(0);
    setPrimaryHandId(null);
    setSecondaryHandId(null);
    setHands(createEmptyHandsMap());
    setTwoHandModifiers(DEFAULT_MODIFIERS);
    setGestureState('IDLE');
    setRecognizedGesture('NONE');
    pushNotification(
      'warning',
      'Camera disconnected',
      'Gesture Mode was disabled because the camera stream ended.'
    );
  }, [pushNotification]);

  const {
    videoRef,
    stream: cameraStream,
    status: cameraStatus,
    errorMessage: cameraError,
    devices: cameraDevices,
    selectedDeviceId: selectedCameraId,
    isInIframe,
    startCamera,
    stopCamera,
    selectDevice: selectCameraDevice,
  } = useCamera(handleCameraDisconnect);

  const handleGestureStateUpdate = useCallback(
    (result: GestureFrameResult, handsCount: number) => {
      setHandDetected(result.handDetected);
      setDetectedHandsCount(handsCount);
      setPrimaryHandId(result.primaryHandId);
      setSecondaryHandId(result.secondaryHandId);
      setHands(result.hands);
      setTwoHandModifiers(result.modifiers);
      setGestureState(result.state);
      setRecognizedGesture(result.gesture);
      setGestureConfidence(result.confidence);
      setPalmOrientation(result.palmOrientation);
      setFingerStates(result.fingerStates);
      setPinchDistance(result.pinchDistance);

      if (
        result.state === 'CANCELLED' &&
        (contextMenuRef.current.open ||
          previewModalRef.current.open ||
          pendingConfirmationRef.current)
      ) {
        setContextMenu(CLOSED_CONTEXT_MENU);
        setPreviewModal(CLOSED_PREVIEW_MODAL);
        setPendingConfirmation(null);
      }
    },
    []
  );

  const triggerDomActionElement = useCallback((actionId: string) => {
    const actionEl = document.querySelector<HTMLElement>(
      `[data-gx-action="${CSS.escape(actionId)}"]`
    );
    actionEl?.click();
  }, []);

  const activateDomActionTarget = useCallback(
    (target: CursorHoverTarget, x: number, y: number): boolean => {
      const osPickerActionIds = new Set([
        'browse-files',
        'browse-folders',
        'empty-select-files',
        'ctx-browse-files',
        'ctx-browse-folders',
        'open-gesture-explorer',
      ]);
      const selectedExists = filesRef.current.some((f) => f.selected);
      if (
        (target.id && osPickerActionIds.has(target.id)) ||
        (target.id === 'primary-upload' && !selectedExists)
      ) {
        openGestureExplorer();
        return true;
      }

      if (target.id === '__dom__' && typeof document !== 'undefined') {
        const elements = document.elementsFromPoint(x, y);
        for (const el of elements) {
          if (!(el instanceof HTMLElement)) continue;
          const interactiveEl = el.closest<HTMLElement>(
            'button:not(:disabled), [role="menuitem"], [role="button"], a[href]'
          );
          if (interactiveEl) {
            interactiveEl.click();
            return true;
          }
        }
        return false;
      }

      if (target.id) {
        triggerDomActionElement(target.id);
        return true;
      }

      return false;
    },
    [openGestureExplorer, triggerDomActionElement]
  );

  const handlePinchStart = useCallback((_target: CursorHoverTarget) => {
    // Pinch start anchors cursor & enters PINCH_STARTED; discrete click waits for quick tap release
  }, []);

  const handleLeftClick = useCallback(
    (target: CursorHoverTarget, x: number, y: number) => {
      const isCtxMenuItem = Boolean(target.id?.startsWith('ctx-'));
      if (contextMenuRef.current.open && !isCtxMenuItem) {
        setContextMenu(CLOSED_CONTEXT_MENU);
        if (target.type !== 'action') return;
      }

      if (target.type === 'action' && target.id) {
        activateDomActionTarget(target, x, y);
        recordAction(`Left Click: ${target.label || target.id}`);
      } else if (target.type === 'file' && target.id) {
        toggleFileSelection(target.id);
      } else if (target.type === 'folder' && target.id) {
        selectFolder(target.id);
      }
    },
    [
      activateDomActionTarget,
      recordAction,
      selectFolder,
      toggleFileSelection,
    ]
  );

  const handleChooseSelect = useCallback(
    (target: CursorHoverTarget) => {
      if (target.type === 'file' && target.id) {
        toggleFileSelection(target.id);
      } else if (target.type === 'folder' && target.id) {
        selectFolder(target.id);
      } else if (target.type === 'action' && target.id && target.id !== '__dom__') {
        triggerDomActionElement(target.id);
      }
    },
    [selectFolder, toggleFileSelection, triggerDomActionElement]
  );

  const handleDoubleClick = useCallback(
    (target: CursorHoverTarget, x: number, y: number) => {
      setContextMenu(CLOSED_CONTEXT_MENU);
      if (target.type === 'file' && target.id) {
        selectFile(target.id);
        openFilePreview(target.id);
      } else if (target.type === 'folder' && target.id) {
        openFolderPreview(target.id);
      } else if (target.type === 'dropzone') {
        openGestureExplorer();
        recordAction('Double Click: Opened Gesture Explorer');
      } else if (target.type === 'action' && target.id) {
        activateDomActionTarget(target, x, y);
      }
    },
    [
      activateDomActionTarget,
      openFilePreview,
      openFolderPreview,
      openGestureExplorer,
      recordAction,
      selectFile,
    ]
  );

  const handleRightClick = useCallback(
    (target: CursorHoverTarget, x: number, y: number) => {
      if (target.type === 'file' && target.id) {
        openContextMenu({
          x,
          y,
          targetType: 'file',
          targetId: target.id,
          label: target.label,
        });
      } else if (target.type === 'folder' && target.id) {
        openContextMenu({
          x,
          y,
          targetType: 'folder',
          targetId: target.id,
          label: target.label,
        });
      } else if (target.type === 'dropzone') {
        openContextMenu({
          x,
          y,
          targetType: 'dropzone',
          targetId: target.id,
          label: 'Upload Drop Zone',
        });
      } else {
        openContextMenu({
          x,
          y,
          targetType: 'workspace',
          targetId: null,
          label: 'Workspace',
        });
      }
    },
    [openContextMenu]
  );

  const handleDragStart = useCallback(
    (
      target: CursorHoverTarget,
      x: number,
      y: number,
      grabSource: 'FIST' | 'PINCH' = 'PINCH'
    ) => {
      const isCtxMenuItem = Boolean(target.id?.startsWith('ctx-'));
      if (contextMenuRef.current.open && !isCtxMenuItem) {
        setContextMenu(CLOSED_CONTEXT_MENU);
      }

      if (target.type === 'file' && target.id) {
        const fileItem = filesRef.current.find((f) => f.id === target.id);
        if (!fileItem) {
          completeInstantGrabRef.current();
          return;
        }
        const selectedFiles = filesRef.current.filter((f) => f.selected);
        const batchCount =
          fileItem.selected && selectedFiles.length > 1 ? selectedFiles.length : 1;
        setDraggingItem({
          kind: 'file',
          id: target.id,
          label:
            batchCount > 1 ? `${fileItem.name} (+${batchCount - 1})` : fileItem.name,
          count: batchCount,
          grabSource,
          startX: x,
          startY: y,
        });
        recordAction(
          `Grabbed ${fileItem.name} (${grabSource === 'FIST' ? 'Closed Fist' : 'Pinch'})`
        );
        return;
      }

      if (target.type === 'folder' && target.id) {
        const folder = deriveFolderGroups(filesRef.current).find(
          (fld) => fld.id === target.id
        );
        if (!folder) {
          completeInstantGrabRef.current();
          return;
        }
        setDraggingItem({
          kind: 'folder',
          id: target.id,
          label: folder.name,
          count: folder.fileIds.length,
          grabSource,
          startX: x,
          startY: y,
        });
        recordAction(
          `Grabbed folder ${folder.name} (${grabSource === 'FIST' ? 'Closed Fist' : 'Pinch'})`
        );
        return;
      }

      if (target.type === 'overlay' && target.id) {
        setDraggingItem({
          kind: 'overlay',
          id: target.id,
          label: target.label || 'Floating Overlay',
          grabSource,
          startX: x,
          startY: y,
        });
        recordAction(`Grabbed overlay: ${target.label || target.id}`);
        return;
      }

      if (target.type === 'action' && target.explorerPath) {
        setDraggingItem({
          kind: 'explorer-node',
          id: target.id ?? target.explorerPath,
          label: target.label || 'Explorer Item',
          explorerPath: target.explorerPath,
          explorerKind: target.explorerKind ?? 'file',
          grabSource,
          startX: x,
          startY: y,
        });
        recordAction(`Grabbed ${target.label || 'item'} in Explorer`);
        return;
      }

      if (target.type === 'action') {
        if (grabSource === 'FIST') {
          if (isCtxMenuItem) {
            setContextMenu(CLOSED_CONTEXT_MENU);
          }
          activateDomActionTarget(target, x, y);
          recordAction(`Fist Choose: ${target.label || target.id || 'Control'}`);
          completeInstantGrabRef.current();
        }
        return;
      }

      // Empty space or dropzone: do not latch an empty fist drag
      if (grabSource === 'FIST') {
        completeInstantGrabRef.current();
      }
    },
    [activateDomActionTarget, recordAction]
  );

  const handleDrop = useCallback(
    (target: CursorHoverTarget, x: number, y: number) => {
      const dragged = draggingItemRef.current;
      setDraggingItem(null);

      if (!dragged) return;

      if (dragged.kind === 'overlay') {
        recordAction(`Dropped ${dragged.label} at (${Math.round(x)}, ${Math.round(y)})`);
        return;
      }

      if (dragged.kind === 'explorer-node') {
        const movedDist = Math.hypot(x - dragged.startX, y - dragged.startY);
        if (
          movedDist < 32 &&
          target.type === 'action' &&
          target.explorerPath === dragged.explorerPath
        ) {
          activateDomActionTarget(target, x, y);
          recordAction(`Chose ${dragged.label} in Explorer`);
          return;
        }
        if (dragged.explorerPath) {
          void stageExplorerPath(dragged.explorerPath);
        }
        return;
      }

      if (dragged.kind === 'file') {
        const draggedFile = filesRef.current.find((f) => f.id === dragged.id);
        if (!draggedFile) return;

        const selectedFiles = filesRef.current.filter((f) => f.selected);
        const movingFiles =
          draggedFile.selected && selectedFiles.length > 1
            ? selectedFiles
            : [draggedFile];

        if (target.type === 'folder' && target.id) {
          movingFiles.forEach((f) => moveFileToFolder(f.id, target.id!));
          pushNotification(
            'success',
            'Moved into folder',
            `${movingFiles.length} file(s) moved into "${target.label || 'Folder'}".`
          );
          return;
        }

        if (target.type === 'dropzone' && target.id === 'queue-root') {
          movingFiles.forEach((f) => moveFileOutOfFolder(f.id));
          pushNotification(
            'info',
            'Moved to workspace root',
            `${movingFiles.length} file(s) moved out of folder.`
          );
          return;
        }

        if (target.type === 'dropzone') {
          movingFiles.forEach((f) => selectFile(f.id));
          if (settings.autoUploadOnDrop) {
            void runUploadBatch(movingFiles);
          } else {
            pushNotification(
              'success',
              'Staged for upload',
              `${movingFiles.length > 1 ? `${movingFiles.length} files` : draggedFile.name} dropped onto Upload Zone.`
            );
            recordAction(`Dropped ${dragged.label} onto upload zone`);
          }
          return;
        }

        if (target.type === 'file' && target.id && target.id !== dragged.id) {
          reorderFileInQueue(dragged.id, target.id);
          return;
        }

        if (
          target.type === 'action' &&
          (target.id === 'nav-dashboard' || target.id === 'nav-files')
        ) {
          const nextTab: NavTab = target.id === 'nav-files' ? 'files' : 'dashboard';
          setActiveTab(nextTab);
          movingFiles.forEach((f) => selectFile(f.id));
          recordAction(`Moved ${dragged.label} to ${nextTab} screen`);
          return;
        }

        movingFiles.forEach((f) => selectFile(f.id));
        recordAction(`Dropped ${dragged.label} on ${activeTabRef.current} screen`);
        return;
      }

      if (dragged.kind === 'folder') {
        const folderFiles = filesRef.current.filter((f) => f.folderId === dragged.id);
        if (target.type === 'folder' && target.id && target.id !== dragged.id) {
          moveFolderToFolder(dragged.id, target.id);
          return;
        }

        if (target.type === 'dropzone' && target.id === 'queue-root') {
          folderFiles.forEach((f) => moveFileOutOfFolder(f.id));
          recordAction(`Ungrouped folder ${dragged.label} to workspace root`);
          return;
        }

        if (target.type === 'dropzone') {
          folderFiles.forEach((f) => selectFile(f.id));
          if (settings.autoUploadOnDrop && folderFiles.length > 0) {
            void runUploadBatch(folderFiles);
          } else {
            pushNotification(
              'success',
              'Folder staged for upload',
              `"${dragged.label}" (${folderFiles.length} files) dropped onto Upload Zone.`
            );
            recordAction(`Dropped folder ${dragged.label} onto upload zone`);
          }
          return;
        }

        if (
          target.type === 'action' &&
          (target.id === 'nav-dashboard' || target.id === 'nav-files')
        ) {
          const nextTab: NavTab = target.id === 'nav-files' ? 'files' : 'dashboard';
          setActiveTab(nextTab);
          folderFiles.forEach((f) => selectFile(f.id));
          recordAction(`Moved folder ${dragged.label} to ${nextTab} screen`);
          return;
        }

        folderFiles.forEach((f) => selectFile(f.id));
        recordAction(`Dropped folder ${dragged.label} on ${activeTabRef.current} screen`);
      }
    },
    [
      activateDomActionTarget,
      moveFileOutOfFolder,
      moveFileToFolder,
      moveFolderToFolder,
      pushNotification,
      recordAction,
      reorderFileInQueue,
      runUploadBatch,
      selectFile,
      settings.autoUploadOnDrop,
      stageExplorerPath,
    ]
  );

  const handleGestureCancel = useCallback(() => {
    if (draggingItemRef.current) {
      setDraggingItem(null);
      recordAction('Cancelled gesture drag');
    } else if (contextMenuRef.current.open) {
      setContextMenu(CLOSED_CONTEXT_MENU);
      recordAction('Closed context menu via gesture');
    } else if (previewModalRef.current.open) {
      setPreviewModal(CLOSED_PREVIEW_MODAL);
      recordAction('Closed preview modal via gesture');
    } else if (pendingConfirmationRef.current) {
      setPendingConfirmation(null);
      recordAction('Cancelled prompt via gesture');
    }
  }, [recordAction]);

  const handleGestureConfirm = useCallback(() => {
    if (pendingConfirmationRef.current) {
      confirmPendingAction();
      recordAction('Confirmed action via gesture');
    }
  }, [confirmPendingAction, recordAction]);

  const handleGestureReject = useCallback(() => {
    if (pendingConfirmationRef.current) {
      setPendingConfirmation(null);
      recordAction('Rejected confirmation via Thumbs Down');
    } else if (contextMenuRef.current.open) {
      setContextMenu(CLOSED_CONTEXT_MENU);
      recordAction('Dismissed menu via Thumbs Down');
    } else if (previewModalRef.current.open) {
      setPreviewModal(CLOSED_PREVIEW_MODAL);
      recordAction('Closed preview via Thumbs Down');
    } else if (filesRef.current.some((f) => f.selected)) {
      clearSelection();
      recordAction('Cleared selection (Undo) via Thumbs Down');
    }
  }, [clearSelection, recordAction]);

  const handleEmergencyStop = useCallback(() => {
    setDraggingItem(null);
    setContextMenu(CLOSED_CONTEXT_MENU);
    setGesturePaused(true);
    recordAction('Emergency Stop: Both fists paused all gesture actions');
    pushNotification(
      'warning',
      'Emergency Stop Activated',
      'Both closed fists paused all gesture interactions. Click Resume when ready.'
    );
  }, [pushNotification, recordAction]);

  const handleGestureScroll = useCallback(
    (deltaX: number, deltaY: number, scrollTarget: HTMLElement | null) => {
      if (scrollTarget) {
        scrollTarget.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
      } else {
        window.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
      }
    },
    []
  );

  const handTrackingConfig = useMemo(
    () => ({
      pinchThreshold: settings.pinchThreshold,
      releaseThreshold: settings.releaseThreshold,
      clickStabilizationMs: settings.clickStabilizationMs,
      dragActivationMs: settings.dragActivationMs,
      cooldownMs: settings.gestureCooldownMs,
      doubleClickWindowMs: settings.doubleClickWindowMs,
      gestureConfidenceThreshold: settings.gestureConfidenceThreshold,
      smoothingFactor: settings.cursorSmoothing,
      sensitivity: settings.cursorSensitivity,
      scrollSpeed: settings.scrollSpeed,
      multiHandEnabled: settings.multiHandEnabled,
      preferredPointerHand: settings.preferredPointerHand,
      mappings: settings.gestureMappings,
    }),
    [
      settings.clickStabilizationMs,
      settings.cursorSensitivity,
      settings.cursorSmoothing,
      settings.doubleClickWindowMs,
      settings.dragActivationMs,
      settings.gestureConfidenceThreshold,
      settings.gestureCooldownMs,
      settings.gestureMappings,
      settings.multiHandEnabled,
      settings.pinchThreshold,
      settings.preferredPointerHand,
      settings.releaseThreshold,
      settings.scrollSpeed,
    ]
  );

  const { modelLoading, modelError, subscribeTracking, completeInstantGrab } =
    useHandTracking({
      enabled: gestureModeEnabled,
      paused: gesturePaused,
      mirror: settings.mirrorPreview,
      videoRef,
      stream: cameraStream,
      config: handTrackingConfig,
      onGestureStateUpdate: handleGestureStateUpdate,
      onHoverTargetChange: setHoveredTarget,
      onPinchStart: handlePinchStart,
      onLeftClick: handleLeftClick,
      onDoubleClick: handleDoubleClick,
      onRightClick: handleRightClick,
      onChooseSelect: handleChooseSelect,
      onDragStart: handleDragStart,
      onDrop: handleDrop,
      onCancel: handleGestureCancel,
      onConfirm: handleGestureConfirm,
      onReject: handleGestureReject,
      onEmergencyStop: handleEmergencyStop,
      onScroll: handleGestureScroll,
    });

  completeInstantGrabRef.current = completeInstantGrab;

  // Live AR/VR carry loop: stream overlay reposition deltas + auto-switch screens when
  // hovering nav tabs while carrying a file or folder.
  useEffect(() => {
    if (!gestureModeEnabled || !draggingItem) return;

    let prevX = draggingItem.startX;
    let prevY = draggingItem.startY;
    let navHoverId: string | null = null;
    let navHoverSinceMs = 0;

    return subscribeTracking((snapshot) => {
      if (draggingItem.kind === 'overlay') {
        const dx = snapshot.cursorX - prevX;
        const dy = snapshot.cursorY - prevY;
        prevX = snapshot.cursorX;
        prevY = snapshot.cursorY;
        if (dx !== 0 || dy !== 0) {
          window.dispatchEvent(
            new CustomEvent('gx:move-overlay', {
              detail: { id: draggingItem.id, dx, dy },
            })
          );
        }
        return;
      }

      if (draggingItem.kind === 'file' || draggingItem.kind === 'folder') {
        const t = snapshot.hoverTarget;
        const isNavTarget =
          t.type === 'action' && (t.id === 'nav-dashboard' || t.id === 'nav-files');
        if (isNavTarget && t.id) {
          if (navHoverId !== t.id) {
            navHoverId = t.id;
            navHoverSinceMs = performance.now();
          } else if (performance.now() - navHoverSinceMs >= 380) {
            const nextTab: NavTab = t.id === 'nav-files' ? 'files' : 'dashboard';
            if (activeTabRef.current !== nextTab) {
              setActiveTab(nextTab);
              recordAction(`Switched to ${nextTab} screen while carrying item`);
            }
            navHoverSinceMs = performance.now() + 999999;
          }
        } else {
          navHoverId = null;
          navHoverSinceMs = 0;
        }
      }
    });
  }, [draggingItem, gestureModeEnabled, recordAction, subscribeTracking]);

  const toggleGestureMode = useCallback(async () => {
    if (gestureModeEnabled) {
      stopCamera();
      setGestureModeEnabled(false);
      setGesturePaused(false);
      setHandDetected(false);
      setDetectedHandsCount(0);
      setPrimaryHandId(null);
      setSecondaryHandId(null);
      setHands(createEmptyHandsMap());
      setTwoHandModifiers(DEFAULT_MODIFIERS);
      setGestureState('IDLE');
      setRecognizedGesture('NONE');
      setDraggingItem(null);
      setHoveredTarget({ type: null, id: null });
      recordAction('Disabled Gesture Mode');
    } else {
      const ok = await startCamera();
      if (ok) {
        setGestureModeEnabled(true);
        setGesturePaused(false);
        recordAction('Enabled Gesture Mode (Webcam + MediaPipe)');
      }
    }
  }, [gestureModeEnabled, recordAction, startCamera, stopCamera]);

  const retryCamera = useCallback(async () => {
    const ok = await startCamera();
    if (ok) {
      setGestureModeEnabled(true);
      setGesturePaused(false);
      recordAction('Connected camera for Gesture Mode');
    }
  }, [recordAction, startCamera]);

  const pauseGestureMode = useCallback(() => {
    setGesturePaused(true);
    setDraggingItem(null);
    setContextMenu(CLOSED_CONTEXT_MENU);
    recordAction('Paused gesture interactions');
  }, [recordAction]);

  const resumeGestureMode = useCallback(() => {
    setGesturePaused(false);
    recordAction('Resumed gesture interactions');
  }, [recordAction]);

  const swapHandRoles = useCallback(() => {
    const nextPref =
      settings.preferredPointerHand === 'left' ? 'right' : 'left';
    updateSettings({ preferredPointerHand: nextPref });
    recordAction(
      `Swapped hand roles: ${nextPref === 'left' ? 'Left' : 'Right'} primary pointer`
    );
  }, [recordAction, settings.preferredPointerHand, updateSettings]);

  // Voice Recognition + Combined Voice/Gesture Action Dispatcher
  const speakRef = useRef<(text: string) => void>(() => undefined);

  const respondVoice = useCallback(
    (message: string, intent?: VoiceLogEntry['intent']) => {
      appendVoiceLog('assistant', message, intent);
      speakRef.current(message);
    },
    [appendVoiceLog]
  );

  const dispatchVoiceCommand = useCallback(
    (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      appendVoiceLog('user', trimmed);
      const parsed = parseVoiceCommand(trimmed);

      if (parsed.ambiguous && parsed.clarificationPrompt) {
        respondVoice(parsed.clarificationPrompt, parsed.intent);
        return;
      }

      const hovered = hoveredTargetRef.current;

      switch (parsed.intent) {
        case 'NAV_DASHBOARD':
          setActiveTab('dashboard');
          respondVoice('Opening dashboard.', parsed.intent);
          recordAction('Voice: Navigated to Dashboard');
          break;

        case 'OPEN_FILE_MANAGER':
        case 'NAV_FILES':
          setActiveTab('files');
          respondVoice('Opening file manager.', parsed.intent);
          recordAction('Voice: Navigated to Files');
          break;

        case 'NAV_HISTORY':
          setActiveTab('history');
          respondVoice('Opening upload history.', parsed.intent);
          recordAction('Voice: Navigated to Upload History');
          break;

        case 'NAV_SETTINGS':
          setActiveTab('settings');
          respondVoice('Opening settings.', parsed.intent);
          recordAction('Voice: Navigated to Settings');
          break;

        case 'BROWSE_FILES':
          openFilePicker();
          respondVoice('Opening file picker.', parsed.intent);
          recordAction('Voice: Opened file picker');
          break;

        case 'BROWSE_FOLDERS':
          void openFolderPicker();
          respondVoice('Opening folder picker.', parsed.intent);
          recordAction('Voice: Opened folder picker');
          break;

        case 'SELECT_ALL':
          if (filesRef.current.length === 0) {
            respondVoice('There are no staged files to select yet.', parsed.intent);
          } else {
            selectAllFiles();
            respondVoice(
              `Selected all ${filesRef.current.length} files.`,
              parsed.intent
            );
          }
          break;

        case 'CLEAR_SELECTION':
          clearSelection();
          respondVoice('Cleared your file selection.', parsed.intent);
          break;

        case 'SHOW_SELECTED':
          setActiveTab('files');
          setFileFilter('selected');
          respondVoice(
            `Showing ${filesRef.current.filter((f) => f.selected).length} selected file(s).`,
            parsed.intent
          );
          break;

        case 'SELECT_TARGET':
          if (hovered.type === 'file' && hovered.id) {
            selectFile(hovered.id);
            const item = filesRef.current.find((f) => f.id === hovered.id);
            respondVoice(
              `Selected ${item?.name ?? 'pointed file'}.`,
              parsed.intent
            );
          } else if (hovered.type === 'folder' && hovered.id) {
            selectFolder(hovered.id);
            respondVoice('Toggled folder selection.', parsed.intent);
          } else {
            respondVoice(
              'Point at a file with your hand cursor first, or say "select all files".',
              parsed.intent
            );
          }
          break;

        case 'REMOVE_TARGET':
          if (hovered.type === 'file' && hovered.id) {
            const item = filesRef.current.find((f) => f.id === hovered.id);
            removeFile(hovered.id);
            respondVoice(
              `Removed ${item?.name ?? 'that file'}.`,
              parsed.intent
            );
          } else if (filesRef.current.some((f) => f.selected)) {
            requestRemoveSelected();
            respondVoice(
              'Say "confirm" or click Confirm to remove the selected files.',
              parsed.intent
            );
          } else {
            respondVoice(
              'No file is pointed at or selected to remove.',
              parsed.intent
            );
          }
          break;

        case 'UPLOAD_SELECTED': {
          const selected = filesRef.current.filter((f) => f.selected);
          if (selected.length === 0) {
            respondVoice(
              'No files are currently selected. Select files first using pinch or click.',
              parsed.intent
            );
          } else {
            respondVoice(
              `Uploading ${selected.length} selected file${selected.length > 1 ? 's' : ''} now.`,
              parsed.intent
            );
            void uploadSelectedFiles().then(() => {
              appendVoiceLog('assistant', 'Selected file uploads finished.');
            });
          }
          break;
        }

        case 'UPLOAD_ALL':
          if (filesRef.current.length === 0) {
            respondVoice('No files are staged for upload.', parsed.intent);
          } else {
            respondVoice(
              `Uploading all ${filesRef.current.length} staged files now.`,
              parsed.intent
            );
            void uploadAllFiles();
          }
          break;

        case 'CANCEL_UPLOAD':
          cancelUpload();
          respondVoice('Cancelling active uploads.', parsed.intent);
          break;

        case 'RETRY_FAILED':
          respondVoice('Retrying failed uploads.', parsed.intent);
          void retryFailedUploads();
          break;

        case 'SHOW_PROGRESS': {
          const uploading = filesRef.current.filter((f) => f.status === 'uploading').length;
          const uploaded = filesRef.current.filter((f) => f.status === 'uploaded').length;
          const failed = filesRef.current.filter((f) => f.status === 'failed').length;
          respondVoice(
            `${uploading} uploading, ${uploaded} completed, and ${failed} failed in the current session.`,
            parsed.intent
          );
          break;
        }

        case 'PAUSE_GESTURE':
          pauseGestureMode();
          respondVoice('Gesture interactions paused.', parsed.intent);
          break;

        case 'RESUME_GESTURE':
          resumeGestureMode();
          respondVoice('Gesture interactions resumed.', parsed.intent);
          break;

        case 'QUERY_SELECTED': {
          const selected = filesRef.current.filter((f) => f.selected);
          if (selected.length === 0) {
            respondVoice('No files are currently selected.', parsed.intent);
          } else {
            const names = selected
              .slice(0, 3)
              .map((f) => f.name)
              .join(', ');
            const extra =
              selected.length > 3 ? ` and ${selected.length - 3} more` : '';
            respondVoice(
              `${selected.length} file(s) selected: ${names}${extra}.`,
              parsed.intent
            );
          }
          break;
        }

        case 'QUERY_UPLOADED':
          respondVoice(
            `${storageStats.totalFiles} file(s) have been uploaded to storage.`,
            parsed.intent
          );
          break;

        case 'HELP':
          respondVoice(
            'You can say: Browse files, Select all files, Select this while pointing, Upload selected files, Cancel upload, Pause gesture control, Open upload history, or Go to settings.',
            parsed.intent
          );
          break;

        case 'CONFIRM':
          if (pendingConfirmationRef.current) {
            confirmPendingAction();
            respondVoice('Action confirmed.', parsed.intent);
          } else {
            respondVoice('There is no pending confirmation right now.', parsed.intent);
          }
          break;

        case 'CANCEL_ACTION':
          if (pendingConfirmationRef.current) {
            cancelPendingAction();
            respondVoice('Cancelled pending action.', parsed.intent);
          } else {
            respondVoice('Nothing to cancel.', parsed.intent);
          }
          break;

        default:
          respondVoice(
            `I didn't recognize "${trimmed}". Say "What can you do?" for supported commands.`,
            'UNKNOWN'
          );
      }
    },
    [
      appendVoiceLog,
      cancelPendingAction,
      cancelUpload,
      clearSelection,
      confirmPendingAction,
      openFilePicker,
      openFolderPicker,
      pauseGestureMode,
      recordAction,
      removeFile,
      requestRemoveSelected,
      respondVoice,
      resumeGestureMode,
      retryFailedUploads,
      selectAllFiles,
      selectFile,
      selectFolder,
      storageStats.totalFiles,
      uploadAllFiles,
      uploadSelectedFiles,
    ]
  );

  const {
    supported: voiceSupported,
    permissionStatus: voicePermission,
    listeningStatus: voiceListeningStatus,
    interimTranscript,
    errorMessage: voiceError,
    startListening,
    stopListening,
    speak,
  } = useVoiceRecognition({
    voiceFeedbackEnabled: settings.voiceFeedbackEnabled,
    onTranscriptCommand: dispatchVoiceCommand,
    onErrorNotification: (msg) => {
      appendVoiceLog('error', msg);
    },
  });

  speakRef.current = speak;

  const toggleVoiceMode = useCallback(async () => {
    if (voiceModeEnabled) {
      stopListening();
      setVoiceModeEnabled(false);
      recordAction('Disabled Voice Mode');
    } else {
      const started = await startListening();
      if (started) {
        setVoiceModeEnabled(true);
        recordAction('Enabled Voice Mode');
        speak('Voice assistant active.');
      } else {
        setVoiceModeEnabled(false);
      }
    }
  }, [recordAction, speak, startListening, stopListening, voiceModeEnabled]);

  const value: AppContextValue = {
    activeTab,
    navigate: setActiveTab,
    fileFilter,
    setFileFilter,
    files,
    folders,
    selectedCount,
    uploadHistory,
    storageStats,
    historyLoading,
    fileInputRef,
    folderInputRef,
    addFiles,
    openFilePicker,
    openFolderPicker,
    selectFile,
    deselectFile,
    toggleFileSelection,
    selectFolder,
    selectAllFiles,
    clearSelection,
    removeFile,
    requestRemoveSingleFile,
    renameFile,
    downloadFile,
    requestRemoveSelected,
    requestClearAllFiles,
    moveFileToFolder,
    moveFileOutOfFolder,
    moveFolderToFolder,
    reorderFileInQueue,
    uploadSingleFile,
    uploadSelectedFiles,
    uploadAllFiles,
    cancelUpload,
    retryFailedUploads,
    refreshHistory,
    deleteHistoryRecord,
    gestureModeEnabled,
    gesturePaused,
    cameraStatus,
    cameraError,
    cameraDevices,
    selectedCameraId,
    isInIframe,
    selectCameraDevice,
    videoRef,
    cameraStream,
    modelLoading,
    modelError,
    handDetected,
    detectedHandsCount,
    primaryHandId,
    secondaryHandId,
    hands,
    twoHandModifiers,
    gestureState,
    recognizedGesture,
    gestureConfidence,
    palmOrientation,
    fingerStates,
    pinchDistance,
    hoveredTarget,
    draggingFileId,
    draggingItem,
    toggleGestureMode,
    retryCamera,
    pauseGestureMode,
    resumeGestureMode,
    swapHandRoles,
    subscribeTracking,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    previewModal,
    openFilePreview,
    openFolderPreview,
    closePreviewModal,
    renameModal,
    openRenameModal,
    closeRenameModal,
    explorerOpen,
    explorerRoot,
    openGestureExplorer,
    closeGestureExplorer,
    mountFolderTreeFromEntries,
    voiceModeEnabled,
    voiceSupported,
    voicePermission,
    voiceListeningStatus,
    voiceError,
    interimTranscript,
    voiceLogs,
    recentActions,
    toggleVoiceMode,
    dispatchVoiceCommand,
    settings,
    updateSettings,
    updateGestureMapping,
    applyGesturePreset,
    resetGestureMappings,
    notifications,
    dismissNotification,
    pendingConfirmation,
    confirmPendingAction,
    cancelPendingAction,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppStore must be used inside AppProvider');
  }
  return ctx;
}
