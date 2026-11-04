import Phaser from 'phaser';
import type { VolleyBoardView } from '../../../shared/volleys';
import { trackAt } from '../../../shared/volleys';
import {
  BALL_R,
  BOARD_H,
  BOARD_W,
  FRAMES,
  GUTTER_HALF,
  HEAD_PIN_Y,
  LANE_HALF,
  LANE_LEN,
  PIN_R,
  PX,
  RELEASE_Y,
  TOP,
  toBoard,
  type BowlBoardState,
} from '../../../shared/games/strikeZone';
import { VolleyScene, type VolleySlot } from '../volleyScene';
import { COLORS, hex, text } from '../theme';

type Slot = VolleySlot<BowlBoardState>;

const BALL_ID = 100;

/** The TV during Strike Zone: everyone's lane side by side (see ../volleyScene), from above, pins at the top. */
export class StrikeZoneScene extends VolleyScene<BowlBoardState> {
  static readonly KEY = 'strike-zone';
  protected readonly title = 'STRIKE ZONE';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected shotWord = 'Ball';
  private frameTexts = new Map<string, Phaser.GameObjects.Text[]>();

  constructor() {
    super(StrikeZoneScene.KEY);
  }

  protected statusText(board: VolleyBoardView<BowlBoardState>) {
    return String(board.boardScore);
  }

  protected resultTitle(board: VolleyBoardView<BowlBoardState>) {
    return `${board.boardScore} PINS`;
  }

  /** The lane on its side (foul line left, pins right): gutters, wood, the arrows; and a box per frame along the top. */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x140f2e, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const foul = toBoard(0, 0).x;
    const end = toBoard(0, LANE_LEN).x;
    const top = toBoard(-GUTTER_HALF, 0).y;
    g.fillStyle(0x3a3350, 1).fillRect(0, top, BOARD_W, GUTTER_HALF * 2 * PX);
    const laneTop = toBoard(-LANE_HALF, 0).y;
    const laneH = LANE_HALF * 2 * PX;
    g.fillStyle(0xd9a45f, 1).fillRect(0, laneTop, end, laneH);
    g.fillStyle(0xc8934f, 1);
    for (let i = 1; i < 8; i += 2) g.fillRect(0, laneTop + (i * laneH) / 8, end, laneH / 8);
    g.fillStyle(0xff5d73, 1).fillRect(foul - 3, laneTop, 6, laneH);
    // Arrows a third of the way up.
    g.fillStyle(0x7a4a22, 1);
    for (let i = -3; i <= 3; i++) {
      const p = toBoard(i * 0.12, 2.6 + Math.abs(i) * 0.1);
      g.fillTriangle(p.x - 10, p.y - 5, p.x - 10, p.y + 5, p.x + 6, p.y);
    }
    // The pin deck, and the pit past it.
    g.fillStyle(0x000000, 0.12).fillRect(toBoard(0, HEAD_PIN_Y - 0.3).x, laneTop, (LANE_LEN - HEAD_PIN_Y + 0.3) * PX, laneH);
    g.fillStyle(0x0a0720, 1).fillRect(end, top, BOARD_W - end, GUTTER_HALF * 2 * PX);
    // Frames along the top: three boxes, filled in as they're bowled.
    const texts: Phaser.GameObjects.Text[] = [];
    const w = 90;
    for (let f = 0; f < FRAMES; f++) {
      const x = BOARD_W / 2 - (FRAMES * w) / 2 + f * w;
      g.lineStyle(2, 0x8b7cf6, 0.7).strokeRect(x, 10, w - 8, TOP - 20);
      const t = text(this, x + (w - 8) / 2, TOP / 2, '', 24, COLORS.text, { fontStyle: '700' });
      slot.container.add(t);
      texts.push(t);
    }
    this.frameTexts.set(slot.playerId, texts);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, seconds: number) {
    const s = slot.board.state;
    const rec = this.view!.phase === 'fly' ? s.shot : null;
    const frame = rec ? Math.min(rec.frames - 1, seconds * rec.fps) : 0;
    const tracks = new Map((rec?.tracks ?? []).map((t) => [t.id, t]));
    for (const pin of s.pins) {
      const track = tracks.get(pin.id);
      const at = track ? trackAt(track, frame) : 'before';
      if (at === 'gone') continue;
      const x = typeof at === 'object' ? at.x : pin.x;
      const y = typeof at === 'object' ? at.y : pin.y;
      // Down pins lie on their side (once the ball's done, they're shown as they settled).
      if (pin.down && !rec) {
        const r = PIN_R * PX;
        g.fillStyle(0x140f2e, 1).fillEllipse(x, y, r * 4.4, r * 2.4);
        g.fillStyle(0xd8d4e8, 1).fillEllipse(x, y, r * 4, r * 2);
        continue;
      }
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, PIN_R * PX + 3);
      g.fillStyle(0xffffff, 1).fillCircle(x, y, PIN_R * PX);
      g.lineStyle(2.5, 0xff5d73, 1).strokeCircle(x, y, PIN_R * PX * 0.6);
    }
    // The ball: rolling, or waiting on the line where it's aimed.
    const track = tracks.get(BALL_ID);
    let ball: { x: number; y: number } | null = null;
    if (track) {
      const at = trackAt(track, frame);
      if (typeof at === 'object') ball = at;
    } else if (this.view!.phase === 'aim' && !s.sitting) ball = toBoard(s.aim.x, RELEASE_Y);
    if (ball) {
      g.fillStyle(0x140f2e, 1).fillCircle(ball.x, ball.y, BALL_R * PX + 3);
      g.fillStyle(hex(slot.board.color), 1).fillCircle(ball.x, ball.y, BALL_R * PX);
      g.fillStyle(0x140f2e, 0.7).fillCircle(ball.x - 3, ball.y - 3, 2).fillCircle(ball.x + 3, ball.y - 3, 2).fillCircle(ball.x, ball.y + 2, 2);
    }
    // Frames so far.
    const texts = this.frameTexts.get(slot.playerId) ?? [];
    s.frames.forEach(([a, b], i) => {
      const first = a === null ? '' : a === 10 ? 'X' : a === 0 ? '-' : String(a);
      const second = b === null ? '' : a !== null && a + b === 10 ? '/' : b === 0 ? '-' : String(b);
      texts[i]?.setText(`${first} ${second}`.trim());
    });
    if (s.sitting && this.view!.phase === 'aim') {
      g.fillStyle(0x0a0720, 0.5).fillRect(0, TOP, toBoard(0, 1.4).x, BOARD_H - TOP);
    }
  }
}
