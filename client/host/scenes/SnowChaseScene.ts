import Phaser from 'phaser';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import {
  GATE_WIDTH,
  ROW_GAP,
  SKIER_R,
  SKIER_SCREEN_Y,
  TREE_R,
  VIEW_H,
  VIEW_W,
  gateInRow,
  treesInRow,
  type SnowBoardState,
} from '../../../shared/games/snowChase';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<SnowBoardState, SnowBoardState>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The TV during Snow Chase: everyone's run side by side (see ../boardsScene). The slope comes from
 * the round's seed; each skier, and the beast behind them, from the server.
 */
export class SnowChaseScene extends BoardsScene<SnowBoardState> {
  static readonly KEY = 'snow-chase';
  protected readonly title = 'SNOW CHASE';
  protected readonly scoring = 'survival';
  protected readonly boardW = VIEW_W;
  protected readonly boardH = VIEW_H;
  protected endedBanner = 'CAUGHT!';
  private seed = 0;

  constructor() {
    super(SnowChaseScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<SnowBoardState>) {
    this.seed = view.seed;
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }

  protected statusText(board: BoardView<SnowBoardState>) {
    return `${board.state.gates} gates`;
  }

  protected resultTitle(board: BoardView<SnowBoardState>) {
    return board.endedAtMs === null ? { title: 'GOT AWAY!', good: true } : { title: `CAUGHT AT ${Math.floor(board.endedAtMs / 1000)}s`, good: false };
  }


  /** Snow. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0xeef6ff, 1).fillRect(0, 0, VIEW_W, VIEW_H);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    const y = lerp(prev.y, curr.y, t);
    const x = lerp(prev.x, curr.x, t);
    const top = y - SKIER_SCREEN_Y;
    const screenY = (wy: number) => wy - top;

    // Gates and trees in view (further down drawn last, so they overlap properly).
    const first = Math.floor(top / ROW_GAP) - 1;
    const last = Math.ceil((top + VIEW_H) / ROW_GAP) + 1;
    for (let n = first; n <= last; n++) {
      const gate = gateInRow(this.seed, n);
      if (gate) {
        const gy = screenY(gate.y);
        for (const [fx, color] of [[gate.left, 0xff5d73], [gate.left + GATE_WIDTH, 0x5ec8f2]] as const) {
          g.lineStyle(6, 0x4a4570, 1).lineBetween(fx, gy, fx, gy - 70);
          g.fillStyle(color, 1).fillTriangle(fx, gy - 70, fx + (fx === gate.left ? 40 : -40), gy - 58, fx, gy - 46);
        }
        g.lineStyle(3, 0x4a4570, 0.25).lineBetween(gate.left, gy, gate.left + GATE_WIDTH, gy);
      }
      for (const tree of treesInRow(this.seed, n)) {
        const ty = screenY(tree.y);
        if (ty < -100 || ty > VIEW_H + 60) continue;
        g.fillStyle(0x000000, 0.12).fillEllipse(tree.x + 10, ty + 8, TREE_R * 2.2, TREE_R * 0.7);
        g.fillStyle(0x7a4f2a, 1).fillRect(tree.x - 7, ty - 14, 14, 22);
        g.fillStyle(0x2e8b57, 1).fillTriangle(tree.x - TREE_R * 1.3, ty - 10, tree.x + TREE_R * 1.3, ty - 10, tree.x, ty - TREE_R * 3);
        g.fillStyle(0x3aa86a, 1).fillTriangle(tree.x - TREE_R, ty - TREE_R * 1.4, tree.x + TREE_R, ty - TREE_R * 1.4, tree.x, ty - TREE_R * 3.6);
        g.fillStyle(0xffffff, 0.8).fillTriangle(tree.x - TREE_R * 0.4, ty - TREE_R * 3.1, tree.x + TREE_R * 0.4, ty - TREE_R * 3.1, tree.x, ty - TREE_R * 3.6);
      }
    }

    // The skier: skis pointing the way they're going, a body in their colour (lying down after a crash).
    const color = hex(slot.board.color);
    const sy = SKIER_SCREEN_Y;
    if (curr.crashed) {
      g.fillStyle(color, 1).fillEllipse(x, sy, SKIER_R * 3, SKIER_R * 1.4);
      g.fillStyle(0x140f2e, 1).fillCircle(x + SKIER_R * 1.4, sy - 4, SKIER_R * 0.6);
    } else {
      const h = lerp(prev.heading, curr.heading, t);
      const dx = Math.sin(h) * 34;
      const dy = Math.cos(h) * 34;
      g.lineStyle(7, 0x140f2e, 1);
      for (const side of [-9, 9]) g.lineBetween(x + side - dx, sy - dy + 10, x + side + dx, sy + dy + 10);
      g.fillStyle(0x140f2e, 1).fillCircle(x, sy, SKIER_R + 3);
      g.fillStyle(color, 1).fillCircle(x, sy, SKIER_R);
      g.fillStyle(0xffd166, 1).fillCircle(x, sy - SKIER_R * 0.9, SKIER_R * 0.55);
    }

    // The beast, closing in from behind (a warning at the top while it's still out of sight).
    if (curr.beastBehind !== null && slot.board.endedAtMs === null) {
      const by = sy - lerp(prev.beastBehind ?? curr.beastBehind, curr.beastBehind, t);
      if (by > -60) this.beast(g, x, by, time);
      else {
        const warn = Math.min(1, 1 - (curr.beastBehind - SKIER_SCREEN_Y) / 600);
        g.fillStyle(0xff5d73, 0.25 + 0.5 * Math.max(0, warn) * (0.5 + 0.5 * Math.sin(time / 90))).fillRect(0, 0, VIEW_W, 18);
      }
    }
  }

  /** The snow beast: a big shaggy white shape with angry eyes and teeth, bobbing as it runs. */
  private beast(g: Phaser.GameObjects.Graphics, x: number, y: number, time: number) {
    const bob = Math.sin(time / 80) * 6;
    g.fillStyle(0x000000, 0.12).fillEllipse(x + 10, y + 70, 150, 30);
    g.fillStyle(0xdfe9f7, 1).fillEllipse(x, y + bob, 130, 150);
    for (let k = 0; k < 8; k++) g.fillCircle(x - 60 + k * 17, y + 60 + bob + (k % 2) * 8, 16);
    g.fillStyle(0xffffff, 1).fillEllipse(x, y - 20 + bob, 100, 90);
    g.fillStyle(0xff5d73, 1).fillCircle(x - 22, y - 30 + bob, 11).fillCircle(x + 22, y - 30 + bob, 11);
    g.lineStyle(6, 0x140f2e, 1).lineBetween(x - 36, y - 48 + bob, x - 10, y - 40 + bob).lineBetween(x + 36, y - 48 + bob, x + 10, y - 40 + bob);
    g.fillStyle(0x140f2e, 1).fillEllipse(x, y + 8 + bob, 56, 26);
    g.fillStyle(0xffffff, 1).fillTriangle(x - 20, y - 2 + bob, x - 10, y - 2 + bob, x - 15, y + 10 + bob).fillTriangle(x + 10, y - 2 + bob, x + 20, y - 2 + bob, x + 15, y + 10 + bob);
  }
}
