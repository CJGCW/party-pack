import Phaser from 'phaser';
import { FLOOR_A, FLOOR_B, INK, block, shade } from '../art';
import type { BoardView } from '../../../shared/boards';
import { BALLOON_COLORS, COLS, EMPTY, ROWS, STONE, STONE_COLOR, type PoppitState } from '../../../shared/games/poppit';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<PoppitState, PoppitState>;

const CELL = 80;
const TOP = 90;
const BOARD_W = COLS * CELL;
const BOARD_H = TOP + ROWS * CELL + 20;
const FILLS = BALLOON_COLORS.map(hex);
/** A pop's burst lasts this long. */
const POP_MS = 450;

/** Draws a balloon: a shiny oval with a knot, and a bow if it holds a gift. */
export function drawBalloon(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, gift: boolean) {
  const w = size * 0.78;
  const h = size * 0.88;
  g.fillStyle(INK, 1).fillEllipse(x, y, w + 6, h + 6);
  g.fillStyle(shade(color, -0.3), 1).fillEllipse(x, y, w, h);
  g.fillStyle(color, 1).fillEllipse(x - 1, y - 3, w * 0.86, h * 0.84);
  g.fillStyle(0xffffff, 0.55).fillEllipse(x - w * 0.18, y - h * 0.22, w * 0.22, h * 0.28);
  g.fillStyle(color, 1).fillTriangle(x - 6, y + h / 2 + 6, x + 6, y + h / 2 + 6, x, y + h / 2 - 2);
  if (gift) {
    g.fillStyle(0xffffff, 1).fillRect(x - 3, y - h / 2 + 4, 6, h - 8);
    g.fillTriangle(x, y - 4, x - 14, y - 12, x - 14, y + 4).fillTriangle(x, y - 4, x + 14, y - 12, x + 14, y + 4);
  }
}

/**
 * The TV during Poppit: everyone's balloons side by side (see ../boardsScene), each pop bursting
 * where it was.
 */
export class PoppitScene extends BoardsScene<PoppitState> {
  static readonly KEY = 'poppit';
  protected readonly title = 'POPPIT';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected endedBanner = 'ALL POPPED!';
  private bursts = new Map<string, { cells: number[]; colors: number[]; at: number }[]>();

  constructor() {
    super(PoppitScene.KEY);
  }

  protected statusText(board: BoardView<PoppitState>) {
    return `${board.boardScore.toLocaleString()}`;
  }

  protected resultTitle(board: BoardView<PoppitState>) {
    return { title: `${board.boardScore.toLocaleString()} POINTS`, good: board.place === 1 };
  }

  protected onSnapshot(slot: Slot, prev: PoppitState, next: PoppitState) {
    if (!next.popped || next.popped.n === prev.popped?.n) return;
    const list = this.bursts.get(slot.playerId) ?? [];
    list.push({ cells: next.popped.cells, colors: next.popped.cells.map((c) => prev.grid[c]), at: performance.now() });
    this.bursts.set(slot.playerId, list);
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    for (let c = 0; c < COLS; c++) g.fillStyle(c % 2 ? FLOOR_A : FLOOR_B, 1).fillRect(c * CELL, TOP, CELL, ROWS * CELL);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const s = slot.curr!.snap;
    const gifts = new Set(s.gifts);
    s.grid.forEach((color, c) => {
      if (color === EMPTY) return;
      const x = (c % COLS) * CELL + CELL / 2;
      const y = TOP + Math.floor(c / COLS) * CELL + CELL / 2;
      if (color === STONE) block(g, x - 37, y - 37, 74, 74, hex(STONE_COLOR));
      else drawBalloon(g, x, y, CELL, FILLS[color], gifts.has(c));
    });
    // Bursts where balloons just popped: a ring and a few bits flying out.
    const now = performance.now();
    const list = (this.bursts.get(slot.playerId) ?? []).filter((b) => now - b.at < POP_MS);
    this.bursts.set(slot.playerId, list);
    for (const b of list) {
      const p = (now - b.at) / POP_MS;
      b.cells.forEach((c, i) => {
        const x = (c % COLS) * CELL + CELL / 2;
        const y = TOP + Math.floor(c / COLS) * CELL + CELL / 2;
        const color = FILLS[b.colors[i]] ?? 0xffffff;
        g.lineStyle(6 * (1 - p), color, 1 - p).strokeCircle(x, y, CELL * (0.3 + p * 0.5));
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + c;
          g.fillStyle(color, 1 - p).fillCircle(x + Math.cos(a) * CELL * p * 0.8, y + Math.sin(a) * CELL * p * 0.8, 6);
        }
      });
    }
  }
}
