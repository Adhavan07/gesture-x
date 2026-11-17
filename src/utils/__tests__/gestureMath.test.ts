import { describe, expect, it } from 'vitest';
import type { Landmark } from '../../types/gesture.ts';
import {
  classifyRawGesture,
  computeFingerStates,
  computePalmCenter,
  normalizePinchDistance,
} from '../gestureMath.ts';
import { computeAdaptiveAlpha, smoothCursorAdaptive } from '../cursorMapping.ts';
import { GestureEngine, HandRoleManager } from '../../engines/GestureEngine.ts';
import { createEmptyTrackedHand } from '../../engines/virtualMouse/DualHandTracker.ts';

function makeHandLandmarks(overrides: Partial<Record<number, Landmark>> = {}): Landmark[] {
  const base: Landmark[] = [
    { x: 0.5, y: 0.82, z: 0 }, // 0 wrist
    { x: 0.43, y: 0.74, z: 0 }, // 1 thumb CMC
    { x: 0.39, y: 0.66, z: 0 }, // 2 thumb MCP
    { x: 0.43, y: 0.62, z: 0 }, // 3 thumb IP (folded inward)
    { x: 0.47, y: 0.61, z: 0 }, // 4 thumb tip (folded)
    { x: 0.44, y: 0.58, z: 0 }, // 5 index MCP
    { x: 0.44, y: 0.52, z: 0 }, // 6 index PIP
    { x: 0.44, y: 0.56, z: 0 }, // 7 index DIP
    { x: 0.44, y: 0.6, z: 0 }, // 8 index tip (folded)
    { x: 0.5, y: 0.56, z: 0 }, // 9 middle MCP
    { x: 0.5, y: 0.51, z: 0 }, // 10 middle PIP
    { x: 0.5, y: 0.55, z: 0 }, // 11 middle DIP
    { x: 0.5, y: 0.59, z: 0 }, // 12 middle tip (folded)
    { x: 0.55, y: 0.58, z: 0 }, // 13 ring MCP
    { x: 0.55, y: 0.53, z: 0 }, // 14 ring PIP
    { x: 0.55, y: 0.57, z: 0 }, // 15 ring DIP
    { x: 0.55, y: 0.61, z: 0 }, // 16 ring tip (folded)
    { x: 0.6, y: 0.61, z: 0 }, // 17 pinky MCP
    { x: 0.6, y: 0.56, z: 0 }, // 18 pinky PIP
    { x: 0.6, y: 0.59, z: 0 }, // 19 pinky DIP
    { x: 0.6, y: 0.63, z: 0 }, // 20 pinky tip (folded)
  ];

  for (const [k, v] of Object.entries(overrides)) {
    if (v) base[Number(k)] = v;
  }
  return base;
}

function shiftLandmarks(lm: Landmark[], dx: number, dy = 0): Landmark[] {
  return lm.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function extendIndex(lm: Landmark[]): Landmark[] {
  const next = [...lm];
  next[6] = { x: 0.44, y: 0.45, z: 0 };
  next[7] = { x: 0.44, y: 0.35, z: 0 };
  next[8] = { x: 0.44, y: 0.25, z: 0 };
  return next;
}

function extendMiddle(lm: Landmark[]): Landmark[] {
  const next = [...lm];
  next[10] = { x: 0.5, y: 0.42, z: 0 };
  next[11] = { x: 0.5, y: 0.32, z: 0 };
  next[12] = { x: 0.5, y: 0.22, z: 0 };
  return next;
}

function extendRing(lm: Landmark[]): Landmark[] {
  const next = [...lm];
  next[14] = { x: 0.55, y: 0.45, z: 0 };
  next[15] = { x: 0.55, y: 0.35, z: 0 };
  next[16] = { x: 0.55, y: 0.26, z: 0 };
  return next;
}

function extendAllFingers(): Landmark[] {
  let lm = makeHandLandmarks({
    3: { x: 0.32, y: 0.58, z: 0 },
    4: { x: 0.24, y: 0.52, z: 0 },
    18: { x: 0.6, y: 0.49, z: 0 },
    19: { x: 0.6, y: 0.41, z: 0 },
    20: { x: 0.6, y: 0.33, z: 0 },
  });
  lm = extendIndex(lm);
  lm = extendMiddle(lm);
  lm = extendRing(lm);
  return lm;
}

function makeIndexPinch(): Landmark[] {
  return makeHandLandmarks({
    3: { x: 0.38, y: 0.54, z: 0 },
    4: { x: 0.41, y: 0.46, z: 0 },
    6: { x: 0.43, y: 0.49, z: 0 },
    7: { x: 0.42, y: 0.47, z: 0 },
    8: { x: 0.415, y: 0.465, z: 0 },
  });
}

function makeMiddlePinch(): Landmark[] {
  return extendIndex(
    makeHandLandmarks({
      3: { x: 0.41, y: 0.52, z: 0 },
      4: { x: 0.46, y: 0.45, z: 0 },
      10: { x: 0.48, y: 0.48, z: 0 },
      11: { x: 0.47, y: 0.46, z: 0 },
      12: { x: 0.465, y: 0.455, z: 0 },
    })
  );
}

function makeRingPinch(): Landmark[] {
  return extendMiddle(
    extendIndex(
      makeHandLandmarks({
        3: { x: 0.45, y: 0.54, z: 0 },
        4: { x: 0.51, y: 0.47, z: 0 },
        14: { x: 0.53, y: 0.5, z: 0 },
        15: { x: 0.52, y: 0.48, z: 0 },
        16: { x: 0.515, y: 0.475, z: 0 },
      })
    )
  );
}

function makeThumbsUp(): Landmark[] {
  return makeHandLandmarks({
    2: { x: 0.38, y: 0.62, z: 0 },
    3: { x: 0.35, y: 0.52, z: 0 },
    4: { x: 0.33, y: 0.42, z: 0 },
  });
}

function makeThumbsDown(): Landmark[] {
  return makeHandLandmarks({
    2: { x: 0.38, y: 0.66, z: 0 },
    3: { x: 0.35, y: 0.76, z: 0 },
    4: { x: 0.33, y: 0.88, z: 0 },
  });
}

describe('gestureMath / GestureRecognizer', () => {
  it('detects POINTING when only index finger is extended', () => {
    const lm = extendIndex(makeHandLandmarks());
    const states = computeFingerStates(lm);
    expect(states.index).toBe(true);
    expect(states.middle).toBe(false);
    expect(states.ring).toBe(false);
    expect(states.pinky).toBe(false);

    const result = classifyRawGesture(lm);
    expect(result.gesture).toBe('POINTING');
  });

  it('detects PINCH when thumb tip and index tip meet', () => {
    const lm = makeIndexPinch();
    expect(normalizePinchDistance(lm)).toBeLessThan(0.2);
    expect(classifyRawGesture(lm, 0.3).gesture).toBe('PINCH');
  });

  it('detects MIDDLE_PINCH when thumb tip and middle tip meet', () => {
    const lm = makeMiddlePinch();
    expect(classifyRawGesture(lm, 0.3).gesture).toBe('MIDDLE_PINCH');
  });

  it('detects RING_PINCH when thumb tip and ring tip meet', () => {
    const lm = makeRingPinch();
    expect(classifyRawGesture(lm, 0.3).gesture).toBe('RING_PINCH');
  });

  it('detects OPEN_PALM when all five fingers are extended', () => {
    const lm = extendAllFingers();
    expect(classifyRawGesture(lm).gesture).toBe('OPEN_PALM');
  });

  it('detects FIST when all fingers are folded', () => {
    const lm = makeHandLandmarks();
    expect(classifyRawGesture(lm).gesture).toBe('FIST');
  });

  it('detects THUMBS_UP and THUMBS_DOWN accurately', () => {
    expect(classifyRawGesture(makeThumbsUp()).gesture).toBe('THUMBS_UP');
    expect(classifyRawGesture(makeThumbsDown()).gesture).toBe('THUMBS_DOWN');
  });

  it('detects TWO_FINGER and THREE_FINGER extensions', () => {
    const two = extendMiddle(extendIndex(makeHandLandmarks()));
    expect(classifyRawGesture(two).gesture).toBe('TWO_FINGER');

    const three = extendRing(two);
    expect(classifyRawGesture(three).gesture).toBe('THREE_FINGER');
  });

  it('computes palm center as average of palm landmarks [0,5,9,13,17]', () => {
    const lm = makeHandLandmarks();
    const center = computePalmCenter(lm);
    expect(center.x).toBeGreaterThan(0.45);
    expect(center.x).toBeLessThan(0.55);
    expect(center.y).toBeGreaterThan(0.6);
    expect(center.y).toBeLessThan(0.68);
  });
});

describe('VirtualMouseEngine / GestureEngine two-hand virtual mouse', () => {
  it('emits LEFT_CLICK immediately when Thumb+Index pinch meets, avoids repeat spam while held, and emits DOUBLE_CLICK on rapid second pinch', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      cooldownMs: 250,
      doubleClickWindowMs: 350,
    });

    const pointing = extendIndex(makeHandLandmarks());
    const indexPinch = makeIndexPinch();

    // Aim at a UI target first -> cursor sits at mirrored index tip (0.56, 0.25)
    const aimed = engine.processFrame(pointing, 80);
    expect(aimed.cursorNormalized.x).toBeCloseTo(0.56, 3);
    expect(aimed.cursorNormalized.y).toBeCloseTo(0.25, 3);

    // 1st Thumb+Index meet fires LEFT_CLICK immediately (without waiting for release) and keeps aim steady
    const click1 = engine.processFrame(indexPinch, 100);
    expect(click1.state).toBe('LEFT_CLICK');
    expect(click1.event).toBe('LEFT_CLICK');
    expect(click1.cursorNormalized.x).toBeCloseTo(0.56, 3);
    expect(click1.cursorNormalized.y).toBeCloseTo(0.25, 3);

    // Holding pinch closed does NOT spam repeat LEFT_CLICK events
    const heldStill = engine.processFrame(indexPinch, 160);
    expect(heldStill.event).toBeUndefined();

    // Separating fingers back to POINTING re-arms pinch; 2nd meet within doubleClickWindowMs fires DOUBLE_CLICK immediately
    engine.processFrame(pointing, 190);
    const click2 = engine.processFrame(indexPinch, 250);
    expect(click2.state).toBe('DOUBLE_CLICK');
    expect(click2.event).toBe('DOUBLE_CLICK');
  });

  it('emits RIGHT_CLICK immediately when Thumb+Middle pinch meets and re-arms only after release', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      cooldownMs: 100,
    });

    const pointing = extendIndex(makeHandLandmarks());
    const middlePinch = makeMiddlePinch();

    engine.processFrame(pointing, 80);

    // Fires RIGHT_CLICK on the exact contact frame
    const rightClick1 = engine.processFrame(middlePinch, 100);
    expect(rightClick1.state).toBe('RIGHT_CLICK');
    expect(rightClick1.event).toBe('RIGHT_CLICK');

    // Staying pinched does not emit another RIGHT_CLICK
    expect(engine.processFrame(middlePinch, 220).event).toBeUndefined();

    // Releasing beyond releaseThreshold re-arms -> next middle pinch fires RIGHT_CLICK again
    engine.processFrame(pointing, 250);
    const rightClick2 = engine.processFrame(middlePinch, 300);
    expect(rightClick2.event).toBe('RIGHT_CLICK');
  });

  it('still supports custom pinch-to-drag and right-button-hold when explicitly mapped in Settings', () => {
    const engine = new GestureEngine({
      stabilityFrames: 2,
      dragEngageFrames: 2,
      dragActivationMs: 300,
      cooldownMs: 0,
      mappings: {
        GRAB_CHOOSE: 'FIST',
        DROP_RELEASE: 'OPEN_PALM',
        LEFT_CLICK: 'INDEX_PINCH',
        DOUBLE_CLICK: 'DOUBLE_INDEX_PINCH',
        RIGHT_CLICK: 'MIDDLE_PINCH',
        CHOOSE_SELECT: 'THREE_FINGER',
        DRAG_DROP: 'INDEX_PINCH',
        RIGHT_BUTTON_HOLD: 'MIDDLE_PINCH',
        SCROLL: 'TWO_FINGER',
        PAUSE_TRACKING: 'RING_PINCH',
        CANCEL_ACTION: 'THUMBS_DOWN',
        CONFIRM_ACTION: 'THUMBS_UP',
        REJECT_ACTION: 'THUMBS_DOWN',
      },
    });

    const pointing = extendIndex(makeHandLandmarks());
    const indexPinch = makeIndexPinch();
    const middlePinch = makeMiddlePinch();

    engine.processFrame(pointing, 100);
    engine.processFrame(pointing, 120);

    engine.processFrame(indexPinch, 200);
    const pinchStart = engine.processFrame(indexPinch, 220);
    expect(pinchStart.state).toBe('PINCH_STARTED');
    expect(pinchStart.event).toBe('PINCH_START');

    const dragStart = engine.processFrame(indexPinch, 540);
    expect(dragStart.state).toBe('DRAGGING');
    expect(dragStart.event).toBe('DRAG_START');

    engine.processFrame(pointing, 600);
    const drop = engine.processFrame(pointing, 620);
    expect(drop.state).toBe('DROPPING');
    expect(drop.event).toBe('DROP');

    engine.processFrame(middlePinch, 700);
    engine.processFrame(middlePinch, 720);
    const rightHold = engine.processFrame(middlePinch, 1060);
    expect(rightHold.state).toBe('RIGHT_BUTTON_HOLD');
    expect(rightHold.event).toBe('RIGHT_HOLD_START');
  });

  it('supports 2D vertical and horizontal scroll on TWO_FINGER', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      scrollSpeed: 1,
    });

    const twoStart = extendMiddle(extendIndex(makeHandLandmarks()));
    const twoMoved = shiftLandmarks(twoStart, -0.05, 0.08); // mirrored: x moves right, y moves down

    const r1 = engine.processFrame(twoStart, 100);
    expect(r1.state).toBe('SCROLLING');

    const r2 = engine.processFrame(twoMoved, 140);
    expect(r2.state).toBe('SCROLLING');
    expect(r2.event).toBe('SCROLL');
    expect(Math.abs(r2.scrollDeltaX ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(r2.scrollDeltaY ?? 0)).toBeGreaterThan(0);
  });

  it('emits CHOOSE_SELECT on THREE_FINGER and REJECT on THUMBS_DOWN by default', () => {
    const engine = new GestureEngine({ stabilityFrames: 1, cooldownMs: 0 });
    const threeFinger = extendRing(extendMiddle(extendIndex(makeHandLandmarks())));
    const thumbsDown = makeThumbsDown();

    const chooseRes = engine.processFrame(threeFinger, 100);
    expect(chooseRes.gesture).toBe('THREE_FINGER');
    expect(chooseRes.event).toBe('CHOOSE_SELECT');

    // Holding same sign does not spam repeat events
    const heldRes = engine.processFrame(threeFinger, 130);
    expect(heldRes.event).toBeUndefined();

    const rejectRes = engine.processFrame(thumbsDown, 700);
    expect(rejectRes.gesture).toBe('THUMBS_DOWN');
    expect(rejectRes.event).toBe('REJECT');
  });

  it('respects custom gesture-to-mouse mappings from Settings', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      mappings: {
        GRAB_CHOOSE: 'FIST',
        DROP_RELEASE: 'OPEN_PALM',
        LEFT_CLICK: 'INDEX_PINCH',
        DOUBLE_CLICK: 'RING_PINCH',
        RIGHT_CLICK: 'THREE_FINGER',
        RIGHT_BUTTON_HOLD: 'INDEX_PINCH',
        CHOOSE_SELECT: 'MIDDLE_PINCH',
        DRAG_DROP: 'INDEX_PINCH',
        SCROLL: 'TWO_FINGER',
        PAUSE_TRACKING: 'OPEN_PALM',
        CANCEL_ACTION: 'FIST',
        CONFIRM_ACTION: 'THUMBS_UP',
        REJECT_ACTION: 'THUMBS_DOWN',
      },
    });

    const threeFinger = extendRing(extendMiddle(extendIndex(makeHandLandmarks())));
    const ringPinch = makeRingPinch();

    expect(engine.processFrame(threeFinger, 100).event).toBe('RIGHT_CLICK');
    expect(engine.processFrame(ringPinch, 700).event).toBe('DOUBLE_CLICK');
  });

  it('grabs with FIST (zero-jump knuckle anchor), stays latched, and drops on OPEN_PALM', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      cooldownMs: 0,
    });

    const pointing = extendIndex(makeHandLandmarks());
    const fist = makeHandLandmarks();
    const movedFist = shiftLandmarks(fist, -0.1, -0.05);
    const palm = extendAllFingers();

    // Pointing places cursor at mirrored index tip (1 - 0.44 = 0.56, y = 0.25)
    const p = engine.processFrame(pointing, 100);
    expect(p.state).toBe('POINTING');
    expect(p.cursorNormalized.x).toBeCloseTo(0.56, 3);
    expect(p.cursorNormalized.y).toBeCloseTo(0.25, 3);

    // Closing into FIST initiates DRAG_START with zero jump at grab frame
    const grabbed = engine.processFrame(fist, 200);
    expect(grabbed.state).toBe('DRAGGING');
    expect(grabbed.event).toBe('DRAG_START');
    expect(grabbed.grabSource).toBe('FIST');
    expect(grabbed.cursorNormalized.x).toBeCloseTo(0.56, 3);
    expect(grabbed.cursorNormalized.y).toBeCloseTo(0.25, 3);

    // Moving FIST moves cursor smoothly by knuckle delta (mirrored dx=-0.1 -> +0.1, dy=-0.05)
    const carried = engine.processFrame(movedFist, 240);
    expect(carried.state).toBe('DRAGGING');
    expect(carried.cursorNormalized.x).toBeCloseTo(0.66, 3);
    expect(carried.cursorNormalized.y).toBeCloseTo(0.2, 3);

    // Stays latched even if fingers briefly relax to POINTING while carrying
    const transientPoint = engine.processFrame(extendIndex(movedFist), 280);
    expect(transientPoint.state).toBe('DRAGGING');

    // OPEN_PALM drops cleanly and freezes coordinates
    const dropped = engine.processFrame(palm, 320);
    expect(dropped.state).toBe('DROPPING');
    expect(dropped.event).toBe('DROP');
    expect(dropped.cursorNormalized.x).toBeCloseTo(0.66, 3);
    expect(dropped.cursorNormalized.y).toBeCloseTo(0.2, 3);

    // completeInstantGrab() exits DRAGGING immediately for UI controls
    engine.processFrame(pointing, 500);
    const secondGrab = engine.processFrame(fist, 650);
    expect(secondGrab.state).toBe('DRAGGING');
    engine.completeInstantGrab();
    expect(engine.getState()).toBe('IDLE');
  });

  it('cancels active FIST drag on THUMBS_DOWN and pauses on RING_PINCH by default', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      cooldownMs: 0,
    });
    const fist = makeHandLandmarks();
    const thumbsDown = makeThumbsDown();
    const ringPinch = makeRingPinch();

    engine.processFrame(fist, 100);
    expect(engine.getState()).toBe('DRAGGING');

    const cancelled = engine.processFrame(thumbsDown, 300);
    expect(cancelled.state).toBe('CANCELLED');
    expect(cancelled.event).toBe('CANCEL');

    const paused = engine.processFrame(ringPinch, 400);
    expect(paused.state).toBe('PAUSED');
  });

  it('maps left and right hands to distinct IDs and supports TwoHandModifierEngine combos', () => {
    const engine = new GestureEngine({
      stabilityFrames: 1,
      multiHandEnabled: true,
      preferredPointerHand: 'right',
      dragEngageFrames: 3,
      dragActivationMs: 300,
    });
    const rightPoint1 = extendIndex(makeHandLandmarks());
    const rightPoint2 = shiftLandmarks(rightPoint1, -0.2, -0.1);
    const leftFist = makeHandLandmarks();
    const leftPinch = makeIndexPinch();
    const leftPalm = extendAllFingers();
    const rightPinch = makeIndexPinch();
    const rightPalm = extendAllFingers();
    const rightFist = makeHandLandmarks();

    // 1. Secondary FIST freezes cursor coordinates while right hand moves
    const baseline = engine.processDualHandFrame(
      [
        { landmarks: leftPalm, handedness: 'Left' },
        { landmarks: rightPoint1, handedness: 'Right' },
      ],
      100,
      true
    );
    expect(baseline.primaryHandId).toBe('hand-right');
    expect(baseline.secondaryHandId).toBe('hand-left');
    expect(baseline.hands.left.role).toBe('secondary');
    expect(baseline.hands.right.role).toBe('primary');

    const frozen = engine.processDualHandFrame(
      [
        { landmarks: leftFist, handedness: 'Left' },
        { landmarks: rightPoint2, handedness: 'Right' },
      ],
      200,
      true
    );
    expect(frozen.modifiers.cursorFrozen).toBe(true);
    expect(frozen.cursorNormalized).toEqual(baseline.cursorNormalized);

    // 2. Secondary thumb-index pinch activates Ctrl-style multi-select hold (primary index pinch meet fires CHOOSE_SELECT immediately)
    const multiTap = engine.processDualHandFrame(
      [
        { landmarks: leftPinch, handedness: 'Left' },
        { landmarks: rightPinch, handedness: 'Right' },
      ],
      300,
      true
    );
    expect(multiTap.modifiers.multiSelectActive).toBe(true);
    expect(multiTap.event).toBe('CHOOSE_SELECT');
    expect(multiTap.state).toBe('MULTI_SELECT');

    // 3. Both hands OPEN_PALM pauses interaction temporarily
    const bothOpen = engine.processDualHandFrame(
      [
        { landmarks: leftPalm, handedness: 'Left' },
        { landmarks: rightPalm, handedness: 'Right' },
      ],
      500,
      true
    );
    expect(bothOpen.modifiers.bothHandsOpenPause).toBe(true);
    expect(bothOpen.state).toBe('PAUSED');

    // 4. Both hands FIST triggers EMERGENCY_STOP
    const bothFists = engine.processDualHandFrame(
      [
        { landmarks: leftFist, handedness: 'Left' },
        { landmarks: rightFist, handedness: 'Right' },
      ],
      700,
      true
    );
    expect(bothFists.modifiers.emergencyStopActive).toBe(true);
    expect(bothFists.event).toBe('EMERGENCY_STOP');
    expect(bothFists.state).toBe('CANCELLED');
  });

  it('disambiguates duplicate handedness labels spatially into distinct left/right IDs', () => {
    const engine = new GestureEngine({ stabilityFrames: 1 });
    const handA = shiftLandmarks(extendIndex(makeHandLandmarks()), -0.25);
    const handB = shiftLandmarks(makeIndexPinch(), 0.25);

    const mapped = engine.mapHandsToIds(
      [
        { landmarks: handB, handedness: 'Right' },
        { landmarks: handA, handedness: 'Right' },
      ],
      false
    );

    expect(mapped.left.id).toBe('hand-left');
    expect(mapped.right.id).toBe('hand-right');
    expect(mapped.left.gesture).toBe('POINTING');
    expect(mapped.right.gesture).toBe('PINCH');
  });

  it('assigns HandRoleManager primary and secondary roles with drag-lock protection', () => {
    const manager = new HandRoleManager();
    const hands = {
      left: { ...createEmptyTrackedHand('left'), detected: true, gesture: 'PINCH' as const },
      right: { ...createEmptyTrackedHand('right'), detected: true, gesture: 'POINTING' as const },
    };

    const initial = manager.assignRoles(hands, {
      multiHandEnabled: true,
      preferredPointerHand: 'right',
      fsmState: 'POINTING',
    });
    expect(initial.primarySide).toBe('right');
    expect(initial.secondarySide).toBe('left');

    // Even if preference changes mid-drag, drag-lock keeps primarySide on 'right'
    const locked = manager.assignRoles(hands, {
      multiHandEnabled: true,
      preferredPointerHand: 'left',
      fsmState: 'DRAGGING',
    });
    expect(locked.primarySide).toBe('right');
  });

  it('scales cursor smoothing alpha lower at micro-hover speeds and higher during fast sweeps', () => {
    const prev = { x: 0.5, y: 0.5 };
    const microTarget = { x: 0.502, y: 0.501 };
    const fastTarget = { x: 0.65, y: 0.55 };

    const microAlpha = computeAdaptiveAlpha(prev, microTarget, 0.25);
    const fastAlpha = computeAdaptiveAlpha(prev, fastTarget, 0.25);

    expect(microAlpha).toBeLessThan(0.2);
    expect(fastAlpha).toBeGreaterThan(0.4);
    expect(fastAlpha).toBeGreaterThan(microAlpha * 2);

    const smoothed = smoothCursorAdaptive(prev, microTarget, 0.25);
    expect(smoothed.x).toBeGreaterThan(prev.x);
    expect(smoothed.x).toBeLessThan(microTarget.x);
  });
});
