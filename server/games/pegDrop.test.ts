import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { BLUE_POINTS, CLEAR_CELEBRATION_MS, GOLD_POINTS, LAUNCHER, MAX_AIM, ballsPerPlayer, playbackSeconds, shotTimeAt, type Peg, type PegHostView, type PegPlayerView } from '../../shared/games/pegDrop';
import type { PlayerInfo } from '../../shared/protocol';
import type { GameContext, MiniGame } from './MiniGame';
import { pegDrop } from './pegDrop';
import { PATTERNS, makePegs } from './pegDrop/layouts';
import { simulateShot } from './pegDrop/physics';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

function play(players: number, boards = 1, modeId = 'auto') {
  const room: PlayerInfo[] = Array.from({ length: players }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    color: '#ffffff',
    score: 0,
    connected: true,
    isVip: i === 0,
  }));
  const views = new Map<string, PegPlayerView>();
  let host = {} as PegHostView;
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (host = v as PegHostView),
    sendPlayer: (id, v) => views.set(id, v as PegPlayerView),
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => {},
    showingQuestion: () => {},
  };
  const game = pegDrop.create(ctx, modeId, { puzzles: boards });
  running.push(game);
  game.start();
  return { game, view: (id: string) => views.get(id)!, host: () => host, room };
}

/** Fires for whoever's up, then plays the shot out. */
function shoot(g: ReturnType<typeof play>, angle = 0.3) {
  const shooter = g.host().shooterId;
  g.game.onInput(shooter, { type: 'fire', angle });
  const shot = g.host().shot!;
  mock.timers.tick(Math.ceil(playbackSeconds(shot) * 1000) + 1_500 + (shot.cleared ? CLEAR_CELEBRATION_MS : 0));
  return { shooter, shot };
}

const peg = (x: number, y: number, gold = false): Peg => ({ x, y, gold, gone: false });

describe('Peg Drop', () => {
  it('every layout makes a board with gold pegs and room between pegs', () => {
    for (const name of Object.keys(PATTERNS)) {
      const pegs = makePegs(name);
      assert.ok(pegs.length >= 40, `${name}: ${pegs.length} pegs`);
      assert.ok(pegs.filter((p) => p.gold).length >= 10, name);
    }
  });

  it('a shot is worked out the same way every time', () => {
    const pegs = makePegs('grid');
    assert.deepEqual(simulateShot(pegs, 0.4, 3), simulateShot(pegs, 0.4, 3));
  });

  it('pegs score when hit, gold ones more, and a ball always drops out', () => {
    const pegs = [peg(LAUNCHER.x, 400), peg(LAUNCHER.x + 40, 700, true)];
    const shot = simulateShot(pegs, 0, 0);
    assert.equal(shot.hits[0].peg, 0);
    assert.equal(shot.hits[0].points, BLUE_POINTS);
    assert.equal(shot.points, shot.hits.reduce((sum, h) => sum + h.points, 0));
    assert.ok(shot.endT > 0 && shot.endT < 25);
    // The only gold peg on the board: hitting it clears the board.
    const gold = simulateShot([peg(LAUNCHER.x, 400, true)], 0, 0);
    assert.equal(gold.cleared, true);
    // It plays back in slow motion around the clearing hit, and the timeline still lines up.
    assert.ok(playbackSeconds(gold) > gold.endT);
    assert.equal(shotTimeAt(gold, playbackSeconds(gold)).t.toFixed(6), gold.endT.toFixed(6));
    assert.equal(shotTimeAt(gold, gold.clearT!).slow, true);
    assert.ok(gold.points > GOLD_POINTS);
  });

  it('the bucket catches some shots', () => {
    const caught = Array.from({ length: 81 }, (_, i) => -MAX_AIM + (i * 2 * MAX_AIM) / 80).filter((a) => simulateShot([], a, 0).caught);
    assert.ok(caught.length > 0);
  });

  it("the bucket moves all the time, so when you fire decides whether it's under the ball", () => {
    const at = (catcherT: number) => simulateShot([], 0, 0, catcherT).caught;
    const outcomes = new Set(Array.from({ length: 45 }, (_, i) => at(i / 10)));
    assert.deepEqual([...outcomes].sort(), [false, true]);

    // Its clock runs on while aiming, and a shot carries on from where the last one left it.
    const g = play(2);
    const startT = g.host().catcherT;
    mock.timers.tick(2_000);
    g.game.onInput('p0', { type: 'aim', angle: 0.3 });
    assert.ok(Math.abs(g.host().catcherT - startT - 2) < 0.01);
    const { shot } = shoot(g);
    assert.ok(Math.abs(shot.catcherT - startT - 2) < 0.01);
    // After playback (shot.endT on the bucket's clock) and the 1.5s tail.
    assert.ok(Math.abs(g.host().catcherT - (shot.catcherT + shot.endT + 1.5)) < 0.01);
  });

  it('takes turns; only the shooter aims and fires, and the aim is kept on the board', () => {
    const g = play(2);
    assert.equal(g.host().shooterId, 'p0');
    assert.equal(g.view('p0').isShooter, true);
    assert.equal(g.view('p1').turnsAway, 1);
    g.game.onInput('p1', { type: 'fire', angle: 0 });
    assert.equal(g.host().phase, 'aim');
    g.game.onInput('p0', { type: 'aim', angle: 5 });
    assert.equal(g.host().angle, MAX_AIM);
    const { shot } = shoot(g);
    assert.equal(g.view('p0').ballsLeft, ballsPerPlayer(2) - (shot.caught ? 0 : 1));
    if (!shot.cleared) assert.equal(g.host().shooterId, 'p1');
  });

  it('gives each player the shots the VIP picked, or on Auto 12 shared out (at least 3 each)', () => {
    assert.equal(play(2, 1, '5').view('p0').ballsLeft, 5);
    assert.equal(play(2).view('p0').ballsLeft, 6);
    assert.equal(play(6).view('p0').ballsLeft, 3);
    assert.equal(ballsPerPlayer(4, '10'), 10);
  });

  it('fires by itself when time runs out', () => {
    const g = play(1);
    mock.timers.tick(20_000);
    assert.equal(g.host().phase, 'shot');
    assert.equal(g.host().shot!.angle, 0);
  });

  it('the board ends when the balls run out; the top scorer gets 1,000', () => {
    const g = play(2);
    for (let i = 0; i < 100 && g.host().phase !== 'boardEnd'; i++) shoot(g, -0.6 + (i % 7) * 0.2);
    assert.equal(g.host().phase, 'boardEnd');
    const players = g.host().players;
    const top = Math.max(...players.map((p) => p.boardPoints));
    for (const p of players) if (p.boardPoints === top && top > 0) assert.equal(p.points, 1000);
    if (g.host().goldLeft > 0) assert.ok(players.every((p) => p.ballsLeft === 0));
  });
});
