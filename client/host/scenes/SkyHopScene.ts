import Phaser from 'phaser';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import {
  HOPPER_R,
  HOPPER_SCREEN_Y,
  PLATFORM_H,
  VIEW_H,
  VIEW_W,
  platformX,
  platformsFor,
  type HopBoardState,
  type Platform,
} from '../../../shared/games/skyHop';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<HopBoardState, HopBoardState>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PLATFORM_COLORS: Record<Platform['kind'], number> = {
  ground: 0x4caf6a,
  normal: 0x4cd37a,
  moving: 0x5ec8f2,
  breaking: 0xb07a4a,
  spring: 0x4cd37a,
  checkpoint: 0xffd166,
};
/** The sky darkens from day to space as you climb (this high is all the way). */
const SPACE_AT = 18_000;

/**
 * The TV during Sky Hop: everyone's climb side by side (see ../boardsScene). The platforms come
 * from the round's seed (moving ones sway with the round's clock); each hopper comes from the server.
 */
export class SkyHopScene extends BoardsScene<HopBoardState> {
  static readonly KEY = 'sky-hop';
  protected readonly title = 'SKY HOP';
  protected readonly scoring = 'best';
  protected readonly boardW = VIEW_W;
  protected readonly boardH = VIEW_H;
  protected labelColor = '#2c2366';
  private platforms: Platform[] = [];
  private clock = { roundMs: 0, at: 0, playing: false };

  constructor() {
    super(SkyHopScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<HopBoardState>) {
    this.platforms = platformsFor(view.seed);
    this.clock = { roundMs: view.roundMs, at: performance.now(), playing: view.phase === 'play' };
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }

  protected statusText(board: BoardView<HopBoardState>) {
    return `${board.boardScore} m`;
  }

  protected resultTitle(board: BoardView<HopBoardState>) {
    return { title: `${board.boardScore} m UP`, good: board.place === 1 };
  }

  protected drawStatic() {}

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    // The view follows the highest point since the last checkpoint (it jumps back down after a fall).
    const best = curr.top < prev.top ? curr.top : lerp(prev.top, curr.top, t);
    const y = lerp(prev.y, curr.y, t);
    let x = curr.x;
    // Between updates, unless it's just gone off one side and come on the other.
    if (Math.abs(curr.x - prev.x) < VIEW_W / 2) x = lerp(prev.x, curr.x, t);
    const ms = this.clock.playing ? this.clock.roundMs + (performance.now() - this.clock.at) : this.clock.roundMs;
    const screenY = (height: number) => HOPPER_SCREEN_Y - (height - best);

    // The sky, darker the higher they are, with stars coming out.
    const dark = Math.min(1, best / SPACE_AT);
    const sky = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x6ec6f5), Phaser.Display.Color.ValueToColor(0x140f2e), 100, dark * 100);
    g.fillStyle(Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b), 1).fillRect(0, 0, VIEW_W, VIEW_H);
    if (dark > 0.3) {
      g.fillStyle(0xffffff, (dark - 0.3) * 1.2);
      for (let i = 0; i < 30; i++) {
        const sy = (((i * 337 + best * 0.2) % VIEW_H) + VIEW_H) % VIEW_H;
        g.fillCircle((i * 223) % VIEW_W, sy, 3);
      }
    }

    // Platforms in view.
    const broken = new Set(curr.broken);
    for (const p of this.platforms) {
      const sy = screenY(p.y);
      if (sy < -40) break;
      if (sy > VIEW_H + 40 || broken.has(p.n)) continue;
      const px = platformX(p, ms);
      const color = PLATFORM_COLORS[p.kind];
      g.fillStyle(0x140f2e, 0.5).fillRoundedRect(px + 4, sy + 6, p.w, PLATFORM_H, 10);
      g.fillStyle(color, 1).fillRoundedRect(px, sy, p.w, PLATFORM_H, 10);
      if (p.kind === 'breaking') g.lineStyle(4, 0x6b4520, 1).lineBetween(px + p.w * 0.35, sy, px + p.w * 0.5, sy + PLATFORM_H).lineBetween(px + p.w * 0.6, sy, px + p.w * 0.7, sy + PLATFORM_H);
      if (p.kind === 'spring') {
        const cx = px + p.w / 2;
        g.lineStyle(6, 0xff5d73, 1);
        for (let k = 0; k < 3; k++) g.lineBetween(cx - 16, sy - 6 - k * 10, cx + 16, sy - 11 - k * 10);
        g.fillStyle(0xff5d73, 1).fillRect(cx - 20, sy - 36, 40, 8);
      }
    }

    // The hopper (and its twin over the other side, while it's going off one).
    const color = hex(slot.board.color);
    const sy = screenY(y) - HOPPER_R;
    const squash = Math.max(0.8, Math.min(1.2, 1 + curr.vy / 6000));
    for (const dx of [0, VIEW_W, -VIEW_W]) {
      const hx = x + dx;
      if (hx < -HOPPER_R * 2 || hx > VIEW_W + HOPPER_R * 2) continue;
      g.fillStyle(0x140f2e, 1).fillEllipse(hx, sy, (HOPPER_R + 4) * 2 / squash, (HOPPER_R + 4) * 2 * squash);
      g.fillStyle(curr.falling && Math.floor(time / 120) % 2 ? 0xff5d73 : color, 1).fillEllipse(hx, sy, (HOPPER_R * 2) / squash, HOPPER_R * 2 * squash);
      g.fillStyle(0xffffff, 1).fillCircle(hx - 9, sy - 6, 8).fillCircle(hx + 9, sy - 6, 8);
      g.fillStyle(0x140f2e, 1).fillCircle(hx - 8, sy - 5, 4).fillCircle(hx + 10, sy - 5, 4);
    }
  }
}
