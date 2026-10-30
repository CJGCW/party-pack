import Phaser from 'phaser';
import { cardLabel, parseCard } from '../../../shared/cards';
import { totalLabel, type TwentyOneHostView, type TwentyOneSeat } from '../../../shared/games/twentyOne';
import { addCardRow } from '../cards';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, hex, text } from '../theme';

const PANEL_W = 420;
const PANEL_GAP = 28;
const INK = '#140f2e';

/**
 * The TV during Twenty-One: a seat per player with their hand. The hole card stays face
 * down (only the player's phone shows it) until they bust or the hand ends; the rest are
 * face up for everyone.
 */
export class TwentyOneScene extends Phaser.Scene {
  static readonly KEY = 'twentyOne';

  private view: TwentyOneHostView | null = null;
  private phaseEndsAt = 0;
  private lastSeq = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private actionText!: Phaser.GameObjects.Text;
  private panels!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(TwentyOneScene.KEY);
  }

  create() {
    this.view = null;
    this.lastSeq = 0;
    addBackdrop(this, { blobs: false });
    text(this, 80, 64, 'TWENTY-ONE', 30, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(6);
    this.headerText = text(this, WIDTH / 2, 64, '', 30, COLORS.muted);
    this.timerText = text(this, WIDTH - 80, 64, '', 56, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    this.hintText = text(this, WIDTH / 2, 128, '', 28, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3);
    this.actionText = text(this, WIDTH / 2, HEIGHT - 60, '', 40, COLORS.text, { fontStyle: '700' });
    this.panels = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: TwentyOneHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as TwentyOneHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(this.view?.phase === 'playing' ? String(secs) : '').setColor(secs <= 5 ? COLORS.danger : COLORS.text);
  }

  private applyView(view: TwentyOneHostView) {
    const fresh = view.lastAction && view.lastAction.seq !== this.lastSeq ? view.lastAction : null;
    this.lastSeq = view.lastAction?.seq ?? 0;
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Hand ${view.hand} of ${view.totalHands}   ·   ${view.shoe} cards in the shoe`);

    const turnName = view.seats.find((s) => s.id === view.turn)?.name;
    const winners = view.seats.filter((s) => s.winner);
    this.hintText
      .setText(
        view.phase === 'dealing'
          ? 'DEALING: ONE CARD DOWN, ONE UP'
          : view.phase === 'playing'
            ? `${turnName?.toUpperCase()}: DRAW OR HOLD?`
            : winners.length === 0
              ? 'EVERYONE BUST!'
              : `${winners.map((w) => w.name.toUpperCase()).join(' & ')} ${winners.length === 1 ? 'WINS' : 'WIN'} WITH ${winners[0].total?.total}`,
      )
      .setColor(view.phase === 'handEnd' ? COLORS.accent : COLORS.muted);

    const a = view.lastAction;
    const who = view.seats.find((s) => s.id === a?.playerId)?.name ?? '';
    const card = a?.card ? cardLabel(parseCard(a.card)!) : '';
    this.actionText.setText(
      !a || view.phase !== 'playing'
        ? ''
        : a.kind === 'draw'
          ? `${who} draws ${card}`
          : a.kind === 'bust'
            ? `${who} draws ${card}: BUST!`
            : a.kind === 'timeout'
              ? `${who} ran out of time and holds`
              : `${who} holds`,
    );
    this.actionText.setColor(a?.kind === 'bust' ? COLORS.danger : COLORS.text);

    this.renderPanels(view, fresh?.card ? fresh.playerId : null);
    this.overlay.removeAll(true);
    if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.seats.map((s) => ({ name: s.name, color: s.color, points: s.gamePoints })));
    }
  }

  private renderPanels(view: TwentyOneHostView, justDrew: string | null) {
    this.panels.removeAll(true);
    const seats = view.seats;
    const perRow = seats.length <= 4 ? seats.length : Math.ceil(seats.length / 2);
    const rows = Math.ceil(seats.length / Math.max(1, perRow));
    const panelH = rows === 1 ? 560 : 400;
    const top = rows === 1 ? 220 : 175;
    seats.forEach((s, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, seats.length - row * perRow);
      const col = i - row * perRow;
      const x = WIDTH / 2 - (inRow * PANEL_W + (inRow - 1) * PANEL_GAP) / 2 + col * (PANEL_W + PANEL_GAP);
      const y = top + row * (panelH + PANEL_GAP);
      this.panels.add(this.panel(s, view, x, y, panelH, rows === 1 ? 120 : 92, justDrew === s.id));
    });
  }

  private panel(s: TwentyOneSeat, view: TwentyOneHostView, x: number, y: number, h: number, cardW: number, justDrew: boolean) {
    const c = this.add.container(x, y);
    const turn = view.turn === s.id;
    const g = this.add.graphics();
    g.fillStyle(turn || s.winner ? COLORS.panelLight : COLORS.panel, 1);
    g.fillRoundedRect(0, 0, PANEL_W, h, 20);
    if (turn || s.winner) {
      g.lineStyle(5, hex(COLORS.accent), 1);
      g.strokeRoundedRect(0, 0, PANEL_W, h, 20);
    }
    g.fillStyle(hex(s.color), 1);
    g.fillRoundedRect(0, 0, PANEL_W, 12, { tl: 20, tr: 20, bl: 0, br: 0 });
    c.add(g);
    c.add(text(this, 28, 50, s.name, 32, s.connected ? COLORS.text : COLORS.muted, { fontStyle: '700' }).setOrigin(0, 0.5));

    // A badge for where they stand.
    const badge =
      s.winner ? ['WINNER', COLORS.accent] : s.status === 'bust' ? ['BUST', COLORS.danger] : s.status === 'held' ? ['HELD', '#b8b0e8'] : turn ? ['TURN', COLORS.accent] : null;
    if (badge) {
      const label = text(this, 0, 50, badge[0], 22, INK, { fontStyle: '700' });
      const bw = label.width + 32;
      const bg = this.add.graphics();
      bg.fillStyle(hex(badge[1]), 1);
      bg.fillRoundedRect(PANEL_W - 24 - bw, 30, bw, 40, 20);
      label.setX(PANEL_W - 24 - bw / 2);
      c.add([bg, label]);
    }

    // The hand: the hole card (face down until shown), then the face-up ones.
    const ids: (string | null)[] = [s.hole, ...s.up];
    const cardsY = 100 + (h - 230) / 2 + (cardW * 1.4) / 2 - 20;
    const cards = addCardRow(this, PANEL_W / 2, cardsY, ids.map((id) => (id ? parseCard(id) : null)), { width: cardW, gap: 10, maxWidth: PANEL_W - 40 });
    c.add(cards);
    if (s.status === 'bust') cards.forEach((card) => card.setAlpha(0.6));
    const newest = cards.at(-1);
    if (justDrew && newest) {
      newest.setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: newest, scale: 1, alpha: s.status === 'bust' ? 0.6 : 1, duration: 280, ease: 'Back.easeOut' });
    }

    const line1 = s.total ? `Total ${totalLabel(s.total)}` : `Showing ${totalLabel(s.showing)} + ?`;
    c.add(text(this, PANEL_W / 2, h - 66, line1, 30, s.status === 'bust' ? COLORS.danger : COLORS.text, { fontStyle: '700' }));
    const line2 = view.phase === 'handEnd' || view.phase === 'gameEnd' ? (s.handPoints ? `+${s.handPoints.toLocaleString()}` : 'No points') : '';
    c.add(text(this, PANEL_W / 2, h - 28, line2, 26, s.handPoints ? COLORS.accent : COLORS.muted, { fontStyle: '700' }));
    return c;
  }
}
