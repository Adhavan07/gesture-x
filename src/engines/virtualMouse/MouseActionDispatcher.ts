import type { CursorHoverTarget } from '../../types/app.ts';
import type { GestureEventType, GestureFrameResult } from '../../types/gesture.ts';

export interface MouseActionHandlers {
  onPinchStart: (target: CursorHoverTarget) => void;
  onLeftClick: (target: CursorHoverTarget, x: number, y: number) => void;
  onDoubleClick: (target: CursorHoverTarget, x: number, y: number) => void;
  onRightClick: (target: CursorHoverTarget, x: number, y: number) => void;
  onChooseSelect: (target: CursorHoverTarget) => void;
  onDragStart: (target: CursorHoverTarget) => void;
  onDrop: (target: CursorHoverTarget) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onEmergencyStop: () => void;
  onScroll: (
    deltaX: number,
    deltaY: number,
    scrollTarget: HTMLElement | null
  ) => void;
}

export class MouseActionDispatcher {
  public dispatchEvent(
    event: GestureEventType | undefined,
    options: {
      hover: CursorHoverTarget;
      cursorX: number;
      cursorY: number;
      scrollDeltaX?: number;
      scrollDeltaY?: number;
      findScrollableElement: (x: number, y: number) => HTMLElement | null;
      handlers: MouseActionHandlers;
    }
  ): void {
    if (!event) return;
    const {
      hover,
      cursorX,
      cursorY,
      scrollDeltaX = 0,
      scrollDeltaY = 0,
      findScrollableElement,
      handlers,
    } = options;

    switch (event) {
      case 'PINCH_START':
        handlers.onPinchStart(hover);
        break;
      case 'LEFT_CLICK':
        handlers.onLeftClick(hover, cursorX, cursorY);
        break;
      case 'DOUBLE_CLICK':
        handlers.onDoubleClick(hover, cursorX, cursorY);
        break;
      case 'RIGHT_CLICK':
      case 'RIGHT_HOLD_START':
        handlers.onRightClick(hover, cursorX, cursorY);
        break;
      case 'CHOOSE_SELECT':
        handlers.onChooseSelect(hover);
        break;
      case 'DRAG_START':
        handlers.onDragStart(hover);
        break;
      case 'DROP':
        handlers.onDrop(hover);
        break;
      case 'CANCEL':
        handlers.onCancel();
        break;
      case 'CONFIRM':
        handlers.onConfirm();
        break;
      case 'REJECT':
        handlers.onReject();
        break;
      case 'EMERGENCY_STOP':
        handlers.onEmergencyStop();
        break;
      case 'SCROLL':
        if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
          const scrollEl = findScrollableElement(cursorX, cursorY);
          handlers.onScroll(scrollDeltaX, scrollDeltaY, scrollEl);
        }
        break;
      default:
        break;
    }
  }

  public dispatchFrame(
    frameResult: GestureFrameResult,
    options: {
      hover: CursorHoverTarget;
      cursorX: number;
      cursorY: number;
      findScrollableElement: (x: number, y: number) => HTMLElement | null;
      handlers: MouseActionHandlers;
    }
  ): void {
    this.dispatchEvent(frameResult.event, {
      ...options,
      scrollDeltaX: frameResult.scrollDeltaX,
      scrollDeltaY: frameResult.scrollDeltaY,
    });

    if (
      frameResult.secondaryEvent &&
      frameResult.secondaryEvent !== frameResult.event
    ) {
      this.dispatchEvent(frameResult.secondaryEvent, {
        ...options,
        scrollDeltaX: frameResult.secondaryScrollDeltaX,
        scrollDeltaY: frameResult.secondaryScrollDeltaY,
      });
    }
  }
}
