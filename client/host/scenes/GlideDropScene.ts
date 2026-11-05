import Phaser from 'phaser';
import { DANGER, GOLD, INK, SEA, SKY, STONE, WOOD, ball, block, duskSky, shade } from '../art';
import { burst, popText } from '../fx';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_PX, BOARD_W, LAUNCH, RINGS, WORLD_H, targetFor, type GlideState } from '../../../shared/games/glideDrop';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<GlideState, GlideState>;

const SEA_Y = 40 + WORLD_H * BOARD_PX;
const at = (x: number, y: number) => ({ x: x * BOARD_PX, y: SEA_Y - y * BOARD_PX });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const RING_COLORS = [GOLD, DANGER, 0xffffff, SKY];

/** The TV during Glide Drop: everyone's flight from the side (see ../boardsScene), the ramp, the sea and the target. */
export class GlideDropScene extends BoardsScene<GlideState> {
  static readonly KEY = 'glide-drop';
  protected readonly title = 'GLIDE DROP';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;

  constructor() {
    super(GlideDropScene.KEY);
  }

  protected statusText(board: BoardView<GlideState>) {
    return `${board.boardScore} · flight ${Math.min(3, board.state.flight + 1)}/3`;
  }

  protected onSnapshot(slot: Slot, prev: GlideState, next: GlideState) {
    if (prev.status === 'landed' || next.status !== 'landed') return;
    const p = at(next.x, 0);
    const s = this.screenOf(slot, p.x, p.y);
    burst(this, s.x, s.y, next.last ? GOLD : SKY, next.last ? 40 : 20);
    if (next.last) popText(this, s.x, s.y - 40, `+${next.last}`, '#ffd166', 44);
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    duskSky(g, 0, 0, BOARD_W, SEA_Y);
    g.fillStyle(SEA, 1).fillRect(0, SEA_Y, BOARD_W, BOARD_H - SEA_Y);
    g.fillStyle(0xffffff, 0.12).fillRect(0, SEA_Y, BOARD_W, 4);
    // The cliff and ramp it launches from.
    const top = at(LAUNCH.x, LAUNCH.y);
    block(g, -20, top.y + 6, top.x + 26, SEA_Y - top.y + 10, STONE);
    g.lineStyle(7, INK, 1).lineBetween(0, top.y - 10, top.x + 6, top.y + 4);
    g.lineStyle(4, WOOD, 1).lineBetween(0, top.y - 10, top.x + 6, top.y + 4);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const v = this.view!;
    const prev = slot.prev!.snap;
    const s = slot.curr!.snap;
    // This flight's target: rings on a float.
    const tx = targetFor(v.seed, s.flight);
    for (let i = RINGS.length - 1; i >= 0; i--) {
      const p = at(tx, 0);
      g.fillStyle(RING_COLORS[i], 1).fillEllipse(p.x, p.y + 2, RINGS[i][0] * 2 * BOARD_PX, 10);
    }
    if (s.status === 'done') return;
    const same = prev.flight === s.flight && prev.status === s.status;
    const x = same ? lerp(prev.x, s.x, t) : s.x;
    const y = same ? lerp(prev.y, s.y, t) : s.y;
    const a = same ? lerp(prev.angle, s.angle, t) : s.angle;
    const p = at(x, y);
    if (s.status === 'landed') {
      // A splash, or a bullseye.
      const k = (time % 600) / 600;
      g.lineStyle(3, s.last ? GOLD : 0xffffff, 1 - k).strokeEllipse(p.x, SEA_Y, 20 + 40 * k, 8 + 10 * k);
      if (s.last) ball(g, p.x, SEA_Y - 8, 7, hex(slot.board.color));
      return;
    }
    const c = Math.cos(-a);
    const sn = Math.sin(-a);
    const pt = (dx: number, dy: number) => new Phaser.Math.Vector2(p.x + dx * c - dy * sn, p.y + dx * sn + dy * c);
    const color = hex(slot.board.color);
    if (s.open) {
      g.fillStyle(INK, 1).fillPoints([pt(-16, -1), pt(12, -1), pt(-2, -19)], true);
      g.fillStyle(shade(color, 0.55), 1).fillPoints([pt(-13, -2), pt(9, -2), pt(-2, -15)], true);
    }
    ball(g, p.x, p.y, 6, color);
  }
}
