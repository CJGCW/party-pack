import Phaser from 'phaser';
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

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x241d55, 1).fillRect(0, TOP, BOARD_W, ROWS * CELL);
    g.lineStyle(2, 0xffffff, 0.06);
    for (let c = 1; c < COLS; c++) g.lineBetween(c * CELL, TOP, c * CELL, TOP + ROWS * CELL);
    for (let r = 1; r < ROWS; r++) g.lineBetween(0, TOP + r * CELL, BOARD_W, TOP + r * CELL);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, _t: number, time: number) {
    const s = slot.curr!.snap;
    s.pieces.forEach((piece, c) => {
      for (const seg of pieceSegments(piece, (c % COLS) * CELL, TOP + Math.floor(c / COLS) * CELL, CELL)) {
        g.lineStyle(34, 0x140f2e, 1).lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
        g.lineStyle(26, 0x8b8fa8, 1).lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
      }
    });
    // The water, rippling a little.
    const shimmer = 0.85 + 0.15 * Math.sin(time / 200);
    for (const seg of waterSegments(s, COLS, CELL, 0, TOP)) g.lineStyle(16, 0x5ec8f2, shimmer).lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
    // The tap.
    const src = { x: (s.source.cell % COLS) * CELL + CELL / 2, y: TOP + Math.floor(s.source.cell / COLS) * CELL + CELL / 2 };
    g.fillStyle(0x140f2e, 1).fillCircle(src.x, src.y, CELL * 0.36);
    g.fillStyle(0x2a6fb5, 1).fillCircle(src.x, src.y, CELL * 0.3);
    g.fillStyle(0xffffff, 0.6).fillCircle(src.x - 8, src.y - 8, CELL * 0.08);
  }
}
