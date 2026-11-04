import type { Dir, TrailsInput, TrailsPlayerView } from '../../../shared/games/lightTrails';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';
import { sensorsLive } from '../motion';
import { Steer } from '../steer';

/** A finger moving at least this far is a swipe. */
const SWIPE_PX = 24;
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
/** Steering: turning the phone this far (radians) turns the cycle; it has to come back to REARM before it'll turn again. */
const STEER_TURN = 0.45;
const STEER_REARM = 0.2;
const CLOCKWISE: Dir[] = ['up', 'right', 'down', 'left'];

/**
 * A big pad: swipe the way you want to turn (arrow keys work too). Keep your finger down and
 * swipe again for a quick second turn. With motion sensors, Steer turns the phone into the
 * handlebars: turn it right or left, like a wheel, and the cycle turns that way.
 */
export function createLightTrails(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TrailsPlayerView | null = null;
  let phaseEndsAt = 0;
  let start: { x: number; y: number } | null = null;
  let steering = false;
  let armed = true;
  /** Which way the cycle's heading, counting turns the server hasn't made yet. */
  let heading: Dir = 'up';
  let serverDir: Dir | null = null;
  const steer = new Steer(null);

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const arrowEl = h('div', { class: 'rh-arrow' });
  const pad = h('div', { class: 'cf-pad rh-pad' }, arrowEl, h('div', { class: 'cf-pad-label' }, 'SWIPE TO TURN'));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  const steerBtn = h('button', { type: 'button', class: 'secondary' }, 'Steer: off') as HTMLButtonElement;
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pad, steerBtn, infoEl, statsEl));

  function turn(dir: Dir) {
    if (!view || !isPlaying(view)) return;
    navigator.vibrate?.(8);
    arrowEl.textContent = ARROWS[dir];
    heading = dir;
    send({ type: 'turn', dir } satisfies TrailsInput);
  }

  steerBtn.addEventListener('click', () => {
    steering = !steering;
    armed = true;
    steer.recentre();
    steerBtn.textContent = `Steer: ${steering ? 'on' : 'off'}`;
  });

  function steerTick() {
    if (!steering || !view || !isPlaying(view)) return;
    const angle = steer.angle();
    if (armed && Math.abs(angle) > STEER_TURN) {
      armed = false;
      turn(CLOCKWISE[(CLOCKWISE.indexOf(heading) + (angle > 0 ? 1 : 3)) % 4]);
    } else if (Math.abs(angle) < STEER_REARM) armed = true;
  }
  const steerInterval = setInterval(steerTick, 50);

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
  });
  // Turning as soon as the finger's moved far enough; then from there, so a second swipe without lifting counts too.
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
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    pad.hidden = !playing;
    steerBtn.hidden = !playing || !sensorsLive();
    infoEl.hidden = playing;
    if (v.state) {
      arrowEl.textContent = ARROWS[v.state.dir];
      arrowEl.style.color = v.state.color;
      if (v.state.dir !== serverDir) heading = serverDir = v.state.dir;
    }
    const info = boardsInfo(v, 'survival', { ended: (o) => (o.endedAtMs !== null ? `Crashed at ${Math.floor(o.endedAtMs / 1000)}s` : '') });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    statsEl.textContent = !v.state || v.phase === 'gameEnd' ? '' : `${v.going} of ${v.playing} still riding`;
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
      view = raw as TrailsPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      clearInterval(steerInterval);
      window.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
