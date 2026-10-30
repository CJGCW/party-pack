import { COLORS, type SpiralInput, type SpiralPlayerView } from '../../../shared/games/spiralShot';
import { h } from '../dom';
import type { Controller } from '../main';
import { motion, needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';

/** Below this much gravity in the screen's plane the phone is lying flat, so tilt aims instead of turning. */
const FLAT_GRAVITY = 4;
/** Turning the phone like a wheel turns the turret this many times as far (a quarter turn each way aims all round). */
const WHEEL_GAIN = 2;
/** Lying flat: degrees of left-right tilt per radian of aim. */
const TILT_DEG_PER_RAD = 20;
/** Aim updates go to the server at most this often, and only when they've moved this much. */
const SEND_MS = 50;
const SEND_RAD = 0.01;

const wrapRad = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));

function ordinal(n: number) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/**
 * Turn the phone like a steering wheel to turn your turret on the TV (lying flat, tilt it left and
 * right; without motion sensors, point at the dial with a finger). It fires by itself; tap the
 * dial to swap the marble in it with the next one.
 */
export function createSpiralShot(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: SpiralPlayerView | null = null;
  let phaseEndsAt = 0;
  let aiming = false;
  let angle = 0;
  let base: { steer: number; gamma: number } | null = null;
  let dragging = false;
  let sent = { angle: NaN, at: 0 };
  let frame = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrow = h('div', { class: 'ss-arrow' });
  const currentEl = h('div', { class: 'ss-ball ss-current' });
  const nextEl = h('div', { class: 'ss-ball ss-next' });
  const dial = h('div', { class: 'ss-dial' }, arrow, currentEl, nextEl);
  const hintEl = h('div', { class: 'pd-hint' });
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on tilt aiming') as HTMLButtonElement;
  const recentreBtn = h('button', { class: 'secondary', type: 'button' }, 'Recentre') as HTMLButtonElement;
  const swapBtn = h('button', { class: 'ss-swap', type: 'button' }, 'Swap') as HTMLButtonElement;
  const aimEl = h('div', { class: 'pd-aim' }, dial, hintEl, permissionBtn, h('div', { class: 'pd-buttons' }, recentreBtn, swapBtn));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });

  root.append(h('div', { class: 'pd ss' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), aimEl, infoEl, statsEl));

  /** The phone's turn, clockwise, in the screen's plane. */
  const gravityAngle = () => Math.atan2(motion.gravity.x, motion.gravity.y);
  const flat = () => Math.hypot(motion.gravity.x, motion.gravity.y) < FLAT_GRAVITY;

  function startAiming() {
    aiming = true;
    angle = 0;
    base = null;
    sent = { angle: NaN, at: 0 };
    loop();
  }

  function stopAiming() {
    aiming = false;
    cancelAnimationFrame(frame);
  }

  function loop() {
    if (!aiming) return;
    if (sensorsLive() && !dragging) {
      base ??= { steer: gravityAngle(), gamma: motion.gamma! };
      const target = flat() ? (motion.gamma! - base.gamma) / TILT_DEG_PER_RAD : WHEEL_GAIN * wrapRad(gravityAngle() - base.steer);
      // A little smoothing takes the shake out of a hand (the short way round).
      angle = wrapRad(angle + wrapRad(target - angle) * 0.35);
    }
    arrow.style.transform = `rotate(${angle}rad)`;
    const now = performance.now();
    if ((Number.isNaN(sent.angle) || Math.abs(wrapRad(angle - sent.angle)) > SEND_RAD) && now - sent.at > SEND_MS) {
      sent = { angle, at: now };
      send({ type: 'aim', angle } satisfies SpiralInput);
    }
    frame = requestAnimationFrame(loop);
  }

  const swap = () => {
    if (!aiming) return;
    navigator.vibrate?.(15);
    send({ type: 'swap' } satisfies SpiralInput);
  };

  // Without sensors, point at the dial: the turret points the same way. With them, a tap swaps.
  const pointAt = (e: PointerEvent) => {
    const r = dial.getBoundingClientRect();
    angle = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
  };
  dial.addEventListener('pointerdown', (e) => {
    if (!aiming) return;
    e.preventDefault();
    if (sensorsLive()) return swap();
    dial.setPointerCapture(e.pointerId);
    dragging = true;
    pointAt(e);
  });
  dial.addEventListener('pointermove', (e) => {
    if (dragging) pointAt(e);
  });
  const endDrag = () => (dragging = false);
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);

  recentreBtn.addEventListener('click', () => {
    base = null;
    angle = 0;
  });
  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));
  swapBtn.addEventListener('click', swap);

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;

    const playing = v.current >= 0 && v.outAtMs === null && (v.phase === 'ready' || v.phase === 'play');
    if (playing && !aiming) startAiming();
    if (!playing && aiming) stopAiming();
    aimEl.hidden = !playing;
    infoEl.hidden = playing;
    currentEl.style.background = COLORS[v.current] ?? 'transparent';
    nextEl.style.background = COLORS[v.next] ?? 'transparent';
    permissionBtn.hidden = !needsMotionPermission();
    recentreBtn.hidden = !sensorsLive();
    hintEl.textContent = sensorsLive()
      ? 'Turn your phone like a steering wheel to aim; it fires by itself. Tap the dial to swap marbles. (Lying flat? Tilt it.)'
      : 'Point at the dial to aim; it fires by itself. Tap Swap to swap marbles.';

    const lines: string[] = [];
    if (v.phase === 'ready' || v.phase === 'play') {
      if (v.current < 0) {
        infoTitle.textContent = 'Watch the TV!';
        lines.push("You'll get a board next round.");
      } else {
        infoTitle.textContent = `Out at ${Math.floor(v.outAtMs! / 1000)}s`;
        lines.push(`${v.alive} of ${v.playing} still in. Watch the TV!`);
      }
    } else if (v.phase === 'result') {
      infoTitle.textContent = v.outAtMs === null ? 'You survived!' : `Out at ${Math.floor(v.outAtMs / 1000)}s`;
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      infoTitle.textContent = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));

    statsEl.textContent =
      v.current < 0 || v.phase === 'gameEnd' ? '' : `Popped: ${v.pops} · Best chain: ${v.bestCombo} · ${v.alive} of ${v.playing} still in`;
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const timed = view.phase === 'play' || view.phase === 'ready';
    timerEl.textContent = timed ? (view.phase === 'ready' ? `Starting in ${secs}` : `${secs}s`) : '';
    timerEl.classList.toggle('low', view.phase === 'play' && secs <= 10);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as SpiralPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      stopAiming();
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
