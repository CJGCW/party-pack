import Phaser from 'phaser';
import {
  WORD_LENGTH,
  type LetterResult,
  type WordleHostPlayer,
  type WordleHostView,
} from '../../../shared/games/wordleRace';
import { listen, net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

const RESULT_COLOR: Record<LetterResult, number> = {
  correct: COLORS.correct,
  present: COLORS.present,
  absent: COLORS.absent,
};

/** Rows shown per board; with unlimited guesses, older rows scroll off the top. */
const VISIBLE_ROWS = 6;
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

interface Board {
  container: Phaser.GameObjects.Container;
  tiles: Phaser.GameObjects.Rectangle[][];
  status: Phaser.GameObjects.Text;
  rowsShown: number;
  finished: boolean;
}

export class WordleRaceScene extends Phaser.Scene {
  static readonly KEY = 'wordle-race';

  private view: WordleHostView | null = null;
  private boards = new Map<string, Board>();
  private boardLayoutKey = '';
  private phaseKey = '';
  private phaseEndsAt = 0;
  private roundText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;
  private countdownText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(WordleRaceScene.KEY);
  }

  create() {
    this.view = null;
    this.boards = new Map();
    this.boardLayoutKey = '';
    this.phaseKey = '';
    this.countdownText = null;

    addBackdrop(this);
    text(this, 200, 60, 'WORD RUSH', 56, COLORS.accent, { fontStyle: '700' });
    this.roundText = text(this, WIDTH / 2, 60, '', 44);
    this.timerText = text(this, WIDTH - 160, 60, '', 56, COLORS.text, { fontStyle: '700' });
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: WordleHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as WordleHostView);
  }

  update() {
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    if (!this.view) return;

    if (this.view.phase === 'playing') {
      this.timerText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
      this.timerText.setColor(secs <= 15 ? COLORS.danger : COLORS.text);
    } else {
      this.timerText.setText('');
    }

    if (this.countdownText && this.view.phase === 'countdown') {
      const label = secs > 1 ? String(secs - 1) : 'GO!';
      if (this.countdownText.text !== label) {
        this.countdownText.setText(label).setScale(1.8);
        this.tweens.add({ targets: this.countdownText, scale: 1, duration: 350, ease: 'Back.easeOut' });
      }
    }
  }

  private applyView(view: WordleHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.roundText.setText(`Round ${view.round} of ${view.totalRounds}`);

    // Rebuild boards whenever a new round starts or the player list changes.
    const layoutKey = `${view.round}|${view.players.map((p) => p.id).join(',')}`;
    if (layoutKey !== this.boardLayoutKey) {
      this.boardLayoutKey = layoutKey;
      this.buildBoards(view.players);
    }
    for (const p of view.players) this.updateBoard(p);

    const phaseKey = `${view.round}|${view.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.showPhase(view);
    }
  }

  private buildBoards(players: WordleHostPlayer[]) {
    for (const b of this.boards.values()) b.container.destroy();
    this.boards.clear();

    const cols = Math.min(4, Math.max(1, players.length));
    const rows = Math.ceil(players.length / cols);
    const top = 110;
    const cellW = (WIDTH - 120) / cols;
    const cellH = (HEIGHT - top - 20) / rows;

    // Size tiles so the whole board (tiles + gaps + padding + name/status) fits its cell
    // with a margin. A board is (n tiles + (n-1) gaps) plus fixed padding in each direction.
    const GAP_RATIO = 0.12;
    const PAD_X = 60;
    const PAD_Y = 120;
    const MARGIN = 24;
    const tile = Math.min(
      (cellW - PAD_X - MARGIN) / (WORD_LENGTH + (WORD_LENGTH - 1) * GAP_RATIO),
      (cellH - PAD_Y - MARGIN) / (VISIBLE_ROWS + (VISIBLE_ROWS - 1) * GAP_RATIO),
      100,
    );
    const gap = tile * GAP_RATIO;
    const gridW = WORD_LENGTH * tile + (WORD_LENGTH - 1) * gap;
    const gridH = VISIBLE_ROWS * tile + (VISIBLE_ROWS - 1) * gap;

    players.forEach((p, i) => {
      const row = Math.floor(i / cols);
      // Center a partially filled last row instead of leaving it left-aligned.
      const inThisRow = Math.min(cols, players.length - row * cols);
      const rowOffset = ((cols - inThisRow) * cellW) / 2;
      const cx = 60 + rowOffset + (i % cols) * cellW + cellW / 2;
      const cy = top + row * cellH + cellH / 2;
      const container = this.add.container(cx, cy);

      const bgW = gridW + PAD_X;
      const bgH = gridH + PAD_Y;
      const bg = this.add.graphics();
      bg.fillStyle(COLORS.panel, 0.85);
      bg.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 20);
      bg.lineStyle(5, hex(p.color), 1);
      bg.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 20);
      container.add(bg);
      container.add(text(this, 0, -bgH / 2 + 30, p.name, 34, p.color, { fontStyle: '700' }));

      const tiles: Phaser.GameObjects.Rectangle[][] = [];
      for (let r = 0; r < VISIBLE_ROWS; r++) {
        const row: Phaser.GameObjects.Rectangle[] = [];
        for (let c = 0; c < WORD_LENGTH; c++) {
          const x = -gridW / 2 + c * (tile + gap) + tile / 2;
          const y = -gridH / 2 + r * (tile + gap) + tile / 2 + 10;
          const rect = this.add.rectangle(x, y, tile, tile, COLORS.empty).setStrokeStyle(2, COLORS.panelLight);
          row.push(rect);
          container.add(rect);
        }
        tiles.push(row);
      }

      const status = text(this, 0, bgH / 2 - 28, '', 28, COLORS.muted);
      container.add(status);

      container.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 400, delay: i * 60, ease: 'Back.easeOut' });
      this.boards.set(p.id, { container, tiles, status, rowsShown: 0, finished: false });
    });
  }

  private updateBoard(p: WordleHostPlayer) {
    const board = this.boards.get(p.id);
    if (!board) return;

    if (p.rows.length !== board.rowsShown) {
      // Guesses are unlimited, so the board shows a window of the most recent rows.
      // Older rows are repainted instantly; rows we haven't shown yet flip in.
      const offset = Math.max(0, p.rows.length - VISIBLE_ROWS);
      for (let r = 0; r < VISIBLE_ROWS; r++) {
        const row = p.rows[offset + r];
        const isNew = offset + r >= board.rowsShown;
        board.tiles[r].forEach((tile, c) => {
          this.tweens.killTweensOf(tile);
          tile.setScale(1);
          if (!row) {
            tile.setFillStyle(COLORS.empty).setStrokeStyle(2, COLORS.panelLight);
          } else if (!isNew) {
            tile.setFillStyle(RESULT_COLOR[row[c]]).setStrokeStyle(0);
          } else {
            this.tweens.add({
              targets: tile,
              scaleY: 0,
              duration: 120,
              delay: c * 110,
              yoyo: true,
              onYoyo: () => tile.setFillStyle(RESULT_COLOR[row[c]]).setStrokeStyle(0),
            });
          }
        });
      }
      board.rowsShown = p.rows.length;
    }

    if (p.solved) {
      board.status.setText(`${ORDINAL[(p.finishRank ?? 1) - 1]}!  +${p.roundPoints}`).setColor(COLORS.accent);
    } else {
      const n = p.rows.length;
      board.status.setText(`${n} ${n === 1 ? 'guess' : 'guesses'}`).setColor(COLORS.muted);
    }

    if (p.solved && !board.finished) {
      board.finished = true;
      this.tweens.add({ targets: board.container, scale: 1.08, duration: 180, yoyo: true, delay: 600 });
      if (p.finishRank === 1) {
        this.time.delayedCall(600, () => burstConfetti(this, board.container.x, board.container.y, 50));
      }
    }
  }

  private showPhase(view: WordleHostView) {
    this.overlay.removeAll(true);
    this.countdownText = null;

    if (view.phase === 'countdown') {
      this.dim(0.6);
      this.overlay.add(text(this, WIDTH / 2, HEIGHT / 2 - 160, `Round ${view.round}`, 72, COLORS.accent, { fontStyle: '700' }));
      this.overlay.add(text(this, WIDTH / 2, HEIGHT / 2 - 80, 'Find the word on your phone. Fastest wins!', 40, COLORS.muted));
      this.countdownText = text(this, WIDTH / 2, HEIGHT / 2 + 80, '', 200, COLORS.text, { fontStyle: '700' });
      this.overlay.add(this.countdownText);
    } else if (view.phase === 'roundEnd' || view.phase === 'gameEnd') {
      // Let the last guesses flip before covering the boards.
      this.time.delayedCall(1200, () => {
        if (this.view?.phase !== view.phase || this.view.round !== view.round) return;
        this.dim(0.75);
        if (view.phase === 'roundEnd') this.showRoundEnd(view);
        else this.showGameEnd(view);
      });
    }
  }

  private dim(alpha: number) {
    const shade = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0720, alpha).setOrigin(0);
    this.overlay.add(shade);
  }

  private revealWord(word: string, y: number) {
    const size = 120;
    const gap = 16;
    const startX = WIDTH / 2 - ((word.length - 1) * (size + gap)) / 2;
    [...word].forEach((letter, i) => {
      const tile = this.add.rectangle(startX + i * (size + gap), y, size, size, COLORS.correct).setScale(1, 0);
      const label = text(this, tile.x, y, letter, 84, COLORS.text, { fontStyle: '700' }).setScale(1, 0);
      this.overlay.add([tile, label]);
      this.tweens.add({ targets: [tile, label], scaleY: 1, duration: 220, delay: i * 140, ease: 'Back.easeOut' });
    });
  }

  private showRoundEnd(view: WordleHostView) {
    this.overlay.add(text(this, WIDTH / 2, 230, 'The word was', 48, COLORS.muted));
    this.revealWord(view.answer ?? '?????', 360);

    const finishers = view.players
      .filter((p) => p.solved)
      .sort((a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99));
    const lines = finishers.length
      ? finishers.map((p) => `${ORDINAL[(p.finishRank ?? 1) - 1]}  ${p.name}  +${p.roundPoints}`)
      : ['Nobody got it!'];
    lines.forEach((line, i) => {
      const t = text(this, WIDTH / 2, 520 + i * 62, line, 44, i === 0 && finishers.length ? COLORS.accent : COLORS.text).setAlpha(0);
      this.overlay.add(t);
      this.tweens.add({ targets: t, alpha: 1, x: { from: WIDTH / 2 - 60, to: WIDTH / 2 }, duration: 300, delay: 900 + i * 200 });
    });
  }

  private showGameEnd(view: WordleHostView) {
    this.overlay.add(text(this, WIDTH / 2, 150, 'The last word was', 40, COLORS.muted));
    this.revealWord(view.answer ?? '?????', 250);

    const standings = [...view.players].sort((a, b) => b.score - a.score);
    const winner = standings[0];
    if (winner) {
      const crown = text(this, WIDTH / 2, 430, `${winner.name} WINS!`, 96, winner.color, {
        fontStyle: '700',
        stroke: '#140f2e',
        strokeThickness: 10,
      }).setScale(0);
      this.overlay.add(crown);
      this.tweens.add({ targets: crown, scale: 1, duration: 600, delay: 900, ease: 'Elastic.easeOut' });
      this.time.delayedCall(1000, () => {
        burstConfetti(this, WIDTH * 0.25, HEIGHT * 0.6, 80);
        burstConfetti(this, WIDTH * 0.75, HEIGHT * 0.6, 80);
      });
    }

    this.overlay.add(panel(this, WIDTH / 2 - 420, 520, 840, 60 + standings.length * 56));
    standings.forEach((p, i) => {
      const y = 560 + i * 56;
      const row = [
        text(this, WIDTH / 2 - 340, y, ORDINAL[i], 36, COLORS.muted),
        text(this, WIDTH / 2 - 60, y, p.name, 40, p.color, { fontStyle: '700' }),
        text(this, WIDTH / 2 + 300, y, String(p.score), 40, COLORS.text),
      ];
      for (const t of row) t.setAlpha(0);
      this.overlay.add(row);
      this.tweens.add({ targets: row, alpha: 1, duration: 300, delay: 1400 + (standings.length - i) * 250 });
    });
  }
}
