import Phaser from 'phaser';
import { DANGER, FLOOR_A, FLOOR_DARK, GOLD, INK, STONE, ball, block, shade, softShadow } from '../art';
import { burst, impact } from '../fx';
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
    if (next.hits > prev.hits) {
      this.hitAt.set(slot.playerId, performance.now());
      const at = this.screenOf(slot, BOARD_W / 2, GROUND_Y - 30);
      burst(this, at.x, at.y, DANGER, 30);
      impact(this, 0.004);
    }
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(FLOOR_A, FLOOR_A, FLOOR_DARK, FLOOR_DARK, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    block(g, -20, GROUND_Y + 30, BOARD_W + 40, BOARD_H - GROUND_Y, STONE);
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
        softShadow(g, cx, GROUND_Y + 28, 40 + 60 * k, 14, 0.2 + 0.3 * k);
        if (now > r.at) {
          // Bounced off (or landed): it flies off to the side.
          const b = (now - r.at) / 250;
          ball(g, x + (r.drift >= 0 ? 1 : -1) * 120 * b, GROUND_Y - 60 - 80 * b + 120 * b * b, ROCK_R, shade(STONE, 0.15), 1 - b);
          continue;
        }
        ball(g, x, y, ROCK_R, shade(STONE, 0.15));
      }
    }
    // The blob: soft and coloured, or grey stone.
    const hit = performance.now() - (this.hitAt.get(slot.playerId) ?? -1e9) < HIT_MS;
    const squash = s.hard ? 1 : 1 + 0.04 * Math.sin(time / 150);
    const bodyColor = out ? 0x444444 : hit ? DANGER : s.hard ? 0x9a93b8 : hex(slot.board.color);
    softShadow(g, cx, GROUND_Y + 54, 150, 22);
    g.fillStyle(INK, 1).fillEllipse(cx, GROUND_Y, 136 * squash, 116 / squash);
    g.fillStyle(shade(bodyColor, -0.3), 1).fillEllipse(cx, GROUND_Y, 128 * squash, 108 / squash);
    g.fillStyle(bodyColor, 1).fillEllipse(cx - 2, GROUND_Y - 6, 112 * squash, 90 / squash);
    g.fillStyle(0xffffff, 0.45).fillEllipse(cx - 34, GROUND_Y - 34, 34, 18);
    if (s.hard) g.lineStyle(3, 0x6d6496, 1).lineBetween(cx - 30, GROUND_Y - 30, cx - 10, GROUND_Y - 5).lineBetween(cx + 20, GROUND_Y - 35, cx + 35, GROUND_Y + 10);
    g.fillStyle(0xffffff, 1).fillCircle(cx - 22, GROUND_Y - 12, 10).fillCircle(cx + 22, GROUND_Y - 12, 10);
    g.fillStyle(0x140f2e, 1).fillCircle(cx - 20, GROUND_Y - 10, 5).fillCircle(cx + 24, GROUND_Y - 10, 5);
    // Energy left.
    g.fillStyle(INK, 1).fillRoundedRect(20, BOARD_H - 26, BOARD_W - 40, 18, 9);
    g.fillStyle(s.energy < 0.25 ? DANGER : GOLD, 1).fillRoundedRect(23, BOARD_H - 23, Math.max(12, (BOARD_W - 46) * s.energy), 12, 6);
  }
}
