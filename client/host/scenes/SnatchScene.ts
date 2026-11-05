import Phaser from 'phaser';
import { DANGER, GOLD, INK, ball, glow, playerCard, shade, softShadow } from '../art';
import { burst, shockwave } from '../fx';
import { addHudBar } from '../hud';
import { GRABS, type SnatchView } from '../../../shared/games/snatch';
import { serverNow } from '../../clock';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

/** The TV during Snatch: the cover (lifting at the moment the server set), and everyone's grabs. */
export class SnatchScene extends Phaser.Scene {
  static readonly KEY = 'snatch';
  private view: SnatchView | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';

  constructor() {
    super(SnatchScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    addHudBar(this);
    text(this, 60, 70, 'SNATCH', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 40);
    this.g = this.add.graphics();
    this.bigText = text(this, WIDTH / 2, 470, '', 200, COLORS.text, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 12 });
    this.msgText = text(this, WIDTH / 2, 790, '', 52, COLORS.accent, { fontStyle: '700' });
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: SnatchView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as SnatchView);
  }

  private applyView(v: SnatchView) {
    if (this.view?.phase === 'grab' && v.phase === 'won' && v.players.some((p) => p.id === v.winner)) {
      burst(this, WIDTH / 2, 470, GOLD, 70);
      shockwave(this, WIDTH / 2, 470, GOLD, 320);
    }
    this.view = v;
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · Grab ${Math.min(v.grab, GRABS)} of ${GRABS}`);
    const winner = v.players.find((p) => p.id === v.winner);
    this.msgText.setText(v.phase === 'won' ? (winner ? `${winner.name} grabbed it in ${v.reaction}ms!` : 'Nobody grabbed it!') : v.phase === 'result' ? 'Round over!' : '');
    const key = `${v.puzzleNumber}|${v.phase}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.overlay.removeAll(true);
      if (v.phase === 'result') burstConfetti(this, WIDTH / 2, 360, 60);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
    this.list.removeAll(true);
    const w = Math.min(260, (WIDTH - 120) / Math.max(1, v.players.length));
    v.players.forEach((p, i) => {
      const x = WIDTH / 2 + (i - (v.players.length - 1) / 2) * w;
      const y = HEIGHT - 150;
      const done = v.phase === 'result' || v.phase === 'gameEnd';
      this.list.add(playerCard(this, x, y, w - 16, 110, p.locked ? 0x3a3350 : 0x2c2366, hex(p.color)));
      this.list.add(text(this, x, y - 22, p.name, 30, p.color, { fontStyle: '700' }));
      this.list.add(text(this, x, y + 22, done ? `${p.grabs} · +${p.points}` : p.locked ? 'LOCKED' : `${p.grabs} grabbed`, 28, p.locked ? COLORS.danger : COLORS.text, { fontStyle: '700' }));
    });
  }

  update(time: number) {
    const v = this.view;
    const g = this.g.clear();
    if (!v || (v.phase !== 'grab' && v.phase !== 'won')) {
      this.bigText.setText('');
      return;
    }
    const now = serverNow();
    const up = v.phase === 'grab' && now >= v.revealAt && now < v.hideAt;
    const [cx, cy] = [WIDTH / 2, 470];
    if (up) {
      const treasure = v.kind === 'treasure';
      glow(g, cx, cy, 420, treasure ? GOLD : DANGER, 0.9 + 0.1 * Math.sin(time / 80));
      this.bigText.setText(treasure ? '★' : '✖').setColor(treasure ? COLORS.accent : COLORS.danger);
    } else {
      // The cover: a dome, trembling a little.
      const shake = v.phase === 'grab' ? Math.sin(time / 40) * 3 : 0;
      const dome = 0x8b7cf6;
      softShadow(g, cx, cy + 220, 460, 50);
      g.fillStyle(INK, 1).fillEllipse(cx + shake, cy + 6, 524, 444);
      g.fillStyle(shade(dome, -0.3), 1).fillEllipse(cx + shake, cy, 500, 420);
      g.fillStyle(dome, 1).fillEllipse(cx - 6 + shake, cy - 16, 450, 372);
      g.fillStyle(0xffffff, 0.3).fillEllipse(cx - 120 + shake, cy - 120, 130, 70);
      ball(g, cx + shake, cy - 222, 30, GOLD);
      this.bigText.setText('?').setColor(COLORS.text);
    }
  }
}
