import Phaser from 'phaser';
import {
  BALL_R,
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  CATCHER,
  LAUNCHER,
  PEG_R,
  catcherX,
  flightAt,
  multiplierFor,
  shotTimeAt,
  type PegHostView,
  type Shot,
} from '../../../shared/games/pegDrop';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, panel, text } from '../theme';

const GOLD = 0xffa62b;
const MINT = 0x6ee7b7;
const RAINBOW = [0xff5d73, 0xffa62b, 0xffd166, 0x6ee7b7, 0x5ec8f2, 0x8b7cf6, 0xf472d0];
const SIDE_W = BOARD_LEFT - 60;
const SIDE_CX = SIDE_W / 2 + 20;
const RIGHT_X = BOARD_RIGHT + 30;
/** How far ahead the aim guide shows the ball's flight (seconds). */
const GUIDE_S = 0.4;
const BARREL_LEN = 96;
const PEG_SIZE = PEG_R * 2 + 4;
const TRAIL = 16;
/** Gold-meter marks: where the multiplier steps up. */
const METER_MARKS = [0.4, 0.65, 0.85];
const METER = { x: 60, y: 650, w: SIDE_W - 80, h: 28 };
/** At the end of a shot, the lit pegs pop one after another, this far apart at most. */
const POP_GAP_MS = 70;
const POP_TOTAL_MS = 1_000;

interface PegSprite {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  gold: boolean;
}

/** A shaded ball with a highlight, drawn once into a texture. */
function sphereTexture(scene: Phaser.Scene, key: string, size: number, inner: string, mid: string, edge: string) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const c = tex.getContext();
  const r = size / 2;
  const body = c.createRadialGradient(r * 0.75, r * 0.65, r * 0.05, r, r, r);
  body.addColorStop(0, inner);
  body.addColorStop(0.55, mid);
  body.addColorStop(1, edge);
  c.fillStyle = body;
  c.beginPath();
  c.arc(r, r, r - 1, 0, Math.PI * 2);
  c.fill();
  const shine = c.createRadialGradient(r * 0.68, r * 0.55, 0, r * 0.68, r * 0.55, r * 0.5);
  shine.addColorStop(0, 'rgba(255,255,255,0.95)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = shine;
  c.fill();
  tex.refresh();
}

/** A soft white glow, tinted to taste and drawn additively. */
function glowTexture(scene: Phaser.Scene, key: string, size: number) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const c = tex.getContext();
  const r = size / 2;
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  tex.refresh();
}

/**
 * The TV during Peg Drop: the board of glossy pegs, the cannon swinging as the shooter turns
 * their phone, then the shot played back (it's worked out on the server). Hit pegs light up and
 * throw sparks, and pop one after another once the ball's gone; the shot that hits the last gold
 * peg plays in slow motion, zoomed in, and the board clears with fireworks.
 */
export class PegDropScene extends Phaser.Scene {
  static readonly KEY = 'peg-drop';

  private view: PegHostView | null = null;
  private pegKey = '';
  private sideKey = '';
  private phaseKey = '';
  private phaseEndsAt = 0;
  private shot: Shot | null = null;
  private shotStart = 0;
  /** The bucket's clock (see catcherX): it read `catcherBase` at `catcherBaseAt` (performance.now ms). */
  private catcherBase = 0;
  private catcherBaseAt = 0;
  private hitsShown = 0;
  private popsShown = 0;
  private shotDone = false;
  private cleared = false;
  /** The board's been cleared: the banner waits for the camera to come back out of slow motion. */
  private bannerDue = false;
  private fired = false;
  private pegs: PegSprite[] = [];
  private lit: number[] = [];
  private trail: { x: number; y: number }[] = [];
  private popTimers: Phaser.Time.TimerEvent[] = [];
  /** Live during a shot: gold pegs cleared so far, the multiplier, and the meter's fill as drawn. */
  private liveGold = 0;
  private liveMultiplier = 1;
  private meterFill = 0;
  private shotPoints = 0;
  private focus = { x: WIDTH / 2, y: HEIGHT / 2 };

  private pegLayer!: Phaser.GameObjects.Container;
  private guide!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private railLights!: Phaser.GameObjects.Arc[];
  private barrel!: Phaser.GameObjects.Container;
  private loaded!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private ballGlow!: Phaser.GameObjects.Image;
  private catcher!: Phaser.GameObjects.Container;
  private lastGoldRing!: Phaser.GameObjects.Graphics;
  private sparks!: Record<'blue' | 'gold' | 'white', Phaser.GameObjects.Particles.ParticleEmitter>;
  private sideLayer!: Phaser.GameObjects.Container;
  private meterGfx!: Phaser.GameObjects.Graphics;
  private multiplierText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private shotText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(PegDropScene.KEY);
  }

  create() {
    this.view = null;
    this.pegKey = this.sideKey = this.phaseKey = '';
    this.shot = null;
    this.pegs = [];
    this.lit = [];
    this.trail = [];
    this.popTimers = [];
    this.meterFill = 0;
    this.focus = { x: WIDTH / 2, y: HEIGHT / 2 };

    sphereTexture(this, 'pd-blue', 64, '#d6ecff', '#3d8bff', '#13306e');
    sphereTexture(this, 'pd-gold', 64, '#fff3c4', '#ff9f1c', '#7a3900');
    sphereTexture(this, 'pd-blue-lit', 64, '#ffffff', '#b5dcff', '#4f9dff');
    sphereTexture(this, 'pd-gold-lit', 64, '#ffffff', '#ffe08a', '#ffa62b');
    sphereTexture(this, 'pd-ball', 64, '#ffffff', '#c9cde0', '#4b4f66');
    sphereTexture(this, 'pd-dome', 128, '#fff6d6', '#ffc94a', '#8a5a00');
    glowTexture(this, 'pd-glow', 128);

    addBackdrop(this);
    this.drawBoardFrame();

    this.pegLayer = this.add.container(0, 0);
    this.lastGoldRing = this.add.graphics().setDepth(4);
    this.catcher = this.makeCatcher();
    this.trailGfx = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.ballGlow = this.add.image(0, 0, 'pd-glow').setDisplaySize(90, 90).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setDepth(6).setVisible(false);
    this.ball = this.add.image(0, 0, 'pd-ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(7).setVisible(false);
    this.makeLauncher();
    // The aim guide goes over the launcher, so it shows from the very start.
    this.guide = this.add.graphics().setDepth(9);

    const spark = (tint: number) =>
      this.add
        .particles(0, 0, 'pd-glow', {
          speed: { min: 120, max: 420 },
          lifespan: { min: 300, max: 650 },
          scale: { start: 0.22, end: 0 },
          alpha: { start: 1, end: 0 },
          gravityY: 500,
          tint,
          blendMode: 'ADD',
          emitting: false,
        })
        .setDepth(8);
    this.sparks = { blue: spark(0x9fd0ff), gold: spark(0xffd27a), white: spark(0xffffff) };

    this.shotText = text(this, LAUNCHER.x, 560, '', 72, COLORS.accent, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 12, align: 'center' }).setDepth(30);

    text(this, SIDE_CX, 70, 'PEG DROP', 58, COLORS.accent, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 8 }).setTint(0xfff1a8, 0xfff1a8, 0xff9f1c, 0xff9f1c);
    this.timerText = text(this, SIDE_CX, 990, '', 72, COLORS.text, { fontStyle: '700' });
    this.sideLayer = this.add.container(0, 0);
    this.meterGfx = this.add.graphics();
    this.multiplierText = text(this, SIDE_CX, 575, '', 96, COLORS.text, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 8 });
    this.goldText = text(this, SIDE_CX, 770, '', 40, '#ffc35c', { fontStyle: '700' });
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: PegHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as PegHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  // ---- Building the scene ------------------------------------------------------------------

  /** The playfield: a starry well with glossy rails and a row of lights along the top. */
  private drawBoardFrame() {
    const w = BOARD_RIGHT - BOARD_LEFT;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x231a5e, 0x231a5e, 0x07051a, 0x07051a, 1);
    bg.fillRect(BOARD_LEFT, BOARD_TOP, w, BOARD_BOTTOM - BOARD_TOP);
    this.add.image(LAUNCHER.x, 620, 'pd-glow').setDisplaySize(w * 1.1, 900).setTint(0x6a4cff).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
    const stars = this.add.graphics();
    for (let i = 0; i < 140; i++) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.08, 0.5));
      stars.fillCircle(Phaser.Math.Between(BOARD_LEFT + 10, BOARD_RIGHT - 10), Phaser.Math.Between(BOARD_TOP + 10, BOARD_BOTTOM), Phaser.Math.FloatBetween(0.8, 2.2));
    }

    const rails = this.add.graphics().setDepth(3);
    // (Gradient fills only work on plain rectangles.)
    const rail = (x: number, y: number, rw: number, rh: number) => {
      rails.fillGradientStyle(0x8b7cf6, 0x3b2f8f, 0x8b7cf6, 0x3b2f8f, 1);
      rails.fillRect(x, y, rw, rh);
      rails.fillStyle(0xffffff, 0.25).fillRect(x + 3, y + 3, Math.max(3, rw * 0.25), rh - 6);
    };
    rail(BOARD_LEFT - 18, BOARD_TOP - 18, 18, HEIGHT - BOARD_TOP + 18);
    rail(BOARD_RIGHT, BOARD_TOP - 18, 18, HEIGHT - BOARD_TOP + 18);
    rails.fillGradientStyle(0xb3a6ff, 0xb3a6ff, 0x3b2f8f, 0x3b2f8f, 1);
    rails.fillRect(BOARD_LEFT - 18, BOARD_TOP - 18, w + 36, 18);

    this.railLights = [];
    for (let x = BOARD_LEFT + 20; x <= BOARD_RIGHT - 20; x += 40) {
      this.railLights.push(this.add.circle(x, BOARD_TOP - 9, 5, 0xffd166, 0.35).setDepth(3));
    }
  }

  private makeLauncher() {
    const g = this.add.graphics();
    g.fillStyle(0x1b1640, 1).fillRoundedRect(-22, 0, 44, BARREL_LEN, 12);
    g.fillGradientStyle(0x5d5a7a, 0xd8d4f0, 0x5d5a7a, 0xd8d4f0, 1).fillRect(-18, 0, 36, BARREL_LEN - 4);
    g.fillStyle(0xffc94a, 1).fillRect(-19, BARREL_LEN * 0.45, 38, 8).fillRect(-21, BARREL_LEN - 22, 42, 12);
    this.loaded = this.add.image(0, BARREL_LEN - 6, 'pd-ball').setDisplaySize(BALL_R * 2, BALL_R * 2);
    this.barrel = this.add.container(LAUNCHER.x, LAUNCHER.y, [g, this.loaded]).setDepth(8);
    this.add.image(LAUNCHER.x, LAUNCHER.y, 'pd-glow').setDisplaySize(200, 200).setTint(0xffc94a).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
    this.add.image(LAUNCHER.x, LAUNCHER.y, 'pd-dome').setDisplaySize(92, 92).setDepth(8);
  }

  /** The free-ball bucket: a glowing tray. */
  private makeCatcher() {
    const { width: w, height: h } = CATCHER;
    const glow = this.add.image(0, h / 2, 'pd-glow').setDisplaySize(w * 1.6, 110).setTint(MINT).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD);
    const g = this.add.graphics();
    g.fillStyle(0x2fbf8a, 1);
    g.fillPoints([new Phaser.Geom.Point(-w / 2, 0), new Phaser.Geom.Point(w / 2, 0), new Phaser.Geom.Point(w / 2 - 22, h), new Phaser.Geom.Point(-w / 2 + 22, h)], true);
    g.fillStyle(0xb8ffe4, 0.6).fillRect(-w / 2 + 6, 3, w - 12, 7);
    g.lineStyle(4, 0xffffff, 0.9).lineBetween(-w / 2, 0, w / 2, 0);
    const label = text(this, 0, h / 2 + 1, 'FREE BALL', 17, '#0b3d2c', { fontStyle: '700' }).setLetterSpacing(2);
    return this.add.container(LAUNCHER.x, CATCHER.y, [glow, g, label]).setDepth(5);
  }

  private drawPegs(view: PegHostView) {
    this.popTimers.forEach((t) => t.remove());
    this.popTimers = [];
    this.pegLayer.removeAll(true);
    this.lit = [];
    this.pegs = view.pegs.map((p, i) => {
      let glow: Phaser.GameObjects.Image | null = null;
      if (p.gold && !p.gone) {
        glow = this.add.image(p.x, p.y, 'pd-glow').setDisplaySize(70, 70).setTint(GOLD).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
        // A slow shimmer, out of step peg to peg.
        this.tweens.add({ targets: glow, alpha: 0.5, duration: 900 + (i % 5) * 150, yoyo: true, repeat: -1, delay: (i * 137) % 900 });
        this.pegLayer.add(glow);
      }
      const img = this.add.image(p.x, p.y, p.gold ? 'pd-gold' : 'pd-blue').setDisplaySize(PEG_SIZE, PEG_SIZE).setVisible(!p.gone);
      this.pegLayer.add(img);
      return { img, glow, gold: p.gold };
    });
  }

  // ---- Views -------------------------------------------------------------------------------

  private applyView(view: PegHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.barrel.setRotation(-view.angle);
    // Follow the server's bucket clock, ignoring small differences (network jitter) so it glides.
    const now = performance.now();
    if (Math.abs(this.catcherBase + (now - this.catcherBaseAt) / 1000 - view.catcherT) > 0.05) {
      this.catcherBase = view.catcherT;
      this.catcherBaseAt = now;
    }

    const pegKey = `${view.boardNumber}|${view.shotNumber}`;
    if (pegKey !== this.pegKey) {
      this.pegKey = pegKey;
      this.drawPegs(view);
    }

    const phaseKey = `${pegKey}|${view.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.overlay.removeAll(true);
      this.shot = view.shot;
      this.hitsShown = this.popsShown = 0;
      this.shotDone = this.cleared = this.fired = this.bannerDue = false;
      this.shotPoints = 0;
      this.trail = [];
      this.liveGold = view.goldTotal - view.goldLeft;
      this.liveMultiplier = view.multiplier;
      this.shotText.setText('').setScale(1).setAlpha(1).clearTint();
      if (this.shot) this.shotStart = performance.now() - (view.phaseMs - view.msLeft);
      if (view.phase === 'boardEnd') this.showBoardEnd(view);
      if (view.phase === 'gameEnd') {
        showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
      }
    }
    this.drawSide(view);
  }

  update(time: number) {
    const v = this.view;
    if (!v) return;
    const now = performance.now();
    const aiming = v.phase === 'aim';
    this.timerText.setText(aiming ? String(Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000))) : '');
    this.loaded.setVisible(aiming);

    this.guide.clear();
    if (aiming) this.drawGuide(v.angle, time);
    this.drawLastGold(v, time);

    const shot = this.shot;
    const { t, slow } = shot ? shotTimeAt(shot, (now - this.shotStart) / 1000) : { t: 0, slow: false };
    // The bucket keeps time with the ball while a shot plays (slow motion too), and runs on its own otherwise.
    this.catcher.setX(catcherX(shot && t < shot.endT ? shot.catcherT + t : this.catcherBase + (now - this.catcherBaseAt) / 1000));

    // The lights along the top chase while a ball is in play, and glow softly otherwise.
    const inPlay = !!shot && t < shot.endT;
    this.railLights.forEach((l, i) => l.setAlpha(inPlay ? (Math.floor(time / 90) - i) % 4 === 0 ? 1 : 0.3 : 0.35 + 0.15 * Math.sin(time / 600 + i * 0.5)));

    let ballAt: { x: number; y: number } | null = null;
    if (shot) ballAt = this.playShot(shot, t);
    else {
      this.ball.setVisible(false);
      this.ballGlow.setVisible(false);
      this.trailGfx.clear();
    }
    this.updateCamera(slow && ballAt ? ballAt : null);
    if (this.bannerDue && !slow && this.cameras.main.zoom < 1.05) {
      this.bannerDue = false;
      this.showClearBanner();
    }
    this.drawMeter();
  }

  /** Slow motion zooms in on the ball; otherwise the camera eases back out. */
  private updateCamera(target: { x: number; y: number } | null) {
    const cam = this.cameras.main;
    const goal = target ?? { x: WIDTH / 2, y: HEIGHT / 2 };
    cam.setZoom(cam.zoom + ((target ? 1.7 : 1) - cam.zoom) * 0.08);
    this.focus.x += (goal.x - this.focus.x) * 0.1;
    this.focus.y += (goal.y - this.focus.y) * 0.1;
    cam.centerOn(this.focus.x, this.focus.y);
  }

  /** The ball's flight as a fading dotted line, up to the first peg in its way, where a ghost ball pulses. */
  private drawGuide(angle: number, time: number) {
    const pegs = this.view!.pegs;
    for (let t = 0.03, i = 0; t < GUIDE_S; t += 0.005, i++) {
      const { x, y } = flightAt(angle, t);
      if (x < BOARD_LEFT || x > BOARD_RIGHT || y > BOARD_BOTTOM) break;
      if (pegs.some((p) => !p.gone && Math.hypot(p.x - x, p.y - y) < PEG_R + BALL_R)) {
        const pulse = 1 + 0.15 * Math.sin(time / 120);
        this.guide.lineStyle(3, 0xffffff, 0.9).strokeCircle(x, y, BALL_R * pulse);
        this.guide.fillStyle(0xffffff, 0.2).fillCircle(x, y, BALL_R * pulse);
        break;
      }
      if (i % 4 === 0) this.guide.fillStyle(0xffffff, 0.85 * (1 - t / GUIDE_S) + 0.1).fillCircle(x, y, 4.5);
    }
  }

  /** With one gold peg left, it gets a pulsing ring: the one to go for. */
  private drawLastGold(v: PegHostView, time: number) {
    this.lastGoldRing.clear();
    if (v.goldLeft !== 1 || this.cleared || v.phase === 'boardEnd' || v.phase === 'gameEnd') return;
    const i = v.pegs.findIndex((p) => p.gold && !p.gone);
    if (i < 0 || this.lit.includes(i)) return;
    const p = v.pegs[i];
    const r = PEG_R + 10 + 6 * Math.sin(time / 150);
    this.lastGoldRing.lineStyle(4, 0xffd166, 0.9).strokeCircle(p.x, p.y, r);
    this.lastGoldRing.lineStyle(2, 0xffffff, 0.5).strokeCircle(p.x, p.y, r + 8);
  }

  // ---- Playing a shot back -----------------------------------------------------------------

  private playShot(shot: Shot, t: number) {
    const last = shot.path.length / 2 - 1;
    const i = Math.min(Math.floor(t / shot.step), last);
    const f = Math.min(1, t / shot.step - i);
    const j = Math.min(i + 1, last);
    const x = shot.path[i * 2] + (shot.path[j * 2] - shot.path[i * 2]) * f;
    const y = shot.path[i * 2 + 1] + (shot.path[j * 2 + 1] - shot.path[i * 2 + 1]) * f;
    const flying = t < shot.endT;
    this.ball.setPosition(x, y).setVisible(flying);
    this.ballGlow.setPosition(x, y).setVisible(flying);

    if (!this.fired) {
      this.fired = true;
      const tip = { x: LAUNCHER.x + Math.sin(shot.angle) * BARREL_LEN, y: LAUNCHER.y + Math.cos(shot.angle) * BARREL_LEN };
      this.sparks.white.explode(18, tip.x, tip.y);
      this.tweens.add({ targets: this.barrel, scaleY: 0.82, duration: 70, yoyo: true });
    }

    // The trail: where the ball's just been.
    if (flying) {
      this.trail.push({ x, y });
      if (this.trail.length > TRAIL) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    this.trailGfx.clear();
    this.trail.forEach((p, k) => {
      const share = (k + 1) / this.trail.length;
      this.trailGfx.fillStyle(0x9fd0ff, 0.35 * share).fillCircle(p.x, p.y, BALL_R * (0.3 + 0.7 * share));
    });

    while (this.hitsShown < shot.hits.length && shot.hits[this.hitsShown].t <= t) this.showHit(shot, shot.hits[this.hitsShown++]);
    while (this.popsShown < shot.pops.length && shot.pops[this.popsShown].t <= t) {
      for (const peg of shot.pops[this.popsShown++].pegs) this.popPeg(peg);
    }

    if (!this.shotDone && t >= shot.endT) {
      this.shotDone = true;
      this.finishShot(shot);
    }
    return { x, y };
  }

  private showHit(shot: Shot, hit: Shot['hits'][number]) {
    const peg = this.pegs[hit.peg];
    if (!peg) return;
    const p = this.view!.pegs[hit.peg];
    this.lit.push(hit.peg);
    this.shotPoints += hit.points;
    peg.img.setTexture(peg.gold ? 'pd-gold-lit' : 'pd-blue-lit');
    const glow = peg.glow ?? this.add.image(p.x, p.y, 'pd-glow').setBlendMode(Phaser.BlendModes.ADD);
    if (!peg.glow) this.pegLayer.addAt(glow, 0);
    peg.glow = glow;
    this.tweens.killTweensOf(glow);
    glow.setTint(peg.gold ? 0xffc35c : 0x7fc0ff).setAlpha(0.9).setDisplaySize(96, 96);
    this.tweens.add({ targets: peg.img, displayWidth: PEG_SIZE * 1.35, displayHeight: PEG_SIZE * 1.35, duration: 80, yoyo: true });
    (peg.gold ? this.sparks.gold : this.sparks.blue).explode(peg.gold ? 16 : 8, p.x, p.y);

    const big = peg.gold || hit.multiplier > 1;
    const label = text(this, p.x, p.y - 28, `+${hit.points}`, peg.gold ? 40 : big ? 30 : 26, peg.gold ? '#ffd166' : '#d8ecff', {
      fontStyle: '700',
      stroke: '#140f2e',
      strokeThickness: 6,
    })
      .setDepth(20)
      .setScale(0.4);
    this.tweens.add({ targets: label, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: label.y - 60, alpha: 0, delay: 350, duration: 700, onComplete: () => label.destroy() });

    if (p.gold) this.liveGold++;
    const clears = shot.clearT !== null && hit.t === shot.clearT;
    if (hit.multiplier > this.liveMultiplier) {
      this.liveMultiplier = hit.multiplier;
      // (The clearing hit has a banner of its own.)
      this.announceMultiplier(hit.multiplier, !clears);
    }
    if (clears) this.celebrateClear(p.x, p.y);
  }

  private announceMultiplier(multiplier: number, banner: boolean) {
    this.multiplierText.setScale(1.6);
    this.tweens.add({ targets: this.multiplierText, scale: 1, duration: 400, ease: 'Back.easeOut' });
    if (!banner) return;
    const label = text(this, LAUNCHER.x, 420, `×${multiplier}!`, 150, '#ffd166', { fontStyle: '700', stroke: '#140f2e', strokeThickness: 14 })
      .setDepth(40)
      .setScale(0.2)
      .setTint(0xfff1a8, 0xfff1a8, 0xff7b3a, 0xff7b3a);
    this.tweens.add({ targets: label, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, alpha: 0, scale: 1.4, delay: 700, duration: 400, onComplete: () => label.destroy() });
    this.cameras.main.shake(180, 0.004);
  }

  /** The last gold peg's been hit: a flash and a shower of sparks, then (once the camera's back out) the banner. */
  private celebrateClear(x: number, y: number) {
    this.cleared = true;
    this.bannerDue = true;
    this.cameras.main.flash(300, 255, 244, 214);
    this.sparks.gold.explode(60, x, y);
    this.sparks.white.explode(40, x, y);
  }

  /** A rainbow banner and fireworks. */
  private showClearBanner() {
    const banner = text(this, LAUNCHER.x, 430, 'BOARD CLEARED!', 120, '#ffffff', { fontStyle: '700', stroke: '#140f2e', strokeThickness: 14 })
      .setDepth(40)
      .setScale(0.2)
      .setTint(RAINBOW[0], RAINBOW[2], RAINBOW[4], RAINBOW[5]);
    this.tweens.add({ targets: banner, scale: 1, duration: 500, ease: 'Back.easeOut' });
    this.tweens.add({ targets: banner, angle: { from: -3, to: 3 }, duration: 260, yoyo: true, repeat: 9 });
    this.tweens.add({ targets: banner, alpha: 0, delay: 2_600, duration: 500, onComplete: () => banner.destroy() });
    for (let k = 0; k < 6; k++) {
      this.time.delayedCall(250 + k * 320, () => {
        const fx = Phaser.Math.Between(BOARD_LEFT + 120, BOARD_RIGHT - 120);
        const fy = Phaser.Math.Between(260, 700);
        burstConfetti(this, fx, fy, 50);
        this.sparks.white.explode(30, fx, fy);
      });
    }
  }

  /** The ball's gone: lit pegs pop one by one as the shot's points count up. */
  private finishShot(shot: Shot) {
    const order = [...this.lit];
    const gap = Math.min(POP_GAP_MS, POP_TOTAL_MS / Math.max(1, order.length));
    let counted = 0;
    order.forEach((peg, k) => {
      const hit = shot.hits.find((h) => h.peg === peg);
      this.popTimers.push(
        this.time.delayedCall(k * gap, () => {
          this.popPeg(peg);
          counted += hit?.points ?? 0;
          if (!this.cleared) this.shotText.setText(`${counted.toLocaleString()}`);
        }),
      );
    });
    this.popTimers.push(
      this.time.delayedCall(order.length * gap + 60, () => {
        if (this.cleared) return;
        const total = shot.points ? `${shot.points.toLocaleString()} points` : 'Missed!';
        this.shotText.setText(shot.caught ? `FREE BALL!\n${total}` : total).setScale(0.6);
        if (shot.caught) this.shotText.setTint(0xb8ffe4, 0xb8ffe4, 0x6ee7b7, 0x6ee7b7);
        this.tweens.add({ targets: this.shotText, scale: 1, duration: 250, ease: 'Back.easeOut' });
      }),
    );
    if (shot.caught) {
      this.tweens.add({ targets: this.catcher, scaleX: 1.25, scaleY: 1.5, duration: 160, yoyo: true, repeat: 1 });
      this.sparks.white.explode(30, this.catcher.x, CATCHER.y);
    }
  }

  private popPeg(index: number) {
    const peg = this.pegs[index];
    if (!peg || !peg.img.visible || !peg.img.active) return;
    const p = this.view!.pegs[index];
    (peg.gold ? this.sparks.gold : this.sparks.blue).explode(6, p.x, p.y);
    const targets = peg.glow ? [peg.img, peg.glow] : [peg.img];
    this.tweens.killTweensOf(targets);
    this.tweens.add({
      targets,
      scale: (_: unknown, __: string, value: number) => value * 1.5,
      alpha: 0,
      duration: 200,
      onComplete: () => targets.forEach((o) => o.setVisible(false)),
    });
  }

  // ---- Side panels -------------------------------------------------------------------------

  /** The gold meter, the multiplier and gold count: live, as pegs get hit. */
  private drawMeter() {
    const v = this.view!;
    const share = v.goldTotal ? this.liveGold / v.goldTotal : 0;
    this.meterFill += (share - this.meterFill) * 0.12;
    const g = this.meterGfx.clear();
    g.fillStyle(0x0c0820, 1).fillRoundedRect(METER.x, METER.y, METER.w, METER.h, METER.h / 2);
    const fillW = Math.max(0, METER.w * this.meterFill);
    if (fillW > 2) {
      g.fillGradientStyle(0xffe08a, 0xff7b3a, 0xffe08a, 0xff7b3a, 1);
      g.fillRect(METER.x + 4, METER.y + 4, fillW - 8, METER.h - 8);
      g.fillStyle(0xffffff, 0.35).fillRect(METER.x + 6, METER.y + 6, Math.max(0, fillW - 12), 5);
    }
    for (const mark of METER_MARKS) {
      const x = METER.x + METER.w * mark;
      g.lineStyle(3, this.meterFill >= mark ? 0xffffff : 0x8b7cf6, 1).lineBetween(x, METER.y - 4, x, METER.y + METER.h + 4);
    }
    const multiplier = this.shot ? this.liveMultiplier : multiplierFor(v.goldTotal - v.goldLeft, v.goldTotal);
    this.multiplierText.setText(`×${multiplier}`).setColor(multiplier > 1 ? '#ffd166' : '#ffffff');
    const left = v.goldTotal - this.liveGold;
    this.goldText.setText(left === 1 ? 'LAST GOLD PEG!' : `${left} gold pegs left`);
  }

  /** Left: whose turn and the board's state. Right: everyone's balls and points. */
  private drawSide(view: PegHostView) {
    const key = JSON.stringify([view.phase, view.shooterId, view.boardNumber, view.players.map((p) => [p.name, p.ballsLeft, p.boardPoints])]);
    if (key === this.sideKey) return;
    this.sideKey = key;
    const o = this.sideLayer;
    o.removeAll(true);
    const shooter = view.players.find((p) => p.id === view.shooterId);

    o.add(text(this, SIDE_CX, 140, `Board ${view.boardNumber} of ${view.totalBoards}`, 32, COLORS.muted));
    o.add(panel(this, 30, 200, SIDE_W - 20, 230));
    if (shooter && (view.phase === 'aim' || view.phase === 'shot')) {
      o.add(text(this, SIDE_CX, 245, view.phase === 'aim' ? 'AIMING' : 'SHOOTING', 26, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
      o.add(text(this, SIDE_CX, 310, shooter.name, 52, shooter.color, { fontStyle: '700', wordWrap: { width: SIDE_W - 50 }, align: 'center' }));
      if (view.phase === 'aim') o.add(text(this, SIDE_CX, 385, 'Turn your phone to aim!', 26, COLORS.text));
    }

    o.add(panel(this, 30, 460, SIDE_W - 20, 370));
    o.add(text(this, SIDE_CX, 500, 'MULTIPLIER', 26, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
    METER_MARKS.forEach((mark, i) => {
      o.add(text(this, METER.x + METER.w * mark, METER.y + METER.h + 26, `×${[2, 3, 5][i]}`, 22, COLORS.muted, { fontStyle: '700' }));
    });

    const rightW = WIDTH - RIGHT_X - 30;
    const rowH = Math.min(110, 900 / Math.max(1, view.players.length));
    o.add(text(this, RIGHT_X + rightW / 2, 70, 'THIS BOARD', 30, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
    view.players.forEach((p, i) => {
      const y = 130 + i * rowH;
      const active = p.id === view.shooterId && (view.phase === 'aim' || view.phase === 'shot');
      o.add(panel(this, RIGHT_X, y, rightW, rowH - 12, active ? COLORS.panelLight : COLORS.panel));
      if (active) {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0xffd166, 1).strokeRoundedRect(RIGHT_X, y, rightW, rowH - 12, 24);
        o.add(ring);
      }
      o.add(text(this, RIGHT_X + 20, y + 28, p.name, 30, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      o.add(text(this, RIGHT_X + rightW - 20, y + 28, p.boardPoints.toLocaleString(), 30, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5));
      for (let b = 0; b < Math.min(p.ballsLeft, 12); b++) {
        o.add(this.add.image(RIGHT_X + 30 + b * 26, y + 66, 'pd-ball').setDisplaySize(20, 20));
      }
      if (p.ballsLeft === 0) o.add(text(this, RIGHT_X + 20, y + 66, 'out of balls', 22, COLORS.muted).setOrigin(0, 0.5));
    });
  }

  private showBoardEnd(view: PegHostView) {
    const o = this.overlay;
    o.add(this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0720, 0.85).setOrigin(0));
    o.add(
      text(this, WIDTH / 2, 170, view.goldLeft === 0 ? 'BOARD CLEARED!' : 'BOARD OVER', 80, COLORS.accent, { fontStyle: '700' }).setTint(0xfff1a8, 0xfff1a8, 0xff9f1c, 0xff9f1c),
    );
    const rows = [...view.players].sort((a, b) => b.boardPoints - a.boardPoints);
    const rowH = 78;
    const top = 290;
    o.add(panel(this, WIDTH / 2 - 480, top - 50, 960, rows.length * rowH + 40));
    rows.forEach((p, i) => {
      const y = top + i * rowH;
      o.add(text(this, WIDTH / 2 - 440, y, p.name, 40, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      o.add(text(this, WIDTH / 2 + 120, y, `${p.boardPoints.toLocaleString()} on the pegs`, 32, COLORS.muted).setOrigin(1, 0.5));
      o.add(text(this, WIDTH / 2 + 440, y, `+${p.points.toLocaleString()}`, 40, COLORS.accent, { fontStyle: '700' }).setOrigin(1, 0.5));
    });
    if (rows[0]?.boardPoints > 0) burstConfetti(this, WIDTH / 2, 170, 80);
  }
}
