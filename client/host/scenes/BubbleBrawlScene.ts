import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import {
  BOARD_H,
  BOARD_W,
  BUBBLE_R,
  COLORS,
  DEAD_ROW,
  ROW_H,
  SHOOTER_X,
  SHOOTER_Y,
  TOP,
  cellCenter,
  rowLength,
  type BubbleBoardState,
} from '../../../shared/games/bubbleBrawl';
import { BoardsScene, type BoardSlot } from '../boardsScene';

type Slot = BoardSlot<BubbleBoardState, BubbleBoardState>;

const FILLS = COLORS.map((c) => parseInt(c.slice(1), 16));
/** Pops burst, drops fall, over this long. */
const BURST_MS = 600;
/** The aiming guide reaches this far (board units), bouncing off the sides. */
const GUIDE_LEN = 520;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function drawBubble(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, r = BUBBLE_R, alpha = 1) {
  g.fillStyle(0x140f2e, alpha).fillCircle(x, y, r);
  g.fillStyle(color, alpha).fillCircle(x, y, r - 3);
  g.fillStyle(0xffffff, 0.4 * alpha).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.25);
}

/** The TV during Bubble Brawl: everyone's cluster side by side (see ../boardsScene), shots, pops and drops, and garbage on its way. */
export class BubbleBrawlScene extends BoardsScene<BubbleBoardState> {
  static readonly KEY = 'bubble-brawl';
  protected readonly title = 'BUBBLE BRAWL';
  protected readonly scoring = 'survival';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private bursts = new Map<string, { cells: number[]; drops: number; at: number }[]>();

  constructor() {
    super(BubbleBrawlScene.KEY);
  }

  protected statusText(board: BoardView<BubbleBoardState>) {
    return `${board.boardScore} popped`;
  }

  protected onSnapshot(slot: Slot, prev: BubbleBoardState, next: BubbleBoardState) {
    if (next.burstId === prev.burstId) return;
    const list = (this.bursts.get(slot.playerId) ?? []).filter((b) => performance.now() - b.at < BURST_MS);
    list.push({ cells: next.burst, drops: next.drops, at: performance.now() });
    this.bursts.set(slot.playerId, list);
  }

  /** The back wall and the line. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x1d1640, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const line = TOP + DEAD_ROW * ROW_H;
    g.fillStyle(0xff5d73, 0.12).fillRect(0, line, BOARD_W, BOARD_H - line);
    g.lineStyle(3, 0xff5d73, 0.7);
    for (let x = 0; x < BOARD_W; x += 24) g.lineBetween(x, line, x + 12, line);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    // The ceiling, come down so far.
    const ceiling = TOP + curr.drops * ROW_H;
    g.fillStyle(0x4a4470, 1).fillRect(0, 0, BOARD_W, ceiling);
    g.fillStyle(0x6d6496, 1).fillRect(0, ceiling - 8, BOARD_W, 8);
    let i = 0;
    for (let r = 0; r < curr.rows; r++) {
      for (let c = 0; c < rowLength(r); c++, i++) {
        const ch = curr.grid[i];
        if (ch === '.' || ch === undefined) continue;
        const p = cellCenter(r, c, curr.drops);
        drawBubble(g, p.x, p.y, FILLS[Number(ch)]);
      }
    }
    // Pops burst outwards; drops fall away.
    const now = performance.now();
    for (const b of this.bursts.get(slot.playerId) ?? []) {
      const k = (now - b.at) / BURST_MS;
      if (k >= 1) continue;
      for (let j = 0; j < b.cells.length; j += 4) {
        const p = cellCenter(b.cells[j], b.cells[j + 1], b.drops);
        const color = FILLS[b.cells[j + 2]];
        if (b.cells[j + 3]) drawBubble(g, p.x, p.y + k * k * 500, color, BUBBLE_R, 1 - k);
        else {
          g.lineStyle(4, color, 1 - k).strokeCircle(p.x, p.y, BUBBLE_R * (1 + k));
        }
      }
    }
    // The aiming guide, bouncing off the sides.
    const aim = lerp(prev.aim, curr.aim, t);
    let [x, y, dx, dy] = [SHOOTER_X, SHOOTER_Y, Math.sin(aim), -Math.cos(aim)];
    g.fillStyle(0xffffff, 0.35);
    for (let d = 30; d < GUIDE_LEN; d += 22) {
      x += dx * 22;
      y += dy * 22;
      if (x < BUBBLE_R || x > BOARD_W - BUBBLE_R) {
        dx = -dx;
        x = Math.max(BUBBLE_R, Math.min(BOARD_W - BUBBLE_R, x));
      }
      if (y < ceiling + BUBBLE_R) break;
      g.fillCircle(x, y, 4);
    }
    // The shooter: this bubble and the next.
    g.fillStyle(0x2a2160, 1).fillCircle(SHOOTER_X, SHOOTER_Y, BUBBLE_R + 12);
    g.lineStyle(8, 0x8b7cf6, 1).lineBetween(SHOOTER_X, SHOOTER_Y, SHOOTER_X + Math.sin(aim) * (BUBBLE_R + 26), SHOOTER_Y - Math.cos(aim) * (BUBBLE_R + 26));
    drawBubble(g, SHOOTER_X, SHOOTER_Y, FILLS[curr.current]);
    drawBubble(g, SHOOTER_X + 70, SHOOTER_Y + 14, FILLS[curr.next], BUBBLE_R * 0.6);
    if (curr.shot) {
      const was = prev.shot;
      const near = was && Math.hypot(was[0] - curr.shot[0], was[1] - curr.shot[1]) < 80;
      drawBubble(g, near ? lerp(was[0], curr.shot[0], t) : curr.shot[0], near ? lerp(was[1], curr.shot[1], t) : curr.shot[1], FILLS[curr.shot[2]]);
    }
    // Garbage on its way: grey bubbles in the corner, wobbling.
    for (let k = 0; k < Math.min(8, curr.incoming); k++) {
      drawBubble(g, 24 + k * 22, SHOOTER_Y + 4 * Math.sin(time / 120 + k), 0x9a93b8, 12);
    }
  }
}
