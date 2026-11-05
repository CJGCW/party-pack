import Phaser from 'phaser';
import { INK, WOOD, ball, block, brick, softShadow } from '../art';
import { burst } from '../fx';
import type { BoardView, BoardsHostView } from '../../../shared/boards';
import { BOARD_SIZE, FRAME, GRID, SHELL_R, TILE, type Picture, type TiltBoardState, type TiltRound } from '../../../shared/games/tileTilt';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<TiltBoardState, TiltBoardState>;

/** A tile flipping over takes this long. */
const FLIP_MS = 260;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The TV during Tile Tilt: everyone's frame side by side (see ../boardsScene). The round's
 * picture is drawn under each frame's tiles, and shows through as they flip.
 */
export class TileTiltScene extends BoardsScene<TiltBoardState, TiltRound> {
  static readonly KEY = 'tile-tilt';
  protected readonly title = 'TILE TILT';
  protected readonly scoring = 'race';
  protected readonly boardW = BOARD_SIZE;
  protected readonly boardH = BOARD_SIZE;
  private picture: Picture = 'sun';
  /** When each board's tiles flipped (by tile index), to animate them. */
  private flips = new Map<string, Map<number, number>>();

  constructor() {
    super(TileTiltScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<TiltBoardState, TiltRound>) {
    this.picture = view.round.picture;
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }

  protected layoutKey(view: BoardsHostView<TiltBoardState, TiltRound>) {
    return view.round.picture;
  }

  protected statusText(board: BoardView<TiltBoardState>) {
    return `${board.boardScore}/${GRID * GRID}`;
  }

  protected onSnapshot(slot: Slot, prev: TiltBoardState, next: TiltBoardState) {
    const flips = this.flips.get(slot.playerId) ?? new Map<number, number>();
    const now = performance.now();
    next.flipped.forEach((bits, row) => {
      const fresh = bits & ~(prev.flipped[row] ?? 0);
      for (let col = 0; col < GRID; col++) {
        if (!(fresh & (1 << col))) continue;
        flips.set(row * GRID + col, now);
        const at = this.screenOf(slot, FRAME.x + (col + 0.5) * TILE, FRAME.y + (row + 0.5) * TILE);
        burst(this, at.x, at.y, hex(slot.board.color), 5);
      }
    });
    this.flips.set(slot.playerId, flips);
  }

  /** The frame and, under where the tiles go, the round's picture. */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    this.flips.delete(slot.playerId);
    block(g, FRAME.x - 36, FRAME.y - 36, FRAME.size + 72, FRAME.size + 72, WOOD);
    drawPicture(g, this.picture);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number) {
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    const flips = this.flips.get(slot.playerId);
    const now = performance.now();

    // Tiles still face down, and those turning over (shrinking edge-on).
    for (let i = 0; i < GRID * GRID; i++) {
      const row = Math.floor(i / GRID);
      const col = i % GRID;
      const up = (curr.flipped[row] >> col) & 1;
      const flippedAt = flips?.get(i);
      const turning = up && flippedAt !== undefined && now - flippedAt < FLIP_MS ? 1 - (now - flippedAt) / FLIP_MS : 0;
      if (up && !turning) continue;
      const w = (TILE - 6) * (up ? turning : 1);
      const x = FRAME.x + col * TILE + (TILE - w) / 2;
      const y = FRAME.y + row * TILE + 3;
      // A dark backing fills the whole square, so no picture shows between face-down tiles.
      if (!up) g.fillStyle(0x1a1442, 1).fillRect(FRAME.x + col * TILE, FRAME.y + row * TILE, TILE, TILE);
      brick(g, x, y, w, TILE - 6, (row + col) % 2 ? 0x4a3f9a : 0x3b3185);
    }

    // The shell: a dome in the player's colour with a pattern on its back.
    const x = lerp(prev.x, curr.x, t);
    const y = lerp(prev.y, curr.y, t);
    const color = hex(slot.board.color);
    softShadow(g, x + 5, y + SHELL_R * 0.9, SHELL_R * 2.1, SHELL_R);
    ball(g, x, y, SHELL_R, color);
    g.lineStyle(4, INK, 0.4);
    const hexPts = Array.from({ length: 6 }, (_, k) => new Phaser.Math.Vector2(x + Math.cos((k * Math.PI) / 3) * SHELL_R * 0.48, y + Math.sin((k * Math.PI) / 3) * SHELL_R * 0.48));
    g.strokePoints(hexPts, true);
    for (const p of hexPts) g.lineBetween(p.x, p.y, x + (p.x - x) * 2, y + (p.y - y) * 2);
  }
}

/** The hidden picture, filling the frame's inside: simple original drawings. */
function drawPicture(g: Phaser.GameObjects.Graphics, picture: Picture) {
  const { x: x0, y: y0, size } = FRAME;
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const s = size / 840;
  const bg = { sun: 0x3b3185, fish: 0x1f4f8f, rocket: 0x0f0b28, flower: 0x2f7d4f, cat: 0x4a3f9a }[picture];
  g.fillStyle(bg, 1).fillRect(x0, y0, size, size);
  switch (picture) {
    case 'sun': {
      g.fillStyle(0xffffff, 0.85).fillEllipse(x0 + 160 * s, y0 + 690 * s, 260 * s, 110 * s).fillEllipse(x0 + 690 * s, y0 + 160 * s, 220 * s, 90 * s);
      g.fillStyle(0xffb703, 1);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const p = (r: number, da: number) => ({ x: cx + Math.cos(a + da) * r * s, y: cy + Math.sin(a + da) * r * s });
        const [tip, l, r] = [p(330, 0), p(200, -0.14), p(200, 0.14)];
        g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
      }
      g.fillStyle(0xffd166, 1).fillCircle(cx, cy, 200 * s);
      g.fillStyle(0x3a2a10, 1).fillCircle(cx - 70 * s, cy - 40 * s, 22 * s).fillCircle(cx + 70 * s, cy - 40 * s, 22 * s);
      g.lineStyle(16 * s, 0x3a2a10, 1).beginPath().arc(cx, cy + 10 * s, 95 * s, 0.25, Math.PI - 0.25).strokePath();
      break;
    }
    case 'fish': {
      g.fillStyle(0x184f86, 1).fillRect(x0, y0 + 700 * s, size, 140 * s);
      g.fillStyle(0xff8c42, 1).fillTriangle(cx + 150 * s, cy, cx + 360 * s, cy - 170 * s, cx + 360 * s, cy + 170 * s);
      g.fillStyle(0xff9f5a, 1).fillEllipse(cx - 40 * s, cy, 500 * s, 320 * s);
      g.fillStyle(0xffd166, 1).fillTriangle(cx - 60 * s, cy - 150 * s, cx + 60 * s, cy - 250 * s, cx + 80 * s, cy - 130 * s);
      g.lineStyle(10 * s, 0xe0712c, 1).beginPath().arc(cx - 20 * s, cy, 110 * s, -1, 1).strokePath();
      g.fillStyle(0xffffff, 1).fillCircle(cx - 180 * s, cy - 40 * s, 42 * s);
      g.fillStyle(0x140f2e, 1).fillCircle(cx - 190 * s, cy - 40 * s, 20 * s);
      g.fillStyle(0xffffff, 0.6).fillCircle(cx - 330 * s, cy - 160 * s, 24 * s).fillCircle(cx - 300 * s, cy - 260 * s, 16 * s).fillCircle(cx - 350 * s, cy - 330 * s, 12 * s);
      break;
    }
    case 'rocket': {
      g.fillStyle(0xffffff, 0.8);
      for (const [px, py] of [[90, 120], [700, 90], [620, 300], [140, 520], [740, 640], [260, 760], [420, 70], [80, 330]]) g.fillCircle(x0 + px * s, y0 + py * s, 7 * s);
      g.fillStyle(0xffd166, 1).fillTriangle(cx - 80 * s, cy + 230 * s, cx + 80 * s, cy + 230 * s, cx, cy + 400 * s);
      g.fillStyle(0xff5d73, 1).fillTriangle(cx - 50 * s, cy + 230 * s, cx + 50 * s, cy + 230 * s, cx, cy + 330 * s);
      g.fillStyle(0xff5d73, 1).fillTriangle(cx - 110 * s, cy + 80 * s, cx - 230 * s, cy + 260 * s, cx - 110 * s, cy + 230 * s);
      g.fillTriangle(cx + 110 * s, cy + 80 * s, cx + 230 * s, cy + 260 * s, cx + 110 * s, cy + 230 * s);
      g.fillStyle(0xe8e8f0, 1).fillRoundedRect(cx - 110 * s, cy - 200 * s, 220 * s, 440 * s, 40 * s);
      g.fillStyle(0xff5d73, 1).fillTriangle(cx - 110 * s, cy - 190 * s, cx + 110 * s, cy - 190 * s, cx, cy - 390 * s);
      g.fillStyle(0x140f2e, 1).fillCircle(cx, cy - 40 * s, 70 * s);
      g.fillStyle(0x5ec8f2, 1).fillCircle(cx, cy - 40 * s, 52 * s);
      break;
    }
    case 'flower': {
      g.fillStyle(0x4caf6a, 1).fillRect(cx - 18 * s, cy, 36 * s, 420 * s);
      g.fillEllipse(cx - 110 * s, cy + 260 * s, 200 * s, 80 * s).fillEllipse(cx + 110 * s, cy + 180 * s, 200 * s, 80 * s);
      g.fillStyle(0xff7eb6, 1);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.fillCircle(cx + Math.cos(a) * 170 * s, cy - 80 * s + Math.sin(a) * 170 * s, 105 * s);
      }
      g.fillStyle(0xffd166, 1).fillCircle(cx, cy - 80 * s, 120 * s);
      g.fillStyle(0xe0a020, 1).fillCircle(cx - 40 * s, cy - 110 * s, 14 * s).fillCircle(cx + 35 * s, cy - 60 * s, 14 * s).fillCircle(cx + 10 * s, cy - 130 * s, 12 * s);
      break;
    }
    case 'cat': {
      g.fillStyle(0xf4a259, 1).fillTriangle(cx - 300 * s, cy - 120 * s, cx - 250 * s, cy - 380 * s, cx - 80 * s, cy - 250 * s);
      g.fillTriangle(cx + 300 * s, cy - 120 * s, cx + 250 * s, cy - 380 * s, cx + 80 * s, cy - 250 * s);
      g.fillStyle(0xf4a259, 1).fillCircle(cx, cy + 20 * s, 300 * s);
      g.fillStyle(0xffffff, 1).fillEllipse(cx, cy + 130 * s, 260 * s, 180 * s);
      g.fillStyle(0x4caf6a, 1).fillEllipse(cx - 110 * s, cy - 50 * s, 80 * s, 100 * s).fillEllipse(cx + 110 * s, cy - 50 * s, 80 * s, 100 * s);
      g.fillStyle(0x140f2e, 1).fillEllipse(cx - 110 * s, cy - 50 * s, 26 * s, 80 * s).fillEllipse(cx + 110 * s, cy - 50 * s, 26 * s, 80 * s);
      g.fillStyle(0xff7eb6, 1).fillTriangle(cx - 30 * s, cy + 60 * s, cx + 30 * s, cy + 60 * s, cx, cy + 95 * s);
      g.lineStyle(6 * s, 0x5a3a20, 1);
      for (const side of [-1, 1]) for (const dy of [-20, 20]) g.lineBetween(cx + side * 70 * s, cy + (100 + dy * 0.3) * s, cx + side * 260 * s, cy + (100 + dy) * s);
      break;
    }
  }
}
