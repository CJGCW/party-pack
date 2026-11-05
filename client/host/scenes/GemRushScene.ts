import Phaser from 'phaser';
import { FLOOR_A, FLOOR_B, INK, STONE, shade } from '../art';
import { burst } from '../fx';
import type { BoardView } from '../../../shared/boards';
import { GEM_COLORS, SIZE, gemOutline, type GemBoardState } from '../../../shared/games/gemRush';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<GemBoardState, GemBoardState>;

const CELL = 70;
/** A strip across the top for the player's name. */
const TOP = 50;
const FILLS = GEM_COLORS.map(hex);
/** A cell that just changed glows for this long. */
const GLOW_MS = 400;

/** The TV during Gem Rush: everyone's gems side by side (see ../boardsScene), cells glowing as they change. */
export class GemRushScene extends BoardsScene<GemBoardState> {
  static readonly KEY = 'gem-rush';
  protected readonly title = 'GEM RUSH';
  protected readonly scoring = 'best';
  protected readonly boardW = SIZE * CELL;
  protected readonly boardH = TOP + SIZE * CELL;
  private changed = new Map<string, { cells: number[]; at: number }>();

  constructor() {
    super(GemRushScene.KEY);
  }

  protected statusText(board: BoardView<GemBoardState>) {
    return board.boardScore.toLocaleString();
  }

  protected resultTitle(board: BoardView<GemBoardState>) {
    return { title: `${board.boardScore.toLocaleString()} POINTS`, good: board.place === 1 };
  }

  protected onSnapshot(slot: Slot, prev: GemBoardState, next: GemBoardState) {
    if (prev.grid === next.grid) return;
    const cells = [...next.grid].map((ch, i) => (ch !== prev.grid[i] ? i : -1)).filter((i) => i >= 0);
    this.changed.set(slot.playerId, { cells, at: performance.now() });
    for (const c of cells.slice(0, 8)) {
      const at = this.screenOf(slot, (c % SIZE) * CELL + CELL / 2, TOP + Math.floor(c / SIZE) * CELL + CELL / 2);
      burst(this, at.x, at.y, 0xffffff, 6);
    }
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(INK, 1).fillRect(0, 0, SIZE * CELL, TOP);
    for (let c = 0; c < SIZE * SIZE; c++) {
      g.fillStyle((Math.floor(c / SIZE) + c) % 2 ? FLOOR_A : FLOOR_B, 1).fillRect((c % SIZE) * CELL, TOP + Math.floor(c / SIZE) * CELL, CELL, CELL);
    }
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const curr = slot.curr!.snap;
    const glow = this.changed.get(slot.playerId);
    const k = glow ? (performance.now() - glow.at) / GLOW_MS : 1;
    const glowing = new Set(k < 1 ? glow!.cells : []);
    for (let c = 0; c < SIZE * SIZE; c++) {
      const ch = curr.grid[c];
      const x = (c % SIZE) * CELL + CELL / 2;
      const y = TOP + Math.floor(c / SIZE) * CELL + CELL / 2;
      if (glowing.has(c)) g.fillStyle(0xffffff, 0.25 * (1 - k)).fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      const stone = ch === 'S';
      const r = CELL * 0.4;
      const outline = gemOutline(stone ? 99 : Number(ch));
      const color = stone ? STONE : FILLS[Number(ch)];
      const at = (k: number, dy = 0) => outline.map(([px, py]) => new Phaser.Math.Vector2(x + px * k, y + py * k + dy));
      g.fillStyle(INK, 1).fillPoints(at(r + 4), true);
      g.fillStyle(shade(color, -0.35), 1).fillPoints(at(r), true);
      g.fillStyle(color, 1).fillPoints(at(r * 0.84, -2), true);
      if (!stone) g.fillStyle(0xffffff, 0.55).fillEllipse(x - r * 0.28, y - r * 0.34, r * 0.42, r * 0.26);
    }
  }
}
