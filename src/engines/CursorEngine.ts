import type { CursorHoverTarget } from '../types/app.ts';
import {
  applyDeadZone,
  mapNormalizedToViewport,
  normalizeWebcamPoint,
  smoothCursorAdaptive,
  type Point2D,
} from '../utils/cursorMapping.ts';

export class CursorEngine {
  private currentNorm: Point2D = { x: 0.5, y: 0.5 };
  private currentViewport: Point2D = { x: 0, y: 0 };
  private initialized = false;

  public update(
    rawNormX: number,
    rawNormY: number,
    options: {
      mirror: boolean;
      sensitivity: number;
      deadZone: number;
      smoothingFactor: number;
      viewportWidth: number;
      viewportHeight: number;
      freeze?: boolean;
    }
  ): Point2D {
    if (options.freeze && this.initialized) {
      return this.currentViewport;
    }

    // rawNormX passed from GestureEngine is already mirrored if mirror was set there,
    // so we pass mirror=false to normalizeWebcamPoint to avoid double-mirroring.
    const mapped = normalizeWebcamPoint(rawNormX, rawNormY, false, options.sensitivity);

    if (!this.initialized) {
      this.currentNorm = mapped;
      this.initialized = true;
    } else {
      const deadZoned = applyDeadZone(this.currentNorm, mapped, options.deadZone);
      this.currentNorm = smoothCursorAdaptive(
        this.currentNorm,
        deadZoned,
        options.smoothingFactor
      );
    }

    this.currentViewport = mapNormalizedToViewport(
      this.currentNorm,
      options.viewportWidth,
      options.viewportHeight
    );

    return this.currentViewport;
  }

  public getPosition(): Point2D {
    return this.currentViewport;
  }

  public reset(): void {
    this.initialized = false;
  }

  public detectHoverTarget(x: number, y: number): CursorHoverTarget {
    if (typeof document === 'undefined') {
      return { type: null, id: null };
    }

    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;

      // Prioritize specific action buttons (including context menu items, modal buttons,
      // explorer tiles, and buttons nested inside cards/dropzones/overlays).
      const actionEl = el.closest<HTMLElement>('[data-gx-action]');
      if (actionEl?.dataset.gxAction) {
        const explorerKindRaw = actionEl.dataset.gxExplorerKind;
        return {
          type: 'action',
          id: actionEl.dataset.gxAction,
          label: actionEl.dataset.gxLabel,
          explorerPath: actionEl.dataset.gxExplorerPath,
          explorerKind:
            explorerKindRaw === 'file' || explorerKindRaw === 'directory'
              ? explorerKindRaw
              : undefined,
        };
      }

      const fileEl = el.closest<HTMLElement>('[data-gx-file-id]');
      if (fileEl?.dataset.gxFileId) {
        return {
          type: 'file',
          id: fileEl.dataset.gxFileId,
          label: fileEl.dataset.gxLabel,
        };
      }

      const folderEl = el.closest<HTMLElement>('[data-gx-folder-id]');
      if (folderEl?.dataset.gxFolderId) {
        return {
          type: 'folder',
          id: folderEl.dataset.gxFolderId,
          label: folderEl.dataset.gxLabel,
        };
      }

      const overlayEl = el.closest<HTMLElement>('[data-gx-drag-overlay]');
      if (overlayEl?.dataset.gxDragOverlay) {
        return {
          type: 'overlay',
          id: overlayEl.dataset.gxDragOverlay,
          label: overlayEl.dataset.gxLabel ?? 'Floating Overlay',
        };
      }

      const dropzoneEl = el.closest<HTMLElement>('[data-gx-dropzone]');
      if (dropzoneEl?.dataset.gxDropzone) {
        return {
          type: 'dropzone',
          id: dropzoneEl.dataset.gxDropzone,
          label: dropzoneEl.dataset.gxLabel ?? 'Upload Drop Zone',
        };
      }

      // Generic fallback so AR/VR Closed Fist & Left Click can choose any interactive
      // button, menu item, or link even in modals, panels, or overlays without explicit data-gx-action.
      const interactiveEl = el.closest<HTMLElement>(
        'button:not(:disabled), [role="menuitem"], [role="button"], a[href]'
      );
      if (interactiveEl) {
        const label =
          interactiveEl.dataset.gxLabel ||
          interactiveEl.getAttribute('aria-label') ||
          interactiveEl.textContent?.trim().slice(0, 42) ||
          'Control';
        return {
          type: 'action',
          id: '__dom__',
          label,
        };
      }
    }

    return { type: null, id: null };
  }

  public findScrollableElement(x: number, y: number): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      let cursor: HTMLElement | null = el instanceof HTMLElement ? el : null;
      while (cursor && cursor !== document.body && cursor !== document.documentElement) {
        const style = window.getComputedStyle(cursor);
        const overflowY = style.overflowY;
        const canScroll =
          (overflowY === 'auto' || overflowY === 'scroll') &&
          cursor.scrollHeight > cursor.clientHeight + 4;
        if (canScroll) {
          return cursor;
        }
        cursor = cursor.parentElement;
      }
    }

    return null;
  }
}
