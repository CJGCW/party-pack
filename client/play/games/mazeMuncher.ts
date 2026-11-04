import { LIVES, type Dir, type MuncherInput, type MuncherPlayerView } from '../../../shared/games/mazeMuncher';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const SWIPE_PX = 26;
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

/** A big pad: swipe the way you want to go next (it turns at the next opening). Arrow keys work too. */
export function createMazeMuncher(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: MuncherPlayerView | null = null;
  let phaseEndsAt = 0;
  let start: { x: number; y: number } | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const statsEl = h('div', { class: 'po-points' });
  const arrowEl = h('div', { class: 'rh-arrow' });
  const pad = h('div', { class: 'cf-pad rh-pad' }, arrowEl, h('div', { class: 'cf-pad-label' }, 'SWIPE TO STEER'));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), statsEl, pad, infoEl));

  function turn(dir: Dir) {
    if (!view || !isPlaying(view)) return;
    navigator.vibrate?.(8);
    arrowEl.textContent = ARROWS[dir];
    send({ type: 'turn', dir } satisfies MuncherInput);
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
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    start = { x: e.clientX, y: e.clientY };
  });
  const end = () => (start = null);
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  const onKey = (e: KeyboardEvent) => {
    const dir = KEY_DIRS[e.code];
    if (!dir) return;
    e.preventDefault();
    turn(dir);
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
    if (s) statsEl.textContent = `${v.boardScore} · ${'♥'.repeat(s.lives)}${'♡'.repeat(Math.max(0, LIVES - s.lives))}${s.scaredMs ? ' · GHOSTS SCARED!' : ''}`;
    const info = boardsInfo(v, 'best', { ended: () => 'Out of lives!', score: (o) => `${o.boardScore} points` });
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
      view = raw as MuncherPlayerView;
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
