// The phone side of a WoochaWare microgame: a canvas, a frame loop and touch input.
// Every microgame draws in a fixed W x H space, scaled to fit the phone.

export const W = 360;
export const H = 560;

export interface Pointer {
  x: number;
  y: number;
}

/** What a microgame can see and do. */
export interface MicroCtx {
  /** 1-3, harder each level. */
  readonly level: number;
  /** Play time in milliseconds. */
  readonly durationMs: number;
  /** Seeded random in [0, 1): the same layout on every phone. */
  readonly rng: () => number;
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

/**
 * Runs one microgame at a time on a canvas. load() draws its first frame, start()
 * sets it going; the result is reported once through onResult.
 */
export class MicroRunner {
  readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private micro: Micro | null = null;
  private ctx: (MicroCtx & { finished: boolean | null }) | null = null;
  private survive = false;
  private running = false;
  private startedAt = 0;
  private lastFrame = 0;
  private pressed = false;
  private raf = 0;

  constructor(private readonly onResult: (won: boolean) => void) {
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
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = () => {
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * ratio);
    this.canvas.height = Math.round(H * ratio);
    if (this.micro) this.render(this.elapsed());
  };

  /** Seconds since start() (0 before it). */
  private elapsed() {
    return this.running ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  private input(kind: 'down' | 'move' | 'up', e: PointerEvent) {
    if (!this.running || !this.micro || this.ctx?.over) return;
    const rect = this.canvas.getBoundingClientRect();
    const p = { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
    this.micro[kind]?.(p);
  }

  load(impl: MicrogameImpl, level: number, durationMs: number, seed: number) {
    this.stopLoop();
    this.running = false;
    this.pressed = false;
    this.survive = !!impl.survive;
    const ctx = {
      level,
      durationMs,
      rng: seededRandom(seed),
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
    this.startedAt = performance.now() - Math.max(0, this.ctx!.durationMs - playMs);
    this.lastFrame = performance.now();
    const frame = (now: number) => {
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
    g.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0);
    g.clearRect(0, 0, W, H);
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

export function fillBg(g: CanvasRenderingContext2D, top: string, bottom = top) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
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
