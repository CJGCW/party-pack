import Phaser from 'phaser';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import {
  BLOCK_W,
  COPTER_R,
  COPTER_X,
  METRES_PER_UNIT,
  VIEW_H,
  VIEW_W,
  blocksBetween,
  caveAt,
  type CaveBoardState,
} from '../../../shared/games/caveFlyer';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<CaveBoardState, CaveBoardState>;

/** The cave's outline is worked out every this many units across the window. */
const STEP = 16;
const ROCK = 0x3b2f6e;
const ROCK_EDGE = 0x8b7cf6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The TV during Cave Flyer: a window onto each player's cave, side by side (see ../boardsScene).
 * Everyone's cave is the same (from the round's seed), so the TV draws it from the seed and each
 * board's distance; the copter is drawn where the server has it.
 */
export class CaveFlyerScene extends BoardsScene<CaveBoardState> {
  static readonly KEY = 'cave-flyer';
  protected readonly title = 'CAVE FLYER';
  protected readonly scoring = 'survival';
  protected readonly boardW = VIEW_W;
  protected readonly boardH = VIEW_H;
  private seed = 0;
  /** Each board's recent copter positions (cave distance, y), for the trail. */
  private trails = new Map<string, { x: number; y: number }[]>();

  constructor() {
    super(CaveFlyerScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<CaveBoardState>) {
    if (view.seed !== this.seed) this.trails.clear();
    this.seed = view.seed;
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }

  protected statusText(board: BoardView<CaveBoardState>) {
    return `${Math.round(board.state.distance * METRES_PER_UNIT)} m`;
  }

  protected drawStatic() {}

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    const distance = lerp(prev.distance, curr.distance, t);
    const y = lerp(prev.y, curr.y, t);
    const vy = lerp(prev.vy, curr.vy, t);
    const color = hex(slot.board.color);
    const crashed = slot.board.endedAtMs !== null;

    // The roof and the floor: rock above and below the cave's outline.
    const roof: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, 0)];
    const floor: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, VIEW_H)];
    for (let sx = 0; sx <= VIEW_W + STEP; sx += STEP) {
      const cave = caveAt(this.seed, distance + sx);
      roof.push(new Phaser.Math.Vector2(sx, cave.top));
      floor.push(new Phaser.Math.Vector2(sx, cave.bottom));
    }
    roof.push(new Phaser.Math.Vector2(VIEW_W + STEP, 0));
    floor.push(new Phaser.Math.Vector2(VIEW_W + STEP, VIEW_H));
    g.fillStyle(ROCK, 1).fillPoints(roof, true).fillPoints(floor, true);
    g.lineStyle(8, ROCK_EDGE, 0.8).strokePoints(roof.slice(1, -1), false).strokePoints(floor.slice(1, -1), false);

    // Blocks in the way.
    for (const b of blocksBetween(this.seed, distance - BLOCK_W, distance + VIEW_W)) {
      const bx = b.x - distance;
      g.fillStyle(ROCK, 1).fillRoundedRect(bx, b.top, BLOCK_W, b.bottom - b.top, 10);
      g.lineStyle(6, ROCK_EDGE, 0.9).strokeRoundedRect(bx, b.top, BLOCK_W, b.bottom - b.top, 10);
    }

    // A trail behind the copter, fading out.
    let trail = this.trails.get(slot.playerId) ?? [];
    if (!crashed) {
      const last = trail[trail.length - 1];
      if (!last || distance + COPTER_X - last.x > 14) trail.push({ x: distance + COPTER_X, y });
      trail = trail.filter((p) => p.x > distance - 20);
      this.trails.set(slot.playerId, trail);
    }
    trail.forEach((p, i) => g.fillStyle(color, (0.35 * (i + 1)) / trail.length).fillCircle(p.x - distance, p.y, 6 + (8 * i) / trail.length));

    this.copter(g, COPTER_X, y, vy, color, curr.holding && !crashed, crashed, time);
  }

  /** The copter: a round body in the player's colour, tipped by how fast it's climbing or falling, with a spinning rotor. */
  private copter(g: Phaser.GameObjects.Graphics, x: number, y: number, vy: number, color: number, thrusting: boolean, crashed: boolean, time: number) {
    const tilt = Phaser.Math.Clamp(vy / 900, -0.45, 0.45);
    const r = COPTER_R;
    const at = (dx: number, dy: number) => new Phaser.Math.Vector2(x + dx * Math.cos(tilt) - dy * Math.sin(tilt), y + dx * Math.sin(tilt) + dy * Math.cos(tilt));
    // The tail.
    g.lineStyle(10, color, 1).lineBetween(at(-r * 0.6, 0).x, at(-r * 0.6, 0).y, at(-r * 2, -r * 0.2).x, at(-r * 2, -r * 0.2).y);
    g.fillStyle(color, 1).fillCircle(at(-r * 2, -r * 0.2).x, at(-r * 2, -r * 0.2).y, r * 0.3);
    // The body and its window.
    g.fillStyle(0x140f2e, 1).fillCircle(x, y, r + 4);
    g.fillStyle(crashed ? 0x555066 : color, 1).fillCircle(x, y, r);
    const w = at(r * 0.35, -r * 0.15);
    g.fillStyle(0xdff6ff, 0.9).fillCircle(w.x, w.y, r * 0.42);
    // The rotor: a blade whose visible length spins.
    if (!crashed) {
      const spin = Math.abs(Math.sin(time / 30)) * r * 1.6 + r * 0.3;
      const hub = at(0, -r * 1.15);
      g.lineStyle(5, 0x140f2e, 1).lineBetween(at(0, -r).x, at(0, -r).y, hub.x, hub.y);
      g.lineStyle(6, 0xffffff, 0.9).lineBetween(hub.x - spin * Math.cos(tilt), hub.y - spin * Math.sin(tilt), hub.x + spin * Math.cos(tilt), hub.y + spin * Math.sin(tilt));
    }
    // Climbing: a puff under the copter.
    if (thrusting) {
      const p = at(0, r * 1.3);
      g.fillStyle(0xffd166, 0.55 + 0.25 * Math.sin(time / 40)).fillCircle(p.x, p.y, r * 0.38);
    }
  }
}
