import type { Dir, RoadInput, RoadPlayerView } from '../../../shared/games/roadHop';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** A finger moving at least this far is a swipe; less is a tap (hop forward). */
const SWIPE_PX = 28;
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Space: 'up' };

/** A big pad: tap it to hop forward, swipe it to hop that way (arrow keys work too). Watch your hopper on the TV. */
export function createRoadHop(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: RoadPlayerView | null = null;
  let phaseEndsAt = 0;
  let start: { x: number; y: number } | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrowEl = h('div', { class: 'rh-arrow' }, '▲');
  const pad = h('div', { class: 'cf-pad rh-pad' }, arrowEl, h('div', { class: 'cf-pad-label' }, 'TAP TO HOP · SWIPE TO TURN'));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pad, infoEl, statsEl));

  function hop(dir: Dir) {
    if (!view || !isPlaying(view) || view.phase !== 'play') return;
    navigator.vibrate?.(8);
    arrowEl.textContent = { up: '▲', down: '▼', left: '◀', right: '▶' }[dir];
    pad.classList.remove('on');
    void pad.offsetWidth;
    pad.classList.add('on');
    send({ type: 'hop', dir } satisfies RoadInput);
  }

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
  });
  pad.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return hop('up');
    hop(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  pad.addEventListener('pointercancel', () => (start = null));
  const onKey = (e: KeyboardEvent) => {
    const dir = KEY_DIRS[e.code];
    if (!dir) return;
    e.preventDefault();
    hop(dir);
  };
  window.addEventListener('keydown', onKey);

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    pad.hidden = !playing;
    infoEl.hidden = playing;
    const info = boardsInfo(v, 'best', { score: (o) => `${o.boardScore} rows crossed` });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    statsEl.textContent = !v.state || v.phase === 'gameEnd' ? '' : `${v.state.best} rows crossed`;
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
      view = raw as RoadPlayerView;
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
