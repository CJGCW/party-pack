import Phaser from 'phaser';
import { playerCard } from '../art';
import { addHudBar } from '../hud';
import { EYES, FIELD_H, FIELD_W, FINDS, HAT_COLORS, HAT_KINDS, MOUTHS, PERSON_R, SKINS, findFor, personAt, type Find, type Person, type SpotHostView } from '../../../shared/games/crowdSpot';
import { serverNow } from '../../clock';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

/** Draws one of the crowd at (x, y), radius r. */
export function drawPerson(g: Phaser.GameObjects.Graphics, p: Person, x: number, y: number, r: number) {
  g.fillStyle(0x140f2e, 1).fillCircle(x, y, r + 3);
  g.fillStyle(hex(SKINS[p.skin]), 1).fillCircle(x, y, r);
  const hat = hex(HAT_COLORS[p.hatColor]);
  const kind = HAT_KINDS[p.hat];
  if (kind === 'cap') g.fillStyle(hat, 1).fillEllipse(x, y - r * 0.65, r * 1.6, r * 0.8).fillRect(x, y - r * 0.55, r * 0.95, r * 0.18);
  else if (kind === 'top') g.fillStyle(hat, 1).fillRect(x - r * 0.55, y - r * 1.55, r * 1.1, r * 0.95).fillRect(x - r * 0.85, y - r * 0.68, r * 1.7, r * 0.18);
  else if (kind === 'bow') g.fillStyle(hat, 1).fillTriangle(x + r * 0.35, y - r * 0.75, x + r * 0.95, y - r * 1.05, x + r * 0.95, y - r * 0.45).fillTriangle(x + r * 0.35, y - r * 0.75, x - r * 0.25, y - r * 1.05, x - r * 0.25, y - r * 0.45);
  const eyes = EYES[p.eyes];
  if (eyes === 'dots') g.fillStyle(0x140f2e, 1).fillCircle(x - r * 0.33, y - r * 0.05, r * 0.12).fillCircle(x + r * 0.33, y - r * 0.05, r * 0.12);
  else if (eyes === 'glasses') {
    g.lineStyle(r * 0.09, 0x140f2e, 1).strokeCircle(x - r * 0.33, y - r * 0.05, r * 0.22).strokeCircle(x + r * 0.33, y - r * 0.05, r * 0.22);
    g.fillStyle(0x140f2e, 1).fillCircle(x - r * 0.33, y - r * 0.05, r * 0.07).fillCircle(x + r * 0.33, y - r * 0.05, r * 0.07);
  } else g.fillStyle(0x140f2e, 1).fillRoundedRect(x - r * 0.62, y - r * 0.2, r * 1.24, r * 0.3, r * 0.1);
  const mouth = MOUTHS[p.mouth];
  if (mouth === 'smile') g.lineStyle(r * 0.09, 0x140f2e, 1).beginPath().arc(x, y + r * 0.2, r * 0.32, 0.2, Math.PI - 0.2).strokePath();
  else if (mouth === 'o') g.fillStyle(0x140f2e, 1).fillCircle(x, y + r * 0.45, r * 0.13);
  else g.fillStyle(0x140f2e, 1).fillRect(x - r * 0.3, y + r * 0.42, r * 0.6, r * 0.08);
}

/** The TV during Crowd Spot: the crowd, big, drifting; what to find; and who's found them. */
export class CrowdSpotScene extends Phaser.Scene {
  static readonly KEY = 'crowd-spot';
  private view: SpotHostView | null = null;
  private find: Find | null = null;
  private findKey = '';
  private field!: Phaser.GameObjects.Container;
  private g!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';
  private phaseEndsAt = 0;

  constructor() {
    super(CrowdSpotScene.KEY);
  }

  create() {
    this.view = null;
    this.findKey = this.phaseKey = '';
    addBackdrop(this);
    addHudBar(this);
    text(this, 60, 70, 'CROWD SPOT', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 36);
    this.timerText = text(this, WIDTH - 120, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.promptText = text(this, WIDTH / 2, 150, '', 46, COLORS.accent, { fontStyle: '700' });
    const scale = Math.min((WIDTH - 80) / FIELD_W, 720 / FIELD_H);
    this.field = this.add.container((WIDTH - FIELD_W * scale) / 2, 190).setScale(scale);
    const back = this.add.graphics().fillStyle(0x2a2160, 1).fillRoundedRect(0, 0, FIELD_W, FIELD_H, 24);
    this.g = this.add.graphics();
    this.field.add([back, this.g]);
    const clip = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(this.field.x, this.field.y, FIELD_W * scale, FIELD_H * scale);
    this.field.setMask(clip.createGeometryMask());
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: SpotHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as SpotHostView);
  }

  private applyView(v: SpotHostView) {
    this.view = v;
    this.phaseEndsAt = performance.now() + v.msLeft;
    const key = `${v.seed}|${v.round.find}`;
    if (key !== this.findKey) {
      this.findKey = key;
      this.find = findFor(v.seed, v.round.find);
    }
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · Find ${v.volley} of ${FINDS}`);
    this.promptText.setText(v.phase === 'aim' || v.phase === 'fly' ? (this.find?.prompt ?? '') : '');
    const pk = `${v.puzzleNumber}|${v.volley}|${v.phase}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      this.overlay.removeAll(true);
      if (v.phase === 'result') burstConfetti(this, WIDTH / 2, 360, 60);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.boards.map((b) => ({ name: b.name, color: b.color, points: v.gamePoints[b.playerId] ?? 0 })));
    }
    this.list.removeAll(true);
    const w = Math.min(230, (WIDTH - 120) / Math.max(1, v.boards.length));
    v.boards.forEach((b, i) => {
      const x = WIDTH / 2 + (i - (v.boards.length - 1) / 2) * w;
      const y = HEIGHT - 60;
      const s = b.state;
      this.list.add(playerCard(this, x, y, w - 14, 80, s.found ? 0x2f6e45 : s.lockedMs > 0 ? 0x6e2f3a : 0x2c2366, hex(b.color)));
      this.list.add(text(this, x, y - 16, b.name, 26, b.color, { fontStyle: '700' }));
      this.list.add(text(this, x, y + 18, s.found ? `${((s.foundMs ?? 0) / 1000).toFixed(1)}s` : v.phase === 'result' || v.phase === 'gameEnd' ? `+${b.points}` : `${b.boardScore}`, 24, COLORS.text, { fontStyle: '700' }));
    });
  }

  update(time: number) {
    const v = this.view;
    const g = this.g.clear();
    if (!v || !this.find || (v.phase !== 'aim' && v.phase !== 'fly')) return;
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(v.phase === 'aim' ? String(secs) : '');
    const ms = v.phase === 'aim' ? serverNow() - v.round.startedAt : 20_000;
    this.find.people.forEach((p, i) => {
      const at = personAt(p, ms);
      drawPerson(g, p, at.x, at.y, PERSON_R);
      if (v.round.answer === i) g.lineStyle(8, 0xffd166, 0.6 + 0.4 * Math.sin(time / 100)).strokeCircle(at.x, at.y, PERSON_R + 16);
    });
  }
}
