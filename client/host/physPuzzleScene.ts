import Phaser from 'phaser';
import type { BoardView } from '../../shared/boards';
import { BOARD_H, BOARD_W, piecesAt, type PuzzleLevel, type PuzzleState } from '../../shared/physPuzzle';
import { BoardsScene, type BoardSlot } from './boardsScene';
import { drawLevel, drawPieces } from './physPuzzleDraw';

/** The TV for a physics puzzle (see shared/physPuzzle.ts): everyone's copy side by side, each change played as it comes in. */
export abstract class PhysPuzzleScene<S extends PuzzleState> extends BoardsScene<S> {
  protected readonly scoring = 'race';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected abstract readonly levels: PuzzleLevel[];
  /** When each board's last change started playing. */
  private playing = new Map<string, number>();
  private levelDrawn = new Map<string, Phaser.GameObjects.Graphics>();

  protected statusText(board: BoardView<S>) {
    const runs = board.state.runs;
    return `${runs} run${runs === 1 ? '' : 's'}`;
  }

  protected onSnapshot(slot: BoardSlot<S, S>, prev: S, next: S) {
    if (next.moveId !== prev.moveId) this.playing.set(slot.playerId, performance.now());
  }

  /** The level's drawn on the first update (the board doesn't know its level before then). */
  protected drawStatic(slot: BoardSlot<S, S>, g: Phaser.GameObjects.Graphics) {
    this.playing.delete(slot.playerId);
    this.levelDrawn.set(slot.playerId, g);
    g.setData('level', -1);
  }

  protected drawBoard(slot: BoardSlot<S, S>, g: Phaser.GameObjects.Graphics) {
    const s = slot.curr!.snap;
    const back = this.levelDrawn.get(slot.playerId);
    if (back && back.getData('level') !== s.level) {
      back.clear();
      back.fillStyle(0x1a1442, 1).fillRect(0, 0, BOARD_W, BOARD_H);
      drawLevel(back, this.levels[s.level]);
      back.setData('level', s.level);
    }
    const from = this.playing.get(slot.playerId);
    drawPieces(g, piecesAt(s as PuzzleState, from === undefined ? null : (performance.now() - from) / 1000));
  }
}
