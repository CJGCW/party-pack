import type { CaveInput, CavePlayerView } from '../../../shared/games/caveFlyer';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/**
 * A big pad: hold it to climb, let go to drop (the space bar works too). Watch your copter on
 * the TV.
 */
export function createCaveFlyer(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: CavePlayerView | null = null;
  let phaseEndsAt = 0;
  let holding = false;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const padLabel = h('div', { class: 'cf-pad-label' }, 'HOLD TO CLIMB');
  const pad = h('div', { class: 'cf-pad' }, padLabel);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd cf' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pad, infoEl, statsEl));

  function hold(down: boolean) {
    if (down === holding) return;
    holding = down;
    pad.classList.toggle('on', down);
    padLabel.textContent = down ? 'CLIMBING' : 'HOLD TO CLIMB';
    if (down) navigator.vibrate?.(8);
    send({ type: 'hold', down } satisfies CaveInput);
  }

  pad.addEventListener('pointerdown', (e) => {
    if (!view || !isPlaying(view)) return;
    e.preventDefault();
    // Keep getting the finger's events if it slides off the pad (never mind if that can't be done).
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      // Let go is still caught by pointerup.
    }
    hold(true);
  });
  const release = () => hold(false);
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  pad.addEventListener('lostpointercapture', release);
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !view || !isPlaying(view)) return;
    e.preventDefault();
    hold(e.type === 'keydown');
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    if (!playing) hold(false);
    pad.hidden = !playing;
    infoEl.hidden = playing;
    const info = boardsInfo(v, 'survival', { ended: (o) => (o.endedAtMs !== null ? `Crashed at ${Math.floor(o.endedAtMs / 1000)}s` : '') });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    statsEl.textContent = !v.state || v.phase === 'gameEnd' ? '' : `${v.state.distance} m flown · ${v.going} of ${v.playing} still flying`;
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
      view = raw as CavePlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      root.replaceChildren();
    },
  };
}
