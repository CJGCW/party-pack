import {
  PLAY_GRACE_MS,
  findMicrogame,
  type MicrogameId,
  type WoochaInput,
  type WoochaPlayerView,
} from '../../../shared/games/woochaware';
import { h } from '../dom';
import type { Controller } from '../main';
import { MicroRunner } from '../woochaware/engine';
import { MICROGAME_IMPLS } from '../woochaware/index';

/** Don't bother starting a microgame with less than this left (e.g. after reconnecting). */
const MIN_PLAY_MS = 400;

export function createWoochaWare(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: WoochaPlayerView | null = null;
  /** The microgame loaded into the runner, and whether it has started. */
  let loadedKey = '';
  let started = false;
  /** This microgame's result as decided on this phone. */
  let localResult: boolean | null = null;

  const headerEl = h('span');
  const levelEl = h('span', { class: 'ww-level' });
  const scoreEl = h('span');
  const fuseFill = h('div', { class: 'ww-fuse-fill' });
  const fuse = h('div', { class: 'ww-fuse' }, fuseFill);
  const bigEl = h('div', { class: 'ww-big' });
  const subEl = h('div', { class: 'ww-sub' });
  const overlay = h('div', { class: 'ww-overlay' }, bigEl, subEl);
  const banner = h('div', { class: 'ww-banner' });

  const runner = new MicroRunner((won) => {
    localResult = won;
    if (view) send({ type: 'result', round: view.round, won } satisfies WoochaInput);
    render();
  });

  root.append(
    h(
      'div',
      { class: 'ww' },
      h('div', { class: 'wr-top' }, headerEl, levelEl, scoreEl),
      fuse,
      h('div', { class: 'ww-stage' }, h('div', { class: 'ww-screen' }, runner.canvas, overlay, banner)),
    ),
  );

  function keyOf(v: WoochaPlayerView) {
    return `${v.round}|${v.microgameId}|${v.seed}`;
  }

  /** Loads (and, during play, starts) this view's microgame if it isn't already. */
  function syncRunner(v: WoochaPlayerView) {
    const impl = MICROGAME_IMPLS[v.microgameId as MicrogameId];
    if (!impl || (v.phase !== 'intro' && v.phase !== 'play')) return;
    if (keyOf(v) !== loadedKey) {
      loadedKey = keyOf(v);
      started = false;
      localResult = null;
      runner.load(impl, v.level, v.durationMs, v.seed);
    }
    if (v.phase === 'play' && !started) {
      const playMs = Math.min(v.durationMs, v.msLeft - PLAY_GRACE_MS);
      // Joined too late to play this one: it counts as missed.
      if (playMs >= MIN_PLAY_MS && v.myResult === null) {
        started = true;
        runner.start(playMs);
      }
    }
  }

  function setOverlay(big: string, sub = '', kind: '' | 'good' | 'bad' | 'command' = '') {
    overlay.hidden = !big;
    overlay.className = `ww-overlay ${kind}`;
    bigEl.textContent = big;
    subEl.textContent = sub;
  }

  function setBanner(text: string, kind: '' | 'good' | 'bad' = '') {
    banner.hidden = !text;
    banner.className = `ww-banner ${kind}`;
    banner.textContent = text;
  }

  function render() {
    if (!view) return;
    const info = findMicrogame(view.microgameId);
    headerEl.textContent = view.practice ? 'PRACTICE' : `${view.round + 1}/${view.totalRounds}`;
    levelEl.textContent = view.practice ? `Level ${view.level}/3` : `Speed ${view.level}`;
    scoreEl.textContent = view.practice ? info?.name ?? '' : `${view.score.toLocaleString()} pts`;
    // Our own result counts until the server has it.
    const result = view.myResult ?? localResult;
    fuse.style.visibility = view.phase === 'play' && started && result === null ? 'visible' : 'hidden';
    runner.canvas.style.visibility = view.phase === 'stageEnd' || view.phase === 'gameEnd' ? 'hidden' : 'visible';
    setBanner('');

    switch (view.phase) {
      case 'intro':
        setOverlay(info?.command ?? '', view.speedUp ? 'SPEED UP!' : info?.name ?? '', 'command');
        break;
      case 'play':
        if (!started && result === null) setOverlay('Wait for the next one…');
        else {
          setOverlay('');
          if (result === true) setBanner('NICE!', 'good');
          else if (result === false) setBanner('MISSED!', 'bad');
        }
        break;
      case 'result':
        setOverlay('');
        setBanner(result ? 'NICE!' : 'MISSED!', result ? 'good' : 'bad');
        break;
      case 'stageEnd':
        setOverlay(`${view.stageWins}/${view.perStage}`, `Stage ${view.stage} done`, view.stageWins > 0 ? 'good' : 'bad');
        break;
      case 'gameEnd':
        setOverlay(`+${view.gamePoints.toLocaleString()}`, 'This round. Look at the TV!', 'good');
        break;
    }
  }

  function tick() {
    fuseFill.style.width = `${runner.timeLeft() * 100}%`;
    fuseFill.classList.toggle('low', runner.timeLeft() < 0.3);
  }
  const interval = setInterval(tick, 50);

  return {
    update(raw) {
      view = raw as WoochaPlayerView;
      syncRunner(view);
      render();
    },
    destroy() {
      clearInterval(interval);
      runner.destroy();
      root.replaceChildren();
    },
  };
}
