// The phone for an arena game you drive with a thumb stick (see ./boards): a stick area (drag
// anywhere in it, from wherever you put your thumb down) and a big button. It sends
// { type: 'stick', x, y } (each -1 to 1, 0,0 when let go) on a steady timer while the player's
// run is going, and the button's input the moment it's pressed. Arrow keys and space work too.

import type { BoardsPlayerView, BoardsScoring } from '../../shared/boards';
import { boardsClock, boardsInfo, isPlaying } from './boards';
import { h } from './dom';
import type { Controller } from './main';

const SEND_MS = 50;
/** A full push is this far from where the thumb went down; this little counts as nothing. */
const FULL_PX = 60;
const DEAD = 0.18;
const KEYS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export interface StickPadOptions<P> {
  scoring: BoardsScoring;
  hint: string;
  /** The big button: its label and what it sends (none for a game that's just the stick). */
  action?: { label: string; input: unknown };
  stats: (v: BoardsPlayerView<P>) => string;
  score?: (v: BoardsPlayerView<P>) => string;
  ended?: (v: BoardsPlayerView<P>) => string;
}

export function createStickPad<P>(root: HTMLElement, send: (input: unknown) => void, options: StickPadOptions<P>): Controller {
  let view: BoardsPlayerView<P> | null = null;
  let phaseEndsAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let touch: { id: number; x: number; y: number } | null = null;
  let stick = { x: 0, y: 0 };
  let sent = { x: NaN, y: NaN };
  const keys = new Set<string>();

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const knob = h('div', { class: 'stk-knob' });
  const base = h('div', { class: 'stk-base' }, knob);
  const area = h('div', { class: 'stk-area' }, base, h('div', { class: 'cf-pad-label' }, 'DRAG TO MOVE'));
  const actionBtn = h('button', { class: 'sp-action stk-action', type: 'button' }, options.action?.label ?? '') as HTMLButtonElement;
  actionBtn.hidden = !options.action;
  const hintEl = h('div', { class: 'pd-hint' }, options.hint);
  const controlsEl = h('div', { class: 'pd-aim' }, area, actionBtn, hintEl);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), controlsEl, infoEl, statsEl));

  /** Where the stick's pushed, as -1..1 each way (from the thumb, or the arrow keys). */
  function setStick(x: number, y: number) {
    const len = Math.hypot(x, y);
    stick = len < DEAD ? { x: 0, y: 0 } : len > 1 ? { x: x / len, y: y / len } : { x, y };
    knob.style.transform = `translate(${stick.x * 50}%, ${stick.y * 50}%)`;
  }

  area.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      area.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
  });
  area.addEventListener('pointermove', (e) => {
    if (touch?.id !== e.pointerId) return;
    setStick((e.clientX - touch.x) / FULL_PX, (e.clientY - touch.y) / FULL_PX);
  });
  const release = (e: PointerEvent) => {
    if (touch?.id !== e.pointerId) return;
    touch = null;
    setStick(0, 0);
  };
  area.addEventListener('pointerup', release);
  area.addEventListener('pointercancel', release);

  function act() {
    if (!timer || !options.action) return;
    send(options.action.input);
    navigator.vibrate?.(10);
  }
  actionBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    act();
  });

  function keysToStick() {
    let x = 0;
    let y = 0;
    for (const k of keys) [x, y] = [x + KEYS[k][0], y + KEYS[k][1]];
    setStick(x, y);
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) act();
    } else if (KEYS[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      keysToStick();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (keys.delete(e.code)) keysToStick();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  /** On a timer rather than the screen's refresh, so it keeps going even if the phone slows its screen down. */
  function sendStick() {
    const x = Math.round(stick.x * 100) / 100;
    const y = Math.round(stick.y * 100) / 100;
    if (x === sent.x && y === sent.y) return;
    sent = { x, y };
    send({ type: 'stick', x, y });
  }

  function setRunning(on: boolean) {
    if (on === !!timer) return;
    if (on) {
      sent = { x: NaN, y: NaN };
      timer = setInterval(sendStick, SEND_MS);
    } else {
      clearInterval(timer!);
      timer = null;
      touch = null;
      keys.clear();
      setStick(0, 0);
    }
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    setRunning(playing);
    controlsEl.hidden = !playing;
    infoEl.hidden = playing;
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
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      root.replaceChildren();
    },
  };
}
