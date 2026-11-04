import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { DRAW_MS, REVEAL_MS, SKETCH_WORDS, blanks, wordFor, type SketchView } from '../../shared/games/sketchIt';
import type { GameContext } from './MiniGame';
import { SketchIt } from './sketchIt';

let game: SketchIt | null = null;
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
});

function setup(names: string[]) {
  const room: PlayerInfo[] = names.map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
  const box = { host: {} as SketchView, phones: new Map<string, SketchView>() };
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (box.host = v as SketchView),
    sendPlayer: (id, v) => box.phones.set(id, v as SketchView),
    addScore: (id, p) => (room.find((o) => o.id === id)!.score += p),
    finish: () => {},
    showingQuestion: () => {},
  };
  game = new SketchIt(ctx, 1);
  game.start();
  return { room, box };
}

describe('Sketch It', () => {
  it('words are blanked for guessers, whole for the artist', () => {
    assert.equal(blanks('ice cream'), '_ _ _    _ _ _ _ _');
    assert.ok(SKETCH_WORDS.includes(wordFor(1, 0)));
    const { box } = setup(['A', 'B', 'C']);
    const artist = box.host.artist;
    const word = box.phones.get(artist)!.word;
    assert.ok(SKETCH_WORDS.includes(word.toLowerCase()));
    const guesser = ['p0', 'p1', 'p2'].find((id) => id !== artist)!;
    assert.ok(box.phones.get(guesser)!.word.includes('_'));
  });

  it("the artist's ink reaches the TV; right guesses score, quicker more; the artist scores for them", () => {
    const { box } = setup(['A', 'B', 'C']);
    const artist = box.host.artist;
    const [g1, g2] = ['p0', 'p1', 'p2'].filter((id) => id !== artist);
    game!.onInput(artist, { type: 'ink', id: 1, color: 0, width: 6, points: [10, 10, 50, 50] });
    mock.timers.tick(200);
    assert.equal(box.host.strokes.length, 1);
    const word = box.phones.get(artist)!.word;
    game!.onInput(g1, { type: 'guess', text: 'not it' });
    assert.deepEqual(box.phones.get(g1)!.misses, ['not it']);
    mock.timers.tick(1000);
    game!.onInput(g1, { type: 'guess', text: word.toLowerCase() });
    mock.timers.tick(20_000);
    game!.onInput(g2, { type: 'guess', text: `  ${word}!` });
    assert.equal(box.host.phase, 'reveal', 'everyone got it');
    const pts = (id: string) => box.host.players.find((p) => p.id === id)!.turnPoints;
    assert.ok(pts(g1) > pts(g2) && pts(g2) > 0);
    assert.equal(pts(artist), 250);
  });

  it('time runs out: the reveal, then the next artist', () => {
    const { box } = setup(['A', 'B']);
    const first = box.host.artist;
    mock.timers.tick(DRAW_MS + 1);
    assert.equal(box.host.phase, 'reveal');
    mock.timers.tick(REVEAL_MS + 1);
    assert.equal(box.host.phase, 'draw');
    assert.notEqual(box.host.artist, first);
    assert.equal(box.host.turns, 4, 'two players draw twice each');
  });
});
