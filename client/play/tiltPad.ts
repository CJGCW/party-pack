// The phone for a game you play by tipping the phone (held flat like a tray; see ./steer): a level
// showing the tilt, "Level here", the motion-permission button, and the boards' out/result
// screens. It sends { type: 'tilt', x, y } (each -1 to 1) on a steady timer while the player's in.
// Without motion sensors, dragging on the level tips it instead.

import type { BoardsPlayerView, BoardsScoring } from '../../shared/boards';
import { boardsClock, boardsInfo, isPlaying } from './boards';
import { h } from './dom';
import type { Controller } from './main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from './motion';
import { Steer } from './steer';

/** Tilt goes to the server at most this often, and only when it's changed this much. */
const SEND_MS = 33;
const SEND_CHANGE = 0.02;

export interface TiltPadOptions<P> {
  scoring: BoardsScoring;
  /** What to tell the player (with sensors, and without, when they drag on the level instead). */
  hint: string;
  dragHint: string;
  stats: (v: BoardsPlayerView<P>) => string;
  score?: (v: BoardsPlayerView<P>) => string;
  ended?: (v: BoardsPlayerView<P>) => string;
}

export function createTiltPad<P>(root: HTMLElement, send: (input: unknown) => void, options: TiltPadOptions<P>): Controller {
  let view: BoardsPlayerView<P> | null = null;
  let phaseEndsAt = 0;
  let sent = { x: NaN, y: NaN, at: 0 };
  let timer: ReturnType<typeof setInterval> | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const bubble = h('div', { class: 'tt-bubble' });
  const level = h('div', { class: 'tt-level' }, h('div', { class: 'tt-ring' }), bubble);
  const hintEl = h('div', { class: 'pd-hint' });
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on tilt') as HTMLButtonElement;
  const recentreBtn = h('button', { class: 'secondary', type: 'button' }, 'Level here') as HTMLButtonElement;
  const controlsEl = h('div', { class: 'pd-aim' }, level, hintEl, permissionBtn, recentreBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd tt' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), controlsEl, infoEl, statsEl));

  const steer = new Steer(level);

  /** On a timer rather than the screen's refresh, so it keeps going even if the phone slows its screen down. */
  function readAndSend() {
    const tilt = steer.tilt();
    bubble.style.transform = `translate(${tilt.x * 40}vmin, ${tilt.y * 40}vmin)`;
    const now = performance.now();
    if ((Number.isNaN(sent.x) || Math.hypot(tilt.x - sent.x, tilt.y - sent.y) > SEND_CHANGE) && now - sent.at >= SEND_MS - 5) {
      sent = { ...tilt, at: now };
      send({ type: 'tilt', x: Math.round(tilt.x * 1000) / 1000, y: Math.round(tilt.y * 1000) / 1000 });
    }
  }

  function setRunning(on: boolean) {
    if (on === !!timer) return;
    if (on) {
      steer.recentre();
      sent = { x: NaN, y: NaN, at: 0 };
      timer = setInterval(readAndSend, SEND_MS);
    } else {
      clearInterval(timer!);
      timer = null;
      send({ type: 'tilt', x: 0, y: 0 });
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
