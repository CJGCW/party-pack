import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { COLS, slidePosition, type StackState } from '../../../shared/games/stacker';
import { FLOOR_A, FLOOR_B, GOLD, DANGER, STONE, block } from '../art';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { burst } from '../fx';
import { hex } from '../theme';

type Slot = BoardSlot<StackState, StackState>;

/** A block is this many board units square; the board shows this many rows, plus room for the name. */
const CELL = 100;
const VISIBLE_ROWS = 9;
const TOP = 110;
const BOARD_W = COLS * CELL;
const BOARD_H = TOP + VISIBLE_ROWS * CELL + 30;
/** Blocks that fall off the edge take this long to drop out of sight. */
const FALL_MS = 700;

/** Which row sits at the bottom of the board: the tower scrolls down as it grows. */
function scrollFor(rows: number) {
  return Math.max(0, rows - (VISIBLE_ROWS - 3));
}

/**
 * The TV during Stacker: everyone's tower side by side (see ../boardsScene). The sliding row's
 * position is worked out from when it started, so it moves smoothly without waiting for updates.
 */
export class StackerScene extends BoardsScene<StackState> {
  static readonly KEY = 'stacker';
  protected readonly title = 'STACKER';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected endedBanner = 'TOPPLED!';
  /** Blocks falling off each board: where they were and when they started falling. */
  private falling = new Map<string, { row: number; col: number; width: number; at: number }[]>();

  constructor() {
    super(StackerScene.KEY);
  }

  protected statusText(board: BoardView<StackState>) {
    return `${board.boardScore} high`;
  }

  protected resultTitle(board: BoardView<StackState>) {
    return { title: `${board.boardScore} HIGH`, good: board.place === 1 };
  }

  protected onSnapshot(slot: Slot, prev: StackState, next: StackState) {
    // A row landing throws up dust where it landed.
    if (next.rows.length > prev.rows.length) {
      const [col, width] = next.rows[next.rows.length - 1];
      const scroll = scrollFor(next.rows.length);
      const at = this.screenOf(slot, (col + width / 2) * CELL, this.rowY(next.rows.length - 1, scroll) + CELL);
      burst(this, at.x, at.y, hex(slot.board.color), 12 + width * 4);
    }
    if (next.fell && next.fell.n !== prev.fell?.n) {
      const list = this.falling.get(slot.playerId) ?? [];
      list.push({ ...next.fell, at: performance.now() });
      this.falling.set(slot.playerId, list);
    }
  }

  /** Faint columns to stack in. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    for (let c = 0; c < COLS; c++) g.fillStyle(c % 2 ? FLOOR_A : FLOOR_B, 1).fillRect(c * CELL, TOP, CELL, VISIBLE_ROWS * CELL);
    g.fillStyle(0xffffff, 0.05).fillRect(0, TOP, BOARD_W, 3);
  }

  private rowY(row: number, scroll: number) {
    return TOP + (VISIBLE_ROWS - 1 - (row - scroll)) * CELL;
  }

  private blocks(g: Phaser.GameObjects.Graphics, col: number, width: number, y: number, color: number, alpha = 1) {
    for (let c = col; c < col + width; c++) {
      if (y + CELL < TOP || y > TOP + VISIBLE_ROWS * CELL) continue;
      block(g, c * CELL + 3, y + 3, CELL - 6, CELL - 6, color, alpha);
    }
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const s = slot.curr!.snap;
    const color = hex(slot.board.color);
    const now = performance.now();
    const scroll = scrollFor(s.rows.length);

    s.rows.forEach(([col, width], row) => this.blocks(g, col, width, this.rowY(row, scroll), row === 0 ? STONE : color));

    // The sliding row, worked out from when it started (only while it's going).
    const going = slot.board.endedAtMs === null && this.view?.phase === 'play' && s.sliding;
    if (going) {
      const ms = s.sliding!.ms + (now - slot.curr!.at);
      const col = slidePosition(s.sliding!.width, s.sliding!.stepMs, ms);
      this.blocks(g, col, s.sliding!.width, this.rowY(s.rows.length, scroll), GOLD);
    }

    // Blocks that fell off the edge, dropping and fading.
    const list = (this.falling.get(slot.playerId) ?? []).filter((f) => now - f.at < FALL_MS);
    this.falling.set(slot.playerId, list);
    for (const f of list) {
      const p = (now - f.at) / FALL_MS;
      this.blocks(g, f.col, f.width, this.rowY(f.row, scroll) + p * p * CELL * 6, DANGER, 1 - p);
    }
  }
}
