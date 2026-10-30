import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_EXTERNAL_GAMES, MAX_EXTERNAL_NAME, externalEntry, parseExternalGames, type ExternalPlayerView } from '../../shared/games/external';
import type { PlayerInfo } from '../../shared/protocol';
import { external } from './external';
import type { GameContext } from './MiniGame';

describe('Other games (played away from the app)', () => {
  it('reads the list: commas or new lines, tidied, no blanks or repeats', () => {
    assert.deepEqual(parseExternalGames(' Catan ,uno\n\n  Ticket   to Ride, catan,, '), ['Catan', 'uno', 'Ticket to Ride']);
    assert.equal(parseExternalGames('x'.repeat(100))[0].length, MAX_EXTERNAL_NAME);
    assert.equal(parseExternalGames(Array.from({ length: 30 }, (_, i) => `Game ${i}`).join(',')).length, MAX_EXTERNAL_GAMES);
    assert.equal(externalEntry('Catan').label, 'Catan');
  });

  it("waits until the VIP marks it finished; the winners they pick score a round's worth", () => {
    const players: PlayerInfo[] = ['VIP', 'OTHER'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    const views = new Map<string, ExternalPlayerView>();
    let finished = false;
    const ctx: GameContext = {
      players: () => players,
      sendHost: () => {},
      sendPlayer: (id, v) => views.set(id, v as ExternalPlayerView),
      addScore: (id, points) => (players.find((p) => p.id === id)!.score += points),
      finish: () => (finished = true),
      showingQuestion: () => {},
    };
    const game = external.create(ctx, 'standard', { puzzles: 3, externalGame: 'Catan' });
    game.start();
    assert.equal(views.get('p1')!.name, 'Catan');
    assert.equal(views.get('p0')!.isVip, true);
    assert.equal(views.get('p1')!.isVip, false);
    game.onInput('p1', { type: 'finish', winners: ['p1'] });
    assert.equal(finished, false);
    assert.equal(views.get('p0')!.players.length, 2);
    game.onInput('p0', { type: 'finish', winners: ['p1', 'nobody'] });
    assert.equal(finished, true);
    // A full round's worth (3 puzzles' worth here), only to the winner.
    assert.deepEqual(players.map((p) => p.score), [0, 3_000]);
  });
});
