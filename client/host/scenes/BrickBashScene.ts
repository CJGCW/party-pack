import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import {
  BALL_R,
  BOARD_H,
  BOARD_W,
  BRICK_COLORS,
  BRICK_H,
  BRICK_W,
  COLS,
  DANGER_Y,
  PADDLE_H,
  PADDLE_W,
  PADDLE_Y,
  TOP,
  WALL_Y,
  type BashBoardState,
} from '../../../shared/games/brickBash';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<BashBoardState, BashBoardState>;

const FILLS: Record<string, number> = Object.fromEntries(Object.entries(BRICK_COLORS).map(([k, c]) => [k, hex(c)]));
/** A smashed brick fades over this long. */
const SMASH_MS = 300;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Brick Bash: everyone's wall side by side (see ../boardsScene), paddle and ball. */
export class BrickBashScene extends BoardsScene<BashBoardState> {
  static readonly KEY = 'brick-bash';
  protected readonly title = 'BRICK BASH';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected endedBanner = 'DONE!';
  private smashes = new Map<string, { cells: number[]; at: number }[]>();

  constructor() {
    super(BrickBashScene.KEY);
  }

  protected statusText(board: BoardView<BashBoardState>) {
    return `${board.boardScore} bricks`;
  }

  protected resultTitle(board: BoardView<BashBoardState>) {
    return { title: `${board.boardScore} BRICKS`, good: board.place === 1 };
  }

  protected onSnapshot(slot: Slot, prev: BashBoardState, next: BashBoardState) {
    // Bricks just gone (only when the wall's not been pushed down, which moves them all).
    if (prev.wall.length !== next.wall.length) return;
    const cells = [...next.wall].map((ch, i) => (ch === '.' && prev.wall[i] !== '.' ? i : -1)).filter((i) => i >= 0);
    if (!cells.length) return;
    const list = (this.smashes.get(slot.playerId) ?? []).filter((s) => performance.now() - s.at < SMASH_MS);
    list.push({ cells, at: performance.now() });
    this.smashes.set(slot.playerId, list);
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x1d1640, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle(0x140f2e, 1).fillRect(0, 0, BOARD_W, TOP);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    // The line a garbage-pushed wall mustn't reach (only once garbage has come in).
    if (curr.wall.length > prev.wall.length || curr.wall.includes('g')) {
      g.lineStyle(3, 0xff5d73, 0.6);
      for (let x = 0; x < BOARD_W; x += 24) g.lineBetween(x, DANGER_Y, x + 12, DANGER_Y);
    }
    for (let i = 0; i < curr.wall.length; i++) {
      const ch = curr.wall[i];
      if (ch === '.') continue;
      const x = (i % COLS) * BRICK_W;
      const y = WALL_Y + Math.floor(i / COLS) * BRICK_H;
      g.fillStyle(0x140f2e, 1).fillRect(x, y, BRICK_W, BRICK_H);
      g.fillStyle(FILLS[ch], 1).fillRect(x + 2, y + 2, BRICK_W - 4, BRICK_H - 4);
      g.fillStyle(0xffffff, 0.25).fillRect(x + 2, y + 2, BRICK_W - 4, 5);
    }
    const now = performance.now();
    for (const s of this.smashes.get(slot.playerId) ?? []) {
      const k = (now - s.at) / SMASH_MS;
      if (k >= 1) continue;
      for (const i of s.cells) {
        const x = (i % COLS) * BRICK_W;
        const y = WALL_Y + Math.floor(i / COLS) * BRICK_H;
        g.fillStyle(0xffffff, 0.8 * (1 - k)).fillRect(x - 4 * k, y - 4 * k, BRICK_W + 8 * k, BRICK_H + 8 * k);
      }
    }
    // The paddle.
    const px = lerp(prev.paddle, curr.paddle, t);
    g.fillStyle(0x140f2e, 1).fillRoundedRect(px - PADDLE_W / 2 - 3, PADDLE_Y - 3, PADDLE_W + 6, PADDLE_H + 6, 9);
    g.fillStyle(hex(slot.board.color), 1).fillRoundedRect(px - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H, 7);
    // The ball (or the wait for the next one: a ball blinking on the paddle).
    if (curr.ball) {
      const near = prev.ball && Math.hypot(prev.ball[0] - curr.ball[0], prev.ball[1] - curr.ball[1]) < 60;
      const bx = near ? lerp(prev.ball![0], curr.ball[0], t) : curr.ball[0];
      const by = near ? lerp(prev.ball![1], curr.ball[1], t) : curr.ball[1];
      g.fillStyle(0x140f2e, 1).fillCircle(bx, by, BALL_R + 3);
      g.fillStyle(0xffffff, 1).fillCircle(bx, by, BALL_R);
    } else if (slot.board.endedAtMs === null && Math.sin(time / 90) > 0) {
      g.fillStyle(0xffffff, 0.6).fillCircle(px, PADDLE_Y - BALL_R - 2, BALL_R);
    }
    // Garbage on its way.
    for (let k = 0; k < Math.min(6, curr.incoming); k++) g.fillStyle(FILLS.g, 1).fillRect(BOARD_W - 30 - k * 26, TOP - 16, 22, 10);
  }
}
