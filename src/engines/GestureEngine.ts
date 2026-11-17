export {
  DEFAULT_CALIBRATION as DEFAULT_GESTURE_CONFIG,
  mergeCalibration,
} from './virtualMouse/GestureCalibration.ts';
export {
  DualHandTracker,
  createEmptyHandsMap,
  createEmptyTrackedHand,
  mapDetectedHandsToIds,
} from './virtualMouse/DualHandTracker.ts';
export { HandRoleManager } from './virtualMouse/HandRoleManager.ts';
export { TwoHandModifierEngine } from './virtualMouse/TwoHandModifierEngine.ts';
export { GestureStateMachine } from './virtualMouse/GestureStateMachine.ts';
export { MouseActionDispatcher } from './virtualMouse/MouseActionDispatcher.ts';
export { VirtualMouseEngine as GestureEngine } from './virtualMouse/VirtualMouseEngine.ts';
export { VirtualMouseEngine } from './virtualMouse/VirtualMouseEngine.ts';
