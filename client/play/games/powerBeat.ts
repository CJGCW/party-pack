import type { BeatInput, BeatPlayerView, Judgement } from '../../../shared/games/powerBeat';
import { serverNow } from '../../clock';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const WORDS: Record<Judgement, string> = { perfect: 'PERFECT!', good: 'GOOD', off: 'off beat', overload: 'OVERLOAD!' };

/** A big pad that pulses on the beat (on the server's clock): tap it in time. */
export function createPowerBeat(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: BeatPlayerView | null = null;
  let phaseEndsAt = 0;
  let frame = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const judgeEl = h('div', { class: 'po-points pb-judge' });
  const ringEl = h('div', { class: 'pb-ring' });
  const pad = h('div', { class: 'cf-pad pb-pad' }, ringEl, h('div', { class: 'cf-pad-label' }, 'TAP ON THE BEAT'));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), judgeEl, pad, infoEl));

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!view || view.phase !== 'play' || !isPlaying(view)) return;
    send({ type: 'tap', at: Math.round(serverNow()) } satisfies BeatInput);
  });

  /** Pulses the ring on each beat. */
  function loop() {
    const s = view?.state;
    if (s && view?.phase === 'play') {
      const since = (((serverNow() - s.epoch) % s.period) + s.period) % s.period;
      const pulse = Math.max(0, 1 - since / 220);
      ringEl.style.transform = `scale(${1 + 0.25 * pulse})`;
      ringEl.style.opacity = String(0.35 + 0.65 * pulse);
    }
    frame = requestAnimationFrame(loop);
  }

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
      judgeEl.textContent = `${s.power} kW${s.streak >= 4 ? ` · streak ${s.streak}` : ''}${s.judged ? ` · ${WORDS[s.judged]}` : ''}`;
      judgeEl.classList.toggle('bad', s.judged === 'overload' || s.judged === 'off');
      pad.classList.toggle('on', s.overloadMs > 0);
    }
    const info = boardsInfo(v, 'best', { score: (o) => `${o.boardScore} kW` });
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
  loop();

  return {
    update(raw) {
      view = raw as BeatPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      if (view.state?.judged === 'perfect') navigator.vibrate?.(15);
      render();
      tick();
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
