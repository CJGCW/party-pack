import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { EXIT_ROW, SIZE, vehiclesIn, type UnblockState } from '../../../shared/games/unblockCar';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { COLORS, text } from '../theme';

type Slot = BoardSlot<UnblockState, UnblockState>;

const CELL = 120;
const PAD = 30;
const TOP = 110;
const BOARD_W = SIZE * CELL + PAD * 2;
const BOARD_H = TOP + SIZE * CELL + PAD * 2;
/** Cars and trucks get a colour by their letter; the red car is always red. */
export const VEHICLE_COLORS = [0x5ec8f2, 0xffd166, 0x4cd37a, 0xb48cff, 0xff9f43, 0x7fe0d0, 0xf472d0, 0xc9b7ff];
export const vehicleColor = (id: string) => (id === 'A' ? 0xff5d73 : VEHICLE_COLORS[(id.charCodeAt(0) - 66) % VEHICLE_COLORS.length]);

/** The TV during Unblock Car: everyone's lot side by side (see ../boardsScene), with how far through the chain they are. */
export class UnblockCarScene extends BoardsScene<UnblockState> {
  static readonly KEY = 'unblock-car';
  protected readonly title = 'UNBLOCK CAR';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected endedBanner = 'ALL CLEAR!';
  private progress = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super(UnblockCarScene.KEY);
  }

  protected statusText(board: BoardView<UnblockState>) {
    return `${board.boardScore} pts`;
  }

  protected resultTitle(board: BoardView<UnblockState>) {
    return { title: `${board.state.solved} SOLVED`, good: board.place === 1 };
  }

  /** The lot: asphalt, faint bays, and the gap in the wall where the exit is. */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const x0 = PAD;
    const y0 = TOP + PAD;
    g.fillStyle(0x6b5a8a, 1).fillRoundedRect(x0 - 16, y0 - 16, SIZE * CELL + 32, SIZE * CELL + 32, 18);
    g.fillStyle(0x3d3a4f, 1).fillRect(x0, y0, SIZE * CELL, SIZE * CELL);
    g.lineStyle(2, 0xffffff, 0.08);
    for (let k = 1; k < SIZE; k++) g.lineBetween(x0 + k * CELL, y0, x0 + k * CELL, y0 + SIZE * CELL).lineBetween(x0, y0 + k * CELL, x0 + SIZE * CELL, y0 + k * CELL);
    g.fillStyle(0x3d3a4f, 1).fillRect(x0 + SIZE * CELL, y0 + EXIT_ROW * CELL + 8, 20, CELL - 16);
    g.fillStyle(0x4cd37a, 1).fillTriangle(x0 + SIZE * CELL + 4, y0 + EXIT_ROW * CELL + CELL / 2 - 16, x0 + SIZE * CELL + 4, y0 + EXIT_ROW * CELL + CELL / 2 + 16, x0 + SIZE * CELL + 22, y0 + EXIT_ROW * CELL + CELL / 2);
    const progress = text(this, BOARD_W / 2, TOP - 26, '', 34, COLORS.text, { fontStyle: '700' });
    slot.container.add(progress);
    this.progress.set(slot.playerId, progress);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const s = slot.curr!.snap;
    this.progress.get(slot.playerId)?.setText(`Lot ${s.number} of ${s.total} · ${s.moves} moves`);
    for (const v of vehiclesIn(s.lot)) {
      const x = PAD + v.col * CELL + 8;
      const y = TOP + PAD + v.row * CELL + 8;
      const w = (v.across ? v.length : 1) * CELL - 16;
      const h = (v.across ? 1 : v.length) * CELL - 16;
      g.fillStyle(0x140f2e, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 20);
      g.fillStyle(vehicleColor(v.id), 1).fillRoundedRect(x, y, w, h, 18);
      // Windows, toward the front (the red car faces the exit).
      g.fillStyle(0xdff6ff, 0.85);
      if (v.across) g.fillRoundedRect(x + w - 34, y + 14, 18, h - 28, 6).fillRoundedRect(x + 16, y + 14, 14, h - 28, 6);
      else g.fillRoundedRect(x + 14, y + 16, w - 28, 18, 6).fillRoundedRect(x + 14, y + h - 30, w - 28, 14, 6);
    }
  }
}
