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
import { DANGER, FLOOR_DARK, GOLD, INK, WOOD, ball, block, shade, softShadow } from '../art';
import { burst, impact, popText, shockwave } from '../fx';
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
  /** Balls on each board's score sheet so far, to spot a new one. */
  private rolled = new Map<string, number>();

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
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const foul = toBoard(0, 0).x;
    const end = toBoard(0, LANE_LEN).x;
    const top = toBoard(-GUTTER_HALF, 0).y;
    // Gutters: dark and rounded, deepest in the middle.
    const gutterH = (GUTTER_HALF - LANE_HALF) * PX;
    for (const y of [top, top + GUTTER_HALF * 2 * PX - gutterH]) {
      g.fillStyle(0x2a2360, 1).fillRect(0, y, BOARD_W, gutterH);
      g.fillStyle(0x1a1442, 1).fillRect(0, y + gutterH * 0.25, BOARD_W, gutterH * 0.5);
    }
    const laneTop = toBoard(-LANE_HALF, 0).y;
    const laneH = LANE_HALF * 2 * PX;
    // Boards of wood, with a shine down the middle and a dark edge.
    const planks = 13;
    for (let i = 0; i < planks; i++) {
      g.fillStyle(shade(WOOD, i % 2 ? 0.14 : 0.06), 1).fillRect(0, laneTop + (i * laneH) / planks, end, laneH / planks + 1);
    }
    g.lineStyle(1, shade(WOOD, -0.25), 0.4);
    for (let i = 1; i < planks; i++) g.lineBetween(0, laneTop + (i * laneH) / planks, end, laneTop + (i * laneH) / planks);
    g.fillStyle(0xffffff, 0.08).fillRect(0, laneTop + laneH * 0.32, end, laneH * 0.36);
    g.fillStyle(INK, 1).fillRect(0, laneTop - 3, end, 3).fillRect(0, laneTop + laneH, end, 3);
    g.fillStyle(DANGER, 1).fillRect(foul - 3, laneTop, 6, laneH);
    // Arrows a third of the way up.
    g.fillStyle(shade(WOOD, -0.55), 1);
    for (let i = -3; i <= 3; i++) {
      const p = toBoard(i * 0.12, 2.6 + Math.abs(i) * 0.1);
      g.fillTriangle(p.x - 10, p.y - 5, p.x - 10, p.y + 5, p.x + 6, p.y);
    }
    // The pin deck, and the pit past it.
    g.fillStyle(0x000000, 0.12).fillRect(toBoard(0, HEAD_PIN_Y - 0.3).x, laneTop, (LANE_LEN - HEAD_PIN_Y + 0.3) * PX, laneH);
    g.fillStyle(INK, 1).fillRect(end, top, BOARD_W - end, GUTTER_HALF * 2 * PX);
    // Frames along the top: three boxes, filled in as they're bowled.
    const texts: Phaser.GameObjects.Text[] = [];
    const w = 90;
    for (let f = 0; f < FRAMES; f++) {
      const x = BOARD_W / 2 - (FRAMES * w) / 2 + f * w;
      block(g, x, 8, w - 8, TOP - 16, 0x3b3185);
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
        g.fillStyle(INK, 1).fillEllipse(x, y, r * 4.4, r * 2.4);
        g.fillStyle(0xd8d4e8, 1).fillEllipse(x, y, r * 4, r * 2);
        g.fillStyle(DANGER, 1).fillEllipse(x, y, r * 0.9, r * 1.9);
        continue;
      }
      softShadow(g, x + 2, y + 4, PIN_R * PX * 2.4, PIN_R * PX * 1.8);
      ball(g, x, y, PIN_R * PX, 0xffffff);
      g.lineStyle(2.5, DANGER, 1).strokeCircle(x, y, PIN_R * PX * 0.58);
    }
    // The ball: rolling, or waiting on the line where it's aimed.
    const track = tracks.get(BALL_ID);
    let rolling: { x: number; y: number } | null = null;
    if (track) {
      const at = trackAt(track, frame);
      if (typeof at === 'object') rolling = at;
    } else if (this.view!.phase === 'aim' && !s.sitting) rolling = toBoard(s.aim.x, RELEASE_Y);
    if (rolling) {
      const color = hex(slot.board.color);
      softShadow(g, rolling.x + 3, rolling.y + 7, BALL_R * PX * 2.1, BALL_R * PX * 1.5);
      ball(g, rolling.x, rolling.y, BALL_R * PX, color);
      g.fillStyle(INK, 0.75).fillCircle(rolling.x + 2, rolling.y - 4, 2.2).fillCircle(rolling.x + 7, rolling.y - 2, 2.2).fillCircle(rolling.x + 4, rolling.y + 3, 2.2);
    }
    // Frames so far.
    const texts = this.frameTexts.get(slot.playerId) ?? [];
    let latest = '';
    let balls = 0;
    s.frames.forEach((f, i) => {
      // Each ball's mark; a ball making ten with the one before is a spare.
      let run = 0;
      const marks = f.map((p) => {
        if (p === null) return '';
        const spare = run > 0 && run + p === 10;
        run = spare || p === 10 ? 0 : run + p;
        balls++;
        latest = spare ? '/' : p === 10 ? 'X' : p === 0 ? '-' : String(p);
        return latest;
      });
      texts[i]?.setText(marks.join(' ').trim());
    });
    // The frame being bowled, picked out in gold.
    if (this.view!.phase === 'aim') {
      const w = 90;
      g.lineStyle(3, GOLD, 0.9).strokeRoundedRect(BOARD_W / 2 - (FRAMES * w) / 2 + s.frame * w, 8, w - 8, TOP - 16, 8);
    }
    this.markBall(slot, balls, latest);
    if (s.sitting && this.view!.phase === 'aim') {
      g.fillStyle(0x0a0720, 0.5).fillRect(0, TOP, toBoard(0, 1.4).x, BOARD_H - TOP);
    }
  }

  /** A new ball on the sheet: strikes and spares get their moment, at the pins. */
  private markBall(slot: Slot, balls: number, mark: string) {
    const seen = this.rolled.get(slot.playerId) ?? 0;
    this.rolled.set(slot.playerId, balls);
    if (balls <= seen || (mark !== 'X' && mark !== '/')) return;
    const pins = toBoard(0, HEAD_PIN_Y + 0.3);
    const [x, y] = [slot.x + pins.x * slot.scale, slot.y + pins.y * slot.scale];
    burst(this, x, y, GOLD, mark === 'X' ? 70 : 40);
    shockwave(this, x, y, GOLD, mark === 'X' ? 220 : 140);
    popText(this, x - 120, y, mark === 'X' ? 'STRIKE!' : 'SPARE!', COLORS.accent, mark === 'X' ? 84 : 64);
    if (mark === 'X') impact(this, 0.006);
  }
}
