import { windEnergy, type WindInput, type WindPlayerView } from '../../../shared/games/windUp';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** What's been wound goes to the server this often. */
const SEND_MS = 100;

/** Circle a finger round the key to wind your toy up; faster circles store more. */
export function createWindUp(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: WindPlayerView | null = null;
  let phaseEndsAt = 0;
  let energy = 0;
  let last: { angle: number; t: number } | null = null;
  let turned = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sent = -1;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const keyEl = h('div', { class: 'wu-key' });
  const ring = h('div', { class: 'wu-ring' }, keyEl);
  const meterFill = h('div', { class: 'wu-fill' });
  const meter = h('div', { class: 'wu-meter' }, meterFill);
  const hintEl = h('div', { class: 'pd-hint' }, 'Circle your finger round and round the key. Faster stores more!');
  const windEl = h('div', { class: 'pd-aim' }, ring, meter, hintEl);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), windEl, infoEl));

  const winding = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked;

  const angleOf = (e: PointerEvent) => {
    const r = ring.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  ring.addEventListener('pointerdown', (e) => {
    if (!winding()) return;
    e.preventDefault();
    last = { angle: angleOf(e), t: e.timeStamp };
    try {
      ring.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
  });
  ring.addEventListener('pointermove', (e) => {
    if (!last || !winding()) return;
    const a = angleOf(e);
    // The short way round from the last point.
    const d = Math.atan2(Math.sin(a - last.angle), Math.cos(a - last.angle));
    const dt = Math.max(1, e.timeStamp - last.t) / 1000;
    energy += windEnergy(d, Math.abs(d) / dt);
    turned += d;
    keyEl.style.transform = `rotate(${turned}rad)`;
    meterFill.style.width = `${Math.min(100, energy / 8)}%`;
    if (Math.floor(energy / 40) !== Math.floor((energy - windEnergy(d, Math.abs(d) / dt)) / 40)) navigator.vibrate?.(5);
    last = { angle: a, t: e.timeStamp };
  });
  const stop = () => (last = null);
  ring.addEventListener('pointerup', stop);
  ring.addEventListener('pointercancel', stop);

  function sendEnergy() {
    if (!winding() || Math.round(energy) === sent) return;
    sent = Math.round(energy);
    send({ type: 'aim', energy: sent } satisfies WindInput);
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const on = winding();
    if (on && !timer) {
      energy = 0;
      sent = -1;
      timer = setInterval(sendEnergy, SEND_MS);
    } else if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
    windEl.hidden = !on;
    infoEl.hidden = on;
    const lines: string[] = [];
    let title = '';
    if (!v.hasBoard) title = "You'll get a toy next round.";
    else if (v.phase === 'fly') title = 'Watch them walk!';
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Farthest walk!' : 'Round over';
      lines.push(`${v.state?.distance ?? 0} m`);
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else if (v.phase === 'gameEnd') {
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
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 3);
  }
  const interval = setInterval(clock, 200);

  return {
    update(raw) {
      view = raw as WindPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      if (timer) clearInterval(timer);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
