// The phone for a side-by-side boards game you steer (see ./steer and ./boards): a dial showing
// the steering, Recentre, the motion-permission button, and the boards' out/result screens.
// It sends { type: 'steer', angle } on a steady timer while the player's run is going.

import type { BoardsPlayerView, BoardsScoring } from '../../shared/boards';
import { boardsClock, boardsInfo, isPlaying } from './boards';
import { h } from './dom';
import type { Controller } from './main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from './motion';
import { Steer, type SteerOptions } from './steer';

/** Steering goes to the server at most this often, and only when it's changed this much. */
const SEND_MS = 33;
const SEND_RAD = 0.008;

export interface SteerPadOptions<P> extends SteerOptions {
  scoring: BoardsScoring;
  /** What to tell the player (with sensors, and without, when they drag on the dial instead). */
  hint: string;
  dragHint: string;
  /** The line under the controls while playing, and what to say about a board's score at the result ('best' games). */
  stats: (v: BoardsPlayerView<P>) => string;
  score?: (v: BoardsPlayerView<P>) => string;
  /** What to say when a run ends (e.g. "Crashed at 32s"). */
  ended?: (v: BoardsPlayerView<P>) => string;
  /** Big buttons under the dial, each sending its `input` the moment it's pressed (e.g. flap). */
  actions?: { label: string; input: unknown; release?: unknown }[];
  /** Colours for the ball in the middle of the dial and the next one (e.g. bubbles); else it's the player's colour. */
  balls?: (v: BoardsPlayerView<P>) => { current: string; next: string } | null;
}

export function createSteerPad<P>(root: HTMLElement, send: (input: unknown) => void, options: SteerPadOptions<P>): Controller {
  let view: BoardsPlayerView<P> | null = null;
  let phaseEndsAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sent = { angle: NaN, at: 0 };

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrow = h('div', { class: 'ss-arrow' });
  const currentEl = h('div', { class: 'ss-ball ss-current sp-hub' });
  const nextEl = h('div', { class: 'ss-ball ss-next' });
  nextEl.hidden = !options.balls;
  const dial = h('div', { class: 'ss-dial' }, arrow, currentEl, nextEl);
  const hintEl = h('div', { class: 'pd-hint' });
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on motion steering') as HTMLButtonElement;
  const recentreBtn = h('button', { class: 'secondary', type: 'button' }, 'Recentre') as HTMLButtonElement;
  const actionBtns = (options.actions ?? []).map((a) => {
    const btn = h('button', { class: 'sp-action', type: 'button' }, a.label) as HTMLButtonElement;
    // On press, not on click, so it lands the instant the finger does.
    let held = false;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!timer) return;
      held = true;
      send(a.input);
      navigator.vibrate?.(10);
    });
    // A button you hold (e.g. thrust) says when it's let go.
    if (a.release !== undefined) {
      const up = () => {
        if (!held) return;
        held = false;
        send(a.release);
      };
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) btn.addEventListener(ev, up);
    }
    return btn;
  });
  const controlsEl = h('div', { class: 'pd-aim' }, dial, h('div', { class: 'sp-actions' }, ...actionBtns), hintEl, permissionBtn, recentreBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), controlsEl, infoEl, statsEl));

  const steer = new Steer(dial, options);

  /** On a timer rather than the screen's refresh, so it keeps going even if the phone slows its screen down. */
  function readAndSend() {
    const angle = steer.angle();
    arrow.style.transform = `rotate(${angle}rad)`;
    const now = performance.now();
    if ((Number.isNaN(sent.angle) || Math.abs(angle - sent.angle) > SEND_RAD) && now - sent.at >= SEND_MS - 5) {
      sent = { angle, at: now };
      send({ type: 'steer', angle: Math.round(angle * 1000) / 1000 });
    }
  }

  function setRunning(on: boolean) {
    if (on === !!timer) return;
    if (on) {
      steer.recentre();
      sent = { angle: NaN, at: 0 };
      timer = setInterval(readAndSend, SEND_MS);
    } else {
      clearInterval(timer!);
      timer = null;
    }
  }

  recentreBtn.addEventListener('click', () => steer.recentre());

  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    setRunning(playing);
    controlsEl.hidden = !playing;
    infoEl.hidden = playing;
    permissionBtn.hidden = !needsMotionPermission();
    recentreBtn.hidden = !sensorsLive();
    hintEl.textContent = sensorsLive() ? options.hint : options.dragHint;
    const info = boardsInfo(v as BoardsPlayerView<unknown>, options.scoring, {
      ended: options.ended as ((v: BoardsPlayerView<unknown>) => string) | undefined,
      score: options.score as ((v: BoardsPlayerView<unknown>) => string) | undefined,
    });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    const balls = options.balls?.(v);
    currentEl.style.background = balls?.current ?? '';
    nextEl.style.background = balls?.next ?? '';
    statsEl.textContent = !v.state || v.phase === 'gameEnd' ? '' : options.stats(v);
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view as BoardsPlayerView<unknown>, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as BoardsPlayerView<P>;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      setRunning(false);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
