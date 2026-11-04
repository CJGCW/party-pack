import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BALL_R, BOARD_H, BOARD_W, HEAD_R, HEAD_Y, throwAt, throwsFor, type HeadState, type Throw } from '../../../shared/games/headBall';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<HeadState, HeadState>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Head Ball: everyone's pitch side by side (see ../boardsScene), the same balls and boots flying at each. */
export class HeadBallScene extends BoardsScene<HeadState> {
  static readonly KEY = 'head-ball';
  protected readonly title = 'HEAD BALL';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected labelColor = '#140f2e';
  private throws: Throw[] = [];
  private seed = -1;
  private bonkAt = new Map<string, number>();

  constructor() {
    super(HeadBallScene.KEY);
  }

  protected statusText(board: BoardView<HeadState>) {
    return `${board.boardScore} headed`;
  }

  protected onSnapshot(slot: Slot, prev: HeadState, next: HeadState) {
    if (next.bonks > prev.bonks) this.bonkAt.set(slot.playerId, performance.now());
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(0x5ec8f2, 0x5ec8f2, 0xbfe9ff, 0xbfe9ff, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle(0x4cae5c, 1).fillRect(0, HEAD_Y + 80, BOARD_W, BOARD_H - HEAD_Y - 80);
    g.fillStyle(0x56c26a, 1);
    for (let x = 0; x < BOARD_W; x += 80) g.fillRect(x, HEAD_Y + 80, 40, BOARD_H - HEAD_Y - 80);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const v = this.view!;
    if (v.seed !== this.seed) {
      this.seed = v.seed;
      this.throws = throwsFor(v.seed);
    }
    const prev = slot.prev!.snap;
    const s = slot.curr!.snap;
    const ms = v.phase === 'play' ? v.roundMs + (performance.now() - slot.curr!.at) : 0;
    const met = new Set(s.met);
    for (const th of this.throws) {
      if (th.at > ms) break;
      if (met.has(th.id) || th.at < ms - 4_000) continue;
      const p = throwAt(th, ms)!;
      if (p.y > BOARD_H + 40) continue;
      if (th.boot) {
        // A boot: a chunky L, spinning.
        const a = (ms - th.at) / 120;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const pts = [
          [-14, -18],
          [6, -18],
          [6, 4],
          [22, 4],
          [22, 18],
          [-14, 18],
        ].map(([x, y]) => new Phaser.Math.Vector2(p.x + x * c - y * sn, p.y + x * sn + y * c));
        g.fillStyle(0x140f2e, 1).fillPoints(pts, true);
        g.fillStyle(0x8f5f34, 1).fillPoints(pts.map((q) => new Phaser.Math.Vector2(p.x + (q.x - p.x) * 0.8, p.y + (q.y - p.y) * 0.8)), true);
      } else {
        g.fillStyle(0x140f2e, 1).fillCircle(p.x, p.y, BALL_R + 3);
        g.fillStyle(0xffffff, 1).fillCircle(p.x, p.y, BALL_R);
        g.fillStyle(0x140f2e, 1).fillCircle(p.x, p.y, BALL_R * 0.35);
      }
    }
    // The player: a head on a body, bobbing up after a header, seeing stars when stunned.
    const x = lerp(prev.x, s.x, t);
    const bonk = Math.max(0, 1 - (performance.now() - (this.bonkAt.get(slot.playerId) ?? -1e9)) / 250);
    const hy = HEAD_Y - bonk * 18;
    const color = hex(slot.board.color);
    g.fillStyle(0x140f2e, 1).fillRoundedRect(x - 34, hy + 30, 68, 70, 16);
    g.fillStyle(color, 1).fillRoundedRect(x - 30, hy + 34, 60, 62, 14);
    g.fillStyle(0x140f2e, 1).fillCircle(x, hy, HEAD_R + 3);
    g.fillStyle(0xf2c9a0, 1).fillCircle(x, hy, HEAD_R);
    g.fillStyle(color, 1).fillEllipse(x, hy - HEAD_R * 0.6, HEAD_R * 1.7, HEAD_R * 0.8);
    g.fillStyle(0x140f2e, 1).fillCircle(x - 12, hy + 4, 4).fillCircle(x + 12, hy + 4, 4);
    if (s.stunMs > 0) {
      for (let k = 0; k < 3; k++) {
        const a = time / 200 + (k * Math.PI * 2) / 3;
        g.fillStyle(0xffd166, 1).fillCircle(x + Math.cos(a) * 46, hy - 40 + Math.sin(a) * 10, 6);
      }
    }
  }
}
