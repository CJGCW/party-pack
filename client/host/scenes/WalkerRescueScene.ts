import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { CELL, COLS, ROWS, WALKERS, WALKER_LEVELS, type RescueState } from '../../../shared/games/walkerRescue';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<RescueState, RescueState>;

const TOP = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = TOP + ROWS * CELL;
const DOING_COLORS: Record<string, number> = { block: 0xff5d73, dig: 0xffd166, build: 0x5ec8f2 };

/** The TV during Walker Rescue: everyone's level side by side (see ../boardsScene), the earth as it's dug and built, and their walkers. */
export class WalkerRescueScene extends BoardsScene<RescueState> {
  static readonly KEY = 'walker-rescue';
  protected readonly title = 'WALKER RESCUE';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private drawn = new Map<string, Phaser.GameObjects.Graphics>();

  constructor() {
    super(WalkerRescueScene.KEY);
  }

  protected statusText(board: BoardView<RescueState>) {
    return `${board.state.saved}/${WALKERS} saved`;
  }

  /** The earth's drawn when it changes (digging and building). */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    this.drawn.set(slot.playerId, g);
    g.setData('grid', '');
  }

  private drawEarth(g: Phaser.GameObjects.Graphics, s: RescueState) {
    g.clear().fillGradientStyle(0x1d1640, 0x1d1640, 0x3a2f6e, 0x3a2f6e, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    for (let y = 0; y < ROWS; y++) {
      // Runs of the same cell along each row, as one rectangle.
      let x = 0;
      while (x < COLS) {
        const ch = s.grid[y * COLS + x];
        let end = x + 1;
        while (end < COLS && s.grid[y * COLS + end] === ch) end++;
        if (ch !== '.') g.fillStyle(ch === 'S' ? 0x7d7896 : 0x8f5f34, 1).fillRect(x * CELL, TOP + y * CELL, (end - x) * CELL, CELL);
        x = end;
      }
    }
    const level = WALKER_LEVELS[s.level];
    // The door, and the exit (a green arch).
    g.fillStyle(0x6b4423, 1).fillRect(level.door.x * CELL - 10, TOP + (level.door.y - 3) * CELL, 20, 3 * CELL);
    g.fillStyle(0x4cd37a, 1).fillRect(level.exit.x * CELL - 12, TOP + (level.exit.y - 3) * CELL, 24, 3 * CELL + 2);
    g.fillStyle(0x140f2e, 1).fillRect(level.exit.x * CELL - 6, TOP + (level.exit.y - 2) * CELL, 12, 2 * CELL + 2);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, _t: number, time: number) {
    const s = slot.curr!.snap;
    const back = this.drawn.get(slot.playerId);
    if (back && back.getData('grid') !== s.grid) {
      back.setData('grid', s.grid);
      this.drawEarth(back, s);
    }
    const color = hex(slot.board.color);
    for (const w of s.walkers) {
      const x = w.x * CELL + CELL / 2;
      const y = TOP + w.y * CELL + CELL;
      const step = w.doing === 'walk' ? Math.sin(time / 80 + w.id) * 2 : 0;
      g.fillStyle(DOING_COLORS[w.doing] ?? 0x4cd37a, 1).fillRect(x - 3, y - 12, 6, 8);
      g.fillStyle(0xf2c9a0, 1).fillCircle(x, y - 15, 3.5);
      g.fillStyle(color, 1).fillRect(x - 3 + step, y - 4, 2, 4).fillRect(x + 1 - step, y - 4, 2, 4);
      if (w.floater) g.fillStyle(0xffffff, 0.9).fillEllipse(x, y - 22, 14, 6);
      if (w.doing === 'block') g.lineStyle(2, 0xff5d73, 1).lineBetween(x - 6, y - 10, x + 6, y - 10);
    }
  }
}
