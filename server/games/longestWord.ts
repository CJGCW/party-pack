import {
  LETTER_COUNT,
  LONGEST_WORD,
  canPick,
  type LetterKind,
  type LongestBest,
  type LongestHostView,
  type LongestInput,
  type LongestPhase,
  type LongestPlayerView,
  type WordProblem,
} from '../../shared/games/longestWord';
import { puzzlePoints } from '../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { CONSONANT_PILE, VOWEL_PILE, shuffledPile } from './longestWord/letters';
import { checkWord, longestWords } from './longestWord/solver';

/** Time the picker has for each letter before one is picked for them. */
const PICK_MS = 10_000;
/** A picker who's dropped out gets letters picked for them quickly. */
const AWAY_PICK_MS = 800;
/** Time to make a word. */
const SOLVE_MS = 30_000;
/** At the reveal, a little longer than other games: there are words to read. */
const REVEAL_MS = PUZZLE_RESULT_MS + 3_000;
// Scoring on the shared scale: a word is worth its share of the longest word the letters make,
// so the longest possible scores 1,000 and one half as long scores 500.

class LongestWord implements MiniGame {
  private phase: LongestPhase = 'pick';
  private puzzleIndex = 0;
  private letters: string[] = [];
  private piles: Record<LetterKind, string[]> = { vowel: [], consonant: [] };
  private pickerId = '';
  private best: LongestBest = { length: 0, words: [], definition: null };
  /** Each player's word as it stands; whatever's here when time runs out counts. */
  private words = new Map<string, string>();
  private locked = new Set<string>();
  /** Who gave up on this word: they score nothing for it. */
  private gaveUp = new Set<string>();
  private problems = new Map<string, WordProblem>();
  private lastPoints = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private phaseMs = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private setPhase(phase: LongestPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseMs = ms;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    this.letters = [];
    this.piles = { vowel: shuffledPile(VOWEL_PILE), consonant: shuffledPile(CONSONANT_PILE) };
    this.words.clear();
    this.locked.clear();
    this.gaveUp.clear();
    this.problems.clear();
    this.lastPoints.clear();
    // The picker goes round the players still here, one per word.
    const here = this.ctx.players().filter((p) => p.connected);
    const pool = here.length > 0 ? here : this.ctx.players();
    this.pickerId = pool[index % pool.length]?.id ?? '';
    this.awaitPick();
  }

  /** Waits for the picker's next letter, picking one for them if they take too long. */
  private awaitPick() {
    const away = !this.ctx.players().find((p) => p.id === this.pickerId)?.connected;
    this.setPhase('pick', away ? AWAY_PICK_MS : PICK_MS, () => {
      const kinds = (['vowel', 'consonant'] as const).filter((k) => canPick(this.letters, k));
      this.pick(kinds[Math.floor(Math.random() * kinds.length)]);
    });
  }

  private pick(kind: LetterKind) {
    if (this.phase !== 'pick' || !canPick(this.letters, kind)) return;
    this.letters.push(this.piles[kind].pop()!);
    if (this.letters.length < LETTER_COUNT) return this.awaitPick();
    this.best = longestWords(this.letters);
    this.setPhase('solve', SOLVE_MS, () => this.reveal());
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as LongestInput;
    if (!input) return;
    if (input.type === 'pick') {
      if (playerId === this.pickerId && (input.kind === 'vowel' || input.kind === 'consonant')) this.pick(input.kind);
      return;
    }
    if (input.type !== 'word' || this.phase !== 'solve' || this.locked.has(playerId)) return;
    const word = String(input.word ?? '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, LETTER_COUNT);
    this.words.set(playerId, word);
    // Drafts only matter to their owner's phone (the TV doesn't show them).
    if (!input.lock) return this.syncPlayer(playerId);
    this.locked.add(playerId);
    this.revealIfAllIn();
  }

  giveUp(playerId: string) {
    if (this.phase !== 'solve' || this.locked.has(playerId)) return;
    this.gaveUp.add(playerId);
    this.locked.add(playerId);
    this.words.set(playerId, '');
    this.revealIfAllIn();
  }

  /** Reveal as soon as everyone still here has locked in. */
  private revealIfAllIn() {
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.locked.has(p.id))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    for (const [playerId, word] of this.words) {
      if (!word) continue;
      const problem = checkWord(word, this.letters);
      this.problems.set(playerId, problem);
      const points = problem || this.best.length === 0 ? 0 : puzzlePoints(word.length / this.best.length);
      if (points === 0) continue;
      this.lastPoints.set(playerId, points);
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
      this.ctx.addScore(playerId, points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('reveal', REVEAL_MS, () => {
      if (!isLast) this.startPuzzle(this.puzzleIndex + 1);
      // With a single puzzle, round scores would just repeat the reveal, so skip them.
      else if (this.totalPuzzles === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private get revealing() {
    return this.phase === 'reveal' || this.phase === 'gameEnd';
  }

  private pickerName() {
    return this.ctx.players().find((p) => p.id === this.pickerId)?.name ?? '';
  }

  syncHost() {
    const view: LongestHostView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      letters: this.letters,
      pickerName: this.pickerName(),
      msLeft: this.msLeft(),
      phaseMs: this.phaseMs,
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        locked: this.locked.has(p.id),
        word: this.revealing ? (this.words.get(p.id) ?? '') : null,
        problem: this.problems.get(p.id) ?? null,
        points: this.lastPoints.get(p.id) ?? 0,
      })),
      best: this.revealing ? this.best : null,
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: LongestPlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      letters: this.letters,
      isPicker: playerId === this.pickerId,
      pickerName: this.pickerName(),
      msLeft: this.msLeft(),
      word: this.words.get(playerId) ?? '',
      locked: this.locked.has(playerId),
      problem: this.problems.get(playerId) ?? null,
      points: this.lastPoints.get(playerId) ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      best: this.revealing ? this.best : null,
      canGiveUp: this.phase === 'solve' && !this.locked.has(playerId),
      gaveUp: this.phase === 'solve' && this.gaveUp.has(playerId),
    };
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const longestWord: MiniGameDefinition = {
  info: LONGEST_WORD,
  create: (ctx, _modeId, options) => new LongestWord(ctx, options.puzzles),
};
