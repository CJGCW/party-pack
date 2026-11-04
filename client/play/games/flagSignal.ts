import type { Dir, FlagInput, FlagPlayerView } from '../../../shared/games/flagSignal';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** A finger moving at least this far is a swipe. */
const SWIPE_PX = 30;
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

/** A big pad: when it's your turn, swipe the signals back in order (arrow keys work too). */
export function createFlagSignal(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: FlagPlayerView | null = null;
  let phaseEndsAt = 0;
  let start: { x: number; y: number } | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrowEl = h('div', { class: 'rh-arrow' });
  const label = h('div', { class: 'cf-pad-label' });
  const pad = h('div', { class: 'cf-pad rh-pad' }, arrowEl, label);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pad, infoEl));

  function swipe(dir: Dir) {
    if (!view || !isPlaying(view) || view.state?.stage !== 'answer') return;
    navigator.vibrate?.(10);
    arrowEl.textContent = ARROWS[dir];
    send({ type: 'swipe', dir } satisfies FlagInput);
  }

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
  });
  pad.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    // One signal a swipe: lift the finger for the next.
    start = null;
    swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  const end = () => (start = null);
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  const onKey = (e: KeyboardEvent) => {
    const dir = KEY_DIRS[e.code];
    if (!dir) return;
    e.preventDefault();
    swipe(dir);
  };
  window.addEventListener('keydown', onKey);

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    pad.hidden = !playing;
    infoEl.hidden = playing;
    if (s) {
      const answering = s.stage === 'answer';
      pad.classList.toggle('on', answering && s.done < s.need);
      if (!answering) arrowEl.textContent = '';
      label.textContent = answering ? (s.done < s.need ? `SWIPE! ${s.need - s.done} to go` : 'DONE! WAIT…') : s.stage === 'show' ? 'WATCH THE TV!' : 'GET READY…';
    }
    const info = boardsInfo(v, 'survival', { ended: (o) => (o.endedAtMs === null ? '' : s?.wrong ? 'Wrong signal!' : 'Too slow!') });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
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
      view = raw as FlagPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
