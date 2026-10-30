import Phaser from 'phaser';
import {
  BALL_R,
  BOARD_SIZE,
  CENTER,
  COLORS as BALL_COLORS,
  TRACKS,
  TURRET_R,
  aimVector,
  trackOutline,
  trackById,
  trackPoint,
  type SpiralBoardView,
  type SpiralHostView,
} from '../../../shared/games/spiralShot';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

/** The boards fill this area, in a grid. */
const AREA = { x: 20, y: 130, w: WIDTH - 40, h: HEIGHT - 145 };
const GAP = 16;
const BALL_FILLS = BALL_COLORS.map(hex);
/** The head this far along the track lights up the hole as a warning. */
const DANGER_FROM = 0.8;

interface Snapshot {
  at: number;
  chain: Map<number, { s: number; color: number }>;
  shots: Map<number, { x: number; y: number; color: number }>;
  angle: number;
}

/** One board on screen: what's drawn every frame, and the last two updates to move smoothly between. */
interface BoardSlot {
  playerId: string;
  x: number;
  y: number;
  size: number;
  container: Phaser.GameObjects.Container;
  dynamic: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  statText: Phaser.GameObjects.Text;
  banner: Phaser.GameObjects.Container;
  prev: Snapshot | null;
  curr: Snapshot | null;
  view: SpiralBoardView;
  /** The round `curr` is from: marbles only pop within a round. */
  puzzle: number;
}

/** The best grid for `n` square boards in the area. */
function gridFor(n: number) {
  let best = { cols: 1, rows: 1, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.min((AREA.w - GAP * (cols - 1)) / cols, (AREA.h - GAP * (rows - 1)) / rows);
    if (size > best.size) best = { cols, rows, size };
  }
  return best;
}

function snapshot(b: SpiralBoardView, at: number): Snapshot {
  const chain = new Map<number, { s: number; color: number }>();
  for (let i = 0; i < b.chain.length; i += 3) chain.set(b.chain[i], { s: b.chain[i + 1], color: b.chain[i + 2] });
  const shots = new Map<number, { x: number; y: number; color: number }>();
  for (let i = 0; i < b.shots.length; i += 4) shots.set(b.shots[i], { x: b.shots[i + 1], y: b.shots[i + 2], color: b.shots[i + 3] });
  return { at, chain, shots, angle: b.angle };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * The TV during Spiral Shot: a board per player, side by side. Each shows its chain rolling round
 * the spiral toward the hole and its turret firing. The server sends the boards about 15 times a
 * second, and the TV moves everything smoothly between the last two.
 */
export class SpiralShotScene extends Phaser.Scene {
  static readonly KEY = 'spiral-shot';

  private view: SpiralHostView | null = null;
  private slots: BoardSlot[] = [];
  private slotsKey = '';
  private track = TRACKS[0];
  private phaseKey = '';
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private boardLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(SpiralShotScene.KEY);
  }

  create() {
    this.view = null;
    this.slots = [];
    this.slotsKey = this.phaseKey = '';
    addBackdrop(this);
    this.makeTextures();
    text(this, 250, 70, 'SPIRAL SHOT', 54, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2, 70, '', 40);
    this.timerText = text(this, WIDTH - 140, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.boardLayer = this.add.container(0, 0);
    this.countdownText = text(this, WIDTH / 2, HEIGHT / 2, '', 260, COLORS.accent, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 16 }).setDepth(40);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: SpiralHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as SpiralHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  /** A soft dot for pop sparks. */
  private makeTextures() {
    if (this.textures.exists('ss-spark')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('ss-spark', 16, 16);
    g.destroy();
  }

  private applyView(view: SpiralHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.track = trackById(view.trackId);
    this.headerText.setText(`Round ${view.puzzleNumber} of ${view.totalPuzzles} · ${this.track.name}`);

    const key = `${view.puzzleNumber}|${view.trackId}|${view.boards.map((b) => b.playerId).join(',')}`;
    if (key !== this.slotsKey) {
      this.slotsKey = key;
      this.buildSlots(view.boards);
    }
    const now = performance.now();
    for (const slot of this.slots) {
      const b = view.boards.find((o) => o.playerId === slot.playerId);
      if (!b) continue;
      const next = snapshot(b, now);
      const sameRound = slot.puzzle === view.puzzleNumber;
      if (slot.curr && sameRound && view.phase === 'play') this.popsBetween(slot, slot.curr, next);
      slot.prev = sameRound ? (slot.curr ?? next) : next;
      slot.puzzle = view.puzzleNumber;
      slot.curr = next;
      slot.view = b;
    }

    const phaseKey = `${view.puzzleNumber}|${view.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.overlay.removeAll(true);
      if (view.phase === 'result') {
        for (const slot of this.slots) this.showResult(slot);
        if (this.slots.some((s) => s.view.outAtMs === null)) burstConfetti(this, WIDTH / 2, HEIGHT / 3, 60);
      }
      if (view.phase === 'gameEnd') {
        showRoundScores(
          this,
          this.overlay,
          view.boards.map((b) => ({ name: b.name, color: b.color, points: view.gamePoints[b.playerId] ?? 0 })),
        );
      }
    }
    for (const slot of this.slots) this.updateLabels(slot);
  }

  /** Lays out a board per player and draws the parts that don't move. */
  private buildSlots(boards: SpiralBoardView[]) {
    this.boardLayer.removeAll(true);
    const { cols, rows, size } = gridFor(Math.max(1, boards.length));
    const gridW = cols * size + (cols - 1) * GAP;
    const gridH = rows * size + (rows - 1) * GAP;
    const scale = size / BOARD_SIZE;
    const outline = trackOutline(this.track);
    this.slots = boards.map((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Centre a short last row.
      const inRow = row === rows - 1 ? boards.length - row * cols : cols;
      const rowW = inRow * size + (inRow - 1) * GAP;
      const x = AREA.x + (AREA.w - gridW) / 2 + (gridW - rowW) / 2 + col * (size + GAP);
      const y = AREA.y + (AREA.h - gridH) / 2 + row * (size + GAP);
      const container = this.add.container(x, y).setScale(scale);
      this.boardLayer.add(container);

      // The board, edged in the player's colour, and the track: a groove with a lighter floor.
      const g = this.add.graphics();
      g.fillStyle(0x1a1442, 0.95).fillRoundedRect(0, 0, BOARD_SIZE, BOARD_SIZE, 40);
      g.lineStyle(10, hex(b.color), 0.9).strokeRoundedRect(0, 0, BOARD_SIZE, BOARD_SIZE, 40);
      g.lineStyle(BALL_R * 2 + 16, 0x0c0920, 1).strokePoints(outline, false);
      g.lineStyle(BALL_R * 2 + 4, 0x2c2366, 1).strokePoints(outline, false);
      // Where marbles come in.
      const entry = trackPoint(this.track, 0);
      const tunnel = trackPoint(this.track, -70);
      g.lineStyle(BALL_R * 2 + 20, 0x0c0920, 1).lineBetween(tunnel.x, tunnel.y, entry.x, entry.y);
      container.add(g);

      const dynamic = this.add.graphics();
      container.add(dynamic);
      const nameText = text(this, 40, 44, b.name, 52, b.color, { fontStyle: '700' }).setOrigin(0, 0.5);
      const statText = text(this, BOARD_SIZE - 40, 44, '', 40, COLORS.muted, { fontStyle: '700' }).setOrigin(1, 0.5);
      const banner = this.add.container(BOARD_SIZE / 2, BOARD_SIZE / 2);
      container.add([nameText, statText, banner]);
      return { playerId: b.playerId, x, y, size, container, dynamic, nameText, statText, banner, prev: null, curr: null, view: b, puzzle: 0 };
    });
  }

  /** Marbles gone from the chain since the last update popped: a burst of sparks where they were. */
  private popsBetween(slot: BoardSlot, before: Snapshot, after: Snapshot) {
    const scale = slot.size / BOARD_SIZE;
    for (const [id, m] of before.chain) {
      if (after.chain.has(id) || m.s < 0) continue;
      const p = trackPoint(this.track, m.s);
      const sparks = this.add.particles(slot.x + p.x * scale, slot.y + p.y * scale, 'ss-spark', {
        speed: { min: 60, max: 220 },
        scale: { start: Math.max(0.4, scale * 1.6), end: 0 },
        lifespan: 450,
        tint: BALL_FILLS[m.color],
        emitting: false,
      });
      sparks.setDepth(30);
      sparks.explode(10);
      this.time.delayedCall(600, () => sparks.destroy());
    }
  }

  private updateLabels(slot: BoardSlot) {
    const b = slot.view;
    slot.statText.setText(b.outAtMs !== null ? `OUT ${Math.floor(b.outAtMs / 1000)}s` : `${b.pops} popped`);
    slot.statText.setColor(b.outAtMs !== null ? COLORS.danger : COLORS.muted);
    // A board that's out dims, with a banner, as soon as it happens.
    if (b.outAtMs !== null && slot.banner.length === 0 && this.view?.phase === 'play') {
      slot.banner.add(text(this, 0, 0, 'OUT!', 200, COLORS.danger, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 20 }));
      slot.banner.setScale(0.3);
      this.tweens.add({ targets: slot.banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.cameras.main.shake(200, 0.004);
    }
  }

  private showResult(slot: BoardSlot) {
    const b = slot.view;
    slot.banner.removeAll(true);
    const survived = b.outAtMs === null;
    slot.banner.add(this.add.rectangle(0, 0, BOARD_SIZE * 0.8, 330, 0x0a0720, 0.85).setStrokeStyle(8, hex(survived ? COLORS.accent : COLORS.danger)));
    slot.banner.add(text(this, 0, -70, survived ? 'SURVIVED!' : `OUT AT ${Math.floor(b.outAtMs! / 1000)}s`, 90, survived ? COLORS.accent : COLORS.danger, { fontStyle: '700' }));
    slot.banner.add(text(this, 0, 60, `+${b.points.toLocaleString()}`, 110, COLORS.text, { fontStyle: '700' }));
    slot.banner.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: slot.banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
  }

  update(time: number) {
    const v = this.view;
    if (!v) return;
    const now = performance.now();
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000));
    this.timerText.setText(v.phase === 'play' ? String(secs) : '').setColor(secs <= 10 ? COLORS.danger : COLORS.text);
    this.countdownText.setText(v.phase === 'ready' ? String(Math.max(1, secs)) : '');
    for (const slot of this.slots) this.drawBoard(slot, now, time);
  }

  private drawBoard(slot: BoardSlot, now: number, time: number) {
    const g = slot.dynamic.clear();
    const { prev, curr, view: b } = slot;
    if (!prev || !curr) return;
    // Between the last two updates, a step behind, so it's always smooth.
    const span = Math.max(1, curr.at - prev.at);
    const t = Math.min(1, (now - curr.at) / span);
    const out = b.outAtMs !== null;

    // The hole: glows red as the chain's head gets close.
    let head = 0;
    for (const m of curr.chain.values()) head = Math.max(head, m.s);
    const danger = Math.max(0, (head / this.track.length - DANGER_FROM) / (1 - DANGER_FROM));
    const hole = trackPoint(this.track, this.track.length);
    if (danger > 0) g.fillStyle(0xff5d73, danger * (0.35 + 0.25 * Math.sin(time / 120))).fillCircle(hole.x, hole.y, BALL_R * 3.2);
    g.fillStyle(0x000000, 1).fillCircle(hole.x, hole.y, BALL_R * 1.9);
    g.lineStyle(6, danger > 0 ? 0xff5d73 : hex(b.color), 1).strokeCircle(hole.x, hole.y, BALL_R * 1.9);

    // The chain.
    for (const [id, m] of curr.chain) {
      const was = prev.chain.get(id);
      const s = was ? lerp(was.s, m.s, t) : m.s;
      if (s < -BALL_R) continue;
      const p = trackPoint(this.track, s);
      this.marble(g, p.x, p.y, m.color, BALL_R);
    }

    // The aim line and the turret.
    const angle = lerpAngle(prev.angle, curr.angle, t);
    const dir = aimVector(angle);
    if (!out) {
      g.lineStyle(4, 0xffffff, 0.18);
      for (let d = TURRET_R + 20; d < 420; d += 34) g.lineBetween(CENTER.x + dir.x * d, CENTER.y + dir.y * d, CENTER.x + dir.x * (d + 16), CENTER.y + dir.y * (d + 16));
    }
    const barrelEnd = { x: CENTER.x + dir.x * (TURRET_R + 26), y: CENTER.y + dir.y * (TURRET_R + 26) };
    g.lineStyle(30, 0x0c0920, 1).lineBetween(CENTER.x, CENTER.y, barrelEnd.x, barrelEnd.y);
    g.lineStyle(20, hex(b.color), 1).lineBetween(CENTER.x, CENTER.y, barrelEnd.x, barrelEnd.y);
    g.fillStyle(0x0c0920, 1).fillCircle(CENTER.x, CENTER.y, TURRET_R + 6);
    g.fillStyle(hex(b.color), 1).fillCircle(CENTER.x, CENTER.y, TURRET_R);
    if (b.current >= 0) this.marble(g, CENTER.x, CENTER.y, b.current, BALL_R + 2);
    // The next marble, small, behind the barrel.
    if (b.next >= 0) this.marble(g, CENTER.x - dir.x * (TURRET_R - 14), CENTER.y - dir.y * (TURRET_R - 14), b.next, BALL_R * 0.55);

    // Shots in flight.
    for (const [id, s] of curr.shots) {
      const was = prev.shots.get(id);
      this.marble(g, was ? lerp(was.x, s.x, t) : s.x, was ? lerp(was.y, s.y, t) : s.y, s.color, BALL_R);
    }

    slot.container.setAlpha(out && this.view?.phase === 'play' ? 0.55 : 1);
  }

  /** A shiny marble: its colour, a shadow underneath and a highlight on top. */
  private marble(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, r: number) {
    g.fillStyle(0x000000, 0.35).fillCircle(x + r * 0.12, y + r * 0.18, r);
    g.fillStyle(BALL_FILLS[color] ?? 0xffffff, 1).fillCircle(x, y, r);
    g.fillStyle(0x000000, 0.18).fillCircle(x + r * 0.25, y + r * 0.3, r * 0.65);
    g.fillStyle(BALL_FILLS[color] ?? 0xffffff, 1).fillCircle(x - r * 0.08, y - r * 0.1, r * 0.62);
    g.fillStyle(0xffffff, 0.75).fillCircle(x - r * 0.35, y - r * 0.38, r * 0.24);
  }
}
