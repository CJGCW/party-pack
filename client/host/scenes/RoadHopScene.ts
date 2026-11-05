import Phaser from 'phaser';
import { DANGER, GOLD, INK, STONE, WOOD, ball, block, shade, softShadow } from '../art';
import { burst } from '../fx';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import {
  CELL,
  HOPPER_R,
  HOPPER_ROW_ON_SCREEN,
  VIEW_H,
  VIEW_W,
  lanesFor,
  movers,
  train,
  type HopState,
  type Lane,
} from '../../../shared/games/roadHop';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<HopState, HopState>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const CAR_COLORS = [0xff5d73, 0xffd166, 0x5ec8f2, 0xb48cff, 0xff9f43];

/**
 * The TV during Road Hop: everyone's crossing side by side (see ../boardsScene). The lanes come
 * from the round's seed and everything in them moves with the round's clock; each hopper comes
 * from the server.
 */
export class RoadHopScene extends BoardsScene<HopState> {
  static readonly KEY = 'road-hop';
  protected readonly title = 'ROAD HOP';
  protected readonly scoring = 'best';
  protected readonly boardW = VIEW_W;
  protected readonly boardH = VIEW_H;
  private lanes: Lane[] = [];
  private clock = { roundMs: 0, at: 0, playing: false };

  constructor() {
    super(RoadHopScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<HopState>) {
    this.lanes = lanesFor(view.seed);
    this.clock = { roundMs: view.roundMs, at: performance.now(), playing: view.phase === 'play' };
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }

  protected statusText(board: BoardView<HopState>) {
    return `${board.boardScore} rows`;
  }

  protected resultTitle(board: BoardView<HopState>) {
    return { title: `${board.boardScore} ROWS`, good: board.place === 1 };
  }

  protected drawStatic() {}

  protected onSnapshot(slot: Slot, prev: HopState, next: HopState) {
    if (next.hit && !prev.hit) {
      const at = this.screenOf(slot, prev.x, VIEW_H - (HOPPER_ROW_ON_SCREEN + 0.5) * CELL);
      burst(this, at.x, at.y, hex(slot.board.color), 30);
    }
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    const ms = this.clock.playing ? this.clock.roundMs + (performance.now() - this.clock.at) : this.clock.roundMs;
    // The view follows the hopper (straight to it after being sent back).
    const row = Math.abs(curr.row - prev.row) > 1 ? curr.row : lerp(prev.row, curr.row, t);
    const camera = Math.max(0, row - HOPPER_ROW_ON_SCREEN);
    const rowY = (r: number) => VIEW_H - (r - camera + 1) * CELL;

    const firstRow = Math.max(0, Math.floor(camera) - 1);
    const lastRow = Math.ceil(camera + VIEW_H / CELL) + 1;
    for (let r = firstRow; r <= lastRow && r < this.lanes.length; r++) this.lane(g, this.lanes[r], rowY(r), ms, time);

    // The hopper: a round little bird in the player's colour, beak the way it last hopped, with a hop in its step.
    const x = Math.abs(curr.x - prev.x) > CELL * 1.5 ? curr.x : lerp(prev.x, curr.x, t);
    const hopLift = curr.row !== prev.row ? Math.sin(Math.min(1, t) * Math.PI) * 18 : 0;
    const y = rowY(row) + CELL / 2 - hopLift;
    const color = curr.hit && Math.floor(time / 110) % 2 ? DANGER : hex(slot.board.color);
    softShadow(g, x + 4, rowY(row) + CELL * 0.82, HOPPER_R * 2, HOPPER_R * 0.6);
    ball(g, x, y, HOPPER_R, color);
    const [bx, by] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[curr.facing];
    g.fillStyle(GOLD, 1).fillTriangle(x + bx * HOPPER_R * 1.5, y + by * HOPPER_R * 1.5, x + by * 8 + bx * HOPPER_R * 0.6, y - bx * 8 + by * HOPPER_R * 0.6, x - by * 8 + bx * HOPPER_R * 0.6, y + bx * 8 + by * HOPPER_R * 0.6);
    g.fillStyle(INK, 1).fillCircle(x + bx * 6 - by * 9, y + by * 6 - 6 - bx * 3, 4).fillCircle(x + bx * 6 + by * 9, y + by * 6 - 6 + bx * 3, 4);
  }

  /** A lane and what's in it, at screen height `y` (its top). */
  private lane(g: Phaser.GameObjects.Graphics, lane: Lane, y: number, ms: number, time: number) {
    if (lane.kind === 'grass') {
      g.fillStyle(lane.row % 2 ? 0x2f7d4f : 0x2c7549, 1).fillRect(0, y, VIEW_W, CELL);
      for (const c of lane.trees) {
        const cx = (c + 0.5) * CELL;
        softShadow(g, cx, y + CELL * 0.88, CELL * 0.7, CELL * 0.2);
        g.fillStyle(WOOD, 1).fillRect(cx - 6, y + CELL * 0.55, 12, CELL * 0.35);
        ball(g, cx, y + CELL * 0.4, CELL * 0.34, 0x4cd37a);
      }
    } else if (lane.kind === 'road') {
      g.fillStyle(0x2b2748, 1).fillRect(0, y, VIEW_W, CELL);
      g.fillStyle(0xffffff, 0.25);
      for (let x = 10; x < VIEW_W; x += 70) g.fillRect(x, y + CELL - 4, 36, 4);
      for (const x of movers(lane, ms)) {
        const color = CAR_COLORS[Math.abs(Math.round(lane.offset + lane.row)) % CAR_COLORS.length];
        block(g, x - 3, y + 8, lane.length + 6, CELL - 16, color);
        // The windscreen at the front.
        const front = lane.dir > 0 ? x + lane.length - 24 : x + 8;
        g.fillStyle(0xdff6ff, 0.9).fillRoundedRect(front, y + 20, 16, CELL - 40, 4);
      }
    } else if (lane.kind === 'river') {
      g.fillStyle(0x1f4f8f, 1).fillRect(0, y, VIEW_W, CELL);
      g.fillStyle(0xffffff, 0.12);
      for (let x = ((time / 20) % 80) - 80; x < VIEW_W; x += 80) g.fillRect(x, y + CELL * 0.3, 30, 3);
      for (const x of movers(lane, ms)) {
        block(g, x, y + 8, lane.length, CELL - 16, WOOD);
      }
    } else {
      const { passing, coming } = train(lane, ms);
      g.fillStyle(0x2b2748, 1).fillRect(0, y, VIEW_W, CELL);
      g.fillStyle(shade(WOOD, -0.55), 1);
      for (let x = 6; x < VIEW_W; x += 30) g.fillRect(x, y + 8, 12, CELL - 16);
      g.fillStyle(STONE, 1).fillRect(0, y + CELL * 0.3, VIEW_W, 5).fillRect(0, y + CELL * 0.65, VIEW_W, 5);
      if (coming && Math.floor(time / 150) % 2) ball(g, VIEW_W - 24, y + 14, 10, DANGER);
      if (passing) {
        block(g, -20, y + 4, VIEW_W + 40, CELL - 8, DANGER);
        g.fillStyle(0xdff6ff, 0.8);
        for (let x = 30; x < VIEW_W; x += 90) g.fillRect(x, y + 18, 40, CELL - 44);
      }
    }
  }
}
