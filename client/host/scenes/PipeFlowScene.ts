import Phaser from 'phaser';
import { FLOOR_A, FLOOR_B, INK, SKY, STONE, ball, checkerFloor, glow, shade } from '../art';
import { burst } from '../fx';
import type { BoardView } from '../../../shared/boards';
import { pieceSegments, waterSegments } from '../../../shared/games/pipeDraw';
import { COLS, ROWS, type PipeState } from '../../../shared/games/pipeFlow';
import { BoardsScene, type BoardSlot } from '../boardsScene';

type Slot = BoardSlot<PipeState, PipeState>;

const CELL = 100;
const TOP = 90;
const BOARD_W = COLS * CELL;
const BOARD_H = TOP + ROWS * CELL + 20;

/** The TV during Pipe Flow: everyone's pipes side by side (see ../boardsScene), with the water working its way along them. */
export class PipeFlowScene extends BoardsScene<PipeState> {
  static readonly KEY = 'pipe-flow';
  protected readonly title = 'PIPE FLOW';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected endedBanner = 'SPILLED!';

  constructor() {
    super(PipeFlowScene.KEY);
  }

  protected statusText(board: BoardView<PipeState>) {
    return `${board.boardScore} filled`;
  }

  protected resultTitle(board: BoardView<PipeState>) {
    return { title: `${board.boardScore} FILLED`, good: board.place === 1 };
  }

  /** Water reaching a new square throws up a little spray. */
  protected onSnapshot(slot: Slot, prev: PipeState, next: PipeState) {
    const fresh = waterSegments(next, COLS, CELL, 0, TOP);
    if (fresh.length <= waterSegments(prev, COLS, CELL, 0, TOP).length) return;
    const tip = fresh[fresh.length - 1];
    const at = this.screenOf(slot, tip.x2, tip.y2);
    burst(this, at.x, at.y, SKY, 8);
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    checkerFloor(g, 0, TOP, COLS, ROWS, CELL, FLOOR_A, FLOOR_B);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, _t: number, time: number) {
    const s = slot.curr!.snap;
    s.pieces.forEach((piece, c) => {
      for (const seg of pieceSegments(piece, (c % COLS) * CELL, TOP + Math.floor(c / COLS) * CELL, CELL)) {
        g.lineStyle(36, INK, 1).lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
        g.lineStyle(26, shade(STONE, 0.3), 1).lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
      }
    });
    // The water, rippling a little.
    const shimmer = 0.85 + 0.15 * Math.sin(time / 200);
    for (const seg of waterSegments(s, COLS, CELL, 0, TOP)) g.lineStyle(16, SKY, shimmer).lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
    // The tap.
    const src = { x: (s.source.cell % COLS) * CELL + CELL / 2, y: TOP + Math.floor(s.source.cell / COLS) * CELL + CELL / 2 };
    glow(g, src.x, src.y, CELL * 0.8, SKY);
    ball(g, src.x, src.y, CELL * 0.3, SKY);
  }
}
