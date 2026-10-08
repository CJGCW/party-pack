// The phone side of a WoochaWare microgame: a canvas, a frame loop, touch input
// and motion input. Every microgame draws in a fixed space scaled to fit the
// phone: W x H, or LW x LH for games played with the phone held sideways.

import { motion, screenAngle, sensorsLive } from '../motion';

export const W = 360;
export const H = 560;
/** Landscape microgames draw in LW x LH. */
export const LW = 560;
export const LH = 360;

/** Degrees of tilt that count as full tilt (1). */
const TILT_RANGE = 28;
/** Touch fallback: how far a drag goes for full tilt, and per radian of steering. */
const DRAG_TILT = 90;
const DRAG_STEER = 150;

export interface Pointer {
  x: number;
  y: number;
}

/**
 * Tilting, turning and shaking the phone, measured from how it was held when the
 * microgame started. Without sensors (plain-HTTP page, permission refused, a
 * laptop), dragging a finger stands in for them.
 */
export interface MotionInput {
  /** -1 to 1 on each axis, in the game's screen directions: right/down tilt is positive. */
  tilt(): Pointer;
  /** Radians the phone has been turned, like a steering wheel: clockwise is positive. */
  steer(): number;
  /** Shakes so far (each back or forth counts). */
  shakes(): number;
  /** How much the phone is moving about, roughly 0 when still (m/s²). */
  jitter(): number;
  /** True when the sensors are working. */
  readonly sensors: boolean;
}

/** What a microgame can see and do. */
export interface MicroCtx {
  /** 1-3, harder each level. */
  readonly level: number;
  /** Play time in milliseconds. */
  readonly durationMs: number;
  /** Seeded random in [0, 1): the same layout on every phone. */
  readonly rng: () => number;
  readonly input: MotionInput;
  /** Ends the microgame. Only the first call to win() or lose() counts. */
  win(): void;
  lose(): void;
  /** True once won or lost. */
  readonly over: boolean;
}

export interface Micro {
  /** `dt` and `t` (time since play began) are in seconds. Keeps running after it's over, for animations. */
  update?(dt: number, t: number): void;
  draw(g: CanvasRenderingContext2D, t: number): void;
  down?(p: Pointer): void;
  /** Only while a finger is down. */
  move?(p: Pointer): void;
  up?(p: Pointer): void;
}

export interface MicrogameImpl {
  /** Survive until time runs out to win (otherwise running out of time is a loss). */
  survive?: boolean;
  /** Played with the phone held sideways: draws in LW x LH. */
  landscape?: boolean;
  create(ctx: MicroCtx): Micro;
}

/** Small seeded PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Angle difference wrapped to -180..180 degrees. */
const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const wrapRad = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));

/**
 * Runs one microgame at a time on a canvas. load() draws its first frame, start()
 * sets it going; the result is reported once through onResult.
 *
 * A landscape microgame on a phone whose browser stays upright (rotation lock, or
 * it just hasn't turned yet) is drawn turned a quarter, so it reads right with the
 * phone turned sideways, top to the left.
 */
export class MicroRunner {
  readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private micro: Micro | null = null;
  private ctx: (MicroCtx & { finished: boolean | null }) | null = null;
  private survive = false;
  private landscape = false;
  private running = false;
  private startedAt = 0;
  private lastFrame = 0;
  private pressed = false;
  private raf = 0;
  /** Bumped on every load, so a frame loop left over from the last microgame stops itself. */
  private generation = 0;
  /** How the phone was held at the start, for measuring tilt and turn from. */
  private base: { beta: number; gamma: number; steer: number; shakes: number } | null = null;
  /** Touch fallback for motion: where the finger went down and where it is now. */
  private anchor: Pointer | null = null;
  private finger: Pointer | null = null;
  private touchShakes = 0;
  private swipeDir = 0;
  private swipeTravel = 0;

  constructor(
    private readonly onResult: (won: boolean) => void,
    /** Called when the screen's shape changes (width / height). */
    private readonly onLayout: (aspect: number, sideways: boolean) => void = () => {},
  ) {
    this.canvas.className = 'ww-canvas';
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this.pressed = true;
      this.input('down', e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.pressed) this.input('move', e);
    });
    const release = (e: PointerEvent) => {
      if (!this.pressed) return;
      this.pressed = false;
      this.input('up', e);
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    window.addEventListener('resize', this.resize);
  }

  /** A landscape game drawn turned on an upright screen. */
  get sideways() {
    return this.landscape && window.innerHeight > window.innerWidth;
  }

  /** Call once the canvas is on the page. */
  layout() {
    this.resize();
  }

  private resize = () => {
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const wide = this.landscape && !this.sideways;
    this.canvas.width = Math.round((wide ? LW : W) * ratio);
    this.canvas.height = Math.round((wide ? LH : H) * ratio);
    this.onLayout(this.canvas.width / this.canvas.height, this.sideways);
    if (this.micro) this.render(this.elapsed());
  };

  /** Seconds since start() (0 before it). */
  private elapsed() {
    return this.running ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  /** A touch, in the microgame's own coordinates. */
  private toGame(e: PointerEvent): Pointer {
    const rect = this.canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    if (this.sideways) return { x: v * LW, y: (1 - u) * LH };
    return this.landscape ? { x: u * LW, y: v * LH } : { x: u * W, y: v * H };
  }

  private input(kind: 'down' | 'move' | 'up', e: PointerEvent) {
    if (!this.running || !this.micro || this.ctx?.over) return;
    const p = this.toGame(e);
    this.trackFinger(kind, p);
    this.micro[kind]?.(p);
  }

  /** Keeps the drag that stands in for tilting, turning and shaking. */
  private trackFinger(kind: 'down' | 'move' | 'up', p: Pointer) {
    if (kind === 'down') {
      this.anchor = this.finger = p;
      this.swipeDir = 0;
      this.swipeTravel = 0;
    } else if (kind === 'move' && this.finger) {
      const dx = p.x - this.finger.x;
      if (dx !== 0) {
        const dir = Math.sign(dx);
        if (dir !== this.swipeDir) {
          if (this.swipeDir !== 0 && this.swipeTravel >= 30) this.touchShakes++;
          this.swipeDir = dir;
          this.swipeTravel = 0;
        }
        this.swipeTravel += Math.abs(dx);
      }
      this.finger = p;
    } else if (kind === 'up') {
      this.anchor = this.finger = null;
    }
  }

  /** Calibrates on the first reading, so "level" is however the phone was being held. */
  private baseline() {
    if (!sensorsLive()) return null;
    if (!this.base) {
      this.base = { beta: motion.beta!, gamma: motion.gamma!, steer: this.gravityAngle(), shakes: motion.shakes };
    }
    return this.base;
  }

  /** Which way is down within the screen's plane, in the phone's own axes. */
  private gravityAngle() {
    return Math.atan2(motion.gravity.x, motion.gravity.y);
  }

  private makeInput(): MotionInput {
    const runner = this;
    return {
      get sensors() {
        return sensorsLive();
      },
      tilt() {
        const base = runner.baseline();
        if (!base) {
          if (!runner.anchor || !runner.finger) return { x: 0, y: 0 };
          return {
            x: clamp((runner.finger.x - runner.anchor.x) / DRAG_TILT, -1, 1),
            y: clamp((runner.finger.y - runner.anchor.y) / DRAG_TILT, -1, 1),
          };
        }
        const dB = wrapDeg(motion.beta! - base.beta) / TILT_RANGE;
        const dG = wrapDeg(motion.gamma! - base.gamma) / TILT_RANGE;
        // Turn the phone's tilt into the game's screen directions.
        const angle = runner.sideways ? 90 : screenAngle();
        const [x, y] = angle === 90 ? [dB, -dG] : angle === 180 ? [-dG, -dB] : angle === 270 ? [-dB, dG] : [dG, dB];
        return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
      },
      steer() {
        const base = runner.baseline();
        if (!base) {
          if (!runner.anchor || !runner.finger) return 0;
          return clamp((runner.finger.x - runner.anchor.x) / DRAG_STEER, -1.2, 1.2);
        }
        // Lying flat, the phone has no "wheel" angle.
        if (Math.hypot(motion.gravity.x, motion.gravity.y) < 3) return 0;
        return -wrapRad(runner.gravityAngle() - base.steer);
      },
      shakes() {
        const base = runner.baseline();
        return base ? motion.shakes - base.shakes : runner.touchShakes;
      },
      jitter() {
        return runner.baseline() ? motion.jitter : 0;
      },
    };
  }

  load(impl: MicrogameImpl, level: number, durationMs: number, seed: number) {
    this.stopLoop();
    this.generation++;
    this.running = false;
    this.pressed = false;
    this.survive = !!impl.survive;
    this.landscape = !!impl.landscape;
    this.base = null;
    this.anchor = this.finger = null;
    this.touchShakes = 0;
    this.micro = null;
    this.resize();
    const ctx = {
      level,
      durationMs,
      rng: seededRandom(seed),
      input: this.makeInput(),
      finished: null as boolean | null,
      get over() {
        return ctx.finished !== null;
      },
      win: () => this.finish(true),
      lose: () => this.finish(false),
    };
    this.ctx = ctx;
    this.micro = impl.create(ctx);
    this.render(0);
  }

  /** Starts play with `playMs` on the clock (less than the full time if we joined late). */
  start(playMs: number) {
    if (!this.micro || this.running) return;
    this.running = true;
    // Measure tilt and turn from how the phone is held right now.
    this.base = null;
    this.baseline();
    this.startedAt = performance.now() - Math.max(0, this.ctx!.durationMs - playMs);
    this.lastFrame = performance.now();
    const generation = this.generation;
    const frame = (now: number) => {
      if (generation !== this.generation) return;
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      const t = this.elapsed();
      if (!this.ctx!.over && t * 1000 >= this.ctx!.durationMs) this.finish(this.survive);
      this.micro!.update?.(dt, t);
      this.render(t);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** 0-1 of the play time left, for the fuse. */
  timeLeft(): number {
    if (!this.ctx) return 0;
    if (!this.running) return 1;
    return Math.max(0, 1 - (this.elapsed() * 1000) / this.ctx.durationMs);
  }

  get result(): boolean | null {
    return this.ctx?.finished ?? null;
  }

  private finish(won: boolean) {
    if (!this.ctx || this.ctx.finished !== null || !this.running) return;
    this.ctx.finished = won;
    this.onResult(won);
  }

  private render(t: number) {
    const g = this.g;
    const k = this.canvas.width / (this.landscape && !this.sideways ? LW : W);
    // Sideways: game x runs down the screen and game y runs right to left.
    if (this.sideways) g.setTransform(0, k, -k, 0, k * W, 0);
    else g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, LW, LW);
    g.save();
    this.micro?.draw(g, t);
    g.restore();
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stopLoop();
    this.generation++;
    window.removeEventListener('resize', this.resize);
    this.micro = null;
  }
}

// ---- Helpers for microgames ---------------------------------------------------

export const PALETTE = {
  bg: '#140f2e',
  panel: '#2c2366',
  panelLight: '#3b3185',
  text: '#ffffff',
  muted: '#b8b0e8',
  accent: '#ffd166',
  danger: '#ff5d73',
  correct: '#4caf6a',
  blue: '#5ec8f2',
  purple: '#8b7cf6',
  pink: '#f472d0',
};

export const rand = (rng: () => number, min: number, max: number) => min + rng() * (max - min);
export const randInt = (rng: () => number, min: number, max: number) => Math.floor(rand(rng, min, max + 1));
export const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** By level: [level 1, level 2, level 3]. */
export const byLevel = <T>(ctx: MicroCtx, values: readonly [T, T, T]): T => values[clamp(ctx.level, 1, 3) - 1];

/** Distance from point p to the segment a-b. */
export function distToSegment(p: Pointer, a: Pointer, b: Pointer): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return dist(p.x, p.y, a.x + u * dx, a.y + u * dy);
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function emoji(g: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, opts: { rot?: number; flip?: boolean; alpha?: number } = {}) {
  g.save();
  g.translate(x, y);
  if (opts.rot) g.rotate(opts.rot);
  if (opts.flip) g.scale(-1, 1);
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.font = `${size}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 0, 0);
  g.restore();
}

export function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string = PALETTE.text) {
  g.save();
  g.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size / 7);
  g.strokeStyle = PALETTE.bg;
  g.lineJoin = 'round';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.restore();
}

/** Fills the whole screen with a top-to-bottom gradient (pass `height` LH for landscape games). */
export function fillBg(g: CanvasRenderingContext2D, top: string, bottom = top, height = H) {
  const grad = g.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, LW, H);
}

export function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = color;
  g.fill();
}
