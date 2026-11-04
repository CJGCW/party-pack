import { type GravityInput, type GravityPlayerView } from '../../../shared/games/tankGravity';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';
import { Steer } from '../steer';

const SEND_MS = 80;
/** Holding FIRE charges up and back down over this long (ms), round and round. */
const CHARGE_MS = 1_400;
/** Turning the phone turns the barrel this many times as far. */
const WHEEL_GAIN = 2;

/**
 * Tank Yard's Gravity mode: point at the dial (or turn your phone) to aim the barrel, then hold
 * FIRE to charge the power and let go to fire.
 */
export function createTankGravity(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: GravityPlayerView | null = null;
  let phaseEndsAt = 0;
  let angle = -Math.PI / 2;
  /** The angle when the phone was last centred (motion aiming turns from there). */
  let base = angle;
  let power = 0;
  let charging: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sent = '';
  let pointing = false;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrow = h('div', { class: 'ss-arrow' });
  const dial = h('div', { class: 'ss-dial' }, arrow, h('div', { class: 'ss-ball ss-current sp-hub' }));
  const fill = h('div', { class: 'cc-fill' });
  const fireLabel = h('div', { class: 'cf-pad-label' }, 'HOLD TO CHARGE, LET GO TO FIRE');
  const fireEl = h('div', { class: 'cc-pull' }, fill, fireLabel);
  const hintEl = h('div', { class: 'pd-hint' });
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on motion aiming') as HTMLButtonElement;
  const aimEl = h('div', { class: 'pd-aim' }, dial, fireEl, hintEl, permissionBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), aimEl, infoEl, statsEl));

  const steer = new Steer(null, { wheelGain: WHEEL_GAIN });
  const canAim = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked && view.state.hp > 0;

  function show() {
    // The dial's arrow points up at angle 0, so turn it a quarter round to match the TV's.
    arrow.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
    fill.style.height = `${Math.round(power * 100)}%`;
    fireLabel.textContent = charging !== null ? `POWER ${Math.round(power * 100)}%` : 'HOLD TO CHARGE, LET GO TO FIRE';
  }

  function tick() {
    if (!canAim()) return;
    if (sensorsLive() && !pointing) angle = base + steer.angle();
    if (charging !== null) {
      const t = ((performance.now() - charging) % (CHARGE_MS * 2)) / CHARGE_MS;
      power = t <= 1 ? t : 2 - t;
    }
    show();
    const key = `${angle.toFixed(3)},${power.toFixed(2)}`;
    if (key === sent) return;
    sent = key;
    send({ type: 'aim', angle, power } satisfies GravityInput);
  }

  function setRunning(on: boolean) {
    if (on === !!timer) return;
    if (on) {
      steer.recentre();
      base = angle;
      sent = '';
      timer = setInterval(tick, SEND_MS / 2);
    } else {
      clearInterval(timer!);
      timer = null;
      charging = null;
    }
  }

  const pointAt = (e: PointerEvent) => {
    const r = dial.getBoundingClientRect();
    angle = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    base = angle;
    steer.recentre();
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

  fireEl.addEventListener('pointerdown', (e) => {
    if (!canAim()) return;
    e.preventDefault();
    charging = performance.now();
    power = 0;
  });
  const release = () => {
    if (charging === null) return;
    charging = null;
    if (!canAim()) return;
    navigator.vibrate?.(40);
    send({ type: 'fire', angle, power } satisfies GravityInput);
    show();
  };
  fireEl.addEventListener('pointerup', release);
  fireEl.addEventListener('pointercancel', release);
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
    hintEl.textContent = `Volley ${v.volley} of ${v.totalVolleys}. ${sensorsLive() ? 'Turn your phone to aim, or point at the dial.' : 'Point at the dial to aim.'} Shells curve round the planets!`;
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll get a tank next round.";
    else if (v.phase === 'aim') title = s && s.hp <= 0 ? 'Your tank is out. Watch the TV!' : `Fired! ${v.lockedCount} of ${v.playing} ready`;
    else if (v.phase === 'fly') title = 'Watch the TV!';
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Top of the round!' : 'Round over';
      lines.push(`${v.boardScore} damage dealt`);
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
    statsEl.textContent = s && v.phase !== 'gameEnd' && v.phase !== 'fly' ? `Armour ${s.hp}% · ${s.dealt} damage dealt` : '';
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
      const next = raw as GravityPlayerView;
      if (next.state && (next.volley !== view?.volley || next.puzzleNumber !== view?.puzzleNumber)) angle = base = next.state.aim.angle;
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
