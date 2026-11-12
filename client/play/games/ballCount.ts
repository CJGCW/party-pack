import { MAX_BALLS, guessPoints, type CountInput, type CountPlayerView } from '../../../shared/games/ballCount';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';
import { Steer } from '../steer';

/** The box (its own units), the balls' size, and how they move. */
const BOX_W = 1;
const BOX_H = 1.6;
const BALL_R = 0.08;
const PULL = 7;
const BOUNCE = 0.5;
/** A knock at least this fast is felt; knocks closer together than this are felt as one. */
const KNOCK_SPEED = 0.3;
const KNOCK_GAP_MS = 45;

/**
 * The balls roll about in a box inside the phone (tilt it, or drag on the box without motion
 * sensors), and every knock against the side buzzes and clicks: a phone can't say whether it really
 * buzzed (it won't on silent), so the click always plays. Then guess how many.
 */
export function createBallCount(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: CountPlayerView | null = null;
  let phaseEndsAt = 0;
  let balls: { x: number; y: number; vx: number; vy: number }[] = [];
  let ballsKey = '';
  let guess = 5;
  let frame = 0;
  let last = 0;
  let lastKnock = 0;
  let audio: AudioContext | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const boxEl = h('div', { class: 'bc-box' }, h('div', { class: 'cf-pad-label' }, 'TILT ME'));
  const minus = h('button', { type: 'button', class: 'secondary' }, '−') as HTMLButtonElement;
  const plus = h('button', { type: 'button', class: 'secondary' }, '+') as HTMLButtonElement;
  const numberEl = h('div', { class: 'bc-number' });
  const submit = h('button', { type: 'button' }, 'That many!') as HTMLButtonElement;
  const guessEl = h('div', { class: 'bc-guess' }, minus, numberEl, plus);
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on tilting') as HTMLButtonElement;
  const hintEl = h('div', { class: 'pd-hint' });
  const feelEl = h('div', { class: 'pd-aim' }, boxEl, hintEl, permissionBtn, guessEl, submit);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), feelEl, infoEl));

  const steer = new Steer(boxEl, {});
  const feeling = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked;

  const showGuess = () => (numberEl.textContent = String(guess));
  minus.addEventListener('click', () => ((guess = Math.max(0, guess - 1)), showGuess()));
  plus.addEventListener('click', () => ((guess = Math.min(MAX_BALLS * 2, guess + 1)), showGuess()));
  submit.addEventListener('click', () => {
    if (!feeling()) return;
    send({ type: 'fire', guess } satisfies CountInput);
  });
  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));

  /** The sound, started (or woken: browsers hold it back until a tap). */
  function sound() {
    try {
      audio ??= new AudioContext();
      if (audio.state === 'suspended') void audio.resume();
      return audio;
    } catch {
      return null;
    }
  }
  feelEl.addEventListener('pointerdown', sound);
  feelEl.addEventListener('pointerup', sound);

  /** A knock: a buzz and a click, high enough for a phone's speaker. */
  function knock(strength: number) {
    const now = performance.now();
    if (now - lastKnock < KNOCK_GAP_MS) return;
    lastKnock = now;
    navigator.vibrate?.(Math.round(Math.min(30, 15 + strength * 10)));
    const ctx = sound();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 700 + Math.random() * 300;
    gain.gain.setValueAtTime(Math.min(0.8, 0.35 + strength * 0.25), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  function step(dt: number) {
    const t = steer.tilt();
    for (const b of balls) {
      b.vx += t.x * PULL * dt;
      b.vy += t.y * PULL * dt;
      b.vx *= Math.exp(-0.3 * dt);
      b.vy *= Math.exp(-0.3 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < BALL_R || b.x > BOX_W - BALL_R) {
        if (Math.abs(b.vx) > KNOCK_SPEED) knock(Math.abs(b.vx));
        b.x = Math.max(BALL_R, Math.min(BOX_W - BALL_R, b.x));
        b.vx = -b.vx * BOUNCE;
      }
      if (b.y < BALL_R || b.y > BOX_H - BALL_R) {
        if (Math.abs(b.vy) > KNOCK_SPEED) knock(Math.abs(b.vy));
        b.y = Math.max(BALL_R, Math.min(BOX_H - BALL_R, b.y));
        b.vy = -b.vy * BOUNCE;
      }
    }
    // Balls bump each other (quietly).
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const c = balls[j];
        const d = Math.hypot(c.x - a.x, c.y - a.y) || 1e-6;
        if (d >= BALL_R * 2) continue;
        const [nx, ny] = [(c.x - a.x) / d, (c.y - a.y) / d];
        const push = (BALL_R * 2 - d) / 2;
        [a.x, a.y, c.x, c.y] = [a.x - nx * push, a.y - ny * push, c.x + nx * push, c.y + ny * push];
        const closing = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (closing > 0) [a.vx, a.vy, c.vx, c.vy] = [a.vx - closing * nx, a.vy - closing * ny, c.vx + closing * nx, c.vy + closing * ny];
      }
    }
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (feeling()) step(dt);
    frame = requestAnimationFrame(loop);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Box ${v.volley}/${v.totalVolleys}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    if (s) {
      const key = `${v.seed}|${s.box}`;
      if (key !== ballsKey) {
        ballsKey = key;
        // A new box: the balls start scattered about, still.
        balls = Array.from({ length: s.balls }, (_, i) => ({ x: BALL_R + ((i * 0.37) % 1) * (BOX_W - BALL_R * 2), y: BALL_R + ((i * 0.61) % 1) * (BOX_H - BALL_R * 2), vx: 0, vy: 0 }));
        steer.recentre();
      }
    }
    const on = feeling();
    feelEl.hidden = !on;
    infoEl.hidden = on;
    permissionBtn.hidden = !needsMotionPermission();
    hintEl.textContent = sensorsLive() ? 'Tilt your phone about, then feel and hear the balls knock. How many are there?' : 'Drag about on the box and listen to the balls knock. How many are there?';
    showGuess();
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll get a box next round.";
    else if (v.phase === 'aim') title = `Guessed! ${v.lockedCount} of ${v.playing} in`;
    else if (v.phase === 'fly' && s) {
      title = `There were ${s.actual}!`;
      lines.push(s.guess === null ? 'You didn’t guess.' : `You said ${s.guess}: +${guessPoints(s.guess, s.actual ?? 1)}`);
    } else if (v.phase === 'result') {
      title = v.place === 1 ? 'Closest counter!' : 'Round over';
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'aim' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 5);
  }
  const interval = setInterval(clock, 200);
  frame = requestAnimationFrame(loop);

  return {
    update(raw) {
      view = raw as CountPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      void audio?.close();
      root.replaceChildren();
    },
  };
}
