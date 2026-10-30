import { MAX_AIM, type PegInput, type PegPlayerView } from '../../../shared/games/pegDrop';
import { h } from '../dom';
import type { Controller } from '../main';
import { motion, needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';

/** Below this much gravity in the screen's plane the phone is lying flat, so tilt aims instead of turning. */
const FLAT_GRAVITY = 4;
/** Lying flat: degrees of left-right tilt per radian of aim. */
const TILT_DEG_PER_RAD = 35;
/** Without sensors: pixels of drag per radian of aim. */
const DRAG_PX_PER_RAD = 160;
/** Aim updates go to the TV at most this often, and only when they've moved this much. */
const SEND_MS = 50;
const SEND_RAD = 0.004;

const wrapRad = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));
const clampAim = (a: number) => Math.max(-MAX_AIM, Math.min(MAX_AIM, a));

/**
 * The shooter aims the launcher on the TV by turning their phone like a steering wheel
 * (measured from however they held it when the turn started), or by tilting it left and
 * right if it's lying flat, or by dragging without motion sensors; then taps Fire.
 * Everyone else sees whose turn it is and how their board's going.
 */
export function createPegDrop(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PegPlayerView | null = null;
  let phaseEndsAt = 0;
  let aiming = false;
  let angle = 0;
  let base: { steer: number; gamma: number } | null = null;
  let drag: { x: number; angle: number } | null = null;
  let sent = { angle: 0, at: 0 };
  let frame = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrow = h('div', { class: 'pd-arrow' });
  const dial = h('div', { class: 'pd-dial' }, h('div', { class: 'pd-launcher' }), arrow);
  const hintEl = h('div', { class: 'pd-hint' });
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on tilt aiming') as HTMLButtonElement;
  const recentreBtn = h('button', { class: 'secondary', type: 'button' }, 'Recentre') as HTMLButtonElement;
  const fireBtn = h('button', { class: 'pd-fire', type: 'button' }, 'FIRE!') as HTMLButtonElement;
  const aimEl = h('div', { class: 'pd-aim' }, dial, hintEl, permissionBtn, h('div', { class: 'pd-buttons' }, recentreBtn, fireBtn));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });

  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), aimEl, infoEl, statsEl));

  /** The phone's turn, clockwise, in the screen's plane. */
  const gravityAngle = () => Math.atan2(motion.gravity.x, motion.gravity.y);
  const flat = () => Math.hypot(motion.gravity.x, motion.gravity.y) < FLAT_GRAVITY;

  function startAiming() {
    aiming = true;
    angle = 0;
    base = null;
    drag = null;
    sent = { angle: 0, at: 0 };
    loop();
  }

  function stopAiming() {
    aiming = false;
    cancelAnimationFrame(frame);
  }

  function loop() {
    if (!aiming) return;
    if (sensorsLive()) {
      base ??= { steer: gravityAngle(), gamma: motion.gamma! };
      const target = flat()
        ? (motion.gamma! - base.gamma) / TILT_DEG_PER_RAD
        : wrapRad(gravityAngle() - base.steer);
      // A little smoothing takes the shake out of a hand.
      angle += (clampAim(target) - angle) * 0.35;
    }
    arrow.style.transform = `rotate(${-angle}rad)`;
    const now = performance.now();
    if (Math.abs(angle - sent.angle) > SEND_RAD && now - sent.at > SEND_MS) {
      sent = { angle, at: now };
      send({ type: 'aim', angle } satisfies PegInput);
    }
    frame = requestAnimationFrame(loop);
  }

  // Dragging works with or without sensors (without, it's the only way to aim).
  dial.addEventListener('pointerdown', (e) => {
    if (!aiming || sensorsLive()) return;
    e.preventDefault();
    dial.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, angle };
  });
  dial.addEventListener('pointermove', (e) => {
    if (!drag) return;
    angle = clampAim(drag.angle + (e.clientX - drag.x) / DRAG_PX_PER_RAD);
  });
  const endDrag = () => (drag = null);
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);

  recentreBtn.addEventListener('click', () => {
    base = null;
    angle = 0;
  });
  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));
  fireBtn.addEventListener('click', () => {
    if (!aiming) return;
    navigator.vibrate?.(30);
    send({ type: 'fire', angle } satisfies PegInput);
    stopAiming();
    fireBtn.disabled = true;
  });

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Board ${v.boardNumber}/${v.totalBoards}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;

    const myTurn = v.phase === 'aim' && v.isShooter;
    if (myTurn && !aiming) startAiming();
    if (!myTurn && aiming) stopAiming();
    aimEl.hidden = !myTurn;
    infoEl.hidden = myTurn;
    fireBtn.disabled = !myTurn || !aiming;
    permissionBtn.hidden = !needsMotionPermission();
    recentreBtn.hidden = !sensorsLive();
    hintEl.textContent = sensorsLive()
      ? 'Turn your phone like a steering wheel to aim. (Lying flat? Tilt it left and right.)'
      : 'Drag left and right on the dial to aim.';

    statsEl.textContent =
      v.phase === 'boardEnd' || v.phase === 'gameEnd'
        ? ''
        : `Balls left: ${v.ballsLeft} · This board: ${v.boardPoints.toLocaleString()} · ×${v.multiplier} · ${v.goldLeft} gold left`;

    const lines: string[] = [];
    if (v.phase === 'aim' || v.phase === 'shot') {
      infoTitle.textContent = v.phase === 'shot' ? (v.isShooter ? 'Watch your ball on the TV!' : `${v.shooterName} fired!`) : `${v.shooterName} is aiming…`;
      if (v.turnsAway === null) lines.push("You're out of balls for this board.");
      else lines.push(v.turnsAway === 1 ? "You're up next!" : `Your turn in ${v.turnsAway} shots.`);
    } else if (v.phase === 'boardEnd') {
      infoTitle.textContent = 'Board over!';
      lines.push(`You scored ${v.boardPoints.toLocaleString()} on the pegs.`, `+${v.points.toLocaleString()} points`);
    } else {
      infoTitle.textContent = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const timed = view.phase === 'aim' && view.isShooter;
    timerEl.textContent = timed ? `${secs}s` : '';
    timerEl.classList.toggle('low', timed && secs <= 5);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as PegPlayerView;
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
