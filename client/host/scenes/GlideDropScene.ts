import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_PX, BOARD_W, LAUNCH, RINGS, WORLD_H, targetFor, type GlideState } from '../../../shared/games/glideDrop';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<GlideState, GlideState>;

const SEA_Y = 40 + WORLD_H * BOARD_PX;
const at = (x: number, y: number) => ({ x: x * BOARD_PX, y: SEA_Y - y * BOARD_PX });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const RING_COLORS = [0xffd166, 0xff5d73, 0xffffff, 0x5ec8f2];

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

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(0x5ec8f2, 0x5ec8f2, 0xbfe9ff, 0xbfe9ff, 1).fillRect(0, 0, BOARD_W, SEA_Y);
    g.fillStyle(0x2f7ab8, 1).fillRect(0, SEA_Y, BOARD_W, BOARD_H - SEA_Y);
    // The cliff and ramp it launches from.
    const top = at(LAUNCH.x, LAUNCH.y);
    g.fillStyle(0x6b5a3e, 1).fillRect(0, top.y + 6, top.x + 6, SEA_Y - top.y);
    g.lineStyle(4, 0x8f5f34, 1).lineBetween(0, top.y - 10, top.x + 6, top.y + 4);
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
      g.lineStyle(3, s.last ? 0xffd166 : 0xffffff, 1 - k).strokeEllipse(p.x, SEA_Y, 20 + 40 * k, 8 + 10 * k);
      if (s.last) g.fillStyle(hex(slot.board.color), 1).fillCircle(p.x, SEA_Y - 8, 8);
      return;
    }
    const c = Math.cos(-a);
    const sn = Math.sin(-a);
    const pt = (dx: number, dy: number) => new Phaser.Math.Vector2(p.x + dx * c - dy * sn, p.y + dx * sn + dy * c);
    const color = hex(slot.board.color);
    if (s.open) g.fillStyle(0xffffff, 0.95).fillPoints([pt(-14, -2), pt(10, -2), pt(-2, -16)], true);
    g.fillStyle(0x140f2e, 1).fillCircle(p.x, p.y, 8);
    g.fillStyle(color, 1).fillCircle(p.x, p.y, 6);
  }
}
