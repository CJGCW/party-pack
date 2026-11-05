import Phaser from 'phaser';
import { DANGER, FLOOR_A, FLOOR_B, GOLD, INK, SKY, STONE, WOOD, ball, block, shade, softShadow } from '../art';
import { burst } from '../fx';
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
    if (next.oops > prev.oops) {
      this.oopsAt.set(slot.playerId, performance.now());
      const at = this.screenOf(slot, BAR_END + 40, BAR_Y[next.bar]);
      burst(this, at.x, at.y, DANGER, 30);
    }
    // A drink landing with a customer: sparks at your end of the bar.
    if (next.served > prev.served) {
      const at = this.screenOf(slot, BAR_END - 40, BAR_Y[next.bar]);
      burst(this, at.x, at.y, GOLD, 10);
    }
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    for (let i = 0; i * 44 < BOARD_H; i++) g.fillStyle(i % 2 ? FLOOR_A : FLOOR_B, 1).fillRect(0, i * 44, BOARD_W, 44);
    for (const y of BAR_Y) {
      block(g, BAR_START - 6, y + 12, BAR_END - BAR_START + 12, 26, WOOD);
      // The door at the far end, and the taps at yours.
      block(g, BAR_START - 38, y - 32, 30, 66, shade(WOOD, -0.35));
      block(g, BAR_END + 10, y - 22, 18, 42, STONE);
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
      ball(g, x, y - 18, 17, CUSTOMER_COLORS[s.customers[i] % CUSTOMER_COLORS.length]);
      g.fillStyle(0xffffff, 1).fillCircle(x + 8, y - 21, 5);
      g.fillStyle(INK, 1).fillCircle(x + 10, y - 21, 2.5);
    }
    for (let i = 0; i < s.drinks.length; i += 2) {
      const y = BAR_Y[s.drinks[i]];
      const x = ease(s.drinks, prev.drinks, i);
      block(g, x - 10, y - 6, 20, 24, GOLD);
      g.fillStyle(0xffffff, 1).fillRoundedRect(x - 11, y - 11, 22, 9, 4);
    }
    for (let i = 0; i < s.glasses.length; i += 2) {
      const y = BAR_Y[s.glasses[i]];
      const x = ease(s.glasses, prev.glasses, i);
      g.fillStyle(SKY, 0.25).fillRoundedRect(x - 9, y - 5, 18, 22, 4);
      g.lineStyle(3, INK, 1).strokeRoundedRect(x - 10, y - 6, 20, 24, 5);
      g.lineStyle(2, 0xbfe9ff, 1).strokeRoundedRect(x - 8, y - 4, 16, 20, 4);
    }
    // You, at your bar's taps.
    const y = BAR_Y[s.bar];
    const oops = performance.now() - (this.oopsAt.get(slot.playerId) ?? -1e9) < OOPS_MS;
    softShadow(g, BAR_END + 40, y + 16, 40, 12);
    ball(g, BAR_END + 40, y - 6, 21, oops ? DANGER : hex(slot.board.color));
    block(g, BAR_END + 24, y - 36, 32, 12, 0xffffff);
    if (oops) g.fillStyle(DANGER, 0.15 + 0.1 * Math.sin(time / 40)).fillRect(0, 0, BOARD_W, BOARD_H);
  }
}
