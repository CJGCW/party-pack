// Motion controls for games that steer or tilt (see ./motion): a steering angle (turn the phone
// like a wheel; lying flat, tilt it left and right) or a tilt (the phone held flat like a tray).
// Both are measured from however the phone was held when they started (or last recentred), and
// both fall back to dragging a finger on an element when there are no motion sensors.
//
// The phone's turn comes from its fused orientation (the phone combines its gyroscope and
// accelerometer), not the raw accelerometer: it's quicker, and a hand moving sideways doesn't
// nudge it. Readings then go through a One Euro filter, which smooths a lot while the phone's
// held still (no wobble) and hardly at all while it's turning fast (no lag).

import { OneEuro } from '../../shared/oneEuro';
import { motion, screenAngle, sensorsLive } from './motion';

/** Below this much tilt from flat (0 to 1, the share of gravity in the screen's plane) the phone counts as lying flat. */
const FLAT_SHARE = 0.4;
/** Held like a tray: this many degrees of tilt is a full tilt (1). */
const TILT_RANGE = 25;

const wrapRad = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));
const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const RAD = Math.PI / 180;

/**
 * Which way is up in the phone's own axes (x right, y up the screen, z out of it), from its fused
 * orientation: the same vector as accelerationIncludingGravity, without the hand's movement in it.
 */
export function upVector(): { x: number; y: number; z: number } {
  const b = motion.beta! * RAD;
  const g = motion.gamma! * RAD;
  return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
}

export interface SteerOptions {
  /** Turning the phone like a wheel turns the steering this many times as far (default 1). */
  wheelGain?: number;
  /** Lying flat: degrees of left-right tilt per radian of steering (default 20). */
  flatDegPerRad?: number;
  /** The steering never goes past this either way, in radians (default: no limit; it wraps round). */
  maxAngle?: number;
  /** Without sensors: pixels of drag across per radian of steering (default 120), or for a full tilt (default 90). */
  dragPxPerRad?: number;
  dragPxFullTilt?: number;
}

export class Steer {
  private base: { wheel: number; beta: number; gamma: number } | null = null;
  private drag: { x: number; y: number; from: number } | null = null;
  private finger: { x: number; y: number } | null = null;
  /** The drag fallback's steering, kept between drags. */
  private dragAngle = 0;
  /** The steering as it was, unwrapped (so it can go round past half a turn without jumping), and filtered. */
  private lastRaw = 0;
  private unwrapped = 0;
  private readonly angleFilter = new OneEuro(1.2, 0.6);
  private readonly tiltX = new OneEuro(1.5, 1.5);
  private readonly tiltY = new OneEuro(1.5, 1.5);
  private readonly options: Required<Omit<SteerOptions, 'maxAngle'>> & { maxAngle: number };

  /** `dragEl`: where a finger drags without motion sensors (null if the game handles that itself). */
  constructor(dragEl: HTMLElement | null, options: SteerOptions = {}) {
    this.options = {
      wheelGain: options.wheelGain ?? 1,
      flatDegPerRad: options.flatDegPerRad ?? 20,
      maxAngle: options.maxAngle ?? Infinity,
      dragPxPerRad: options.dragPxPerRad ?? 120,
      dragPxFullTilt: options.dragPxFullTilt ?? 90,
    };
    if (!dragEl) return;
    dragEl.addEventListener('pointerdown', (e) => {
      if (sensorsLive()) return;
      e.preventDefault();
      try {
        dragEl.setPointerCapture(e.pointerId);
      } catch {
        // Fine without: the drag still ends on pointerup.
      }
      this.drag = { x: e.clientX, y: e.clientY, from: this.dragAngle };
      this.finger = { x: e.clientX, y: e.clientY };
    });
    dragEl.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.finger = { x: e.clientX, y: e.clientY };
      const max = this.options.maxAngle;
      this.dragAngle = clamp(this.drag.from + (e.clientX - this.drag.x) / this.options.dragPxPerRad, -max, max);
    });
    const end = () => {
      this.drag = this.finger = null;
    };
    dragEl.addEventListener('pointerup', end);
    dragEl.addEventListener('pointercancel', end);
  }

  /** Whether the phone's sensors are steering (else it's the finger). */
  get sensors() {
    return sensorsLive();
  }

  /** Makes the way the phone is held now the middle. */
  recentre() {
    this.base = null;
    this.dragAngle = this.lastRaw = this.unwrapped = 0;
    this.angleFilter.reset();
    this.tiltX.reset();
    this.tiltY.reset();
  }

  /** How far the phone's turned like a wheel, clockwise positive: turning it clockwise tips up toward the screen's left. */
  private wheelAngle(up: { x: number; y: number }) {
    return Math.atan2(-up.x, up.y);
  }

  private baseline() {
    if (!sensorsLive()) return null;
    if (!this.base) {
      this.base = { wheel: this.wheelAngle(upVector()), beta: motion.beta!, gamma: motion.gamma! };
    }
    return this.base;
  }

  /**
   * The steering angle in radians, clockwise positive: how far the phone's been turned (or, lying
   * flat, tilted) from the middle. Without sensors: how far the finger's dragged across.
   */
  angle() {
    const base = this.baseline();
    if (!base) return this.dragAngle;
    const up = upVector();
    const { wheelGain, flatDegPerRad, maxAngle } = this.options;
    const flat = Math.hypot(up.x, up.y) < FLAT_SHARE;
    const raw = flat ? wrapDeg(motion.gamma! - base.gamma) / flatDegPerRad : wheelGain * wrapRad(this.wheelAngle(up) - base.wheel);
    // Unwrap, so a value going past half a turn carries on rather than jumping to the other side.
    this.unwrapped += Number.isFinite(maxAngle) ? raw - this.lastRaw : wrapRad(raw - this.lastRaw);
    this.lastRaw = raw;
    const smooth = this.angleFilter.filter(this.unwrapped);
    return Number.isFinite(maxAngle) ? clamp(smooth, -maxAngle, maxAngle) : wrapRad(smooth);
  }

  /**
   * The phone held flat like a tray: which way it's tipped, -1 to 1 each way (x right, y toward
   * you, i.e. down the screen). Without sensors: the finger's drag from where it went down.
   */
  tilt(): { x: number; y: number } {
    const base = this.baseline();
    if (!base) {
      if (!this.drag || !this.finger) return { x: 0, y: 0 };
      const full = this.options.dragPxFullTilt;
      return { x: clamp((this.finger.x - this.drag.x) / full, -1, 1), y: clamp((this.finger.y - this.drag.y) / full, -1, 1) };
    }
    const dB = wrapDeg(motion.beta! - base.beta) / TILT_RANGE;
    const dG = wrapDeg(motion.gamma! - base.gamma) / TILT_RANGE;
    // The phone's tilt in the screen's own directions, whichever way round it's held.
    const angle = screenAngle();
    const [x, y] = angle === 90 ? [dB, -dG] : angle === 180 ? [-dG, -dB] : angle === 270 ? [-dB, dG] : [dG, dB];
    return { x: clamp(this.tiltX.filter(x), -1, 1), y: clamp(this.tiltY.filter(y), -1, 1) };
  }
}
