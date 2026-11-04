import { HEARTS, type RockInput, type RockPlayerView } from '../../../shared/games/rockSolid';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** Hold the pad to turn to stone; let go to get your energy back. Watch the TV for rocks. */
export function createRockSolid(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: RockPlayerView | null = null;
  let phaseEndsAt = 0;
  let down = false;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const heartsEl = h('div', { class: 'po-points' });
  const label = h('div', { class: 'cf-pad-label' }, 'HOLD TO HARDEN');
  const fill = h('div', { class: 'cc-fill rs-energy' });
  const pad = h('div', { class: 'cc-pull rs-pad' }, fill, label);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), heartsEl, pad, infoEl));

  const set = (on: boolean) => {
    if (on === down) return;
    down = on;
    pad.classList.toggle('on', on);
    if (on) navigator.vibrate?.(10);
    send({ type: 'hold', down: on } satisfies RockInput);
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (view && isPlaying(view)) set(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) pad.addEventListener(ev, () => set(false));

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    if (!playing) set(false);
    pad.hidden = !playing;
    infoEl.hidden = playing;
    if (s) {
      heartsEl.textContent = `${'♥'.repeat(s.hearts)}${'♡'.repeat(Math.max(0, HEARTS - s.hearts))} · ${s.blocked} bounced`;
      fill.style.height = `${Math.round(s.energy * 100)}%`;
      label.textContent = s.hard ? 'STONE!' : s.energy < 0.05 ? 'OUT OF ENERGY: LET GO' : 'HOLD TO HARDEN';
    }
    const info = boardsInfo(v, 'survival', { ended: (o) => (o.endedAtMs !== null ? `Squashed at ${Math.floor(o.endedAtMs / 1000)}s` : '') });
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
      view = raw as RockPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
