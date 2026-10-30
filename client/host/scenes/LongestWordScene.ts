import Phaser from 'phaser';
import { LETTER_COUNT, VOWELS, type LongestHostPlayer, type LongestHostView } from '../../../shared/games/longestWord';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, panel, text } from '../theme';

const TILE = 160;
const TILE_GAP = 18;
const BOARD_W = LETTER_COUNT * (TILE + TILE_GAP) - TILE_GAP;
const BOARD_X = (WIDTH - BOARD_W) / 2;
const BOARD_Y = 250;
const LEFT_X = BOARD_X;
const LEFT_W = 1000;
const RIGHT_X = LEFT_X + LEFT_W + 40;
const RIGHT_W = BOARD_X + BOARD_W - RIGHT_X;
const PANEL_TOP = 400;
const PANEL_H = 600;
const CLOCK_X = RIGHT_X + RIGHT_W / 2;
const CLOCK_Y = PANEL_TOP + 290;
const CLOCK_R = 190;
const TILE_FILL = 0xffffff;
const INK = '#140f2e';

const PROBLEM_LABEL = { 'not-a-word': 'not a word', 'bad-letters': "letters aren't there" } as const;

/**
 * The TV during Longest Word: the nine letters going up one at a time as they're picked, then
 * the clock while everyone works on a word, then everyone's word and the longest there was.
 */
export class LongestWordScene extends Phaser.Scene {
  static readonly KEY = 'longest-word';

  private view: LongestHostView | null = null;
  private renderKey = '';
  private shownLetters = 0;
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private boardLayer!: Phaser.GameObjects.Container;
  private panelLayer!: Phaser.GameObjects.Container;
  private clock!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(LongestWordScene.KEY);
  }

  create() {
    this.view = null;
    this.renderKey = '';
    this.shownLetters = 0;
    addBackdrop(this);
    text(this, 250, 70, 'LONGEST WORD', 54, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2 + 250, 70, '', 40);
    this.timerText = text(this, WIDTH - 140, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.boardLayer = this.add.container(0, 0);
    this.panelLayer = this.add.container(0, 0);
    this.clock = this.add.graphics();
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: LongestHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as LongestHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    const v = this.view;
    this.clock.clear();
    if (!v || (v.phase !== 'solve' && v.phase !== 'pick')) {
      this.timerText.setText('');
      return;
    }
    const left = Math.max(0, this.phaseEndsAt - performance.now());
    const secs = Math.ceil(left / 1000);
    this.timerText.setText(String(secs)).setColor(secs <= 5 ? COLORS.danger : COLORS.text);
    if (v.phase !== 'solve') return;

    // The clock: a face that fills in as time runs out.
    const done = 1 - left / Math.max(1, v.phaseMs);
    const start = -Math.PI / 2;
    this.clock.fillStyle(0xf6f3ff, 1).fillCircle(CLOCK_X, CLOCK_Y, CLOCK_R);
    this.clock.fillStyle(secs <= 5 ? 0xff5d73 : 0x5ec8f2, 1);
    this.clock.slice(CLOCK_X, CLOCK_Y, CLOCK_R - 10, start, start + done * Math.PI * 2, false).fillPath();
    this.clock.lineStyle(10, COLORS.panelLight, 1).strokeCircle(CLOCK_X, CLOCK_Y, CLOCK_R);
    for (let i = 0; i < 12; i++) {
      const a = start + (i / 12) * Math.PI * 2;
      const r1 = i % 3 === 0 ? CLOCK_R - 40 : CLOCK_R - 25;
      this.clock.lineStyle(i % 3 === 0 ? 8 : 4, 0x140f2e, 1);
      this.clock.lineBetween(CLOCK_X + Math.cos(a) * r1, CLOCK_Y + Math.sin(a) * r1, CLOCK_X + Math.cos(a) * (CLOCK_R - 10), CLOCK_Y + Math.sin(a) * (CLOCK_R - 10));
    }
    const hand = start + done * Math.PI * 2;
    this.clock.lineStyle(10, 0x140f2e, 1).lineBetween(CLOCK_X, CLOCK_Y, CLOCK_X + Math.cos(hand) * (CLOCK_R - 30), CLOCK_Y + Math.sin(hand) * (CLOCK_R - 30));
    this.clock.fillStyle(0x140f2e, 1).fillCircle(CLOCK_X, CLOCK_Y, 14);
  }

  private applyView(view: LongestHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Word ${view.puzzleNumber} of ${view.totalPuzzles}`);

    const key = `${view.puzzleNumber}|${view.phase}`;
    if (key !== this.renderKey) {
      this.renderKey = key;
      this.overlay.removeAll(true);
      if (view.phase === 'pick' && view.letters.length === 0) this.shownLetters = 0;
      if (view.phase === 'gameEnd') {
        showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
      }
      if (view.phase === 'reveal' && view.best && view.players.some((p) => p.word && !p.problem && p.word.length === view.best!.length)) {
        burstConfetti(this, WIDTH / 2, BOARD_Y, 70);
      }
    }
    this.renderBoard(view);
    this.renderPanels(view);
  }

  private tileX(i: number) {
    return BOARD_X + i * (TILE + TILE_GAP) + TILE / 2;
  }

  private renderBoard(view: LongestHostView) {
    this.boardLayer.removeAll(true);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.empty, 1);
    bg.fillRoundedRect(BOARD_X - 16, BOARD_Y - TILE / 2 - 16, BOARD_W + 32, TILE + 32, 24);
    this.boardLayer.add(bg);
    for (let i = 0; i < LETTER_COUNT; i++) {
      const x = this.tileX(i);
      const letter = view.letters[i];
      const g = this.add.graphics();
      g.fillStyle(letter ? TILE_FILL : COLORS.panel, 1);
      g.fillRoundedRect(x - TILE / 2, BOARD_Y - TILE / 2, TILE, TILE, 16);
      this.boardLayer.add(g);
      if (!letter) continue;
      const t = text(this, x, BOARD_Y + 4, letter, TILE * 0.62, VOWELS.includes(letter) ? '#c0392b' : INK, { fontStyle: '700' });
      this.boardLayer.add(t);
      // A newly picked letter flips up.
      if (i >= this.shownLetters) {
        t.setScale(1, 0);
        g.setAlpha(0);
        this.tweens.add({ targets: t, scaleY: 1, duration: 250, ease: 'Back.easeOut' });
        this.tweens.add({ targets: g, alpha: 1, duration: 150 });
      }
    }
    this.shownLetters = view.letters.length;
  }

  private renderPanels(view: LongestHostView) {
    this.panelLayer.removeAll(true);
    const o = this.panelLayer;
    o.add(panel(this, LEFT_X, PANEL_TOP, LEFT_W, PANEL_H));
    o.add(panel(this, RIGHT_X, PANEL_TOP, RIGHT_W, PANEL_H));
    this.renderPlayers(view);

    const cx = RIGHT_X + RIGHT_W / 2;
    if (view.phase === 'pick') {
      const vowels = view.letters.filter((l) => VOWELS.includes(l)).length;
      o.add(text(this, cx, PANEL_TOP + 90, 'PICKING THE LETTERS', 30, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
      o.add(text(this, cx, PANEL_TOP + 190, view.pickerName, 64, COLORS.accent, { fontStyle: '700', wordWrap: { width: RIGHT_W - 40 }, align: 'center' }));
      o.add(text(this, cx, PANEL_TOP + 300, 'Vowel or consonant?', 44));
      o.add(text(this, cx, PANEL_TOP + 400, `${vowels} vowel${vowels === 1 ? '' : 's'}  ·  ${view.letters.length - vowels} consonant${view.letters.length - vowels === 1 ? '' : 's'}`, 34, COLORS.muted));
      o.add(text(this, cx, PANEL_TOP + 470, 'At least 3 vowels and 4 consonants', 26, COLORS.muted));
    } else if (view.phase === 'reveal' && view.best) {
      const best = view.best;
      o.add(text(this, cx, PANEL_TOP + 60, 'LONGEST POSSIBLE', 30, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
      if (best.length === 0) {
        o.add(text(this, cx, PANEL_TOP + 160, 'Nothing!', 56, COLORS.accent, { fontStyle: '700' }));
        return;
      }
      o.add(text(this, cx, PANEL_TOP + 150, best.words.join('\n'), best.words.length > 1 ? 52 : 64, COLORS.accent, { fontStyle: '700', align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0.5));
      const defY = PANEL_TOP + 150 + best.words.length * 34 + 60;
      o.add(text(this, cx, defY, `${best.length} letters`, 34, COLORS.text, { fontStyle: '700' }));
      if (best.definition) {
        const d = best.definition;
        o.add(
          text(this, RIGHT_X + 36, defY + 50, `${d.word.toLowerCase()} (${d.partOfSpeech}): ${d.text}`, 26, COLORS.muted, {
            wordWrap: { width: RIGHT_W - 72 },
            fontStyle: 'italic',
          })
            .setOrigin(0, 0)
            .setCrop(0, 0, RIGHT_W - 72, PANEL_TOP + PANEL_H - 30 - (defY + 50)),
        );
      }
    }
  }

  /** Each player's status, or at the reveal their word and points, best first. */
  private renderPlayers(view: LongestHostView) {
    const o = this.panelLayer;
    const revealing = view.phase === 'reveal';
    const rank = (p: LongestHostPlayer) => (p.word && !p.problem ? p.word.length : p.word ? -1 : -2);
    const rows = revealing ? [...view.players].sort((a, b) => b.points - a.points || rank(b) - rank(a)) : view.players;
    const rowH = Math.min(80, (PANEL_H - 40) / Math.max(1, rows.length));
    rows.forEach((p, i) => {
      const y = PANEL_TOP + 20 + i * rowH + rowH / 2;
      o.add(text(this, LEFT_X + 36, y, p.name, 36, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      let status = view.phase === 'solve' ? (p.locked ? '✓ locked in' : 'thinking…') : '';
      let color: string = p.locked ? COLORS.accent : COLORS.muted;
      if (revealing) {
        if (!p.word) {
          status = 'no word';
          color = COLORS.muted;
        } else if (p.problem) {
          status = `${p.word}  ✗ ${PROBLEM_LABEL[p.problem]}`;
          color = COLORS.danger;
        } else {
          status = `${p.word}  ${p.word.length}  (+${p.points})`;
          color = COLORS.text;
        }
      }
      o.add(text(this, LEFT_X + LEFT_W - 36, y, status, 34, color, { fontStyle: '700' }).setOrigin(1, 0.5));
    });
  }
}
