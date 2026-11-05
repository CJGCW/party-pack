import Phaser from 'phaser';
import { DANGER, FIRE, GOLD, GOOD, INK, SKY, STONE, ball, gridFloor, glow, shade, softShadow } from '../art';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import {
  BALL_R,
  BALL_SCREEN_Y,
  CHECKPOINT_EVERY,
  RING_GAP,
  SEGMENTS,
  VIEW_H,
  VIEW_W,
  ringAt,
  type HelixBoardState,
} from '../../../shared/games/helixDrop';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<HelixBoardState, HelixBoardState>;

/** The tower: rings this wide round the middle, seen a little from above (so their fronts sit lower). */
const CX = VIEW_W / 2;
const R = 270;
const R_POLE = 70;
const TILT = 0.3;
const THICK = 26;
const STEPS = 6;
const RING_COLORS = [SKY, GOOD];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * The TV during Helix Drop: everyone's tower side by side (see ../boardsScene). The rings come
 * from the round's seed; each board's ball depth and tower angle come from the server.
 */
export class HelixDropScene extends BoardsScene<HelixBoardState> {
  static readonly KEY = 'helix-drop';
  protected readonly title = 'HELIX DROP';
  protected readonly scoring = 'best';
  protected readonly boardW = VIEW_W;
  protected readonly boardH = VIEW_H;
  private seed = 0;

  constructor() {
    super(HelixDropScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<HelixBoardState>) {
    this.seed = view.seed;
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }

  protected statusText(board: BoardView<HelixBoardState>) {
    return `${board.boardScore} ${board.boardScore === 1 ? 'ring' : 'rings'}`;
  }

  protected resultTitle(board: BoardView<HelixBoardState>) {
    return { title: `${board.boardScore} ${board.boardScore === 1 ? 'RING' : 'RINGS'}`, good: board.place === 1 };
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    gridFloor(g, VIEW_W, VIEW_H, 60, 4, 0x8b7cf6);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    const depth = lerp(prev.depth, curr.depth, t);
    const angle = lerpAngle(prev.angle, curr.angle, t);
    const top = depth - BALL_SCREEN_Y;
    const first = Math.max(0, Math.floor((top - RING_GAP) / RING_GAP));
    const last = Math.ceil((top + VIEW_H + RING_GAP) / RING_GAP);

    // The far halves of the rings, then the pole, then the near halves over it.
    for (const near of [false, true]) {
      if (near) {
        g.fillStyle(INK, 1).fillRect(CX - R_POLE - 4, 0, R_POLE * 2 + 8, VIEW_H);
        g.fillStyle(STONE, 1).fillRect(CX - R_POLE, 0, R_POLE * 2, VIEW_H);
        g.fillStyle(0xffffff, 0.18).fillRect(CX - R_POLE + 12, 0, 22, VIEW_H);
      }
      for (let n = last; n >= first; n--) this.ring(g, n, n * RING_GAP - top, angle, near);
    }

    // The ball, sitting on the front of the ring below it (red and flashing after landing on red).
    const ballY = BALL_SCREEN_Y + R * TILT - BALL_R;
    const color = curr.respawning && Math.floor(time / 120) % 2 ? DANGER : curr.fire ? FIRE : hex(slot.board.color);
    softShadow(g, CX + 4, ballY + BALL_R + 6, BALL_R * 2, BALL_R * 0.6);
    if (curr.fire) glow(g, CX, ballY, BALL_R * 4, FIRE);
    ball(g, CX, ballY, BALL_R, color);
  }

  /** Ring `n` at screen height `y`: its slices round the tower, the near or the far ones. */
  private ring(g: Phaser.GameObjects.Graphics, n: number, y: number, angle: number, near: boolean) {
    if (y < -RING_GAP || y > VIEW_H + RING_GAP) return;
    const slices = ringAt(this.seed, n);
    const checkpoint = n % CHECKPOINT_EVERY === 0;
    const base = checkpoint ? GOLD : RING_COLORS[n % 2];
    const span = (Math.PI * 2) / SEGMENTS;
    slices.forEach((slice, k) => {
      if (slice === 'gap') return;
      const mid = (k + 0.5) * span + angle;
      if (Math.cos(mid) > 0 !== near) return;
      // The slice's top face: from the pole out to the rim, across its share of the circle.
      const top: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const a = k * span + angle + (i / STEPS) * span;
        top.push(new Phaser.Math.Vector2(CX + R * Math.sin(a), y + R * TILT * Math.cos(a)));
      }
      for (let i = STEPS; i >= 0; i--) {
        const a = k * span + angle + (i / STEPS) * span;
        top.push(new Phaser.Math.Vector2(CX + R_POLE * Math.sin(a), y + R_POLE * TILT * Math.cos(a)));
      }
      const color = slice === 'danger' ? DANGER : base;
      // Its front edge, a little darker, for some thickness.
      const edge = top.slice(0, STEPS + 1).map((p) => new Phaser.Math.Vector2(p.x, p.y + THICK));
      g.fillStyle(shade(color, -0.35), near ? 1 : 0.5).fillPoints([...top.slice(0, STEPS + 1), ...edge.reverse()], true);
      g.fillStyle(color, near ? 1 : 0.5).fillPoints(top, true);
      if (near) g.lineStyle(3, INK, 1).strokePoints(top, true);
    });
  }
}
