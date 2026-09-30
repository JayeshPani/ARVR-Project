import type { Point } from "./engine.ts";

/** Dwell-to-press logic, kept free of THREE and the DOM so it can be tested
 * headlessly with synthetic landmarks. The AR layer supplies which button the
 * cursor is over; everything about *when* that becomes a press lives here. */
export const BUTTONS = {
  enterFrames: 2,   // consecutive frames inside a button before dwell starts
  dwellMs: 700,     // hold to fire
  dropoutMs: 150,   // tolerate this much tracking loss without losing progress
  cooldownMs: 800,  // global quiet period after a press
  gestureGraceMs: 400, // after rotate/move/zoom ends, before buttons re-arm
};

export interface PressState { hovered: string | null; progress: number; fired: string | null }

export class ButtonPressMachine {
  private hovered: string | null = null;
  private insideFrames = 0;
  private dwellStart = 0;
  private lastSeen = 0;
  private cooldownUntil = 0;
  private gestureUntil = 0;
  /** Cleared only when the cursor leaves: stops one long hold from firing the
   * same button over and over. */
  private latched: string | null = null;

  /** `hit` is the button under the cursor, or null. `idle` is false whenever a
   * manipulation gesture is running, which suppresses and disarms presses. */
  update(hit: string | null, idle: boolean, time: number): PressState {
    if (!idle) {
      this.gestureUntil = time + BUTTONS.gestureGraceMs;
      this.reset();
      return { hovered: null, progress: 0, fired: null };
    }
    if (time < this.gestureUntil || time < this.cooldownUntil) {
      this.reset();
      return { hovered: null, progress: 0, fired: null };
    }
    if (hit === null) {
      // Brief tracking dropouts are common; don't throw away a nearly
      // complete dwell because one frame missed.
      if (this.hovered && time - this.lastSeen <= BUTTONS.dropoutMs) {
        return { hovered: this.hovered, progress: this.progressAt(time), fired: null };
      }
      this.reset();
      this.latched = null;
      return { hovered: null, progress: 0, fired: null };
    }
    if (hit !== this.hovered) { this.hovered = hit; this.insideFrames = 0; this.dwellStart = 0; this.latched = this.latched === hit ? hit : null; }
    this.lastSeen = time;
    if (this.latched === hit) return { hovered: hit, progress: 0, fired: null };
    if (++this.insideFrames < BUTTONS.enterFrames) return { hovered: hit, progress: 0, fired: null };
    if (!this.dwellStart) this.dwellStart = time;
    const progress = this.progressAt(time);
    if (progress < 1) return { hovered: hit, progress, fired: null };
    this.cooldownUntil = time + BUTTONS.cooldownMs;
    this.latched = hit;
    this.dwellStart = 0;
    this.insideFrames = 0;
    return { hovered: hit, progress: 1, fired: hit };
  }

  private progressAt(time: number): number {
    return this.dwellStart ? Math.min(1, (time - this.dwellStart) / BUTTONS.dwellMs) : 0;
  }
  private reset(): void { this.hovered = null; this.insideFrames = 0; this.dwellStart = 0; }
  cancel(): void { this.reset(); this.latched = null; }
}

export interface Rect { left: number; top: number; width: number; height: number }

/** Gesture points are normalised against the surface the video is laid out in,
 * but the raycast needs NDC against the render canvas, which may not fill that
 * surface exactly. */
export function containerPointToNdc(point: Point, container: Rect, canvas: Rect): Point {
  const x = container.left + point.x * container.width;
  const y = container.top + point.y * container.height;
  return {
    x: canvas.width > 0 ? ((x - canvas.left) / canvas.width) * 2 - 1 : 0,
    y: canvas.height > 0 ? -(((y - canvas.top) / canvas.height) * 2 - 1) : 0,
  };
}
