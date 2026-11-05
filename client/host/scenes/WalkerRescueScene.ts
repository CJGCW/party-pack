import Phaser from 'phaser';
import { DANGER, FLOOR_A, FLOOR_DARK, GOLD, GOOD, INK, SKY, STONE, WOOD, block, shade } from '../art';
import { burst } from '../fx';
import type { BoardView } from '../../../shared/boards';
import { CELL, COLS, ROWS, WALKERS, WALKER_LEVELS, type RescueState } from '../../../shared/games/walkerRescue';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<RescueState, RescueState>;

const TOP = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = TOP + ROWS * CELL;
const DOING_COLORS: Record<string, number> = { block: DANGER, dig: GOLD, build: SKY };

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

  protected onSnapshot(slot: Slot, prev: RescueState, next: RescueState) {
    if (next.saved > prev.saved) {
      const exit = WALKER_LEVELS[next.level].exit;
      const at = this.screenOf(slot, exit.x * CELL, TOP + (exit.y - 1) * CELL);
      burst(this, at.x, at.y, GOOD, 16);
    }
  }

  /** The earth's drawn when it changes (digging and building). */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    this.drawn.set(slot.playerId, g);
    g.setData('grid', '');
  }

  private drawEarth(g: Phaser.GameObjects.Graphics, s: RescueState) {
    g.clear().fillGradientStyle(FLOOR_DARK, FLOOR_DARK, FLOOR_A, FLOOR_A, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    for (let y = 0; y < ROWS; y++) {
      // Runs of the same cell along each row, as one rectangle.
      let x = 0;
      while (x < COLS) {
        const ch = s.grid[y * COLS + x];
        let end = x + 1;
        while (end < COLS && s.grid[y * COLS + end] === ch) end++;
        if (ch !== '.') {
          const color = ch === 'S' ? STONE : shade(WOOD, -0.2);
          g.fillStyle(color, 1).fillRect(x * CELL, TOP + y * CELL, (end - x) * CELL, CELL);
          // Light on anything open to the air above.
          for (let c = x; c < end; c++) if (s.grid[(y - 1) * COLS + c] === '.') g.fillStyle(shade(color, 0.3), 1).fillRect(c * CELL, TOP + y * CELL, CELL, 2.5);
        }
        x = end;
      }
    }
    const level = WALKER_LEVELS[s.level];
    // The door, and the exit (a green arch).
    block(g, level.door.x * CELL - 12, TOP + (level.door.y - 3) * CELL, 24, 3 * CELL, shade(WOOD, -0.35));
    block(g, level.exit.x * CELL - 14, TOP + (level.exit.y - 3) * CELL, 28, 3 * CELL + 2, GOOD);
    g.fillStyle(INK, 1).fillRect(level.exit.x * CELL - 6, TOP + (level.exit.y - 2) * CELL, 12, 2 * CELL + 2);
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
      g.fillStyle(DOING_COLORS[w.doing] ?? GOOD, 1).fillRect(x - 3, y - 12, 6, 8);
      g.fillStyle(0xf2c9a0, 1).fillCircle(x, y - 15, 3.5);
      g.fillStyle(color, 1).fillRect(x - 3 + step, y - 4, 2, 4).fillRect(x + 1 - step, y - 4, 2, 4);
      if (w.floater) g.fillStyle(0xffffff, 0.9).fillEllipse(x, y - 22, 14, 6);
      if (w.doing === 'block') g.lineStyle(2, DANGER, 1).lineBetween(x - 6, y - 10, x + 6, y - 10);
    }
  }
}
