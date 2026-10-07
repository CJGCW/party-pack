import Phaser from 'phaser';
import {
  BOARD_COLS,
  BOARD_ROWS,
  HIDDEN,
  type TossUpHostView,
  type TossUpPlayer,
} from '../../../shared/games/tossUp';
import { listen, net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

const TILE_W = 104;
const TILE_H = 128;
const TILE_GAP = 8;
const BOARD_Y = 400;

const TILE_EMPTY = 0x1f6f5c; // board cells with no puzzle in them
const TILE_PUZZLE = 0xffffff; // puzzle cells (blank until revealed)
const TILE_FLASH = 0x5ec8f2; // a letter lighting up as it's revealed
const LETTER_COLOR = '#140f2e';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

interface Tile {
  rect: Phaser.GameObjects.Rectangle;
  letter: Phaser.GameObjects.Text;
}

export class TossUpScene extends Phaser.Scene {
  static readonly KEY = 'toss-up';

  private view: TossUpHostView | null = null;
  private tiles: Tile[][] = [];
  /** Board cell for each puzzle character, keyed "line:col" within the puzzle. */
  private cellFor = new Map<string, Tile>();
  private shown = new Map<string, string>();
  private puzzleKey = '';
  private phaseKey = '';
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private categoryText!: Phaser.GameObjects.Text;
  private playersRow!: Phaser.GameObjects.Container;
  private banner!: Phaser.GameObjects.Container;
  private bannerTimer: Phaser.GameObjects.Text | null = null;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(TossUpScene.KEY);
  }

  create() {
    this.view = null;
    this.cellFor = new Map();
    this.shown = new Map();
    this.puzzleKey = '';
    this.phaseKey = '';
    this.bannerTimer = null;

    addBackdrop(this);
    text(this, 210, 60, 'LETTER DROP', 56, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2, 60, '', 44);
    this.valueText = text(this, WIDTH - 200, 60, '', 52, COLORS.accent, { fontStyle: '700' });

    this.buildBoard();
    this.categoryText = text(this, WIDTH / 2, BOARD_Y + (BOARD_ROWS * (TILE_H + TILE_GAP)) / 2 + 60, '', 52, COLORS.text, {
      fontStyle: '700',
    }).setLetterSpacing(6);
    this.playersRow = this.add.container(WIDTH / 2, 990);
    this.banner = this.add.container(WIDTH / 2, 830).setDepth(40);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: TossUpHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as TossUpHostView);
  }

  update() {
    if (this.bannerTimer && this.view?.phase === 'buzzed') {
      const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
      this.bannerTimer.setText(String(secs)).setColor(secs <= 5 ? COLORS.danger : COLORS.text);
    }
  }

  private buildBoard() {
    const boardW = BOARD_COLS * TILE_W + (BOARD_COLS - 1) * TILE_GAP;
    const boardH = BOARD_ROWS * TILE_H + (BOARD_ROWS - 1) * TILE_GAP;
    panel(this, WIDTH / 2 - boardW / 2 - 24, BOARD_Y - boardH / 2 - 24, boardW + 48, boardH + 48, 0x0d3b31, 1);

    this.tiles = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < BOARD_COLS; c++) {
        const x = WIDTH / 2 - boardW / 2 + c * (TILE_W + TILE_GAP) + TILE_W / 2;
        const y = BOARD_Y - boardH / 2 + r * (TILE_H + TILE_GAP) + TILE_H / 2;
        const rect = this.add.rectangle(x, y, TILE_W, TILE_H, TILE_EMPTY).setStrokeStyle(3, 0x0d3b31);
        const letter = text(this, x, y, '', 86, LETTER_COLOR, { fontStyle: '700' });
        row.push({ rect, letter });
      }
      this.tiles.push(row);
    }
  }

  /** Places the puzzle on the board: lines centred vertically, each line centred horizontally. */
  private placePuzzle(lines: string[]) {
    this.cellFor.clear();
    this.shown.clear();
    for (const row of this.tiles) {
      for (const t of row) {
        this.tweens.killTweensOf(t.rect);
        t.rect.setFillStyle(TILE_EMPTY).setScale(1);
        t.letter.setText('');
      }
    }
    const top = Math.floor((BOARD_ROWS - lines.length) / 2);
    lines.forEach((line, l) => {
      const left = Math.floor((BOARD_COLS - line.length) / 2);
      [...line].forEach((ch, c) => {
        if (ch === ' ') return;
        const tile = this.tiles[top + l][left + c];
        tile.rect.setFillStyle(TILE_PUZZLE);
        this.cellFor.set(`${l}:${c}`, tile);
      });
    });
  }

  private applyView(view: TossUpHostView) {
    const previous = this.view;
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Puzzle ${view.puzzleNumber} of ${view.totalPuzzles}`);
    this.valueText.setText(view.value.toLocaleString());
    this.categoryText.setText(view.category);

    const puzzleKey = `${view.puzzleNumber}`;
    if (puzzleKey !== this.puzzleKey) {
      this.puzzleKey = puzzleKey;
      this.placePuzzle(view.lines);
    }
    this.revealLetters(view.lines, view.phase === 'solved' || view.phase === 'unsolved');
    this.renderPlayers(view.players);

    const phaseKey = `${view.puzzleNumber}|${view.phase}|${view.lastGuess?.playerId ?? ''}|${view.buzzerId ?? ''}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.showPhase(view, previous);
    }
  }

  /** Lights up any letters that weren't showing before. */
  private revealLetters(lines: string[], all: boolean) {
    let delay = 0;
    lines.forEach((line, l) => {
      [...line].forEach((ch, c) => {
        const key = `${l}:${c}`;
        const tile = this.cellFor.get(key);
        if (!tile || ch === HIDDEN || this.shown.get(key) === ch) return;
        this.shown.set(key, ch);
        // When the whole puzzle is revealed at the end, sweep across instead of all at once.
        const wait = all ? delay : 0;
        delay += 35;
        tile.rect.setFillStyle(TILE_FLASH);
        this.time.delayedCall(wait + 250, () => {
          tile.rect.setFillStyle(TILE_PUZZLE);
          tile.letter.setText(ch).setScale(0.3);
          this.tweens.add({ targets: tile.letter, scale: 1, duration: 200, ease: 'Back.easeOut' });
        });
      });
    });
  }

  private renderPlayers(players: TossUpPlayer[]) {
    this.playersRow.removeAll(true);
    const w = 210;
    const gap = 16;
    const startX = -((players.length - 1) * (w + gap)) / 2;
    players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const isBuzzer = this.view?.buzzerId === p.id;
      const g = this.add.graphics();
      g.fillStyle(hex(p.color), p.lockedOut ? 0.25 : 1);
      g.fillRoundedRect(x - w / 2, -50, w, 100, 18);
      if (isBuzzer) {
        g.lineStyle(6, 0xffffff, 1);
        g.strokeRoundedRect(x - w / 2, -50, w, 100, 18);
      }
      const name = text(this, x, -18, p.name, 30, '#140f2e', { fontStyle: '700' });
      const score = text(this, x, 22, p.score.toLocaleString(), 28, '#140f2e');
      this.playersRow.add([g, name, score]);
      if (p.lockedOut) this.playersRow.add(text(this, x + w / 2 - 22, -30, '✖', 28, COLORS.danger, { fontStyle: '700' }));
    });
  }

  private showBanner(message: string, color: string, withTimer = false) {
    this.banner.removeAll(true);
    this.bannerTimer = null;
    const w = 1100;
    const bg = this.add.graphics();
    bg.fillStyle(0x140f2e, 0.92);
    bg.fillRoundedRect(-w / 2, -55, w, 110, 26);
    bg.lineStyle(5, hex(color), 1);
    bg.strokeRoundedRect(-w / 2, -55, w, 110, 26);
    this.banner.add([bg, text(this, withTimer ? -60 : 0, 0, message, 46, color, { fontStyle: '700' })]);
    if (withTimer) {
      this.bannerTimer = text(this, w / 2 - 80, 0, '', 56, COLORS.text, { fontStyle: '700' });
      this.banner.add(this.bannerTimer);
    }
    this.banner.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 250, ease: 'Back.easeOut' });
    this.categoryText.setVisible(false);
  }

  private hideBanner() {
    this.banner.removeAll(true);
    this.bannerTimer = null;
    this.categoryText.setVisible(true);
  }

  private showPhase(view: TossUpHostView, previous: TossUpHostView | null) {
    this.overlay.removeAll(true);
    const buzzer = view.players.find((p) => p.id === view.buzzerId);

    switch (view.phase) {
      case 'intro':
        this.hideBanner();
        this.showBanner(`Puzzle ${view.puzzleNumber}  ·  ${view.value.toLocaleString()} points`, COLORS.accent);
        break;
      case 'buzzed':
        if (buzzer) {
          this.showBanner(`${buzzer.name} buzzed in!`, buzzer.color, true);
          this.cameras.main.shake(150, 0.004);
        }
        break;
      case 'revealing': {
        const wrong = view.lastGuess && !view.lastGuess.correct ? view.lastGuess : null;
        // Just after a wrong answer, show it briefly; otherwise show the category.
        if (wrong && previous?.phase === 'buzzed') {
          const said = wrong.text ? `"${wrong.text.toUpperCase()}"` : 'out of time';
          this.showBanner(`✖  ${wrong.name}: ${said}`, COLORS.danger);
          this.time.delayedCall(2300, () => {
            if (this.view?.phase === 'revealing') this.hideBanner();
          });
        } else {
          this.hideBanner();
        }
        break;
      }
      case 'solved': {
        const winner = view.players.find((p) => p.id === view.solvedBy);
        if (winner) {
          this.showBanner(`${winner.name} solved it!  +${view.value.toLocaleString()}`, winner.color);
          this.time.delayedCall(400, () => {
            burstConfetti(this, WIDTH * 0.3, BOARD_Y, 70);
            burstConfetti(this, WIDTH * 0.7, BOARD_Y, 70);
          });
        }
        break;
      }
      case 'unsolved':
        this.showBanner('Nobody solved it!', COLORS.muted);
        break;
      case 'gameEnd':
        this.hideBanner();
        this.showGameEnd(view);
        break;
    }
  }

  private showGameEnd(view: TossUpHostView) {
    this.overlay.add(this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0720, 0.85).setOrigin(0));
    const standings = [...view.players].sort((a, b) => b.score - a.score);
    const winner = standings[0];
    if (winner) {
      const crown = text(this, WIDTH / 2, 250, `${winner.name} WINS!`, 110, winner.color, {
        fontStyle: '700',
        stroke: '#140f2e',
        strokeThickness: 10,
      }).setScale(0);
      this.overlay.add(crown);
      this.tweens.add({ targets: crown, scale: 1, duration: 600, delay: 300, ease: 'Elastic.easeOut' });
      this.time.delayedCall(400, () => {
        burstConfetti(this, WIDTH * 0.25, HEIGHT * 0.5, 80);
        burstConfetti(this, WIDTH * 0.75, HEIGHT * 0.5, 80);
      });
    }
    this.overlay.add(panel(this, WIDTH / 2 - 420, 380, 840, 60 + standings.length * 60));
    standings.forEach((p, i) => {
      const y = 425 + i * 60;
      const row = [
        text(this, WIDTH / 2 - 340, y, ORDINAL[i], 38, COLORS.muted),
        text(this, WIDTH / 2 - 60, y, p.name, 42, p.color, { fontStyle: '700' }),
        text(this, WIDTH / 2 + 300, y, p.score.toLocaleString(), 42, COLORS.text),
      ];
      for (const t of row) t.setAlpha(0);
      this.overlay.add(row);
      this.tweens.add({ targets: row, alpha: 1, duration: 300, delay: 800 + (standings.length - i) * 250 });
    });
  }
}
