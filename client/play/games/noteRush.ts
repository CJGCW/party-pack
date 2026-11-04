import { LANES, LEAD_MS, chartFor, type Hit, type Note, type NoteInput, type NotePlayerView } from '../../../shared/games/noteRush';
import { serverNow } from '../../clock';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const LANE_COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2'];
const WORDS: Record<Hit, string> = { perfect: 'PERFECT', good: 'GOOD', ok: 'OK', miss: 'MISS', stray: 'MISS' };

/** The notes coming down (on the server's clock) over four lane pads: tap a lane as its note reaches the line. */
export function createNoteRush(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: NotePlayerView | null = null;
  let phaseEndsAt = 0;
  let chart: Note[] = [];
  let chartKey = '';
  /** Notes this phone has tapped (by index), so it can stop drawing them straight away. */
  const tapped = new Set<number>();
  let frame = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const judgeEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'nr-canvas' }) as HTMLCanvasElement;
  const pads = Array.from({ length: LANES }, (_, lane) => {
    const pad = h('div', { class: 'nr-pad' });
    pad.style.background = LANE_COLORS[lane];
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!view?.state || view.phase !== 'play' || !isPlaying(view)) return;
      const at = Math.round(serverNow());
      send({ type: 'tap', lane, at } satisfies NoteInput);
      // Hide the note it was surely meant for (the server says how it went).
      const t = at - view.state.epoch;
      const i = chart.findIndex((n, k) => n.lane === lane && !tapped.has(k) && Math.abs(n.at - t) <= 150);
      if (i >= 0) tapped.add(i);
      pad.classList.add('on');
      setTimeout(() => pad.classList.remove('on'), 90);
    });
    return pad;
  });
  const playEl = h('div', { class: 'nr-play' }, canvas, h('div', { class: 'nr-pads' }, ...pads));
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), judgeEl, playEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  function draw() {
    const s = view?.state;
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (!s || !w || !hgt) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const lane = w / LANES;
    const t = serverNow() - s.epoch;
    chart.forEach((n, i) => {
      if (tapped.has(i) || n.at < t - 150 || n.at > t + LEAD_MS) return;
      const y = hgt - ((n.at - t) / LEAD_MS) * hgt;
      ctx.fillStyle = LANE_COLORS[n.lane];
      ctx.globalAlpha = n.at < t ? 0.4 : 1;
      ctx.fillRect(n.lane * lane + 6, y - 10, lane - 12, 20);
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (view?.phase === 'play') draw();
    frame = requestAnimationFrame(loop);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    if (s) {
      const key = `${v.seed}|${s.round}`;
      if (key !== chartKey) {
        chartKey = key;
        chart = chartFor(v.seed, s.round);
        tapped.clear();
      }
      judgeEl.textContent = `${s.points} · combo ${s.combo}${s.judged ? ` · ${WORDS[s.judged]}` : ''}`;
      judgeEl.classList.toggle('bad', s.judged === 'stray' || s.judged === 'miss');
    }
    const playing = isPlaying(v);
    playEl.hidden = !playing;
    infoEl.hidden = playing;
    const info = boardsInfo(v, 'best', { score: (o) => `${o.boardScore} points` });
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
      view = raw as NotePlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
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
