import { COLORS, type SpiralInput, type SpiralPlayerView } from '../../../shared/games/spiralShot';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';
import { Steer } from '../steer';

/** Turning the phone like a wheel turns the turret this many times as far (a quarter turn each way aims all round). */
const WHEEL_GAIN = 2;
/** Aim updates go to the server at most this often, and only when they've moved this much. */
const SEND_MS = 33;
const SEND_RAD = 0.01;

const wrapRad = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));

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

  // The phone's turn (or tilt, lying flat), smoothed; without sensors the dial's pointed at instead (below).
  const steer = new Steer(null, { wheelGain: WHEEL_GAIN });

  function startAiming() {
    aiming = true;
    angle = 0;
    steer.recentre();
    sent = { angle: NaN, at: 0 };
    loop();
  }

  function stopAiming() {
    aiming = false;
    cancelAnimationFrame(frame);
  }

  function loop() {
    if (!aiming) return;
    if (sensorsLive() && !dragging) angle = steer.angle();
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
    steer.recentre();
    angle = 0;
  });
  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));
  swapBtn.addEventListener('click', swap);

  function render() {
    if (!view) return;
    const v = view;
    const st = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;

    const playing = isPlaying(v);
    if (playing && !aiming) startAiming();
    if (!playing && aiming) stopAiming();
    aimEl.hidden = !playing;
    infoEl.hidden = playing;
    currentEl.style.background = (st && COLORS[st.current]) ?? 'transparent';
    nextEl.style.background = (st && COLORS[st.next]) ?? 'transparent';
    permissionBtn.hidden = !needsMotionPermission();
    recentreBtn.hidden = !sensorsLive();
    hintEl.textContent = sensorsLive()
      ? 'Turn your phone like a steering wheel to aim; it fires by itself. Tap the dial to swap marbles. (Lying flat? Tilt it.)'
      : 'Point at the dial to aim; it fires by itself. Tap Swap to swap marbles.';

    const info = boardsInfo(v, 'survival');
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    statsEl.textContent = !st || v.phase === 'gameEnd' ? '' : `Popped: ${st.pops} · Best chain: ${st.bestCombo} · ${v.going} of ${v.playing} still in`;
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
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
