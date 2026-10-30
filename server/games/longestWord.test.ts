import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { LETTER_COUNT, VOWELS, type LongestHostView, type LongestPlayerView } from '../../shared/games/longestWord';
import type { PlayerInfo } from '../../shared/protocol';
import { longestWord } from './longestWord';
import { checkWord, longestWords } from './longestWord/solver';
import type { GameContext, MiniGame } from './MiniGame';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

function play(players: number) {
  const room: PlayerInfo[] = Array.from({ length: players }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    color: '#ffffff',
    score: 0,
    connected: true,
    isVip: i === 0,
  }));
  const views = new Map<string, LongestPlayerView>();
  let host = {} as LongestHostView;
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (host = v as LongestHostView),
    sendPlayer: (id, v) => views.set(id, v as LongestPlayerView),
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => {},
    showingQuestion: () => {},
  };
  const game = longestWord.create(ctx, 'standard', { puzzles: 2 });
  running.push(game);
  game.start();
  const view = (id: string) => views.get(id)!;
  /** The picker takes `vowels` vowels then consonants until the letters are all out. */
  const pickAll = (vowels = 3) => {
    const picker = room.find((p) => view(p.id).isPicker)!.id;
    for (let i = 0; i < LETTER_COUNT; i++) game.onInput(picker, { type: 'pick', kind: i < vowels ? 'vowel' : 'consonant' });
  };
  return { game, view, host: () => host, pickAll, room };
}

describe('Longest Word', () => {
  it('one player picks; at most 5 vowels and 6 consonants, then the clock starts', () => {
    const { game, view } = play(2);
    assert.equal(view('p0').isPicker, true);
    assert.equal(view('p1').isPicker, false);
    // Someone else can't pick.
    game.onInput('p1', { type: 'pick', kind: 'vowel' });
    assert.equal(view('p0').letters.length, 0);
    for (let i = 0; i < 7; i++) game.onInput('p0', { type: 'pick', kind: 'vowel' });
    assert.equal(view('p0').letters.length, 5);
    assert.ok(view('p0').letters.every((l) => VOWELS.includes(l)));
    for (let i = 0; i < 4; i++) game.onInput('p0', { type: 'pick', kind: 'consonant' });
    assert.equal(view('p0').phase, 'solve');
    assert.equal(view('p0').letters.length, LETTER_COUNT);
  });

  it('picks for a picker who takes too long, keeping to the minimums', () => {
    const { view } = play(1);
    for (let i = 0; i < LETTER_COUNT; i++) mock.timers.tick(10_000);
    const letters = view('p0').letters;
    assert.equal(view('p0').phase, 'solve');
    const vowels = letters.filter((l) => VOWELS.includes(l)).length;
    assert.ok(vowels >= 3 && LETTER_COUNT - vowels >= 4, letters.join(''));
  });

  it('the longest possible word scores 1,000; a made-up one or missing letters score nothing', () => {
    const { game, view, pickAll } = play(3);
    pickAll(4);
    const best = longestWords(view('p0').letters);
    assert.ok(best.length > 0);
    game.onInput('p0', { type: 'word', word: best.words[0], lock: true });
    game.onInput('p1', { type: 'word', word: 'QQQQ', lock: true });
    game.onInput('p2', { type: 'word', word: 'ZZXQJ', lock: true });
    assert.equal(view('p0').phase, 'reveal');
    assert.equal(view('p0').points, 1000);
    assert.equal(view('p1').problem, 'bad-letters');
    assert.equal(view('p1').points, 0);
    assert.equal(view('p0').best?.length, best.length);
  });

  it('a word that is not in the dictionary scores nothing', () => {
    assert.equal(checkWord('TEARS', ['T', 'E', 'A', 'R', 'S']), null);
    assert.equal(checkWord('RATSE', ['T', 'E', 'A', 'R', 'S']), 'not-a-word');
    assert.equal(checkWord('TEETH', ['T', 'E', 'H']), 'bad-letters');
  });

  it("a draft counts when time runs out; giving up doesn't", () => {
    const { game, view, pickAll } = play(2);
    pickAll(4);
    const best = longestWords(view('p0').letters);
    game.onInput('p0', { type: 'word', word: best.words[0], lock: false });
    game.giveUp!('p1');
    assert.equal(view('p1').gaveUp, true);
    assert.equal(view('p0').phase, 'solve');
    mock.timers.tick(30_000);
    assert.equal(view('p0').phase, 'reveal');
    assert.equal(view('p0').points, 1000);
    assert.equal(view('p1').word, '');
    assert.equal(view('p1').points, 0);
  });

  it('the picker goes round the players', () => {
    const { game, view, pickAll } = play(2);
    pickAll();
    game.giveUp!('p0');
    game.giveUp!('p1');
    mock.timers.tick(10_000);
    assert.equal(view('p0').phase, 'pick');
    assert.equal(view('p1').isPicker, true);
  });
});
