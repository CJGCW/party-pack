import Phaser from 'phaser';
import { BOARD_COLS, type CrewHostPlayer, type CrewHostView } from '../../../shared/games/clueCrew';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, hex, text } from '../theme';

const CARD_W = 330;
const CARD_H = 96;
const GAP_X = 16;
const GAP_Y = 14;
const BOARD_TOP = 352;
const LINE = 0x4a4290;
const INK = '#140f2e';

/**
 * The TV during Clue Crew: the shared board (never anyone's secret key), the current
 * clue, the team's progress, and how the votes are going.
 */
export class ClueCrewScene extends Phaser.Scene {
  static readonly KEY = 'clue-crew';

  private view: CrewHostView | null = null;
  private phaseEndsAt = 0;
  private phaseMs = 1;
  private phaseKey = '';
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;
  private clueLayer!: Phaser.GameObjects.Container;
  private boardLayer!: Phaser.GameObjects.Container;
  private playersRow!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(ClueCrewScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this, { blobs: false });
    this.timerBar = this.add.graphics();
    text(this, 80, 64, 'CLUE CREW', 30, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(6);
    this.headerText = text(this, WIDTH / 2, 64, '', 30, COLORS.muted);
    this.timerText = text(this, WIDTH - 80, 64, '', 48, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    this.clueLayer = this.add.container(0, 0);
    this.boardLayer = this.add.container(0, 0);
    this.playersRow = this.add.container(WIDTH / 2, HEIGHT - 76);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: CrewHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as CrewHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    this.timerBar.clear();
    const timed = this.view?.phase === 'clue' || this.view?.phase === 'guess';
    if (!timed) {
      this.timerText.setText('');
      return;
    }
    const msLeft = Math.max(0, this.phaseEndsAt - performance.now());
    const secs = Math.ceil(msLeft / 1000);
    const low = secs <= 10;
    this.timerText.setText(String(secs)).setColor(low ? COLORS.danger : COLORS.text);
    this.timerBar.fillStyle(low ? hex(COLORS.danger) : hex(COLORS.accent), 1);
    this.timerBar.fillRect(0, 0, WIDTH * (msLeft / this.phaseMs), 6);
  }

  private applyView(view: CrewHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    const key = `${view.round}|${view.turn}|${view.phase}|${view.guessesLeft}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.phaseMs = Math.max(1, view.msLeft);
    }
    this.headerText.setText(`Round ${view.round} of ${view.totalRounds}   ·   Turn ${view.turn} of ${view.turnsPerRound}`);
    this.renderClue(view);
    this.renderBoard(view);
    this.renderPlayers(view.players, view);

    this.overlay.removeAll(true);
    if (view.phase === 'gameEnd') {
      const scores = view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints }));
      if (view.outcome === 'complete') showRoundScores(this, this.overlay, scores, 'ALL WORDS FOUND', COLORS.accent);
      else if (view.outcome === 'trap') showRoundScores(this, this.overlay, scores, 'A TRAP ENDED IT', COLORS.danger);
      else showRoundScores(this, this.overlay, scores, 'OUT OF TURNS', COLORS.danger);
    }
  }

  /** Who's giving the clue, the clue itself, guesses left, and the team's progress. */
  private renderClue(view: CrewHostView) {
    const c = this.clueLayer;
    c.removeAll(true);
    c.add(text(this, WIDTH / 2, 140, `${view.giverName.toUpperCase()}'S CLUE`, 24, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(5));
    if (view.clue) {
      c.add(text(this, WIDTH / 2, 200, `${view.clue.word}  ·  ${view.clue.number}`, 64, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(4));
    } else {
      c.add(text(this, WIDTH / 2, 200, 'Thinking of a clue…', 44, COLORS.text, { fontStyle: '700' }));
    }
    let note = '';
    if (view.phase === 'guess') note = `${view.guessesLeft} guess${view.guessesLeft === 1 ? '' : 'es'} left${view.stopVotes ? `   ·   ${view.stopVotes} voting to stop` : ''}`;
    else if (view.phase === 'result' && view.last) {
      const word = view.last.index !== null ? view.cards[view.last.index].word : '';
      note =
        view.last.kind === 'target'
          ? `${word}: found`
          : view.last.kind === 'trap'
            ? `${word} was one of ${view.giverName}'s traps`
            : view.last.kind === 'neutral'
              ? `${word} isn't one of ${view.giverName}'s words`
              : 'The team stopped';
    }
    c.add(text(this, WIDTH / 2, 258, note, 26, view.last?.kind === 'target' && view.phase === 'result' ? COLORS.accent : COLORS.muted, { fontStyle: '700' }));

    // Progress: a segment per target word.
    const barW = 900;
    const gap = 5;
    const n = Math.max(1, view.totalTargets);
    const segW = (barW - gap * (n - 1)) / n;
    const g = this.add.graphics();
    for (let i = 0; i < n; i++) {
      g.fillStyle(i < view.found ? hex(COLORS.accent) : COLORS.panel, 1);
      g.fillRoundedRect(WIDTH / 2 - barW / 2 + i * (segW + gap), 306, segW, 12, 6);
    }
    c.add(g);
    c.add(text(this, WIDTH / 2 + barW / 2 + 28, 312, `${view.found} / ${view.totalTargets} FOUND`, 22, COLORS.muted, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(3));
  }

  private renderBoard(view: CrewHostView) {
    const b = this.boardLayer;
    b.removeAll(true);
    const totalW = BOARD_COLS * CARD_W + (BOARD_COLS - 1) * GAP_X;
    view.cards.forEach((card, i) => {
      const x = WIDTH / 2 - totalW / 2 + (i % BOARD_COLS) * (CARD_W + GAP_X);
      const y = BOARD_TOP + Math.floor(i / BOARD_COLS) * (CARD_H + GAP_Y);
      const picked = view.phase === 'result' && view.last?.index === i ? view.last.kind : null;
      const g = this.add.graphics();
      let textColor: string = COLORS.text;
      if (card.found) {
        g.fillStyle(COLORS.correct, 1);
        g.fillRoundedRect(x, y, CARD_W, CARD_H, 14);
      } else if (picked === 'trap') {
        g.fillStyle(hex(COLORS.danger), 1);
        g.fillRoundedRect(x, y, CARD_W, CARD_H, 14);
      } else {
        g.fillStyle(picked === 'neutral' ? COLORS.panelLight : COLORS.panel, 1);
        g.fillRoundedRect(x, y, CARD_W, CARD_H, 14);
        g.lineStyle(picked === 'neutral' ? 4 : 2, picked === 'neutral' ? hex(COLORS.muted) : LINE, 1);
        g.strokeRoundedRect(x, y, CARD_W, CARD_H, 14);
        if (picked === 'neutral') textColor = COLORS.muted;
      }
      b.add(g);
      b.add(text(this, x + CARD_W / 2, y + CARD_H / 2, card.word, 32, textColor, { fontStyle: '700' }).setLetterSpacing(2));
      // Live votes: a small count in the corner.
      const votes = view.phase === 'guess' ? view.voteCounts[i] : 0;
      if (votes > 0) {
        const pill = this.add.graphics();
        pill.fillStyle(hex(COLORS.accent), 1);
        pill.fillRoundedRect(x + CARD_W - 52, y + 10, 40, 30, 15);
        b.add(pill);
        b.add(text(this, x + CARD_W - 32, y + 25, String(votes), 20, INK, { fontStyle: '700' }));
      }
    });
  }

  /** Player cards: the clue-giver is marked; the others show whether they've voted. */
  private renderPlayers(players: CrewHostPlayer[], view: CrewHostView) {
    this.playersRow.removeAll(true);
    const w = 214;
    const h = 84;
    const gap = 14;
    const startX = -((players.length - 1) * (w + gap)) / 2;
    players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const left = x - w / 2;
      const giver = p.id === view.giverId;
      const g = this.add.graphics();
      g.fillStyle(giver ? COLORS.panelLight : COLORS.panel, 1);
      g.fillRoundedRect(left, -h / 2, w, h, 12);
      g.fillStyle(hex(p.color), 1);
      g.fillRoundedRect(left, -h / 2, 8, h, { tl: 12, bl: 12, tr: 0, br: 0 });
      this.playersRow.add(g);
      this.playersRow.add(text(this, left + 24, -16, p.name, 26, COLORS.text, { fontStyle: '700' }).setOrigin(0, 0.5));
      let status = `${p.score.toLocaleString()} pts`;
      let color: string = COLORS.muted;
      if (giver && (view.phase === 'clue' || view.phase === 'guess')) {
        status = 'Giving the clue';
        color = COLORS.accent;
      } else if (view.phase === 'guess') {
        status = p.voted ? 'Voted' : 'Thinking';
        if (p.voted) color = COLORS.text;
      }
      this.playersRow.add(text(this, left + 24, 18, status, 22, color, { fontStyle: '700' }).setOrigin(0, 0.5));
    });
  }
}
