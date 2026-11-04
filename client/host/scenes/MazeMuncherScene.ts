import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { COLS, LIVES, MAZE, ROWS, TILE, findIn, type MuncherState } from '../../../shared/games/mazeMuncher';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<MuncherState, MuncherState>;

const TOP = 30;
const BOARD_W = COLS * TILE;
const BOARD_H = TOP + ROWS * TILE;
const GHOST_COLORS = [0xff5d73, 0xff9f43, 0x5ec8f2, 0xb48cff];
const ANGLES: Record<MuncherState['dir'], number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const near = (a: number, b: number) => Math.abs(a - b) < 1.5;
const START = findIn('P');

/** The TV during Maze Muncher: everyone's maze side by side (see ../boardsScene): dots, ghosts (scared or not), and their muncher. */
export class MazeMuncherScene extends BoardsScene<MuncherState> {
  static readonly KEY = 'maze-muncher';
  protected readonly title = 'MAZE MUNCHER';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;

  constructor() {
    super(MazeMuncherScene.KEY);
  }

  protected statusText(board: BoardView<MuncherState>) {
    return `${board.boardScore} · ${'♥'.repeat(board.state.lives)}${'♡'.repeat(Math.max(0, LIVES - board.state.lives))}`;
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x07051a, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    MAZE.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== '#') return;
        g.fillStyle(0x2a2a9a, 1).fillRoundedRect(x * TILE + 2, TOP + y * TILE + 2, TILE - 4, TILE - 4, 6);
      }),
    );
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number, time: number) {
    const prev = slot.prev!.snap;
    const s = slot.curr!.snap;
    const px = (x: number) => x * TILE + TILE / 2;
    const py = (y: number) => TOP + y * TILE + TILE / 2;
    for (let i = 0; i < s.dots.length; i++) {
      const ch = s.dots[i];
      if (ch === ' ') continue;
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      if (ch === '.') g.fillStyle(0xffd8a8, 1).fillCircle(px(x), py(y), 3);
      else g.fillStyle(0xffd8a8, 0.6 + 0.4 * Math.sin(time / 150)).fillCircle(px(x), py(y), 8);
    }
    if (s.fruit) g.fillStyle(0xff5d73, 1).fillCircle(px(START.x) - 4, py(START.y) + 2, 7).fillCircle(px(START.x) + 5, py(START.y) + 3, 7);
    s.ghosts.forEach((gh, i) => {
      const was = prev.ghosts[i];
      const x = was && near(was.x, gh.x) && near(was.y, gh.y) ? lerp(was.x, gh.x, t) : gh.x;
      const y = was && near(was.x, gh.x) && near(was.y, gh.y) ? lerp(was.y, gh.y, t) : gh.y;
      const color = gh.scared ? (s.scaredMs < 2000 && Math.sin(time / 90) > 0 ? 0xffffff : 0x3b3bff) : gh.kind >= 4 ? 0x9a93b8 : GHOST_COLORS[gh.kind];
      const cx = px(x);
      const cy = py(y);
      g.fillStyle(color, 1).fillCircle(cx, cy - 2, 12).fillRect(cx - 12, cy - 2, 24, 12);
      g.fillStyle(0xffffff, 1).fillCircle(cx - 5, cy - 4, 4).fillCircle(cx + 5, cy - 4, 4);
      g.fillStyle(0x140f2e, 1).fillCircle(cx - 4, cy - 4, 2).fillCircle(cx + 6, cy - 4, 2);
    });
    // The muncher, mouth opening and closing.
    const jump = !near(prev.x, s.x) || !near(prev.y, s.y);
    const x = px(jump ? s.x : lerp(prev.x, s.x, t));
    const y = py(jump ? s.y : lerp(prev.y, s.y, t));
    const mouth = 0.15 + 0.3 * Math.abs(Math.sin(time / 90));
    const a = ANGLES[s.dir];
    g.fillStyle(hex(slot.board.color), 1).slice(x, y, 13, a + mouth, a - mouth + Math.PI * 2, false).fillPath();
  }
}
