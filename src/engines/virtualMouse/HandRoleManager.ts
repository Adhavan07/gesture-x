import type {
  GestureState,
  GestureType,
  HandSide,
  HandsMap,
  PointerHandPreference,
} from '../../types/gesture.ts';

function scoreGesturePriority(gesture: GestureType): number {
  switch (gesture) {
    case 'PINCH':
    case 'MIDDLE_PINCH':
    case 'RING_PINCH':
      return 4;
    case 'POINTING':
    case 'TWO_FINGER':
    case 'THREE_FINGER':
      return 3;
    case 'THUMBS_UP':
    case 'THUMBS_DOWN':
    case 'FIST':
      return 2;
    case 'OPEN_PALM':
      return 1;
    default:
      return 0;
  }
}

export interface HandRoleAssignment {
  primarySide: HandSide | null;
  secondarySide: HandSide | null;
}

export class HandRoleManager {
  private currentPrimarySide: HandSide | null = null;

  public reset(): void {
    this.currentPrimarySide = null;
  }

  public getPrimarySide(): HandSide | null {
    return this.currentPrimarySide;
  }

  /**
   * Resolves primary and secondary anatomical hands using MediaPipe classification,
   * user-configured preference (auto / right / left), and drag-lock hysteresis.
   */
  public assignRoles(
    hands: HandsMap,
    options: {
      multiHandEnabled: boolean;
      preferredPointerHand: PointerHandPreference;
      fsmState: GestureState;
    }
  ): HandRoleAssignment {
    const leftDetected = hands.left.detected;
    const rightDetected = hands.right.detected;

    if (!leftDetected && !rightDetected) {
      this.currentPrimarySide = null;
      return { primarySide: null, secondarySide: null };
    }

    let primarySide: HandSide;

    if (leftDetected && !rightDetected) {
      primarySide = 'left';
    } else if (!leftDetected && rightDetected) {
      primarySide = 'right';
    } else if (
      this.currentPrimarySide &&
      (options.fsmState === 'PINCH_STARTED' ||
        options.fsmState === 'DRAGGING' ||
        options.fsmState === 'RIGHT_BUTTON_HOLD')
    ) {
      // Never swap primary hand mid-pinch or mid-drag
      primarySide = this.currentPrimarySide;
    } else if (
      options.preferredPointerHand === 'left' ||
      options.preferredPointerHand === 'right'
    ) {
      primarySide = options.preferredPointerHand;
    } else {
      const leftScore = scoreGesturePriority(hands.left.gesture);
      const rightScore = scoreGesturePriority(hands.right.gesture);

      if (this.currentPrimarySide) {
        const currentScore =
          this.currentPrimarySide === 'left' ? leftScore : rightScore;
        const otherSide: HandSide =
          this.currentPrimarySide === 'left' ? 'right' : 'left';
        const otherScore = otherSide === 'left' ? leftScore : rightScore;
        if (currentScore >= 3 && otherScore <= currentScore) {
          primarySide = this.currentPrimarySide;
        } else if (otherScore - currentScore >= 2) {
          primarySide = otherSide;
        } else {
          primarySide = this.currentPrimarySide;
        }
      } else {
        primarySide = leftScore > rightScore ? 'left' : 'right';
      }
    }

    this.currentPrimarySide = primarySide;

    const otherSide: HandSide = primarySide === 'left' ? 'right' : 'left';
    const secondarySide: HandSide | null =
      options.multiHandEnabled && hands[otherSide].detected ? otherSide : null;

    hands[primarySide].isPrimary = true;
    hands[primarySide].role = 'primary';

    if (secondarySide) {
      hands[secondarySide].isPrimary = false;
      hands[secondarySide].role = 'secondary';
    } else {
      hands[otherSide].isPrimary = false;
      hands[otherSide].role = 'none';
    }

    return { primarySide, secondarySide };
  }
}
