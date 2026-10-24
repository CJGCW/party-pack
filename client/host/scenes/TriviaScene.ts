import Phaser from 'phaser';
import { ANSWER_LETTERS, MAX_LIVES, type TeamState, type TriviaHostPlayer, type TriviaHostView } from '../../../shared/games/trivia';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, hex, text } from '../theme';

const TILE_W = 840;
const TILE_H = 128;
const TILE_GAP = 24;
const TILES_TOP = 570;
const BADGE = 60;
const LINE = 0x4a4290;
const INK = '#140f2e';

interface Tile {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  badge: Phaser.GameObjects.Graphics;
  letter: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
}

/**
 * The TV for Trivia and Team Trivia: a clean layout of flat panels, letter badges and
 * thin bars. Team Trivia adds the stage's progress under the header and lives on each
 * player's card.
 */
export class TriviaScene extends Phaser.Scene {
  static readonly KEY = 'trivia';

  private view: TriviaHostView | null = null;
  private phaseKey = '';
  private phaseEndsAt = 0;
  private phaseMs = 1;
  private titleText!: Phaser.GameObjects.Text;
  private headerText!: Phaser.GameObjects.Text;
  private filmText!: Phaser.GameObjects.Text;
  private questionText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;
  private multiText!: Phaser.GameObjects.Text;
  private tiles: Tile[] = [];
  private playersRow!: Phaser.GameObjects.Container;
  /** Team Trivia: the stage and how far along it the team is. */
  private stageBar!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(TriviaScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    this.tiles = [];
    addBackdrop(this, { blobs: false });

    this.timerBar = this.add.graphics();
    this.titleText = text(this, 80, 64, 'TRIVIA', 30, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(6);
    this.headerText = text(this, WIDTH / 2, 64, '', 30, COLORS.muted);
    this.timerText = text(this, WIDTH - 80, 64, '', 48, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    this.filmText = text(this, WIDTH / 2, 200, '', 26, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(6);
    this.questionText = text(this, WIDTH / 2, 340, '', 60, COLORS.text, { fontStyle: '700', align: 'center', wordWrap: { width: 1560 } });
    this.multiText = text(this, WIDTH / 2, 512, 'SELECT ALL THAT APPLY', 24, COLORS.muted, { fontStyle: '700' })
      .setLetterSpacing(5)
      .setVisible(false);

    for (let i = 0; i < ANSWER_LETTERS.length; i++) {
      const x = WIDTH / 2 + (i % 2 === 0 ? -1 : 1) * (TILE_W / 2 + TILE_GAP / 2);
      const y = TILES_TOP + Math.floor(i / 2) * (TILE_H + TILE_GAP) + TILE_H / 2;
      const container = this.add.container(x, y).setAlpha(0);
      const bg = this.add.graphics();
      const badge = this.add.graphics();
      const letter = text(this, -TILE_W / 2 + 32 + BADGE / 2, 0, ANSWER_LETTERS[i], 30, COLORS.accent, { fontStyle: '700' });
      const label = text(this, -TILE_W / 2 + 32 + BADGE + 28, 0, '', 38, COLORS.text, {
        fontStyle: '700',
        wordWrap: { width: TILE_W - BADGE - 190 },
      }).setOrigin(0, 0.5);
      const count = text(this, TILE_W / 2 - 46, 0, '', 30, COLORS.text, { fontStyle: '700' });
      container.add([bg, badge, letter, label, count]);
      this.tiles.push({ container, bg, badge, letter, label, count });
    }

    this.playersRow = this.add.container(WIDTH / 2, HEIGHT - 76);
    this.stageBar = this.add.container(WIDTH / 2, 132);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: TriviaHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as TriviaHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    this.timerBar.clear();
    if (this.view?.phase !== 'answering') {
      this.timerText.setText('');
      return;
    }
    const msLeft = Math.max(0, this.phaseEndsAt - performance.now());
    const secs = Math.ceil(msLeft / 1000);
    const low = secs <= 5;
    this.timerText.setText(String(secs)).setColor(low ? COLORS.danger : COLORS.text);
    // A thin bar along the top edge, running down with the clock.
    this.timerBar.fillStyle(low ? hex(COLORS.danger) : hex(COLORS.accent), 1);
    this.timerBar.fillRect(0, 0, WIDTH * (msLeft / this.phaseMs), 6);
  }

  private drawTile(i: number, state: 'normal' | 'right' | 'wrong') {
    const { bg, badge, letter } = this.tiles[i];
    bg.clear();
    badge.clear();
    if (state === 'right') {
      bg.fillStyle(COLORS.correct, 1);
      bg.fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 16);
      badge.fillStyle(0xffffff, 0.22);
      letter.setColor(COLORS.text);
    } else {
      bg.fillStyle(COLORS.panel, 1);
      bg.fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 16);
      bg.lineStyle(2, LINE, 1);
      bg.strokeRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 16);
      badge.fillStyle(COLORS.panelLight, 1);
      letter.setColor(COLORS.accent);
    }
    badge.fillRoundedRect(-TILE_W / 2 + 32, -BADGE / 2, BADGE, BADGE, 12);
  }

  private applyView(view: TriviaHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    const count = view.totalQuestions > 0 ? `Question ${view.questionNumber} of ${view.totalQuestions}` : `Question ${view.questionNumber}`;
    this.headerText.setText(`${count}   ·   ${view.packName}`);
    const team = view.team;
    this.titleText.setText(team ? 'TEAM TRIVIA' : 'TRIVIA');
    // Team Trivia makes room for the stage bar under the header.
    this.filmText.setY(team ? 228 : 200);
    this.questionText.setY(team ? 360 : 340);
    this.renderStage(team);
    this.filmText.setText(view.film.toUpperCase());
    this.questionText.setText(view.question);
    this.multiText.setVisible(view.multi && view.phase !== 'gameEnd');
    this.renderPlayers(view.players, view.phase);

    const key = `${view.questionNumber}|${view.phase}`;
    if (key === this.phaseKey) return;
    this.phaseKey = key;
    this.phaseMs = Math.max(1, view.msLeft);
    this.overlay.removeAll(true);

    if (view.phase === 'question') {
      for (const t of this.tiles) t.container.setAlpha(0);
      this.questionText.setAlpha(0).setY(this.questionText.y + 16);
      this.tweens.add({ targets: this.questionText, alpha: 1, y: this.questionText.y - 16, duration: 260, ease: 'Cubic.easeOut' });
    } else if (view.phase === 'answering') {
      view.answers.forEach((answer, i) => {
        const tile = this.tiles[i];
        this.drawTile(i, 'normal');
        tile.label.setText(answer).setAlpha(1);
        tile.count.setText('');
        const y = TILES_TOP + Math.floor(i / 2) * (TILE_H + TILE_GAP) + TILE_H / 2;
        tile.container.setAlpha(0).setScale(1).setY(y + 14);
        this.tweens.add({ targets: tile.container, alpha: 1, y, duration: 220, delay: i * 60, ease: 'Cubic.easeOut' });
      });
    } else if (view.phase === 'reveal') {
      this.showReveal(view);
      if (team?.clearedNow) this.showStageCleared();
    } else if (view.phase === 'gameEnd') {
      const scores = view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints }));
      if (team?.outcome === 'complete') showRoundScores(this, this.overlay, scores, 'CHALLENGE COMPLETE', COLORS.accent);
      else if (team?.outcome === 'failed') showRoundScores(this, this.overlay, scores, 'CHALLENGE FAILED', COLORS.danger);
      else showRoundScores(this, this.overlay, scores);
    }
  }

  private showReveal(view: TriviaHostView) {
    view.answers.forEach((_, i) => {
      const tile = this.tiles[i];
      const right = view.correctIndices?.includes(i) ?? false;
      tile.container.setAlpha(right ? 1 : 0.45).setScale(1);
      this.drawTile(i, right ? 'right' : 'wrong');
      tile.label.setAlpha(1);
      const n = view.counts?.[i] ?? 0;
      tile.count.setText(n > 0 ? `${n}` : '');
    });
  }

  /** Team Trivia: the stage, a segmented bar of the correct answers it needs, and the count. */
  private renderStage(team: TeamState | undefined) {
    this.stageBar.removeAll(true);
    if (!team) return;
    const st = team.stage;
    const barW = 760;
    const gap = 6;
    const segW = (barW - gap * (st.needed - 1)) / st.needed;
    const g = this.add.graphics();
    for (let i = 0; i < st.needed; i++) {
      const filled = i < st.correct;
      const fresh = filled && i >= st.correct - team.correctNow;
      g.fillStyle(filled ? (fresh ? 0xffffff : hex(COLORS.accent)) : COLORS.panel, 1);
      g.fillRoundedRect(-barW / 2 + i * (segW + gap), -7, segW, 14, 7);
    }
    this.stageBar.add(g);
    const name = st.final ? 'FINAL STAGE' : `STAGE ${st.number} OF ${st.total}`;
    this.stageBar.add(text(this, -barW / 2 - 28, 0, name, 24, st.final ? COLORS.accent : COLORS.muted, { fontStyle: '700' }).setOrigin(1, 0.5).setLetterSpacing(3));
    this.stageBar.add(text(this, barW / 2 + 28, 0, `${st.correct} / ${st.needed} CORRECT`, 24, COLORS.muted, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(3));
  }

  /** A quiet banner when a stage is done. */
  private showStageCleared() {
    const w = 420;
    const h = 72;
    const banner = this.add.container(WIDTH / 2, 500).setAlpha(0);
    const g = this.add.graphics();
    g.fillStyle(hex(COLORS.accent), 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    banner.add([g, text(this, 0, 0, 'STAGE CLEARED', 32, INK, { fontStyle: '700' }).setLetterSpacing(5)]);
    this.overlay.add(banner);
    this.tweens.add({ targets: banner, alpha: 1, duration: 250, ease: 'Cubic.easeOut' });
  }

  /** Player cards along the bottom: a stripe of their colour, their name and status (and lives in Team Trivia). */
  private renderPlayers(players: TriviaHostPlayer[], phase: TriviaHostView['phase']) {
    this.playersRow.removeAll(true);
    const w = 214;
    const h = 84;
    const gap = 14;
    const startX = -((players.length - 1) * (w + gap)) / 2;
    players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const left = x - w / 2;
      const out = p.lives === 0;
      const card = this.add.container(0, 0).setAlpha(out ? 0.5 : 1);
      const g = this.add.graphics();
      g.fillStyle(COLORS.panel, 1);
      g.fillRoundedRect(left, -h / 2, w, h, 12);
      g.fillStyle(hex(p.color), 1);
      g.fillRoundedRect(left, -h / 2, 8, h, { tl: 12, bl: 12, tr: 0, br: 0 });
      card.add(g);
      card.add(text(this, left + 24, -16, p.name, 26, COLORS.text, { fontStyle: '700' }).setOrigin(0, 0.5));

      let status = '';
      let color: string = COLORS.muted;
      if (p.lives !== undefined) {
        // Lives as small bars at the top right.
        const lives = this.add.graphics();
        for (let k = 0; k < MAX_LIVES; k++) {
          lives.fillStyle(k < p.lives ? hex(COLORS.danger) : COLORS.panelLight, 1);
          lives.fillRoundedRect(left + w - 20 - (MAX_LIVES - k) * 22, -22, 16, 8, 4);
        }
        card.add(lives);
        const teamText = { correct: 'Correct', partial: 'Partly right', wrong: '−1 life', back: 'Back in', out: 'Out' } as const;
        const teamColor = { correct: COLORS.accent, partial: COLORS.muted, wrong: COLORS.danger, back: COLORS.accent, out: COLORS.muted } as const;
        if (phase === 'reveal' && p.teamResult) {
          status = teamText[p.teamResult];
          color = teamColor[p.teamResult];
        } else if (phase === 'answering') status = p.answered ? 'Locked in' : out ? 'Out' : 'Thinking';
        else status = out ? 'Out' : `${p.score.toLocaleString()} pts`;
      } else if (phase === 'answering') {
        status = p.answered ? 'Locked in' : 'Thinking';
        if (p.answered) color = COLORS.text;
      } else if (phase === 'reveal') {
        status = p.correct ? `+${p.questionPoints}` : 'No points';
        if (p.correct) color = COLORS.accent;
      } else status = `${p.score.toLocaleString()} pts`;
      card.add(text(this, left + 24, 18, status, 22, color, { fontStyle: '700' }).setOrigin(0, 0.5));
      this.playersRow.add(card);
    });
  }
}
