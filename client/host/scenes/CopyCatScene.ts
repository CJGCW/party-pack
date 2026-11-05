import Phaser from 'phaser';
import { playerCard } from '../art';
import { addHudBar } from '../hud';
import { MOVE_MS, TRACE_HZ, type CopyView, type Trace } from '../../../shared/games/copyCat';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, hex, text } from '../theme';

const BOX = 560;
const BOX_X = WIDTH / 2 - BOX / 2 - 200;
const BOX_Y = 220;

/** The TV during Copy Cat: the leader's move played back as a dot moving round a box (and the phone tipping), then everyone's copies over it. */
export class CopyCatScene extends Phaser.Scene {
  static readonly KEY = 'copy-cat';
  private view: CopyView | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';
  private phaseAt = 0;

  constructor() {
    super(CopyCatScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    addHudBar(this);
    text(this, 60, 70, 'COPY CAT', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 36);
    this.msgText = text(this, BOX_X + BOX / 2, 170, '', 44, COLORS.accent, { fontStyle: '700' });
    this.g = this.add.graphics();
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: CopyView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as CopyView);
  }

  private applyView(v: CopyView) {
    this.view = v;
    const leader = v.players.find((p) => p.id === v.leader);
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · ${leader?.name ?? ''} leads (${v.turn} of ${v.turns})`);
    const pk = `${v.puzzleNumber}|${v.turn}|${v.phase}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      this.phaseAt = performance.now();
      this.overlay.removeAll(true);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
    this.msgText.setText(
      v.phase === 'lead' ? `${leader?.name} is making a move…` : v.phase === 'show' ? 'Watch closely!' : v.phase === 'copy' ? 'Now copy it!' : v.phase === 'score' ? 'How close?' : '',
    );
    this.list.removeAll(true);
    v.players.forEach((p, i) => {
      const x = WIDTH - 520;
      const y = 240 + i * 86;
      const isLeader = p.id === v.leader;
      this.list.add(playerCard(this, x + 220, y, 440, 74, p.done ? 0x2f6e45 : 0x2a2160, hex(p.color)));
      this.list.add(text(this, x + 16, y - 14, `${isLeader ? '★ ' : ''}${p.name}`, 28, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      const right =
        v.phase === 'result' || v.phase === 'gameEnd' ? `+${p.points}` : v.phase === 'score' ? (isLeader ? `+${p.turnPoints}` : `${p.match ?? 0}% · +${p.turnPoints}`) : isLeader ? 'leading' : p.done ? 'copied' : '';
      this.list.add(text(this, x + 16, y + 18, right, 24, COLORS.text, { fontStyle: '700' }).setOrigin(0, 0.5));
    });
  }

  /** A trace's point `k` (0 to 1 of the way through), in screen pixels. */
  private at(trace: Trace, k: number) {
    const n = trace.length / 2;
    const i = Math.min(n - 1, Math.max(0, Math.floor(k * (n - 1))));
    return { x: BOX_X + BOX / 2 + trace[i * 2] * (BOX / 2 - 30), y: BOX_Y + BOX / 2 + trace[i * 2 + 1] * (BOX / 2 - 30) };
  }

  private path(g: Phaser.GameObjects.Graphics, trace: Trace, color: number, width: number, alpha: number, upTo = 1) {
    const n = trace.length / 2;
    g.lineStyle(width, color, alpha);
    for (let i = 1; i < n * upTo; i++) {
      const a = this.at(trace, (i - 1) / (n - 1));
      const b = this.at(trace, i / (n - 1));
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  update() {
    const v = this.view;
    const g = this.g.clear();
    if (!v || v.phase === 'result' || v.phase === 'gameEnd') return;
    g.fillStyle(0x2a2160, 1).fillRoundedRect(BOX_X, BOX_Y, BOX, BOX, 24);
    if (!v.move) return;
    const leader = v.players.find((p) => p.id === v.leader);
    const color = hex(leader?.color ?? '#ffffff');
    const moveMs = ((v.move.length / 2) * 1000) / TRACE_HZ || MOVE_MS;
    if (v.phase === 'show') {
      // Played back, a dot drawing its path, with the phone tipping as it went.
      const k = Math.min(1, (performance.now() - this.phaseAt - 500) / moveMs);
      if (k < 0) return;
      this.path(g, v.move, color, 6, 0.5, k);
      const p = this.at(v.move, k);
      g.fillStyle(0x140f2e, 1).fillCircle(p.x, p.y, 26);
      g.fillStyle(color, 1).fillCircle(p.x, p.y, 22);
      return;
    }
    if (v.phase === 'copy') {
      // A reminder: the path, faintly.
      this.path(g, v.move, color, 6, 0.25);
      return;
    }
    // The score: the move, and everyone's copy over it.
    this.path(g, v.move, 0xffffff, 10, 0.8);
    for (const [id, trace] of Object.entries(v.copies)) {
      const p = v.players.find((o) => o.id === id);
      this.path(g, trace, hex(p?.color ?? '#888888'), 4, 0.9);
    }
  }
}

