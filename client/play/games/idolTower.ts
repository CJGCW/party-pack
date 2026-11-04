import { BOARD_H, BOARD_W, TOP, towerAt, type BlockView, type TowerInput, type TowerPlayerView } from '../../../shared/games/idolTower';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const COLORS: Record<BlockView['kind'], string> = { wood: '#c8934f', stone: '#7d7896', idol: '#ffd166' };

/** Draws a tower in board pixels (the caller scales). */
function drawTower(ctx: CanvasRenderingContext2D, blocks: BlockView[]) {
  ctx.fillStyle = '#5ec8f2';
  ctx.fillRect(0, TOP, BOARD_W, BOARD_H - TOP);
  ctx.fillStyle = '#4cae5c';
  ctx.fillRect(0, BOARD_H - 6, BOARD_W, 6);
  for (const b of blocks) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.fillStyle = '#140f2e';
    ctx.fillRect(-b.hw - 2, -b.hh - 2, b.hw * 2 + 4, b.hh * 2 + 4);
    ctx.fillStyle = COLORS[b.kind];
    ctx.fillRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
    if (b.kind === 'idol') {
      ctx.fillStyle = '#140f2e';
      ctx.fillRect(-b.hw * 0.5, -b.hh * 0.35, b.hw * 0.3, b.hh * 0.2);
      ctx.fillRect(b.hw * 0.2, -b.hh * 0.35, b.hw * 0.3, b.hh * 0.2);
      ctx.fillRect(-b.hw * 0.4, b.hh * 0.15, b.hw * 0.8, b.hh * 0.12);
    } else if (b.kind === 'wood') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(-b.hw, -b.hh * 0.2, b.hw * 2, b.hh * 0.15);
    }
    ctx.restore();
  }
}

/** Your tower: tap a wooden block to knock it out. The server settles the tower and sends back how it moved. */
export function createIdolTower(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TowerPlayerView | null = null;
  let phaseEndsAt = 0;
  let moveId = -1;
  /** When the last tap's settling started playing (performance.now()), or null when it's done. */
  let playingFrom: number | null = null;
  let frame = 0;
  let scale = 1;
  /** Redraw on the next frame (otherwise only while a tap's settling plays). */
  let dirty = true;
  let size = '';
  /** Taps are locked till then (after the idol falls). */
  let lockedUntil = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  canvas.addEventListener('pointerdown', (e) => {
    const s = view?.state;
    if (!view || !s || view.phase !== 'play' || !isPlaying(view) || playingFrom !== null || lockedUntil) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / scale;
    const py = (e.clientY - r.top) / scale;
    // The block under the finger (in its own turned frame), a little forgiving round the edges.
    const hit = [...s.blocks].reverse().find((b) => {
      const c = Math.cos(-b.a);
      const sn = Math.sin(-b.a);
      const lx = (px - b.x) * c - (py - b.y) * sn;
      const ly = (px - b.x) * sn + (py - b.y) * c;
      return Math.abs(lx) <= b.hw + 6 && Math.abs(ly) <= b.hh + 6;
    });
    if (!hit) return;
    if (hit.kind !== 'wood') {
      navigator.vibrate?.([10, 30, 10]);
      msgEl.textContent = hit.kind === 'idol' ? "That's the idol: keep it safe!" : 'Stone blocks stay put.';
      return;
    }
    navigator.vibrate?.(15);
    send({ type: 'tap', id: hit.id } satisfies TowerInput);
  });

  function draw() {
    const s = view?.state;
    if (!s) return;
    const box = boardEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const key = `${box.width}x${box.height}x${dpr}`;
    if (key !== size) {
      size = key;
      scale = Math.min(box.width / BOARD_W, box.height / BOARD_H);
      canvas.width = Math.round(BOARD_W * scale * dpr);
      canvas.height = Math.round(BOARD_H * scale * dpr);
      canvas.style.width = `${Math.round(BOARD_W * scale)}px`;
      canvas.style.height = `${Math.round(BOARD_H * scale)}px`;
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    const seconds = playingFrom === null ? null : (performance.now() - playingFrom) / 1000;
    drawTower(ctx, towerAt(s, seconds));
    if (seconds !== null && s.shot && seconds * s.shot.fps >= s.shot.frames) playingFrom = null;
  }

  function loop() {
    if (dirty || playingFrom !== null) {
      dirty = false;
      draw();
    }
    if (lockedUntil && performance.now() >= lockedUntil) {
      lockedUntil = 0;
      render();
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
    boardEl.hidden = !s || v.phase === 'gameEnd' || (!playing && v.phase !== 'result');
    infoEl.hidden = playing;
    if (s) msgEl.textContent = s.fell && lockedUntil ? 'The idol fell! The tower resets…' : `${s.level}: ${s.removed} of ${s.removable} knocked out`;
    dirty = true;
    const info = boardsInfo(v, 'race', { score: (o) => `${o.boardScore} blocks` });
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
      const next = raw as TowerPlayerView;
      if (next.state && next.state.moveId !== moveId) {
        // A new tap's settling to play (not on a new round's tower).
        playingFrom = next.state.moveId > 0 && next.seed === view?.seed ? performance.now() : null;
        moveId = next.state.moveId;
      }
      view = next;
      lockedUntil = next.state?.lockedMs ? performance.now() + next.state.lockedMs : 0;
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
