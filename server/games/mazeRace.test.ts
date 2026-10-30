import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { DIRS, distancesTo, shortestPath, slide, step, type Dir, type Maze, type MazeHostView, type MazePlayerView } from '../../shared/games/mazeRace';
import type { PlayerInfo } from '../../shared/protocol';
import type { GameContext, MiniGame } from './MiniGame';
import { mazeRace } from './mazeRace';
import { generateMaze } from './mazeRace/generate';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

/** The steps along the shortest way through. */
function solve(maze: Maze, from = maze.start): Dir[] {
  const path = shortestPath(maze, from);
  return path.slice(1).map((cell, i) => DIRS.find((d) => step(maze, path[i], d) === cell)!);
}

function play(players: number) {
  const room: PlayerInfo[] = Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#ffffff', score: 0, connected: true, isVip: i === 0 }));
  const views = new Map<string, MazePlayerView>();
  let host = {} as MazeHostView;
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (host = v as MazeHostView),
    sendPlayer: (id, v) => views.set(id, v as MazePlayerView),
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => {},
    showingQuestion: () => {},
  };
  const game = mazeRace.create(ctx, 'standard', { puzzles: 2 });
  running.push(game);
  game.start();
  return { game, view: (id: string) => views.get(id)!, host: () => host, room };
}

describe('Maze Race', () => {
  it('makes mazes where every cell can be reached, with walls matching on both sides', () => {
    for (let i = 0; i < 20; i++) {
      const maze = generateMaze();
      assert.ok(distancesTo(maze, maze.exit).every((d) => d >= 0));
      for (let c = 0; c < maze.open.length; c++) {
        for (const d of DIRS) {
          const next = step(maze, c, d);
          if (next < 0) continue;
          assert.ok(next < maze.open.length);
          assert.ok(DIRS.some((back) => step(maze, next, back) === c));
        }
      }
      assert.equal(shortestPath(maze).at(-1), maze.exit);
    }
  });

  it('slides straight along a corridor, stopping at the first turning or wall', () => {
    // A corridor along the top that bends down at the end, then back along the bottom:
    //   0 1 2 3
    //   4 5 6 7   (only 3→7 open below; 1→5 opens a side turning)
    const maze: Maze = { cols: 4, rows: 2, open: [2, 2 | 8 | 4, 2 | 8, 8 | 4, 0, 1, 2, 1 | 8], start: 0, exit: 4 };
    // Stops at 1, where there's a side turning.
    assert.deepEqual(slide(maze, 0, 'E'), { cells: [1], dirs: ['E'] });
    // Then on to the bend at 3, and doesn't follow it round.
    assert.deepEqual(slide(maze, 1, 'E').cells, [2, 3]);
    assert.deepEqual(slide(maze, 0, 'S').cells, []);
  });

  it('counts down, then checks every move; out-of-step moves are sent back', () => {
    const { game, view, host } = play(2);
    assert.equal(view('p0').phase, 'ready');
    assert.equal(view('p0').maze, null);
    mock.timers.tick(3_000);
    const maze = view('p0').maze!;
    assert.equal(host().phase, 'race');
    const way = solve(maze);
    game.onInput('p0', { type: 'move', seq: 1, from: maze.start, dirs: way.slice(0, 3) });
    mock.timers.tick(200);
    assert.ok(host().players[0].progress > 0);
    // Wrong starting cell: nothing moves, and the phone hears where it really is.
    game.onInput('p0', { type: 'move', seq: 2, from: maze.start, dirs: way.slice(3, 4) });
    assert.equal(view('p0').seq, 2);
    assert.equal(view('p0').pos, shortestPath(maze)[3]);
    // Into a wall: stops there.
    const blocked = DIRS.find((d) => step(maze, maze.start, d) < 0)!;
    game.onInput('p1', { type: 'move', seq: 1, from: maze.start, dirs: [blocked] });
    assert.equal(view('p1').pos, maze.start);
  });

  it('ranks who gets out first; anyone left scores for how close they got', () => {
    const { game, view, host, room } = play(3);
    mock.timers.tick(3_000);
    const maze = view('p0').maze!;
    const way = solve(maze);
    mock.timers.tick(10_000);
    game.onInput('p1', { type: 'move', seq: 1, from: maze.start, dirs: way });
    assert.equal(view('p1').place, 1);
    mock.timers.tick(20_000);
    game.onInput('p0', { type: 'move', seq: 1, from: maze.start, dirs: way });
    assert.equal(view('p0').place, 2);
    // Halfway along, then time runs out.
    game.onInput('p2', { type: 'move', seq: 1, from: maze.start, dirs: way.slice(0, Math.floor(way.length / 2)) });
    mock.timers.tick(60_000);
    assert.equal(host().phase, 'reveal');
    const [first, second, third] = [room[1].score, room[0].score, room[2].score];
    assert.ok(first > second && second > third && third > 0);
    assert.ok(third <= 300);
    assert.equal(host().players[1].trail!.at(-1), maze.exit);
  });

  it('reveals as soon as everyone is out or has given up', () => {
    const { game, view, host } = play(2);
    mock.timers.tick(3_000);
    const maze = view('p0').maze!;
    game.giveUp!('p1');
    assert.equal(host().phase, 'race');
    game.onInput('p0', { type: 'move', seq: 1, from: maze.start, dirs: solve(maze) });
    assert.equal(host().phase, 'reveal');
    assert.equal(host().players[1].points, 0);
    assert.equal(host().solution!.at(-1), maze.exit);
  });
});
