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
  | 'GRAB_CHOOSE'
  | 'DROP_RELEASE'
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

export const GESTURE_MAPPING_VERSION = 2;

/**
 * Default AR/VR Virtual Mouse Mapping:
 * - Index Finger Pointing: Move Cursor
 * - Thumb + Index Pinch (on meet): Left Click | (2x rapid): Double Click
 * - Thumb + Middle Pinch (on meet): Right Click
 * - Closed Fist: AR/VR Grab, Choose & Drag files, folders, or overlays
 * - Open Palm: Drop carried file/folder/overlay at current screen or target
 * - Three Fingers Up: Choose / Multi-Select
 * - Two Fingers Extended: Vertical & Horizontal Scroll
 * - Ring Pinch: Single-Hand Pause | Thumbs Up: Confirm | Thumbs Down: Cancel / Reject / Undo
 */
export const DEFAULT_GESTURE_MAPPINGS: GestureMappingConfig = {
  GRAB_CHOOSE: 'FIST',
  DROP_RELEASE: 'OPEN_PALM',
  LEFT_CLICK: 'INDEX_PINCH',
  DOUBLE_CLICK: 'DOUBLE_INDEX_PINCH',
  RIGHT_CLICK: 'MIDDLE_PINCH',
  CHOOSE_SELECT: 'THREE_FINGER',
  DRAG_DROP: 'FIST',
  RIGHT_BUTTON_HOLD: 'RING_PINCH',
  SCROLL: 'TWO_FINGER',
  PAUSE_TRACKING: 'RING_PINCH',
  CANCEL_ACTION: 'THUMBS_DOWN',
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
    label: 'AR/VR Virtual Mouse',
    summary:
      'Thumb+Index pinch for instant Left Click (2x Double-Click), Thumb+Middle pinch for instant Right Click, Closed Fist Grab/Drag & Open Palm Drop.',
    mappings: { ...DEFAULT_GESTURE_MAPPINGS },
  },
  {
    id: 'classic_index',
    label: 'Pinch-to-Drag Classic',
    summary:
      'Thumb+Index pinch for Left Click / Hold-to-Drag, Thumb+Middle pinch for Right Click, plus Closed Fist Grab & Open Palm Drop.',
    mappings: {
      GRAB_CHOOSE: 'FIST',
      DROP_RELEASE: 'OPEN_PALM',
      LEFT_CLICK: 'INDEX_PINCH',
      DOUBLE_CLICK: 'DOUBLE_INDEX_PINCH',
      RIGHT_CLICK: 'MIDDLE_PINCH',
      CHOOSE_SELECT: 'THREE_FINGER',
      DRAG_DROP: 'INDEX_PINCH',
      RIGHT_BUTTON_HOLD: 'RING_PINCH',
      SCROLL: 'TWO_FINGER',
      PAUSE_TRACKING: 'RING_PINCH',
      CANCEL_ACTION: 'THUMBS_DOWN',
      CONFIRM_ACTION: 'THUMBS_UP',
      REJECT_ACTION: 'THUMBS_DOWN',
    },
  },
  {
    id: 'one_handed',
    label: 'Low-Strain One-Hand',
    summary:
      'Thumb+Index Left Click, Three-Finger Right Click, Thumbs-Up Selection, Closed Fist Grab/Drag & Open Palm Drop.',
    mappings: {
      GRAB_CHOOSE: 'FIST',
      DROP_RELEASE: 'OPEN_PALM',
      LEFT_CLICK: 'INDEX_PINCH',
      DOUBLE_CLICK: 'DOUBLE_INDEX_PINCH',
      RIGHT_CLICK: 'THREE_FINGER',
      CHOOSE_SELECT: 'THUMBS_UP',
      DRAG_DROP: 'FIST',
      RIGHT_BUTTON_HOLD: 'RING_PINCH',
      SCROLL: 'TWO_FINGER',
      PAUSE_TRACKING: 'RING_PINCH',
      CANCEL_ACTION: 'THUMBS_DOWN',
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
    action: 'GRAB_CHOOSE',
    label: 'AR/VR Grab & Choose',
    description:
      'Close hand into a fist to choose any UI/overlay item or grab a file/folder/overlay to move at will.',
    mode: 'hold',
  },
  {
    action: 'DROP_RELEASE',
    label: 'Open-Palm Drop',
    description:
      'Open palm to drop the carried file, folder, or overlay onto any screen or target.',
    mode: 'control',
  },
  {
    action: 'LEFT_CLICK',
    label: 'Left Click',
    description:
      'Fires immediately when thumb and index tips meet to click buttons, tabs, menus, or toggle selection.',
    mode: 'click',
  },
  {
    action: 'DOUBLE_CLICK',
    label: 'Double Click',
    description: 'Two rapid pinches to open full file preview or folder contents.',
    mode: 'click',
  },
  {
    action: 'RIGHT_CLICK',
    label: 'Right Click',
    description:
      'Fires immediately when thumb and middle tips meet to open the floating context menu at cursor.',
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
    label: 'Drag & Drop (Hold)',
    description: 'Hold gesture (Closed Fist by default) to carry items and release with Open Palm.',
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
  grabSource?: 'FIST' | 'PINCH';
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
