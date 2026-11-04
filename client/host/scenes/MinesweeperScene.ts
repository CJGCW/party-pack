import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BOOM, COLS, FLAGGED, HIDDEN, ROWS, type MineState } from '../../../shared/games/minesweeper';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { COLORS, text } from '../theme';

type Slot = BoardSlot<MineState, MineState>;

const CELL = 80;
const TOP = 90;
const BOARD_W = COLS * CELL;
const BOARD_H = TOP + ROWS * CELL + 20;
export const NUMBER_COLORS = ['', '#5ec8f2', '#4cd37a', '#ff5d73', '#b48cff', '#ff9f43', '#7fe0d0', '#ffffff', '#b8b0e8'];

/** The TV during Mine Dash: everyone's field side by side (see ../boardsScene); mines only show once hit, or at the end. */
export class MinesweeperScene extends BoardsScene<MineState> {
  static readonly KEY = 'minesweeper';
  protected readonly title = 'MINE DASH';
  protected readonly scoring = 'race';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  /** A text per square for its number (made once per board, updated each frame). */
  private numbers = new Map<string, Phaser.GameObjects.Text[]>();

  constructor() {
    super(MinesweeperScene.KEY);
  }

  protected statusText(board: BoardView<MineState>) {
    return `${board.boardScore}%`;
  }

  protected drawStatic(slot: Slot) {
    const texts = Array.from({ length: COLS * ROWS }, (_, c) => text(this, (c % COLS) * CELL + CELL / 2, TOP + Math.floor(c / COLS) * CELL + CELL / 2 + 2, '', CELL * 0.55, COLORS.text, { fontStyle: '700' }));
    slot.container.add(texts);
    this.numbers.set(slot.playerId, texts);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, _t: number, time: number) {
    const s = slot.curr!.snap;
    const texts = this.numbers.get(slot.playerId);
    s.squares.forEach((sq, c) => {
      const x = (c % COLS) * CELL;
      const y = TOP + Math.floor(c / COLS) * CELL;
      const covered = sq === HIDDEN || sq === FLAGGED;
      g.fillStyle(covered ? ((c + Math.floor(c / COLS)) % 2 ? 0x4a3f9a : 0x433892) : sq === BOOM ? 0x5a1f3a : 0x1f1848, 1).fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      if (covered) g.fillStyle(0xffffff, 0.08).fillRect(x + 4, y + 4, CELL - 8, 8);
      if (sq === FLAGGED) {
        g.lineStyle(5, 0xffffff, 1).lineBetween(x + CELL * 0.38, y + CELL * 0.22, x + CELL * 0.38, y + CELL * 0.8);
        g.fillStyle(0xff5d73, 1).fillTriangle(x + CELL * 0.38, y + CELL * 0.22, x + CELL * 0.75, y + CELL * 0.36, x + CELL * 0.38, y + CELL * 0.5);
      }
      if (sq === BOOM) {
        g.fillStyle(0x140f2e, 1).fillCircle(x + CELL / 2, y + CELL / 2, CELL * 0.26);
        g.fillStyle(0xff9f43, 0.6 + 0.4 * Math.sin(time / 150)).fillCircle(x + CELL / 2 + 6, y + CELL / 2 - 6, CELL * 0.08);
      }
      const label = sq > 0 ? String(sq) : '';
      if (texts && texts[c].text !== label) texts[c].setText(label).setColor(NUMBER_COLORS[sq] ?? COLORS.text);
    });
    // Locked after a mine: a wash over the board.
    if (s.lockedMs > 0 && this.view?.phase === 'play') g.fillStyle(0xff5d73, 0.18).fillRect(0, TOP, BOARD_W, ROWS * CELL);
  }
}
