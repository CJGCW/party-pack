import Phaser from 'phaser';
import { DANGER, FLOOR_A, FLOOR_DARK, INK, ball, gridFloor, softShadow } from '../art';
import { burst } from '../fx';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import {
  BALL_R,
  BOARD_SIZE,
  CENTER,
  COLORS as BALL_COLORS,
  TRACKS,
  TURRET_R,
  aimVector,
  trackById,
  trackOutline,
  trackPoint,
  type SpiralBoardState,
  type SpiralRound,
} from '../../../shared/games/spiralShot';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

const BALL_FILLS = BALL_COLORS.map(hex);
/** The head this far along the track lights up the hole as a warning. */
const DANGER_FROM = 0.8;

interface Snap {
  chain: Map<number, { s: number; color: number }>;
  shots: Map<number, { x: number; y: number; color: number }>;
  angle: number;
}

type Slot = BoardSlot<SpiralBoardState, Snap>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * The TV during Spiral Shot: a board per player, side by side (see ../boardsScene). Each shows its
 * chain rolling round the track toward the hole and its turret firing.
 */
export class SpiralShotScene extends BoardsScene<SpiralBoardState, SpiralRound, Snap> {
  static readonly KEY = 'spiral-shot';
  protected readonly title = 'SPIRAL SHOT';
  protected readonly scoring = 'survival';
  protected readonly boardW = BOARD_SIZE;
  protected readonly boardH = BOARD_SIZE;
  private track = TRACKS[0];

  constructor() {
    super(SpiralShotScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<SpiralBoardState, SpiralRound>) {
    this.track = trackById(view.round.trackId);
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles} · ${this.track.name}`;
  }

  protected layoutKey(view: BoardsHostView<SpiralBoardState, SpiralRound>) {
    return view.round.trackId;
  }

  protected statusText(board: BoardView<SpiralBoardState>) {
    return `${board.state.pops} popped`;
  }

  protected snapshot(board: BoardView<SpiralBoardState>): Snap {
    const b = board.state;
    const chain = new Map<number, { s: number; color: number }>();
    for (let i = 0; i < b.chain.length; i += 3) chain.set(b.chain[i], { s: b.chain[i + 1], color: b.chain[i + 2] });
    const shots = new Map<number, { x: number; y: number; color: number }>();
    for (let i = 0; i < b.shots.length; i += 4) shots.set(b.shots[i], { x: b.shots[i + 1], y: b.shots[i + 2], color: b.shots[i + 3] });
    return { chain, shots, angle: b.angle };
  }

  /** Marbles gone from the chain since the last update popped: a burst of sparks where they were. */
  protected onSnapshot(slot: Slot, before: Snap, after: Snap) {
    for (const [id, m] of before.chain) {
      if (after.chain.has(id) || m.s < 0) continue;
      const p = trackPoint(this.track, m.s);
      const at = this.screenOf(slot, p.x, p.y);
      burst(this, at.x, at.y, BALL_FILLS[m.color], 10);
    }
  }

  /** The track: a groove with a lighter floor, and the tunnel marbles come in by. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    gridFloor(g, BOARD_SIZE, BOARD_SIZE, 60, 4, 0x8b7cf6);
    const outline = trackOutline(this.track);
    g.lineStyle(BALL_R * 2 + 16, INK, 1).strokePoints(outline, false);
    g.lineStyle(BALL_R * 2 + 4, FLOOR_A, 1).strokePoints(outline, false);
    const entry = trackPoint(this.track, 0);
    const tunnel = trackPoint(this.track, -70);
    g.lineStyle(BALL_R * 2 + 20, FLOOR_DARK, 1).lineBetween(tunnel.x, tunnel.y, entry.x, entry.y);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    const b = slot.board.state;
    const color = hex(slot.board.color);
    const out = slot.board.endedAtMs !== null;

    // The hole: glows red as the chain's head gets close.
    let head = 0;
    for (const m of curr.chain.values()) head = Math.max(head, m.s);
    const danger = Math.max(0, (head / this.track.length - DANGER_FROM) / (1 - DANGER_FROM));
    const hole = trackPoint(this.track, this.track.length);
    if (danger > 0) g.fillStyle(DANGER, danger * (0.35 + 0.25 * Math.sin(time / 120))).fillCircle(hole.x, hole.y, BALL_R * 3.2);
    g.fillStyle(0x000000, 1).fillCircle(hole.x, hole.y, BALL_R * 1.9);
    g.lineStyle(6, danger > 0 ? DANGER : color, 1).strokeCircle(hole.x, hole.y, BALL_R * 1.9);

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
    g.lineStyle(30, INK, 1).lineBetween(CENTER.x, CENTER.y, barrelEnd.x, barrelEnd.y);
    g.lineStyle(20, color, 1).lineBetween(CENTER.x, CENTER.y, barrelEnd.x, barrelEnd.y);
    softShadow(g, CENTER.x + 6, CENTER.y + TURRET_R, TURRET_R * 2.2, TURRET_R);
    ball(g, CENTER.x, CENTER.y, TURRET_R, color);
    if (b.current >= 0) this.marble(g, CENTER.x, CENTER.y, b.current, BALL_R + 2);
    // The next marble, small, behind the barrel.
    if (b.next >= 0) this.marble(g, CENTER.x - dir.x * (TURRET_R - 14), CENTER.y - dir.y * (TURRET_R - 14), b.next, BALL_R * 0.55);

    // Shots in flight.
    for (const [id, s] of curr.shots) {
      const was = prev.shots.get(id);
      this.marble(g, was ? lerp(was.x, s.x, t) : s.x, was ? lerp(was.y, s.y, t) : s.y, s.color, BALL_R);
    }
  }

  /** A shiny marble: its colour, a shadow underneath and a highlight on top. */
  private marble(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, r: number) {
    ball(g, x, y, r * 0.9, BALL_FILLS[color] ?? 0xffffff);
  }
}
