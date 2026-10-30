import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { GiveUpView, PlayerInfo } from '../../shared/protocol';
import { blockbusters } from './blockbusters';
import { clueCrew } from './clueCrew';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { pickEm, pickEmCoop } from './pickEm';
import { rackAttack } from './rackAttack';
import { tossUp } from './tossUp';
import { trivia, triviaQuest } from './trivia';

/** A game running in a pretend room, keeping the latest view each player was sent. */
function play(def: MiniGameDefinition, players: number, modeId = def.info.modes[0].id) {
  const room: PlayerInfo[] = Array.from({ length: players }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    color: '#ffffff',
    score: 0,
    connected: true,
    isVip: i === 0,
  }));
  const views = new Map<string, Record<string, unknown>>();
  let host: Record<string, unknown> = {};
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (host = v as Record<string, unknown>),
    sendPlayer: (id, v) => views.set(id, v as Record<string, unknown>),
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => {},
    showingQuestion: () => {},
  };
  const game = def.create(ctx, modeId, { puzzles: 2 });
  running.push(game);
  game.start();
  return {
    game,
    view: (id: string) => views.get(id) as Record<string, unknown> & GiveUpView,
    host: () => host,
  };
}

const running: MiniGame[] = [];
afterEach(() => running.splice(0).forEach((g) => g.dispose()));

describe('Giving up', () => {
  it('Letter Drop: out of the puzzle, and it ends once everyone is', () => {
    const { game, view } = play(tossUp, 2);
    assert.equal(view('p0').canGiveUp, true);
    game.giveUp!('p0');
    assert.equal(view('p0').lockedOut, true);
    assert.equal(view('p0').canGiveUp, false);
    game.giveUp!('p1');
    assert.equal(view('p1').phase, 'unsolved');
  });

  it('Trivia: no answer, and it reveals once everyone has answered or given up', () => {
    const { game, view } = play(trivia, 2);
    game.giveUp!('p0');
    assert.equal(view('p0').gaveUp, true);
    assert.equal(view('p0').canGiveUp, false);
    assert.equal(view('p1').phase, 'question');
    game.giveUp!('p1');
    assert.equal(view('p0').phase, 'reveal');
    assert.equal(view('p0').gaveUp, false);
    assert.equal(view('p0').questionPoints, 0);
  });

  it('Team Trivia: giving up costs a life, as a missed answer does', () => {
    const { game, view } = play(triviaQuest, 1);
    const lives = view('p0').lives as number;
    game.giveUp!('p0');
    assert.equal(view('p0').lives, lives - 1);
  });

  it("Pick 'Em: done with the list, scoring nothing on a tap list", () => {
    const { game, view } = play(pickEm, 2);
    game.giveUp!('p0');
    assert.equal(view('p0').gaveUp, true);
    game.giveUp!('p1');
    assert.equal(view('p0').phase, 'reveal');
    if (view('p0').kind === 'choice') assert.equal(view('p0').points, 0);
  });

  it("Team Pick 'Em: the list ends once everyone has given up", () => {
    const { game, view } = play(pickEmCoop, 2);
    game.giveUp!('p0');
    assert.equal(view('p0').gaveUp, true);
    assert.equal(view('p1').canGiveUp, true);
    game.giveUp!('p1');
    assert.equal(view('p0').phase, 'reveal');
  });

  it('Rack Attack: a pass', () => {
    const { game, view } = play(rackAttack, 2);
    game.giveUp!('p0');
    assert.equal(view('p0').gaveUp, true);
    assert.deepEqual(view('p0').submitted, { tiles: [], words: [], score: 0 });
    game.giveUp!('p1');
    assert.equal(view('p0').phase, 'reveal');
  });

  it('Blockbusters: a whole team giving up hands the question to the other team; both, and nobody gets it', () => {
    const { game, view } = play(blockbusters, 4);
    const team = (id: string) => view(id).myTeam as string;
    const control = view('p0').control as string;
    const picker = ['p0', 'p1', 'p2', 'p3'].find((id) => team(id) === control)!;
    game.onInput(picker, { type: 'pick', index: 0 });
    assert.equal(view('p0').phase, 'question');

    const [a1, a2] = ['p0', 'p1', 'p2', 'p3'].filter((id) => team(id) === control);
    game.giveUp!(a1);
    assert.equal(view(a1).gaveUp, true);
    // Sat out: can't buzz any more.
    game.onInput(a1, { type: 'buzz' });
    assert.equal(view(a1).phase, 'question');
    game.giveUp!(a2);
    assert.deepEqual(view(a1).lockedOut, [control]);

    const others = ['p0', 'p1', 'p2', 'p3'].filter((id) => team(id) !== control);
    others.forEach((id) => game.giveUp!(id));
    assert.equal(view('p0').phase, 'result');
    assert.equal(view('p0').correct, null);
  });

  it('Blockbusters: the buzzer giving up counts as a wrong answer', () => {
    const { game, view } = play(blockbusters, 2);
    const picker = ['p0', 'p1'].find((id) => view(id).myTeam === view(id).control)!;
    game.onInput(picker, { type: 'pick', index: 0 });
    game.onInput('p0', { type: 'buzz' });
    assert.equal(view('p0').canGiveUp, true);
    assert.equal(view('p1').canGiveUp, false);
    game.giveUp!('p0');
    assert.equal(view('p0').phase, 'result');
    assert.equal(view('p0').correct, false);
  });

  it('Clue Crew: only the clue-giver, and it moves on to the next turn', () => {
    const { game, view } = play(clueCrew, 3);
    const giver = ['p0', 'p1', 'p2'].find((id) => view(id).isGiver)!;
    const voter = ['p0', 'p1', 'p2'].find((id) => !view(id).isGiver)!;
    assert.equal(view(giver).canGiveUp, true);
    assert.equal(view(voter).canGiveUp, false);
    game.giveUp!(voter);
    assert.equal(view(giver).isGiver, true);
    game.giveUp!(giver);
    assert.equal(view(giver).isGiver, false);
    assert.equal(view(giver).phase, 'clue');
  });
});
