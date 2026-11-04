import {
  MAX_ELEVATION,
  MIN_ELEVATION,
  STEER_FULL,
  type CastleInput,
  type CastlePlayerView,
} from '../../../shared/games/castleCrush';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';
import { Steer } from '../steer';

/** Aim updates go to the server at most this often. */
const SEND_MS = 80;
/** Pulling this far down is full power. */
const FULL_PULL_PX = 220;
const MID = (MIN_ELEVATION + MAX_ELEVATION) / 2;
const clampElevation = (e: number) => Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, e));

/**
 * Turn the phone like a wheel to raise and lower the catapult (anticlockwise lifts it; without
 * motion sensors, point at the dial), then pull down on the pad to set the power and let go to fire.
 */
export function createCastleCrush(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: CastlePlayerView | null = null;
  let phaseEndsAt = 0;
  let elevation = MID;
  let power = 0;
  let pulling: { id: number; y: number } | null = null;
  let pointing = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sent = '';

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrow = h('div', { class: 'ss-arrow' });
  const dial = h('div', { class: 'ss-dial cc-dial' }, arrow, h('div', { class: 'ss-ball ss-current sp-hub' }));
  const fill = h('div', { class: 'cc-fill' });
  const pullLabel = h('div', { class: 'cf-pad-label' }, 'PULL BACK, LET GO TO FIRE');
  const pull = h('div', { class: 'cc-pull' }, fill, pullLabel);
  const hintEl = h('div', { class: 'pd-hint' });
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on motion aiming') as HTMLButtonElement;
  const recentreBtn = h('button', { class: 'secondary', type: 'button' }, 'Recentre') as HTMLButtonElement;
  const aimEl = h('div', { class: 'pd-aim' }, dial, pull, hintEl, permissionBtn, recentreBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), aimEl, infoEl, statsEl));

  const steer = new Steer(null, {});

  const canAim = () => !!view && view.phase === 'aim' && view.hasBoard && !view.locked;

  function showAim() {
    arrow.style.transform = `rotate(${Math.PI / 2 - elevation}rad)`;
    fill.style.height = `${Math.round(power * 100)}%`;
    pullLabel.textContent = pulling ? `POWER ${Math.round(power * 100)}%` : 'PULL BACK, LET GO TO FIRE';
  }

  /** On a timer rather than the screen's refresh, so it keeps going even if the phone slows its screen down. */
  function tick() {
    if (!canAim()) return;
    if (sensorsLive() && !pointing) elevation = clampElevation(MID - (steer.angle() / STEER_FULL) * (MAX_ELEVATION - MID));
    showAim();
    const aim = `${elevation.toFixed(3)},${power.toFixed(2)}`;
    if (aim === sent) return;
    sent = aim;
    send({ type: 'aim', elevation, power } satisfies CastleInput);
  }

  function setRunning(on: boolean) {
    if (on === !!timer) return;
    if (on) {
      steer.recentre();
      power = 0;
      sent = '';
      timer = setInterval(tick, SEND_MS);
    } else {
      clearInterval(timer!);
      timer = null;
      pulling = null;
      showAim();
    }
  }

  // Without sensors, point at the dial: up and right, from its middle.
  const pointAt = (e: PointerEvent) => {
    const r = dial.getBoundingClientRect();
    elevation = clampElevation(Math.atan2(r.top + r.height / 2 - e.clientY, e.clientX - (r.left + r.width / 2)));
  };
  dial.addEventListener('pointerdown', (e) => {
    if (!canAim()) return;
    e.preventDefault();
    pointing = true;
    try {
      dial.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
    pointAt(e);
  });
  dial.addEventListener('pointermove', (e) => pointing && pointAt(e));
  const stopPointing = () => (pointing = false);
  dial.addEventListener('pointerup', stopPointing);
  dial.addEventListener('pointercancel', stopPointing);

  pull.addEventListener('pointerdown', (e) => {
    if (!canAim()) return;
    e.preventDefault();
    pulling = { id: e.pointerId, y: e.clientY };
    try {
      pull.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
  });
  pull.addEventListener('pointermove', (e) => {
    if (pulling?.id !== e.pointerId) return;
    const next = Math.max(0, Math.min(1, (e.clientY - pulling.y) / FULL_PULL_PX));
    if (Math.floor(next * 10) !== Math.floor(power * 10)) navigator.vibrate?.(5);
    power = next;
    showAim();
  });
  pull.addEventListener('pointerup', (e) => {
    if (pulling?.id !== e.pointerId) return;
    pulling = null;
    // A tap without a pull doesn't fire.
    if (canAim() && power > 0.05) {
      navigator.vibrate?.(40);
      send({ type: 'fire', elevation, power } satisfies CastleInput);
    }
    showAim();
  });
  pull.addEventListener('pointercancel', () => {
    pulling = null;
    showAim();
  });
  recentreBtn.addEventListener('click', () => steer.recentre());
  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const aiming = canAim();
    setRunning(aiming);
    aimEl.hidden = !aiming;
    infoEl.hidden = aiming;
    permissionBtn.hidden = !needsMotionPermission();
    recentreBtn.hidden = !sensorsLive();
    hintEl.textContent = sensorsLive()
      ? `Shot ${v.volley} of ${v.totalVolleys}. Turn your phone anticlockwise to aim higher, clockwise to aim lower; pull down on the pad and let go to fire.`
      : `Shot ${v.volley} of ${v.totalVolleys}. Point at the dial to aim; pull down on the pad and let go to fire.`;
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll get a castle next round.";
    else if (v.phase === 'aim') title = `Fired! ${v.lockedCount} of ${v.playing} ready`;
    else if (v.phase === 'fly') title = 'Watch the TV!';
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Top of the round!' : 'Round over';
      lines.push(`${v.boardScore} damage`);
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
    statsEl.textContent = s && v.phase !== 'gameEnd' && v.phase !== 'fly' ? `${v.boardScore} damage · ${s.knocked} blocks · ${s.guardsDown} of ${s.guards} guards` : '';
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'aim' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 5);
  }
  const interval = setInterval(clock, 200);

  return {
    update(raw) {
      const next = raw as CastlePlayerView;
      // A new shot to aim: start from where the last one was aimed (the server's copy).
      if (next.state && (next.volley !== view?.volley || next.puzzleNumber !== view?.puzzleNumber)) elevation = clampElevation(next.state.aim.elevation);
      view = next;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      setRunning(false);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
