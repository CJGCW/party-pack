import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_W, GROUND_Y, HEARTS, ROCK_R, rocksFor, type Rock, type RockState } from '../../../shared/games/rockSolid';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<RockState, RockState>;

/** A hit flashes red for this long. */
const HIT_MS = 400;

/** The TV during Rock Solid: everyone's blob in a column (see ../boardsScene), the same rocks dropping on each. */
export class RockSolidScene extends BoardsScene<RockState> {
  static readonly KEY = 'rock-solid';
  protected readonly title = 'ROCK SOLID';
  protected readonly scoring = 'survival';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private rocks: Rock[] = [];
  private seed = -1;
  private hitAt = new Map<string, number>();

  constructor() {
    super(RockSolidScene.KEY);
  }

  protected statusText(board: BoardView<RockState>) {
    return '♥'.repeat(board.state.hearts) + '♡'.repeat(Math.max(0, HEARTS - board.state.hearts));
  }

  protected onSnapshot(slot: Slot, prev: RockState, next: RockState) {
    if (next.hits > prev.hits) this.hitAt.set(slot.playerId, performance.now());
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(0x3a2f6e, 0x3a2f6e, 0x1d1640, 0x1d1640, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle(0x6d6496, 1).fillRect(0, GROUND_Y + 30, BOARD_W, BOARD_H - GROUND_Y - 30);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, _t: number, time: number) {
    const view = this.view!;
    if (view.seed !== this.seed) {
      this.seed = view.seed;
      this.rocks = rocksFor(view.seed);
    }
    const s = slot.curr!.snap;
    const out = slot.board.endedAtMs !== null;
    // The round's clock, run on from the last update.
    const now = view.phase === 'play' ? view.roundMs + (performance.now() - slot.curr!.at) : 0;
    const cx = BOARD_W / 2;
    if (!out) {
      for (const r of this.rocks) {
        if (now < r.at - r.fall || now > r.at + 250) continue;
        const k = Math.min(1, (now - (r.at - r.fall)) / r.fall);
        const x = cx + r.drift * 60 * (1 - k);
        const y = -ROCK_R + (GROUND_Y - 40 + ROCK_R) * k * k;
        g.fillStyle(0x000000, 0.2 + 0.3 * k).fillEllipse(cx, GROUND_Y + 28, 40 + 60 * k, 14);
        if (now > r.at) {
          // Bounced off (or landed): it flies off to the side.
          const b = (now - r.at) / 250;
          g.fillStyle(0x8a7f6a, 1 - b).fillCircle(x + (r.drift >= 0 ? 1 : -1) * 120 * b, GROUND_Y - 60 - 80 * b + 120 * b * b, ROCK_R);
          continue;
        }
        g.fillStyle(0x140f2e, 1).fillCircle(x, y, ROCK_R + 3);
        g.fillStyle(0x8a7f6a, 1).fillCircle(x, y, ROCK_R);
        g.fillStyle(0xffffff, 0.2).fillCircle(x - 10, y - 10, ROCK_R * 0.35);
      }
    }
    // The blob: soft and coloured, or grey stone.
    const hit = performance.now() - (this.hitAt.get(slot.playerId) ?? -1e9) < HIT_MS;
    const squash = s.hard ? 1 : 1 + 0.04 * Math.sin(time / 150);
    const bodyColor = out ? 0x444444 : hit ? 0xff5d73 : s.hard ? 0x9a93b8 : hex(slot.board.color);
    g.fillStyle(0x140f2e, 1).fillEllipse(cx, GROUND_Y, 136 * squash, 116 / squash);
    g.fillStyle(bodyColor, 1).fillEllipse(cx, GROUND_Y, 128 * squash, 108 / squash);
    if (s.hard) g.lineStyle(3, 0x6d6496, 1).lineBetween(cx - 30, GROUND_Y - 30, cx - 10, GROUND_Y - 5).lineBetween(cx + 20, GROUND_Y - 35, cx + 35, GROUND_Y + 10);
    g.fillStyle(0xffffff, 1).fillCircle(cx - 22, GROUND_Y - 12, 10).fillCircle(cx + 22, GROUND_Y - 12, 10);
    g.fillStyle(0x140f2e, 1).fillCircle(cx - 20, GROUND_Y - 10, 5).fillCircle(cx + 24, GROUND_Y - 10, 5);
    // Energy left.
    g.fillStyle(0x140f2e, 1).fillRect(20, BOARD_H - 24, BOARD_W - 40, 14);
    g.fillStyle(s.energy < 0.25 ? 0xff5d73 : 0xffd166, 1).fillRect(22, BOARD_H - 22, (BOARD_W - 44) * s.energy, 10);
  }
}
