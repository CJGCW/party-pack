import Phaser from 'phaser';
import { ANSWER_STYLES, MAX_HEARTS, type QuestState, type TriviaHostPlayer, type TriviaHostView } from '../../../shared/games/trivia';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

const TILE_W = 820;
const TILE_H = 150;
const TILE_GAP = 30;
const TILES_TOP = 560;

interface Tile {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
}

export class TriviaScene extends Phaser.Scene {
  static readonly KEY = 'trivia';

  private view: TriviaHostView | null = null;
  private phaseKey = '';
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private filmText!: Phaser.GameObjects.Text;
  private questionText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private multiText!: Phaser.GameObjects.Text;
  private tiles: Tile[] = [];
  private playersRow!: Phaser.GameObjects.Container;
  /** Trivia Quest: the monster and its health. */
  private questBar!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(TriviaScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    this.tiles = [];
    addBackdrop(this);

    this.titleText = text(this, 160, 60, 'TRIVIA', 56, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2, 60, '', 42);
    this.timerText = text(this, WIDTH - 150, 60, '', 64, COLORS.text, { fontStyle: '700' });
    this.filmText = text(this, WIDTH / 2, 170, '', 40, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(4);
    this.questionText = text(this, WIDTH / 2, 330, '', 64, COLORS.text, {
      fontStyle: '700',
      align: 'center',
      wordWrap: { width: 1600 },
    });

    this.multiText = text(this, WIDTH / 2, 505, 'SELECT ALL THAT APPLY', 34, COLORS.accent, { fontStyle: '700' })
      .setLetterSpacing(3)
      .setVisible(false);

    for (let i = 0; i < ANSWER_STYLES.length; i++) {
      const x = WIDTH / 2 + (i % 2 === 0 ? -1 : 1) * (TILE_W / 2 + TILE_GAP / 2);
      const y = TILES_TOP + Math.floor(i / 2) * (TILE_H + TILE_GAP) + TILE_H / 2;
      const container = this.add.container(x, y).setAlpha(0);
      const bg = this.add.graphics();
      const shape = text(this, -TILE_W / 2 + 60, 0, ANSWER_STYLES[i].shape, 56, COLORS.accent);
      const label = text(this, 30, 0, '', 44, COLORS.text, {
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: TILE_W - 220 },
      });
      const count = text(this, TILE_W / 2 - 50, 0, '', 44, COLORS.text, { fontStyle: '700' });
      container.add([bg, shape, label, count]);
      this.tiles.push({ container, bg, label, count });
    }

    this.playersRow = this.add.container(WIDTH / 2, 1000);
    this.questBar = this.add.container(WIDTH / 2, 132);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: TriviaHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as TriviaHostView);
  }

  update() {
    if (this.view?.phase !== 'answering') {
      this.timerText.setText('');
      return;
    }
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(String(secs)).setColor(secs <= 5 ? COLORS.danger : COLORS.text);
  }

  /** Purple panel tiles like the rest of the game; the right answers go green at the reveal. */
  private drawTile(i: number, state: 'normal' | 'right' | 'wrong') {
    const { bg } = this.tiles[i];
    const fill = state === 'right' ? COLORS.correct : state === 'wrong' ? COLORS.panel : COLORS.panelLight;
    bg.clear();
    bg.fillStyle(fill, state === 'wrong' ? 0.7 : 1);
    bg.fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 24);
    if (state !== 'wrong') {
      bg.lineStyle(state === 'right' ? 8 : 3, state === 'right' ? 0xffffff : 0x5f57a0, 1);
      bg.strokeRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 24);
    }
  }

  private applyView(view: TriviaHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    const count = view.totalQuestions > 0 ? `Question ${view.questionNumber} of ${view.totalQuestions}` : `Question ${view.questionNumber}`;
    this.headerText.setText(`${count}  ·  ${view.packName}`);
    // Trivia Quest makes room for the monster under the header.
    const quest = view.quest;
    this.titleText.setText(quest ? 'QUEST' : 'TRIVIA');
    this.filmText.setY(quest ? 205 : 170);
    this.questionText.setY(quest ? 350 : 330);
    this.renderQuest(quest);
    this.filmText.setText(view.film.toUpperCase());
    this.questionText.setText(view.question);
    this.multiText.setVisible(view.multi && view.phase !== 'gameEnd');
    this.renderPlayers(view.players, view.phase);

    const key = `${view.questionNumber}|${view.phase}`;
    if (key === this.phaseKey) return;
    this.phaseKey = key;
    this.overlay.removeAll(true);

    if (view.phase === 'question') {
      for (const t of this.tiles) t.container.setAlpha(0);
      this.questionText.setScale(0.85).setAlpha(0);
      this.tweens.add({ targets: this.questionText, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    } else if (view.phase === 'answering') {
      view.answers.forEach((answer, i) => {
        const tile = this.tiles[i];
        this.drawTile(i, 'normal');
        tile.label.setText(answer).setAlpha(1);
        tile.count.setText('');
        tile.container.setScale(0.7).setAlpha(0);
        this.tweens.add({ targets: tile.container, scale: 1, alpha: 1, duration: 300, delay: i * 90, ease: 'Back.easeOut' });
      });
    } else if (view.phase === 'reveal') {
      this.showReveal(view);
      if (quest) this.showQuestReveal(quest);
    } else if (view.phase === 'gameEnd') {
      const scores = view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints }));
      if (quest?.outcome === 'victory') showRoundScores(this, this.overlay, scores, 'VICTORY!', COLORS.accent);
      else if (quest?.outcome === 'defeat') showRoundScores(this, this.overlay, scores, 'THE PARTY HAS FALLEN', COLORS.danger);
      else showRoundScores(this, this.overlay, scores);
    }
  }

  private showReveal(view: TriviaHostView) {
    view.answers.forEach((_, i) => {
      const tile = this.tiles[i];
      const right = view.correctIndices?.includes(i) ?? false;
      tile.container.setAlpha(1).setScale(1);
      this.drawTile(i, right ? 'right' : 'wrong');
      tile.label.setAlpha(right ? 1 : 0.55);
      const n = view.counts?.[i] ?? 0;
      tile.count.setText(n > 0 ? `${n}` : '');
      if (right) this.tweens.add({ targets: tile.container, scale: 1.06, duration: 200, yoyo: true, repeat: 1 });
    });
  }

  /** The monster banner: name, and a health bar of hits still needed. */
  private renderQuest(quest: QuestState | undefined) {
    this.questBar.removeAll(true);
    if (!quest) return;
    const m = quest.monster;
    const barW = 620;
    const barX = -barW / 2 + 140;
    this.questBar.add(text(this, barX - 70, 0, m.emoji, 64));
    this.questBar.add(
      text(this, barX - 120, 0, `${m.boss ? 'BOSS: ' : ''}${m.name.toUpperCase()}`, 30, m.boss ? COLORS.danger : COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5),
    );
    const g = this.add.graphics();
    g.fillStyle(COLORS.empty, 1);
    g.fillRoundedRect(barX, -16, barW, 32, 16);
    if (m.hp > 0) {
      g.fillStyle(hex(COLORS.danger), 1);
      g.fillRoundedRect(barX, -16, Math.max(32, (barW * m.hp) / m.maxHp), 32, 16);
    }
    this.questBar.add(g);
    this.questBar.add(text(this, barX + barW / 2, 0, `${m.hp} / ${m.maxHp}`, 24, COLORS.text, { fontStyle: '700' }));
    this.questBar.add(text(this, barX + barW + 30, 0, `Monster ${m.number} of ${m.total}`, 26, COLORS.muted).setOrigin(0, 0.5));
  }

  /** At the reveal: the hits landed, and a cheer if the monster falls. */
  private showQuestReveal(quest: QuestState) {
    const shake = { x: this.questBar.x };
    if (quest.hitsNow > 0) {
      this.tweens.add({ targets: this.questBar, x: shake.x + 12, duration: 50, yoyo: true, repeat: 3, onComplete: () => this.questBar.setX(shake.x) });
      const hits = text(this, WIDTH / 2 + 520, 132, `-${quest.hitsNow}`, 56, COLORS.danger, { fontStyle: '700' });
      this.overlay.add(hits);
      this.tweens.add({ targets: hits, y: 90, alpha: 0, duration: 1400, ease: 'Cubic.easeOut' });
    }
    if (quest.defeatedNow) {
      const banner = text(this, WIDTH / 2, 470, `${quest.monster.name.toUpperCase()} DEFEATED!`, 72, COLORS.accent, { fontStyle: '700' }).setStroke('#140f2e', 14);
      this.overlay.add(banner);
      banner.setScale(0.5);
      this.tweens.add({ targets: banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
      burstConfetti(this, WIDTH * 0.3, 500, 50);
      burstConfetti(this, WIDTH * 0.7, 500, 50);
    }
  }

  /** Players along the bottom: a tick once they've answered, then +points or ✗ at the reveal. */
  private renderPlayers(players: TriviaHostPlayer[], phase: TriviaHostView['phase']) {
    this.playersRow.removeAll(true);
    const w = 210;
    const gap = 16;
    const startX = -((players.length - 1) * (w + gap)) / 2;
    players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const g = this.add.graphics();
      g.fillStyle(hex(p.color), 1);
      g.fillRoundedRect(x - w / 2, -45, w, 90, 18);
      const name = text(this, x, -14, p.name, 28, '#140f2e', { fontStyle: '700' });
      let status = '';
      if (p.hearts !== undefined) {
        // Trivia Quest: hearts, then what each answer did.
        const hearts = p.hearts > 0 ? '♥'.repeat(p.hearts) + '♡'.repeat(MAX_HEARTS - p.hearts) : '👻';
        const questText = { hit: 'HIT!', glance: 'glancing', hurt: '-1 ♥', revived: 'REVIVED!', ghost: '👻' } as const;
        if (phase === 'answering') status = `${hearts} ${p.answered ? '✓' : '…'}`;
        else if (phase === 'reveal' && p.questResult) status = questText[p.questResult];
        else status = hearts;
      } else if (phase === 'answering') status = p.answered ? '✓ locked in' : 'thinking…';
      else if (phase === 'reveal') status = p.correct ? `+${p.questionPoints}` : '✗';
      else status = p.score.toLocaleString();
      const sub = text(this, x, 20, status, 26, '#140f2e');
      this.playersRow.add([g, name, sub]);
    });
  }
}
