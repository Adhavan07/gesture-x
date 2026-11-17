export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureType =
  | 'NONE'
  | 'POINTING'
  | 'PINCH'
  | 'MIDDLE_PINCH'
  | 'RING_PINCH'
  | 'OPEN_PALM'
  | 'FIST'
  | 'THUMBS_UP'
  | 'THUMBS_DOWN'
  | 'TWO_FINGER'
  | 'THREE_FINGER';

export type GestureTrigger =
  | 'INDEX_PINCH'
  | 'DOUBLE_INDEX_PINCH'
  | 'MIDDLE_PINCH'
  | 'DOUBLE_MIDDLE_PINCH'
  | 'RING_PINCH'
  | 'TWO_FINGER'
  | 'THREE_FINGER'
  | 'OPEN_PALM'
  | 'FIST'
  | 'THUMBS_UP'
  | 'THUMBS_DOWN';

export type MouseActionType =
  | 'LEFT_CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'CHOOSE_SELECT'
  | 'DRAG_DROP'
  | 'RIGHT_BUTTON_HOLD'
  | 'SCROLL'
  | 'PAUSE_TRACKING'
  | 'CANCEL_ACTION'
  | 'CONFIRM_ACTION'
  | 'REJECT_ACTION';

export type GestureMappingConfig = Record<MouseActionType, GestureTrigger>;

/**
 * Recommended Virtual Mouse Default Mapping:
 * Non-overlapping discrete assignments so every mouse operation is unambiguous.
 * - Index Finger Pointing: Move Cursor
 * - Thumb + Middle Pinch (tap): Left Click | (2x rapid): Double Click | (hold): Drag & Drop
 * - Thumb + Index Pinch (tap): Right Click | (hold): Right-Button Hold
 * - Three Fingers Up: Choose / Multi-Select
 * - Two Fingers Extended: Vertical & Horizontal Scroll
 * - Open Palm: Pause | Closed Fist: Cancel | Thumbs Up: Confirm | Thumbs Down: Reject/Undo
 */
export const DEFAULT_GESTURE_MAPPINGS: GestureMappingConfig = {
  LEFT_CLICK: 'MIDDLE_PINCH',
  DOUBLE_CLICK: 'DOUBLE_MIDDLE_PINCH',
  RIGHT_CLICK: 'INDEX_PINCH',
  CHOOSE_SELECT: 'THREE_FINGER',
  DRAG_DROP: 'MIDDLE_PINCH',
  RIGHT_BUTTON_HOLD: 'INDEX_PINCH',
  SCROLL: 'TWO_FINGER',
  PAUSE_TRACKING: 'OPEN_PALM',
  CANCEL_ACTION: 'FIST',
  CONFIRM_ACTION: 'THUMBS_UP',
  REJECT_ACTION: 'THUMBS_DOWN',
};

export type PointerHandPreference = 'auto' | 'left' | 'right';

export type GesturePresetId = 'virtual_mouse' | 'classic_index' | 'one_handed';

export const GESTURE_PRESETS: Array<{
  id: GesturePresetId;
  label: string;
  summary: string;
  mappings: GestureMappingConfig;
}> = [
  {
    id: 'virtual_mouse',
    label: 'Two-Hand Virtual Mouse',
    summary:
      'Middle pinch for Left Click/Drag/2x-Click, Index pinch for Right Click/Hold, Two-finger 2D scroll.',
    mappings: { ...DEFAULT_GESTURE_MAPPINGS },
  },
  {
    id: 'classic_index',
    label: 'Classic Index Pinch',
    summary:
      'Index pinch for Left Click & Drag, Double Index Pinch for Double Click, Middle pinch for Right Click.',
    mappings: {
      LEFT_CLICK: 'INDEX_PINCH',
      DOUBLE_CLICK: 'DOUBLE_INDEX_PINCH',
      RIGHT_CLICK: 'MIDDLE_PINCH',
      CHOOSE_SELECT: 'THREE_FINGER',
      DRAG_DROP: 'INDEX_PINCH',
      RIGHT_BUTTON_HOLD: 'RING_PINCH',
      SCROLL: 'TWO_FINGER',
      PAUSE_TRACKING: 'OPEN_PALM',
      CANCEL_ACTION: 'FIST',
      CONFIRM_ACTION: 'THUMBS_UP',
      REJECT_ACTION: 'THUMBS_DOWN',
    },
  },
  {
    id: 'one_handed',
    label: 'Low-Strain One-Hand',
    summary:
      'Index pinch Left Click/Drag with Three-Finger Right Click and Thumbs-Up Selection to minimize strain.',
    mappings: {
      LEFT_CLICK: 'INDEX_PINCH',
      DOUBLE_CLICK: 'DOUBLE_INDEX_PINCH',
      RIGHT_CLICK: 'THREE_FINGER',
      CHOOSE_SELECT: 'THUMBS_UP',
      DRAG_DROP: 'INDEX_PINCH',
      RIGHT_BUTTON_HOLD: 'MIDDLE_PINCH',
      SCROLL: 'TWO_FINGER',
      PAUSE_TRACKING: 'OPEN_PALM',
      CANCEL_ACTION: 'FIST',
      CONFIRM_ACTION: 'RING_PINCH',
      REJECT_ACTION: 'THUMBS_DOWN',
    },
  },
];

export const GESTURE_TRIGGER_LABELS: Record<GestureTrigger, string> = {
  INDEX_PINCH: 'Thumb + Index Pinch',
  DOUBLE_INDEX_PINCH: 'Double Thumb + Index Pinch',
  MIDDLE_PINCH: 'Thumb + Middle Pinch',
  DOUBLE_MIDDLE_PINCH: 'Double Thumb + Middle Pinch',
  RING_PINCH: 'Thumb + Ring Pinch',
  TWO_FINGER: 'Two Fingers (Index + Middle)',
  THREE_FINGER: 'Three Fingers Up',
  OPEN_PALM: 'Open Palm (All Five)',
  FIST: 'Closed Fist',
  THUMBS_UP: 'Thumbs Up',
  THUMBS_DOWN: 'Thumbs Down',
};

export const MOUSE_ACTION_META: Array<{
  action: MouseActionType;
  label: string;
  description: string;
  mode: 'click' | 'hold' | 'continuous' | 'control';
}> = [
  {
    action: 'LEFT_CLICK',
    label: 'Left Click',
    description: 'Pinch & release to click buttons, tabs, menus, or toggle selection.',
    mode: 'click',
  },
  {
    action: 'DOUBLE_CLICK',
    label: 'Double Click',
    description: 'Two rapid pinch cycles to open full file preview or folder contents.',
    mode: 'click',
  },
  {
    action: 'RIGHT_CLICK',
    label: 'Right Click',
    description: 'Pinch & release to open the floating context menu at cursor.',
    mode: 'click',
  },
  {
    action: 'CHOOSE_SELECT',
    label: 'Choosing / Multi-Select',
    description: 'Toggle multi-selection on hovered files or folders.',
    mode: 'click',
  },
  {
    action: 'DRAG_DROP',
    label: 'Drag & Drop (Left Hold)',
    description: 'Hold pinch to pick up a file and release over Upload Zone or Folder.',
    mode: 'hold',
  },
  {
    action: 'RIGHT_BUTTON_HOLD',
    label: 'Right-Button Hold',
    description: 'Sustain pinch to hold right button / sticky context inspection.',
    mode: 'hold',
  },
  {
    action: 'SCROLL',
    label: 'Scroll (Vertical & Horizontal)',
    description: 'Move extended two fingers up/down or left/right to scroll panels.',
    mode: 'continuous',
  },
  {
    action: 'PAUSE_TRACKING',
    label: 'Pause Cursor',
    description: 'Temporarily pause gesture actions without turning off camera.',
    mode: 'control',
  },
  {
    action: 'CANCEL_ACTION',
    label: 'Cancel / Escape',
    description: 'Cancel active drag or dismiss an open context menu or modal.',
    mode: 'control',
  },
  {
    action: 'CONFIRM_ACTION',
    label: 'Confirm Prompt',
    description: 'Confirm destructive delete or pending confirmation modal.',
    mode: 'control',
  },
  {
    action: 'REJECT_ACTION',
    label: 'Reject / Undo',
    description: 'Reject pending prompt, close modal, or undo recent staging change.',
    mode: 'control',
  },
];

export type GestureState =
  | 'IDLE'
  | 'POINTING'
  | 'LEFT_CLICK'
  | 'RIGHT_CLICK'
  | 'DOUBLE_CLICK'
  | 'PINCH_STARTED'
  | 'DRAGGING'
  | 'RIGHT_BUTTON_HOLD'
  | 'DROPPING'
  | 'SCROLLING'
  | 'MULTI_SELECT'
  | 'PAUSED'
  | 'CANCELLED';

export type PalmOrientation = 'front' | 'back' | 'side';

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export type GestureEventType =
  | 'PINCH_START'
  | 'LEFT_CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'RIGHT_HOLD_START'
  | 'RIGHT_HOLD_END'
  | 'CHOOSE_SELECT'
  | 'DRAG_START'
  | 'DROP'
  | 'CANCEL'
  | 'CONFIRM'
  | 'REJECT'
  | 'EMERGENCY_STOP'
  | 'SCROLL';

export type HandSide = 'left' | 'right';
export type HandId = 'hand-left' | 'hand-right';

export interface TrackedHandInput {
  landmarks: Landmark[];
  handedness?: string;
  handednessScore?: number;
}

export interface TrackedHandState {
  id: HandId;
  side: HandSide;
  detected: boolean;
  landmarks: Landmark[];
  palmCenter: { x: number; y: number };
  gesture: GestureType;
  stableGesture: GestureType;
  confidence: number;
  palmOrientation: PalmOrientation;
  fingerStates: FingerStates;
  pinchDistance: number;
  cursorNormalized: { x: number; y: number };
  isPrimary: boolean;
  role: 'primary' | 'secondary' | 'none';
}

export type HandsMap = Record<HandSide, TrackedHandState>;

export interface TwoHandModifierState {
  cursorFrozen: boolean;
  multiSelectActive: boolean;
  secondaryScrollActive: boolean;
  bothHandsOpenPause: boolean;
  emergencyStopActive: boolean;
  activeModifierLabel: string | null;
}

export interface GestureFrameResult {
  state: GestureState;
  gesture: GestureType;
  confidence: number;
  handDetected: boolean;
  palmOrientation: PalmOrientation;
  fingerStates: FingerStates;
  cursorNormalized: { x: number; y: number };
  pinchDistance: number;
  primaryHandId: HandId | null;
  secondaryHandId: HandId | null;
  multiHandEnabled: boolean;
  hands: HandsMap;
  modifiers: TwoHandModifierState;
  event?: GestureEventType;
  scrollDeltaY?: number;
  scrollDeltaX?: number;
  secondaryEvent?: GestureEventType;
  secondaryScrollDeltaY?: number;
  secondaryScrollDeltaX?: number;
}

export interface GestureConfig {
  pinchThreshold: number;
  releaseThreshold: number;
  stabilityFrames: number;
  clickStabilizationMs: number;
  dragEngageFrames: number;
  dragActivationMs: number;
  cooldownMs: number;
  doubleClickWindowMs: number;
  scrollSpeed: number;
  deadZone: number;
  smoothingFactor: number;
  sensitivity: number;
  trackingLossGraceFrames: number;
  handDetectionConfidence: number;
  gestureConfidenceThreshold: number;
  multiHandEnabled: boolean;
  preferredPointerHand: PointerHandPreference;
  mappings: GestureMappingConfig;
}

export type CameraPermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
