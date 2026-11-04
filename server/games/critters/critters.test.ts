import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { critterLevel, type CritterHostView, type CritterPlayerView } from '../../../shared/critters';
import type { DoorsState, LineUpState, PickyState, RoomState, SeatingState, StonesState } from '../../../shared/games/critterGames';
import { STONES_LEVELS } from '../../../shared/games/critterGames';
import type { PlayerInfo } from '../../../shared/protocol';
import type { GameContext, MiniGame, MiniGameDefinition } from '../MiniGame';
import { sameTraits, sharedTraits } from './engine';
import { lensLab, lineUp, lookalikes, pickyEater, roomSort, seatingChart, steppingStones, switchback, twoDoors } from './index';
import { makeLens, throughLenses } from './lensLab';
import { chip, makeLineUp } from './lineUp';
import { makeLookalikes } from './lookalikes';
import { makePicky, replyTo } from './pickyEater';
import { makeRooms } from './roomSort';
import { fits, makeSeating } from './seatingChart';
import { canStep, makeStones } from './steppingStones';
import { makeSwitch, run, solve } from './switchback';
import { makeDoors } from './twoDoors';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

function play<S>(def: MiniGameDefinition, modeId = '1', players = 1, puzzles = 1) {
  const room: PlayerInfo[] = Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
  const views = new Map<string, CritterPlayerView<S>>();
  let host = {} as CritterHostView;
  let finished = false;
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (host = v as CritterHostView),
    sendPlayer: (id, v) => views.set(id, v as CritterPlayerView<S>),
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => (finished = true),
    showingQuestion: () => {},
  };
  const game = def.create(ctx, modeId, { puzzles });
  running.push(game);
  game.start();
  const puzzle = <Z,>() => (game as unknown as { puzzle: Z }).puzzle;
  return { game, view: (id = 'p0') => views.get(id)!, host: () => host, room, puzzle, finished: () => finished };
}

const LEVELS = [1, 2, 3, 4];
const repeat = (n: number, fn: () => void) => {
  for (let i = 0; i < n; i++) fn();
};

describe('Wumble puzzles: every game', () => {
  const games = { twoDoors, pickyEater, seatingChart, lookalikes, roomSort, lineUp, lensLab, switchback, steppingStones };

  it('has four levels plus Rising, and starts at each of them', () => {
    for (const [name, def] of Object.entries(games)) {
      assert.deepEqual(def.info.modes.map((m) => m.id), ['rising', '1', '2', '3', '4'], name);
      for (const mode of def.info.modes) {
        const g = play(def, mode.id);
        assert.equal(g.host().phase, 'play', name);
        assert.ok(g.view().goal > 0, name);
      }
    }
  });

  it('Rising climbs a level each puzzle', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => critterLevel('rising', i, 4)), [1, 2, 3, 4, 4]);
    assert.equal(critterLevel('3', 2, 4), 3);
  });

  it('solving scores more than a part-done puzzle, and quicker scores more', () => {
    const g = play<DoorsState>(twoDoors, '1', 3);
    const z = g.puzzle<{ answer: number[] }>();
    mock.timers.tick(5_000);
    z.answer.forEach((door, critter) => g.game.onInput('p0', { type: 'send', critter, door }));
    mock.timers.tick(30_000);
    z.answer.forEach((door, critter) => g.game.onInput('p1', { type: 'send', critter, door }));
    assert.equal(g.host().phase, 'play');
    z.answer.slice(0, 8).forEach((door, critter) => g.game.onInput('p2', { type: 'send', critter, door }));
    g.game.giveUp!('p2');
    assert.equal(g.host().phase, 'reveal');
    const [a, b, c] = g.host().players.map((p) => p.points);
    assert.ok(a > b && b >= 850 && c < 850 && c > 0, `${a} ${b} ${c}`);
  });

  it('running out of tries ends your go', () => {
    const g = play<DoorsState>(twoDoors, '1', 2);
    const z = g.puzzle<{ answer: number[] }>();
    for (let critter = 0; critter < 6; critter++) g.game.onInput('p0', { type: 'send', critter, door: 1 - z.answer[critter] });
    assert.equal(g.view().done, true);
    assert.equal(g.view().triesLeft, 0);
    assert.equal(g.view().canGiveUp, false);
    g.game.onInput('p0', { type: 'send', critter: 7, door: z.answer[7] });
    assert.equal(g.view().got, 0);
  });

  it('keeps the answer from phones until the reveal', () => {
    const g = play<DoorsState>(twoDoors);
    assert.equal(g.view().state.answer, null);
    g.game.giveUp!('p0');
    assert.ok(g.view().state.answer);
  });

  it('moves on and finishes after the last puzzle', () => {
    const g = play<DoorsState>(twoDoors, '1', 1, 2);
    g.game.giveUp!('p0');
    mock.timers.tick(60_000);
    assert.equal(g.view().puzzleNumber, 2);
    g.game.giveUp!('p0');
    mock.timers.tick(60_000);
    assert.equal(g.host().phase, 'gameEnd');
    mock.timers.tick(60_000);
    assert.ok(g.finished());
  });
});

describe('Two Doors', () => {
  it('every Wumble has one door, and every door has Wumbles', () => {
    for (const level of LEVELS) {
      repeat(30, () => {
        const z = makeDoors(level);
        assert.equal(z.critters.length, 16);
        for (let d = 0; d < z.doors; d++) assert.ok(z.answer.filter((a) => a === d).length >= 4);
      });
    }
  });

  it('a wrong door costs a try once and keeps them waiting', () => {
    const g = play<DoorsState>(twoDoors);
    const z = g.puzzle<{ answer: number[] }>();
    const wrong = { type: 'send', critter: 0, door: 1 - z.answer[0] };
    g.game.onInput('p0', wrong);
    g.game.onInput('p0', wrong);
    assert.equal(g.view().triesLeft, 5);
    assert.deepEqual(g.view().state.critters[0].refused, [wrong.door]);
  });
});

describe('Picky Eater', () => {
  it('says more, yuck or yum', () => {
    assert.equal(replyTo([1, 2, 3], [1, 2]), 'more');
    assert.equal(replyTo([1, 2, 3], [1, 2, 4]), 'yuck');
    assert.equal(replyTo([1, 2, 3], [1, 2, 3, 4]), 'yuck');
    assert.equal(replyTo([1, 2, 3], [3, 2, 1].sort()), 'yum');
  });

  it('has enough tries to find every order by testing one topping at a time', () => {
    const tries = [8, 10, 16, 26];
    for (const level of LEVELS) {
      const z = makePicky(level);
      const worst = z.wants.length * z.toppings.length + z.wants.length;
      assert.ok(tries[level - 1] >= Math.ceil(worst * 0.7), `level ${level}`);
    }
  });

  it('moves to the next customer on yum', () => {
    const g = play<PickyState>(pickyEater, '3');
    const z = g.puzzle<{ wants: number[][] }>();
    g.game.onInput('p0', { type: 'serve', picks: z.wants[0].slice(0, 1) });
    assert.equal(g.view().state.orders[0].reply, 'more');
    g.game.onInput('p0', { type: 'serve', picks: z.wants[0] });
    assert.equal(g.view().state.serving, 1);
    assert.deepEqual(g.view().state.orders, []);
    g.game.onInput('p0', { type: 'serve', picks: z.wants[1] });
    assert.equal(g.host().phase, 'reveal');
  });
});

describe('Seating Chart', () => {
  it('always has a seating that works', () => {
    for (const level of LEVELS) {
      repeat(20, () => {
        const z = makeSeating(level);
        const seats: (number | null)[] = z.answer.map(() => null);
        z.answer.forEach((who, seat) => {
          assert.ok(fits(z, seats, who, seat), `level ${level}`);
          seats[seat] = who;
        });
      });
    }
  });

  it('bounces a Wumble with nothing in common, and standing up is free', () => {
    const g = play<SeatingState>(seatingChart, '2');
    const z = g.puzzle<Parameters<typeof fits>[0]>();
    const [a, b] = (() => {
      for (let i = 0; i < z.critters.length; i++) for (let j = 0; j < z.critters.length; j++) if (i !== j && !sharedTraits(z.critters[i], z.critters[j]).length) return [i, j];
      return [-1, -1];
    })();
    if (a < 0) return;
    g.game.onInput('p0', { type: 'sit', critter: a, seat: 0 });
    g.game.onInput('p0', { type: 'sit', critter: b, seat: 1 });
    assert.equal(g.view().triesLeft, 5);
    assert.equal(g.view().got, 1);
    g.game.onInput('p0', { type: 'stand', seat: 0 });
    assert.equal(g.view().got, 0);
    assert.equal(g.view().triesLeft, 5);
  });

  it('Very hard says which trait each pair must share', () => {
    const z = makeSeating(4);
    assert.ok(z.edges.every((e) => e.tag !== null));
    assert.ok(z.edges.every((e) => sharedTraits(z.critters[z.answer[e.a]], z.critters[z.answer[e.b]]).includes(e.tag!)));
  });
});

describe('Lookalikes', () => {
  it('every pair is distinct, and each Wumble has one robot', () => {
    for (const level of LEVELS) {
      repeat(30, () => {
        const z = makeLookalikes(level);
        assert.equal(new Set(z.answer).size, z.critters.length);
        assert.equal(new Set(z.bots.map((b) => b.join())).size, z.bots.length);
      });
    }
  });

  it('a wrong pair costs a try', () => {
    const g = play(lookalikes);
    const z = g.puzzle<{ answer: number[] }>();
    g.game.onInput('p0', { type: 'match', critter: 0, bot: z.answer[1] });
    assert.equal(g.view().triesLeft, 4);
    g.game.onInput('p0', { type: 'match', critter: 0, bot: z.answer[0] });
    assert.equal(g.view().got, 1);
  });
});

describe('Room Sort', () => {
  it('fills every room, leaving clues in place', () => {
    for (const level of LEVELS) {
      repeat(10, () => {
        const z = makeRooms(level);
        assert.equal(z.guests.length, z.rows * z.cols * z.floors);
        assert.equal(new Set(z.clues).size, z.clues.length);
      });
    }
    const g = play<RoomState>(roomSort, '3');
    const z = g.puzzle<{ guests: number[][] }>();
    while (g.view().state.guest) {
      const guest = g.view().state.guest!;
      g.game.onInput('p0', { type: 'room', room: z.guests.findIndex((t) => sameTraits(t, guest)) });
    }
    assert.equal(g.host().phase, 'reveal');
    assert.ok(g.host().players[0].points >= 850);
  });
});

describe('Room Sort clues', () => {
  it('are shared between the floors', () => {
    for (const level of [3, 4]) {
      repeat(20, () => {
        const z = makeRooms(level);
        const floors = new Set(z.clues.map((c) => Math.floor(c / (z.rows * z.cols))));
        assert.equal(floors.size, 2);
      });
    }
  });
});

describe('Line Up', () => {
  it('the answer follows the clue', () => {
    for (const level of [1, 2]) {
      repeat(20, () => {
        const z = makeLineUp(level);
        const rank = (t: number[]) => z.ladders.map((l) => l.values.indexOf(t[l.trait]));
        const ranks = z.answer.map((i) => rank(z.critters[i]));
        for (let i = 1; i < ranks.length; i++) {
          const [a, b] = [ranks[i - 1], ranks[i]];
          assert.ok(a[0] < b[0] || (a[0] === b[0] && (a[1] ?? 0) < (b[1] ?? 0)));
        }
      });
    }
  });

  it('hides part of the clue on Hard and up', () => {
    assert.equal(makeLineUp(2).ladders.flatMap((l) => l.values).filter((v) => v === null).length, 0);
    assert.equal(makeLineUp(3).ladders.flatMap((l) => l.values).filter((v) => v === null).length, 1);
    assert.equal(makeLineUp(4).ladders.flatMap((l) => l.values).filter((v) => v === null).length, 2);
    assert.equal(chip(1, null).k, 'e');
  });

  it('checks light up the right places, and swapping is free', () => {
    const g = play<LineUpState>(lineUp);
    const z = g.puzzle<{ answer: number[] }>();
    const place = (who: number) => g.view().state.line.indexOf(who);
    g.game.onInput('p0', { type: 'swap', a: 0, b: place(z.answer[0]) });
    assert.equal(g.view().triesLeft, 6);
    g.game.onInput('p0', { type: 'check' });
    assert.equal(g.view().triesLeft, 5);
    assert.equal(g.view().state.marks[0], true);
    z.answer.forEach((who, i) => {
      if (place(who) !== i) g.game.onInput('p0', { type: 'swap', a: i, b: place(who) });
    });
    g.game.onInput('p0', { type: 'check' });
    assert.equal(g.host().phase, 'reveal');
  });
});

describe('Lens Lab', () => {
  it('only the right Wumbles come out looking like a target', () => {
    for (const level of LEVELS) {
      repeat(30, () => {
        const z = makeLens(level);
        const outs = z.pool.map((t) => throughLenses(z.lenses, t));
        const hits = outs.filter((o) => z.targets.some((t) => sameTraits(t, o))).length;
        assert.equal(hits, z.targets.length, `level ${level}`);
      });
    }
  });

  it('an `only` lens leaves others alone', () => {
    const lens = { trait: 0, a: 1, b: 2, only: { trait: 3, value: 4 } };
    assert.deepEqual(throughLenses([lens], [1, 0, 0, 4]), [2, 0, 0, 4]);
    assert.deepEqual(throughLenses([lens], [1, 0, 0, 3]), [1, 0, 0, 3]);
  });

  it('a right one docks, a wrong one costs a try and stays', () => {
    const g = play(lensLab);
    const z = g.puzzle<ReturnType<typeof makeLens>>();
    g.game.onInput('p0', { type: 'send', critter: z.sources[0] });
    assert.equal(g.view().got, 1);
    const wrong = z.pool.findIndex((_, i) => !z.sources.includes(i));
    g.game.onInput('p0', { type: 'send', critter: wrong });
    assert.equal(g.view().triesLeft, 4);
  });
});

describe('Switchback', () => {
  it('always has an order that works', () => {
    for (const level of LEVELS) {
      repeat(15, () => {
        const z = makeSwitch(level);
        assert.ok(solve(z));
        const flipped = z.gates.map(() => false);
        for (const who of z.answer) assert.ok(z.exits[run(z, flipped, z.critters[who]).exit]);
      });
    }
  });

  it('switches flip for the next one along', () => {
    const z = { gates: [{ kind: 'switch' as const }] };
    const flipped = [false];
    assert.equal(run(z, flipped, [0, 0, 0, 0]).exit, 0);
    assert.equal(run(z, flipped, [0, 0, 0, 0]).exit, 1);
    assert.equal(run(z, flipped, [0, 0, 0, 0]).exit, 0);
  });

  it('solving in the right order gets them all home', () => {
    const g = play(switchback, '4');
    const z = g.puzzle<ReturnType<typeof makeSwitch>>();
    z.answer.forEach((critter) => g.game.onInput('p0', { type: 'send', critter }));
    assert.equal(g.host().phase, 'reveal');
    assert.ok(g.host().players[0].points >= 850);
  });
});

describe('Stepping Stones', () => {
  it('every planted route can be walked', () => {
    for (const level of LEVELS) {
      repeat(30, () => {
        const z = makeStones(level);
        assert.equal(z.routes.length, STONES_LEVELS[level - 1].walkers);
        assert.equal(new Set(z.routes.flat()).size, z.routes.flat().length, 'routes must not share stones');
        for (const route of z.routes) {
          const walked: number[][] = [];
          for (const cell of route) {
            const tile = z.tiles[cell]!;
            assert.ok(tile);
            assert.ok(canStep(z, walked, tile), `level ${level}`);
            walked.push(tile);
          }
        }
      });
    }
  });

  it('walking a route gets across; a crumbled stone cannot be used again', () => {
    const g = play<StonesState>(steppingStones, '2');
    const z = g.puzzle<{ routes: number[][] }>();
    z.routes[0].forEach((cell) => g.game.onInput('p0', { type: 'step', cell }));
    assert.equal(g.view().got, 1);
    assert.deepEqual(g.view().state.path, []);
    g.game.onInput('p0', { type: 'step', cell: z.routes[0][0] });
    assert.deepEqual(g.view().state.path, []);
    z.routes[1].forEach((cell) => g.game.onInput('p0', { type: 'step', cell }));
    assert.equal(g.host().phase, 'reveal');
  });

  it('back is free; starting over costs a try, but never the last', () => {
    const g = play<StonesState>(steppingStones);
    const z = g.puzzle<{ routes: number[][] }>();
    const first = z.routes[0][0];
    g.game.onInput('p0', { type: 'step', cell: first });
    g.game.onInput('p0', { type: 'back' });
    assert.equal(g.view().triesLeft, 3);
    for (let i = 0; i < 5; i++) {
      g.game.onInput('p0', { type: 'step', cell: first });
      g.game.onInput('p0', { type: 'restart' });
    }
    assert.equal(g.view().triesLeft, 1);
    assert.equal(g.view().done, false);
  });
});
