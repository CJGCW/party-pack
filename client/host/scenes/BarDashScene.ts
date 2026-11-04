import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BAR_END, BAR_START, BAR_Y, BOARD_H, BOARD_W, LIVES, type BarState } from '../../../shared/games/barDash';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<BarState, BarState>;

const CUSTOMER_COLORS = [0xff9f43, 0x5ec8f2, 0xb48cff, 0x4cd37a];
/** A lost life flashes for this long. */
const OOPS_MS = 400;

/** The TV during Bar Dash: everyone's four bars side by side (see ../boardsScene): customers coming, drinks and glasses sliding. */
export class BarDashScene extends BoardsScene<BarState> {
  static readonly KEY = 'bar-dash';
  protected readonly title = 'BAR DASH';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private oopsAt = new Map<string, number>();

  constructor() {
    super(BarDashScene.KEY);
  }

  protected statusText(board: BoardView<BarState>) {
    return `${board.boardScore} served · ${'♥'.repeat(board.state.lives)}${'♡'.repeat(Math.max(0, LIVES - board.state.lives))}`;
  }

  protected onSnapshot(slot: Slot, prev: BarState, next: BarState) {
    if (next.oops > prev.oops) this.oopsAt.set(slot.playerId, performance.now());
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x3a2a1f, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    for (const y of BAR_Y) {
      g.fillStyle(0x140f2e, 1).fillRect(BAR_START - 6, y + 14, BAR_END - BAR_START + 12, 22);
      g.fillStyle(0xb07a45, 1).fillRect(BAR_START - 4, y + 16, BAR_END - BAR_START + 8, 18);
      // The door at the far end, and the taps at yours.
      g.fillStyle(0x6b4423, 1).fillRect(BAR_START - 36, y - 30, 26, 60);
      g.fillStyle(0x9a93b8, 1).fillRect(BAR_END + 12, y - 20, 14, 40);
    }
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const s = slot.curr!.snap;
    // Slide things on between updates (by their own speed would need more; following the last two is smooth enough).
    const ease = (list: number[], before: number[], i: number) => (before.length === list.length ? before[i + 1] + (list[i + 1] - before[i + 1]) * t : list[i + 1]);
    for (let i = 0; i < s.customers.length; i += 2) {
      const y = BAR_Y[s.customers[i]];
      const x = ease(s.customers, prev.customers, i);
      g.fillStyle(0x140f2e, 1).fillCircle(x, y - 18, 20);
      g.fillStyle(CUSTOMER_COLORS[(s.customers[i] + i) % CUSTOMER_COLORS.length], 1).fillCircle(x, y - 18, 17);
      g.fillStyle(0xffffff, 1).fillCircle(x + 6, y - 22, 4);
    }
    for (let i = 0; i < s.drinks.length; i += 2) {
      const y = BAR_Y[s.drinks[i]];
      const x = ease(s.drinks, prev.drinks, i);
      g.fillStyle(0xffd166, 1).fillRect(x - 8, y - 4, 16, 20);
      g.fillStyle(0xffffff, 1).fillRect(x - 8, y - 8, 16, 6);
    }
    for (let i = 0; i < s.glasses.length; i += 2) {
      const y = BAR_Y[s.glasses[i]];
      const x = ease(s.glasses, prev.glasses, i);
      g.lineStyle(3, 0xbfe9ff, 1).strokeRect(x - 8, y - 4, 16, 20);
    }
    // You, at your bar's taps.
    const y = BAR_Y[s.bar];
    const oops = performance.now() - (this.oopsAt.get(slot.playerId) ?? -1e9) < OOPS_MS;
    g.fillStyle(0x140f2e, 1).fillCircle(BAR_END + 40, y - 6, 24);
    g.fillStyle(oops ? 0xff5d73 : hex(slot.board.color), 1).fillCircle(BAR_END + 40, y - 6, 21);
    g.fillStyle(0xffffff, 1).fillRect(BAR_END + 24, y - 34, 32, 8);
    if (oops) g.fillStyle(0xff5d73, 0.15 + 0.1 * Math.sin(time / 40)).fillRect(0, 0, BOARD_W, BOARD_H);
  }
}
