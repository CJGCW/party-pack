import { E, N, S, W, slide, step, type Dir, type Maze, type MazeInput, type MazePlayerView } from '../../../shared/games/mazeRace';
import { h } from '../dom';
import type { Controller } from '../main';

/** How far the finger has to be past the middle of the dot's cell (in cells) to move it a cell that way. */
const FOLLOW_CELLS = 0.5;
/** How far ahead of the dot the finger can get (in cells) while it's held up by a wall. */
const HOLD_CELLS = 0.75;
/** Each step along, a sideways pull fades by this much, so a finger drifting sideways doesn't take the next turning. */
const SIDEWAYS_FADE = 0.6;
/** How long the dot takes over each cell as it moves. */
const STEP_MS = 20;
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };

function ordinal(n: number) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/**
 * The maze, filling the screen. Put a finger down anywhere and drag: the dot follows it, as far as
 * the finger moves, along the corridors (walls hold it up). To turn, drag toward the opening; you
 * can start before you get there. Arrow keys slide to the next turning. Moves happen on the phone
 * straight away and go to the server after, which checks them; if the two ever disagree, the
 * server's position wins.
 */
export function createMazeRace(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: MazePlayerView | null = null;
  let phaseEndsAt = 0;
  let mazeKey = '';
  let pos = 0;
  let trail: number[] = [];
  /** The last move message sent. */
  let sentSeq = 0;
  /** Cells the dot still has to slide through, and where it's drawn now (in cells). */
  let queue: number[] = [];
  let drawAt = { x: 0, y: 0 };
  let stepStarted = 0;
  let cell = 0;
  /** While a finger's down: where it was last, and where it's pulling the dot to (in cells). */
  let fingerX = 0;
  let fingerY = 0;
  let dragging = false;
  let aim = { x: 0, y: 0 };
  let frame = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const statusEl = h('div', { class: 'ra-status mz-status' });
  const canvas = h('canvas', { class: 'mz-canvas' }) as HTMLCanvasElement;
  const countdownEl = h('div', { class: 'mz-countdown' });
  const boardEl = h('div', { class: 'mz-board' }, canvas, countdownEl);
  root.append(h('div', { class: 'ra mz' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), statusEl, boardEl));
  const ctx = canvas.getContext('2d')!;

  const racing = () => !!view && view.phase === 'race' && !!view.maze && view.place === null && !view.gaveUp;
  const xy = (maze: Maze, c: number) => ({ x: c % maze.cols, y: Math.floor(c / maze.cols) });

  /** Arrow keys: slide to the next turning. */
  function move(dir: Dir) {
    if (!racing()) return;
    const { cells, dirs } = slide(view!.maze!, pos, dir);
    if (cells.length === 0) navigator.vibrate?.(15);
    else go(cells, dirs);
  }

  /** Moves the dot through these cells (the phone first, then the server). */
  function go(cells: number[], dirs: Dir[]) {
    const maze = view!.maze!;
    send({ type: 'move', seq: ++sentSeq, from: pos, dirs } satisfies MazeInput);
    if (queue.length === 0) stepStarted = performance.now();
    queue.push(...cells);
    trail.push(...cells);
    pos = cells[cells.length - 1];
    if (pos === maze.exit) navigator.vibrate?.([30, 40, 60]);
    render();
  }

  /** Steps the dot toward where the finger's pulling it, as far as the walls let it. */
  function follow() {
    const maze = view!.maze!;
    const cells: number[] = [];
    const dirs: Dir[] = [];
    let at = pos;
    for (let guard = 0; guard < maze.open.length && at !== maze.exit; guard++) {
      const c = xy(maze, at);
      const dx = aim.x - (c.x + 0.5);
      const dy = aim.y - (c.y + 0.5);
      const across: Dir = dx > 0 ? 'E' : 'W';
      const down: Dir = dy > 0 ? 'S' : 'N';
      const pull: Record<Dir, number> = { E: dx, W: -dx, S: dy, N: -dy };
      // The stronger pull first; the other only if that way's blocked (so turnings are taken as they come).
      const tries = Math.abs(dx) >= Math.abs(dy) ? [across, down] : [down, across];
      const dir = tries.find((d) => pull[d] >= FOLLOW_CELLS && step(maze, at, d) >= 0);
      if (!dir) break;
      at = step(maze, at, dir);
      cells.push(at);
      dirs.push(dir);
      // Moving along takes the edge off any sideways pull.
      const n = xy(maze, at);
      if (dir === 'E' || dir === 'W') aim.y = n.y + 0.5 + (aim.y - n.y - 0.5) * SIDEWAYS_FADE;
      else aim.x = n.x + 0.5 + (aim.x - n.x - 0.5) * SIDEWAYS_FADE;
    }
    if (cells.length) go(cells, dirs);
    // Held up by a wall: the finger can't get far ahead, so moving it back responds straight away.
    const c = xy(maze, pos);
    aim.x = Math.max(c.x + 0.5 - HOLD_CELLS, Math.min(c.x + 0.5 + HOLD_CELLS, aim.x));
    aim.y = Math.max(c.y + 0.5 - HOLD_CELLS, Math.min(c.y + 0.5 + HOLD_CELLS, aim.y));
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!racing()) return;
    canvas.setPointerCapture(e.pointerId);
    dragging = true;
    fingerX = e.clientX;
    fingerY = e.clientY;
    const c = xy(view!.maze!, pos);
    aim = { x: c.x + 0.5, y: c.y + 0.5 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !racing() || cell === 0) return;
    // The dot moves as far as the finger does.
    aim.x += (e.clientX - fingerX) / cell;
    aim.y += (e.clientY - fingerY) / cell;
    fingerX = e.clientX;
    fingerY = e.clientY;
    follow();
  });
  const endDrag = () => (dragging = false);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  const onKey = (e: KeyboardEvent) => {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  };
  window.addEventListener('keydown', onKey);

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `ra-status mz-status ${kind}`;
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Maze ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    countdownEl.hidden = v.phase !== 'ready';
    canvas.hidden = !v.maze;

    const out = v.finished === 1 ? '1 player is out' : `${v.finished} players are out`;
    if (v.phase === 'ready') setStatus('Get ready! Put a finger down anywhere and drag: the dot follows.');
    else if (v.phase === 'race') {
      if (v.place !== null) setStatus(`You're out in ${ordinal(v.place)} place! Waiting for everyone else…`, 'good');
      else if (pos === v.maze?.exit) setStatus("You're out!", 'good');
      else setStatus(v.finished ? `${out}. Keep going!` : 'Drag anywhere: the dot follows your finger.');
    } else if (v.phase === 'reveal') {
      if (v.place !== null) setStatus(`${ordinal(v.place)} place in ${(v.finishMs! / 1000).toFixed(1)}s: +${v.points}. The yellow line is the shortest way.`, 'good');
      else setStatus(v.points ? `Out of time. +${v.points} for getting close. The yellow line is the shortest way.` : 'No points this time. The yellow line is the shortest way.', v.points ? '' : 'bad');
    } else setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
  }

  /** Sizes the canvas to fit the space it has, keeping cells square. */
  function fit(maze: Maze) {
    const box = boardEl.getBoundingClientRect();
    cell = Math.max(4, Math.floor(Math.min(box.width / maze.cols, box.height / maze.rows)));
    const w = cell * maze.cols;
    const hgt = cell * maze.rows;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${hgt}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function polyline(maze: Maze, cells: number[], upTo?: { x: number; y: number }) {
    ctx.beginPath();
    cells.forEach((c, i) => {
      const p = xy(maze, c);
      const x = (p.x + 0.5) * cell;
      const y = (p.y + 0.5) * cell;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (upTo) ctx.lineTo((upTo.x + 0.5) * cell, (upTo.y + 0.5) * cell);
    ctx.stroke();
  }

  function draw(now: number) {
    frame = requestAnimationFrame(draw);
    tick();
    const v = view;
    const maze = v?.maze;
    if (!v || !maze) return;
    fit(maze);
    const w = cell * maze.cols;
    const hgt = cell * maze.rows;
    ctx.clearRect(0, 0, w, hgt);
    ctx.fillStyle = '#241d55';
    ctx.fillRect(0, 0, w, hgt);

    // The exit.
    const exit = xy(maze, maze.exit);
    ctx.fillStyle = '#4caf6a';
    ctx.fillRect(exit.x * cell, exit.y * cell, cell, cell);

    // Slide the dot along the cells it's still to pass through (faster if it's falling behind).
    const stepMs = () => STEP_MS / Math.max(1, queue.length / 8);
    while (queue.length && now - stepStarted >= stepMs()) {
      stepStarted += stepMs();
      drawAt = xy(maze, queue.shift()!);
    }
    if (!queue.length) stepStarted = now;
    let dot = drawAt;
    if (queue.length) {
      const next = xy(maze, queue[0]);
      const t = Math.min(1, (now - stepStarted) / stepMs());
      dot = { x: drawAt.x + (next.x - drawAt.x) * t, y: drawAt.y + (next.y - drawAt.y) * t };
    }

    // Where they've been, up to the dot.
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(94, 200, 242, 0.45)';
    ctx.lineWidth = cell * 0.3;
    polyline(maze, trail.slice(0, trail.length - queue.length), dot);

    if (v.solution) {
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
      ctx.lineWidth = cell * 0.18;
      polyline(maze, v.solution);
    }

    // The walls.
    ctx.strokeStyle = '#b8b0e8';
    ctx.lineWidth = Math.max(2, cell * 0.12);
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let c = 0; c < maze.open.length; c++) {
      const { x, y } = xy(maze, c);
      const o = maze.open[c];
      const x0 = x * cell;
      const y0 = y * cell;
      if (!(o & N)) (ctx.moveTo(x0, y0), ctx.lineTo(x0 + cell, y0));
      if (!(o & W)) (ctx.moveTo(x0, y0), ctx.lineTo(x0, y0 + cell));
      if (!(o & E) && x === maze.cols - 1) (ctx.moveTo(x0 + cell, y0), ctx.lineTo(x0 + cell, y0 + cell));
      if (!(o & S) && y === maze.rows - 1) (ctx.moveTo(x0, y0 + cell), ctx.lineTo(x0 + cell, y0 + cell));
    }
    ctx.stroke();

    // The dot.
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc((dot.x + 0.5) * cell, (dot.y + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  frame = requestAnimationFrame(draw);

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    countdownEl.textContent = view.phase === 'ready' ? String(Math.max(1, secs)) : '';
    const timed = racing();
    timerEl.textContent = timed ? `${secs}s` : '';
    timerEl.classList.toggle('low', timed && secs <= 10);
  }

  return {
    update(raw) {
      view = raw as MazePlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      const key = `${view.puzzleNumber}|${view.maze ? view.maze.open.join('') : ''}`;
      if (key !== mazeKey) {
        // A new maze: start from where the server has us.
        mazeKey = key;
        sentSeq = view.seq;
        queue = [];
      }
      // Take the server's word for where we are once it's caught up with every move sent.
      if (view.seq === sentSeq && (view.pos !== pos || view.trail.length !== trail.length)) {
        pos = view.pos;
        trail = [...view.trail];
        queue = [];
        if (view.maze) drawAt = xy(view.maze, pos);
      }
      render();
      tick();
    },
    destroy() {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
