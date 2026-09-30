import test from 'node:test';
import assert from 'node:assert/strict';
import { ButtonPressMachine, BUTTONS, containerPointToNdc } from '../src/gestures/buttons.ts';
import { pointingCursor, GestureEngine } from '../src/gestures/engine.ts';

/** 21 landmarks. `point` extends the index finger and curls the rest, which is
 * the posture in-scene buttons respond to. Mirrors tests/gestures.test.mjs. */
function hand({ x = .4, point = false, pinch = false } = {}) {
  const p = Array.from({ length: 21 }, () => ({ x, y: .5, z: 0 }));
  p[0] = { x, y: .8 };
  for (const [base, offset] of [[5, -.06], [9, 0], [13, .05], [17, .1]]) {
    // Wrist sits at y=.8. Extended fingers reach away from it; a curled finger
    // folds back so the tip ends up nearer the wrist than its middle joint,
    // which is what the extension test actually measures.
    const curled = point && base !== 5;
    const reach = curled ? [.62, .55, .60, .66] : [.6, .47, .38, .28];
    for (let i = 0; i < 4; i++) p[base + i] = { x: x + offset, y: reach[i] };
  }
  p[4] = pinch ? { x: p[8].x + .04, y: p[8].y } : { x: x - .18, y: .55 };
  return { landmarks: p, handedness: 'Left' };
}

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('pointing is recognised, and open palm or pinch never is', () => {
  assert.ok(pointingCursor(hand({ point: true })), 'index-only should be a cursor');
  assert.equal(pointingCursor(hand()), null, 'open palm is rotate, not a cursor');
  assert.equal(pointingCursor(hand({ point: true, pinch: true })), null, 'pinch is move, not a cursor');
  assert.equal(pointingCursor({ landmarks: [] }), null);
});

test('the engine emits a cursor only while idle', () => {
  const e = new GestureEngine();
  assert.ok(e.update([hand({ point: true })], 0).cursor, 'idle pointing hand exposes a cursor');
  const rotating = new GestureEngine();
  for (let t = 0; t <= 300; t += 50) rotating.update([hand()], t);
  const frame = rotating.update([hand({ x: .44 })], 350);
  assert.equal(frame.mode, 'rotate');
  assert.equal(frame.cursor, undefined, 'a committed gesture must not also drive UI');
});

test('dwell fires once and will not repeat until the cursor leaves', () => {
  const m = new ButtonPressMachine();
  let t = 0;
  assert.equal(m.update('opacity-up', true, t).fired, null);
  t += 50; assert.equal(m.update('opacity-up', true, t).fired, null, 'entry needs two frames');
  let fired = null;
  for (let i = 0; i < 40 && !fired; i++) { t += 50; fired = m.update('opacity-up', true, t).fired; }
  assert.equal(fired, 'opacity-up');
  // Holding still must not auto-repeat, even long past the cooldown.
  for (let i = 0; i < 60; i++) { t += 50; assert.equal(m.update('opacity-up', true, t).fired, null, 'latched button re-fired'); }
  // Leaving must outlast the dropout tolerance, otherwise it reads as a
  // tracking glitch and the latch is deliberately kept.
  t += BUTTONS.dropoutMs + 100; m.update(null, true, t);
  t += BUTTONS.cooldownMs;
  let again = null;
  for (let i = 0; i < 40 && !again; i++) { t += 50; again = m.update('opacity-up', true, t).fired; }
  assert.equal(again, 'opacity-up', 're-entry should be able to fire again');
});

test('a brief dropout keeps dwell progress, a long one discards it', () => {
  const brief = new ButtonPressMachine();
  let t = 0;
  for (let i = 0; i < 3; i++) { t += 50; brief.update('cut', true, t); }
  const before = brief.update('cut', true, (t += 50)).progress;
  assert.ok(before > 0);
  const kept = brief.update(null, true, (t += BUTTONS.dropoutMs - 10));
  assert.equal(kept.hovered, 'cut');
  assert.ok(kept.progress >= before, 'progress should survive a short gap');
  const dropped = brief.update(null, true, (t += BUTTONS.dropoutMs * 2));
  assert.equal(dropped.hovered, null);
  near(dropped.progress, 0);
});

test('presses are suppressed during a gesture and for a grace period after', () => {
  const m = new ButtonPressMachine();
  let t = 0;
  for (let i = 0; i < 30; i++) { t += 50; assert.equal(m.update('reset', false, t).fired, null, 'fired mid-gesture'); }
  // Releasing the gesture must not immediately land a press.
  let fired = null;
  const graceEnd = t + BUTTONS.gestureGraceMs;
  while (t < graceEnd) { t += 50; fired = m.update('reset', true, t).fired ?? fired; }
  assert.equal(fired, null, 'fired inside the post-gesture grace window');
  for (let i = 0; i < 40 && !fired; i++) { t += 50; fired = m.update('reset', true, t).fired; }
  assert.equal(fired, 'reset', 'should work again once the grace window passes');
});

test('container points map to NDC against the render canvas', () => {
  const full = { left: 0, top: 0, width: 100, height: 200 };
  const centre = containerPointToNdc({ x: .5, y: .5 }, full, full);
  near(centre.x, 0); near(centre.y, 0);
  const corner = containerPointToNdc({ x: 0, y: 0 }, full, full);
  near(corner.x, -1); near(corner.y, 1);
  // Canvas letterboxed inside a taller container: the same point shifts.
  const canvas = { left: 0, top: 50, width: 100, height: 100 };
  const inset = containerPointToNdc({ x: .5, y: .5 }, full, canvas);
  near(inset.x, 0); near(inset.y, 0);
  const top = containerPointToNdc({ x: .5, y: .25 }, full, canvas);
  near(top.y, 1);
  assert.doesNotThrow(() => containerPointToNdc({ x: .5, y: .5 }, full, { left: 0, top: 0, width: 0, height: 0 }));
});
