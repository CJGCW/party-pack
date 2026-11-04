import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Room, pickChooser, type ClientSocket, type IO } from './rooms';

const channel = { to: () => channel, emit: () => {} };
const silentIo = channel as unknown as IO;

function sessionRoom(externalGames: string[], enabled?: string[]) {
  const room = new Room('TEST', silentIo, '', () => {});
  for (const [i, id] of ['a', 'b', 'c'].entries()) {
    room.players.set(id, { id, name: id, color: '#fff', score: 0, connected: true, isVip: i === 0, sessionId: id, socketId: id });
  }
  room.settings = { ...room.settings, externalGames, rounds: 3, ...(enabled ? { enabled } : {}) };
  assert.equal(room.startSession(), null);
  return room;
}
const as = (id: string) => ({ data: { playerId: id } }) as unknown as ClientSocket;
/** The round's wheel has finished its countdown and whatever it landed on is starting. */
const internals = (room: Room) => room as unknown as { session: { losers: string[]; round: number }; nextRound(): void; wheelChoice: unknown; spin: unknown };

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => mock.timers.reset());

describe('picking the wheel', () => {
  it('goes to the loser, or one of them if they tied', () => {
    assert.deepEqual(pickChooser(['b'], ['a', 'b', 'c'], 'a'), { id: 'b', isLoser: true });
    for (let i = 0; i < 20; i++) assert.ok(['b', 'c'].includes(pickChooser(['b', 'c'], ['a', 'b', 'c'], 'a')!.id));
  });

  it('goes to the VIP with no loser, or if the loser has left', () => {
    assert.deepEqual(pickChooser([], ['a', 'b'], 'a'), { id: 'a', isLoser: false });
    assert.deepEqual(pickChooser(['c'], ['a', 'b'], 'a'), { id: 'a', isLoser: false });
    assert.deepEqual(pickChooser([], ['b'], null), { id: 'b', isLoser: false });
    assert.equal(pickChooser([], [], null), null);
  });
});

describe('two wheels', () => {
  it('with no other games, spins straight away as ever', () => {
    const room = sessionRoom([]);
    assert.equal(room.state().phase, 'spinning');
    assert.equal(room.state().spin!.wheel, null);
    room.returnToLobby();
  });

  it('with only other games, spins them straight away', () => {
    const room = sessionRoom(['Catan'], []);
    assert.equal(room.state().phase, 'spinning');
    assert.deepEqual(room.state().spin!.entries.map((e) => e.label), ['Catan']);
    room.returnToLobby();
  });

  it('with both, the VIP picks first, and each wheel holds only its own games', () => {
    const room = sessionRoom(['Catan', 'Charades']);
    const choice = room.state().wheelChoice!;
    assert.equal(room.state().phase, 'choosing');
    assert.deepEqual([choice.chooserId, choice.isLoser], ['a', false]);
    assert.equal(room.chooseWheel(as('a'), 'other'), null);
    const spin = room.state().spin!;
    assert.equal(spin.wheel, 'other');
    assert.deepEqual(spin.entries.map((e) => e.label).sort(), ['Catan', 'Charades']);
    room.returnToLobby();

    const again = sessionRoom(['Catan']);
    again.chooseWheel(as('a'), 'app');
    assert.ok(again.state().spin!.entries.every((e) => e.gameId !== 'external'));
    assert.ok(again.state().spin!.entries.length > 1);
    again.returnToLobby();
  });

  it('only the chooser can pick', () => {
    const room = sessionRoom(['Catan']);
    assert.ok(room.chooseWheel(as('b'), 'app'));
    assert.ok(room.chooseWheel(as('a'), 'nonsense' as 'app'));
    assert.equal(room.state().phase, 'choosing');
    room.returnToLobby();
  });

  it("the next round's choice goes to the last round's loser", () => {
    const room = sessionRoom(['Catan']);
    const r = internals(room);
    room.chooseWheel(as('a'), 'other');
    r.spin = null;
    r.session.losers = ['c'];
    r.nextRound();
    assert.deepEqual([room.state().wheelChoice!.chooserId, room.state().wheelChoice!.isLoser], ['c', true]);
    assert.equal(room.state().session!.round, 2);
    room.returnToLobby();
  });

  it('picks a wheel if nobody does, and the lobby clears a choice', () => {
    const room = sessionRoom(['Catan']);
    mock.timers.tick(15_001);
    assert.equal(room.state().phase, 'spinning');
    assert.ok(room.state().spin!.wheel);
    room.returnToLobby();

    const left = sessionRoom(['Catan']);
    left.returnToLobby();
    assert.equal(left.state().wheelChoice, null);
    assert.equal(left.state().phase, 'lobby');
  });
});
