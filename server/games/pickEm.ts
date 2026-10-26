import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  COOP_CLEAR_POINTS,
  COOP_FOUND_POINTS,
  COOP_PENALTY_MS,
  COOP_START_MS,
  PICK_EM,
  PICK_EM_COOP,
  PICK_POINTS,
  type CoopEvent,
  type CoopTile,
  type PickCoopHostView,
  type PickCoopInput,
  type PickCoopPlayerView,
  type PickGuessResult,
  type PickHostView,
  type PickInput,
  type PickKind,
  type PickPhase,
  type PickPlayerView,
} from '../../shared/games/pickEm';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { loadQuestionFile, shuffle, type Question } from './trivia';

/** The question alone, before the options (or the text box) appear. */
const READ_MS = 3_000;
/** Time to pick from a tap list. */
const CHOICE_MS = 30_000;
/** Time to type answers to a typed list. */
const TYPED_MS = 60_000;

/** A tap list has 8 to 12 options with at least two right and two wrong; a typed list has at least three answers. */
function validList(q: Question) {
  const options = q.correct.length + q.wrong.length;
  if (q.list.length > 0) return options === 0 && q.list.length >= 3;
  return q.correct.length >= 2 && q.wrong.length >= 2 && options >= 8 && options <= 12;
}

/** Each file in ./pickem is a bank (a mode), in the trivia format. */
const BANK_DIR = join(import.meta.dirname, 'pickem');
const BANKS = new Map<string, Question[]>(
  readdirSync(BANK_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => [f.replace(/\.txt$/, ''), loadQuestionFile(join(BANK_DIR, f), validList, 'pickem')]),
);

/** Dealt from a shuffled deck per bank, so lists don't repeat until all are used. */
const decks = new Map<string, Question[]>();
function dealQuestion(bankId: string): Question {
  let deck = decks.get(bankId);
  if (!deck || deck.length === 0) {
    deck = shuffle([...(BANKS.get(bankId) ?? [])]);
    decks.set(bankId, deck);
  }
  return deck.pop()!;
}

/** Points for a set of picks: PICK_POINTS per right one, minus as much per wrong one, never below 0. */
export function pickPoints(picks: number[], correct: number[]) {
  const right = picks.filter((i) => correct.includes(i)).length;
  const wrong = picks.length - right;
  return { right, wrong, points: Math.max(0, (right - wrong) * PICK_POINTS) };
}

// ---- Matching typed answers ---------------------------------------------------------

/** Lowercase letters and digits only, ignoring accents, punctuation, spaces and "the/a/an". */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, '');
}

/** Edits to turn one string into the other, counting a swap of two neighbouring letters as one. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Which answer a guess matches (-1 for none): exactly, after normalising, or with a
 * typo or two in longer answers. A guess near two answers matches the closer one.
 */
export function matchAnswer(text: string, list: string[][]): number {
  const guess = normalise(text);
  if (!guess) return -1;
  const exact = list.findIndex((forms) => forms.some((f) => normalise(f) === guess));
  if (exact >= 0) return exact;
  let best = -1;
  let bestDistance = Infinity;
  list.forEach((forms, i) => {
    for (const f of forms) {
      const target = normalise(f);
      const allowed = target.length >= 9 ? 2 : target.length >= 5 ? 1 : 0;
      const d = editDistance(guess, target);
      if (d <= allowed && d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
  });
  return best;
}

// ---- Game ---------------------------------------------------------------------------------

class PickEm implements MiniGame {
  private phase: PickPhase = 'question';
  private questionIndex = 0;
  private question!: Question;
  private options: string[] = [];
  private correctIndices: number[] = [];
  /** Tap lists: each player's locked-in picks. */
  private picks = new Map<string, number[]>();
  /** Typed lists: answers each player has found (in the order found), their last guess, and who's done. */
  private found = new Map<string, number[]>();
  private lastGuess = new Map<string, PickGuessResult>();
  private done = new Set<string>();
  private results = new Map<string, { right: number; wrong: number; points: number }>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly bankId: string,
    private readonly totalQuestions: number,
  ) {}

  private get kind(): PickKind {
    return this.question.list.length > 0 ? 'typed' : 'choice';
  }

  start() {
    this.startQuestion(0);
  }

  private setPhase(phase: PickPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startQuestion(index: number) {
    this.questionIndex = index;
    this.question = dealQuestion(this.bankId);
    this.options = shuffle([...this.question.correct, ...this.question.wrong]);
    this.correctIndices = this.options.flatMap((o, i) => (this.question.correct.includes(o) ? [i] : []));
    this.picks.clear();
    this.found.clear();
    this.lastGuess.clear();
    this.done.clear();
    this.results.clear();
    const answerMs = this.kind === 'typed' ? TYPED_MS : CHOICE_MS;
    this.setPhase('question', READ_MS, () => this.setPhase('answering', answerMs, () => this.reveal()));
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as PickInput;
    if (this.phase !== 'answering' || !input) return;

    if (this.kind === 'choice') {
      if (input.type !== 'answer' || !Array.isArray(input.indices) || this.picks.has(playerId)) return;
      const indices = [...new Set(input.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < this.options.length);
      if (indices.length === 0) return;
      this.picks.set(playerId, indices);
      this.revealIfAllDone();
      return;
    }

    if (this.done.has(playerId)) return;
    if (input.type === 'done') {
      this.done.add(playerId);
      this.revealIfAllDone();
      return;
    }
    if (input.type !== 'guess' || typeof input.text !== 'string') return;
    const text = input.text.slice(0, 60);
    const i = matchAnswer(text, this.question.list);
    const mine = this.found.get(playerId) ?? [];
    let result: PickGuessResult['result'] = 'wrong';
    if (i >= 0 && mine.includes(i)) result = 'repeat';
    else if (i >= 0) {
      result = 'right';
      this.found.set(playerId, [...mine, i]);
    }
    this.lastGuess.set(playerId, { seq: Number(input.seq) || 0, text, result, answer: i >= 0 ? this.question.list[i][0] : null });
    // Everyone has found everything: no need to wait.
    if (result === 'right' && this.found.get(playerId)!.length === this.question.list.length) this.done.add(playerId);
    this.revealIfAllDone();
  }

  private revealIfAllDone() {
    const connected = this.ctx.players().filter((p) => p.connected);
    const finished = (id: string) => (this.kind === 'choice' ? this.picks.has(id) : this.done.has(id));
    if (connected.every((p) => finished(p.id))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    for (const p of this.ctx.players()) {
      let result: { right: number; wrong: number; points: number } | null = null;
      if (this.kind === 'choice') {
        const picks = this.picks.get(p.id);
        if (picks) result = pickPoints(picks, this.correctIndices);
      } else {
        const right = this.found.get(p.id)?.length ?? 0;
        result = { right, wrong: 0, points: right * PICK_POINTS };
      }
      if (!result) continue;
      this.results.set(p.id, result);
      if (result.points === 0) continue;
      this.gamePoints.set(p.id, (this.gamePoints.get(p.id) ?? 0) + result.points);
      this.ctx.addScore(p.id, result.points);
    }
    const isLast = this.questionIndex >= this.totalQuestions - 1;
    this.setPhase('reveal', PUZZLE_RESULT_MS, () => {
      if (!isLast) this.startQuestion(this.questionIndex + 1);
      // With a single question, round scores would just repeat the reveal, so skip them.
      else if (this.totalQuestions === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private get revealing() {
    return this.phase === 'reveal' || this.phase === 'gameEnd';
  }

  private visibleOptions() {
    return this.phase === 'question' ? [] : this.options;
  }

  private answerNames() {
    return this.question.list.map((forms) => forms[0]);
  }

  syncHost() {
    const counts = this.options.map((_, i) => [...this.picks.values()].filter((p) => p.includes(i)).length);
    const typed = this.kind === 'typed';
    const view: PickHostView = {
      phase: this.phase,
      kind: this.kind,
      packName: PICK_EM.modes.find((m) => m.id === this.bankId)?.name ?? '',
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      topic: this.question.film,
      question: this.question.question,
      options: this.visibleOptions(),
      correctIndices: this.revealing && !typed ? this.correctIndices : null,
      counts: this.revealing && !typed ? counts : null,
      slots: this.question.list.length,
      // Typed answers stay hidden on the TV until the reveal, so nobody copies anyone.
      answers: this.revealing && typed ? this.answerNames() : null,
      foundBy:
        this.revealing && typed
          ? this.question.list.map((_, i) => [...this.found].filter(([, f]) => f.includes(i)).map(([id]) => id))
          : null,
      msLeft: this.msLeft(),
      players: this.ctx.players().map((p) => {
        const r = this.results.get(p.id);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          gamePoints: this.gamePoints.get(p.id) ?? 0,
          answered: typed ? this.done.has(p.id) : this.picks.has(p.id),
          found: this.found.get(p.id)?.length ?? 0,
          right: r?.right ?? 0,
          wrong: r?.wrong ?? 0,
          points: r?.points ?? 0,
        };
      }),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const r = this.results.get(playerId);
    const typed = this.kind === 'typed';
    const view: PickPlayerView = {
      phase: this.phase,
      kind: this.kind,
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      topic: this.question.film,
      question: this.question.question,
      options: this.visibleOptions(),
      myPicks: this.picks.get(playerId) ?? [],
      correctIndices: this.revealing && !typed ? this.correctIndices : null,
      slots: this.question.list.length,
      found: (this.found.get(playerId) ?? []).map((i) => this.question.list[i][0]),
      lastGuess: this.lastGuess.get(playerId) ?? null,
      done: this.done.has(playerId),
      answers: this.revealing && typed ? this.answerNames() : null,
      right: r?.right ?? 0,
      wrong: r?.wrong ?? 0,
      points: r?.points ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      msLeft: this.msLeft(),
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

export const pickEm: MiniGameDefinition = {
  info: PICK_EM,
  create: (ctx, modeId, options) => new PickEm(ctx, modeId, options.puzzles),
};

// ---- Team Pick 'Em (co-op) ---------------------------------------------------------

/** How many picks and guesses the TV's feed shows. */
const FEED_LENGTH = 6;

/**
 * Everyone works one list together. Each pick or guess counts straight away: a right one
 * lights up for the whole team, a wrong one takes time off the shared clock, and one
 * that's already been tried costs nothing. Clear the list before the clock runs out.
 */
class PickEmCoop implements MiniGame {
  private phase: PickPhase = 'question';
  private questionIndex = 0;
  private question!: Question;
  private options: string[] = [];
  /** Who found each right answer (by option index for tap lists, list index for typed ones). */
  private foundBy = new Map<number, string>();
  /** Tap lists: wrong options someone picked, and who. Typed lists: wrong guesses already made. */
  private wrongPicks = new Map<number, string>();
  private wrongGuesses = new Set<string>();
  private penalties = 0;
  private feed: CoopEvent[] = [];
  private lastGuess = new Map<string, CoopEvent>();
  private cleared: boolean | null = null;
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly bankId: string,
    private readonly totalQuestions: number,
  ) {}

  private get kind(): PickKind {
    return this.question.list.length > 0 ? 'typed' : 'choice';
  }

  /** How many right answers the list has. */
  private get total() {
    return this.kind === 'typed' ? this.question.list.length : this.question.correct.length;
  }

  start() {
    this.startQuestion(0);
  }

  private setPhase(phase: PickPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    this.schedule(next);
    this.syncAll();
  }

  /** (Re)arm the timer for the current phase's end, e.g. after a penalty moves it. */
  private schedule(next: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, Math.max(0, this.phaseEndsAt - Date.now()));
  }

  private startQuestion(index: number) {
    this.questionIndex = index;
    this.question = dealQuestion(this.bankId);
    this.options = shuffle([...this.question.correct, ...this.question.wrong]);
    this.foundBy.clear();
    this.wrongPicks.clear();
    this.wrongGuesses.clear();
    this.penalties = 0;
    this.feed = [];
    this.lastGuess.clear();
    this.cleared = null;
    this.setPhase('question', READ_MS, () => this.setPhase('answering', COOP_START_MS, () => this.reveal()));
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as PickCoopInput;
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (this.phase !== 'answering' || !input || !player) return;
    const seq = Number(input.seq) || 0;
    let text: string;
    let result: CoopEvent['result'];
    let answer: string | null = null;

    if (this.kind === 'choice') {
      if (input.type !== 'tap' || !Number.isInteger(input.index) || input.index < 0 || input.index >= this.options.length) return;
      const i = input.index;
      text = this.options[i];
      if (this.foundBy.has(i) || this.wrongPicks.has(i)) {
        result = 'repeat';
        answer = text;
      } else if (this.question.correct.includes(text)) {
        result = 'right';
        answer = text;
        this.foundBy.set(i, playerId);
      } else {
        result = 'wrong';
        this.wrongPicks.set(i, playerId);
      }
    } else {
      if (input.type !== 'guess' || typeof input.text !== 'string') return;
      text = input.text.trim().slice(0, 60);
      if (!text) return;
      const i = matchAnswer(text, this.question.list);
      if (i >= 0) {
        answer = this.question.list[i][0];
        result = this.foundBy.has(i) ? 'repeat' : 'right';
        if (result === 'right') this.foundBy.set(i, playerId);
      } else {
        // The same wrong guess twice only costs once.
        const key = normalise(text);
        result = this.wrongGuesses.has(key) ? 'repeat' : 'wrong';
        this.wrongGuesses.add(key);
      }
    }

    const event: CoopEvent = { seq, playerId, name: player.name, color: player.color, text, result, answer };
    this.lastGuess.set(playerId, event);
    this.feed = [...this.feed, event].slice(-FEED_LENGTH);

    if (result === 'right') {
      for (const p of this.ctx.players()) this.award(p.id, COOP_FOUND_POINTS);
      if (this.foundBy.size === this.total) return this.reveal();
    } else if (result === 'wrong') {
      this.penalties++;
      this.phaseEndsAt -= COOP_PENALTY_MS;
      if (this.phaseEndsAt <= Date.now()) return this.reveal();
      this.schedule(() => this.reveal());
    }
    this.syncAll();
  }

  private award(playerId: string, points: number) {
    this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
    this.ctx.addScore(playerId, points);
  }

  private reveal() {
    this.cleared = this.foundBy.size === this.total;
    if (this.cleared) for (const p of this.ctx.players()) this.award(p.id, COOP_CLEAR_POINTS);
    const isLast = this.questionIndex >= this.totalQuestions - 1;
    this.setPhase('reveal', PUZZLE_RESULT_MS, () => {
      if (!isLast) this.startQuestion(this.questionIndex + 1);
      else if (this.totalQuestions === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private person(id: string | undefined) {
    const p = id ? this.ctx.players().find((pl) => pl.id === id) : undefined;
    return p ? { name: p.name, color: p.color } : null;
  }

  private tiles(): CoopTile[] {
    if (this.phase === 'question') return [];
    const revealing = this.phase === 'reveal' || this.phase === 'gameEnd';
    if (this.kind === 'choice') {
      return this.options.map((label, i) => {
        if (this.foundBy.has(i)) return { label, state: 'found', by: this.person(this.foundBy.get(i)) };
        if (this.wrongPicks.has(i)) return { label, state: 'wrong', by: this.person(this.wrongPicks.get(i)) };
        if (revealing && this.question.correct.includes(label)) return { label, state: 'missed', by: null };
        return { label, state: 'open', by: null };
      });
    }
    return this.question.list.map((forms, i) => {
      if (this.foundBy.has(i)) return { label: forms[0], state: 'found', by: this.person(this.foundBy.get(i)) };
      return revealing ? { label: forms[0], state: 'missed', by: null } : { label: null, state: 'open', by: null };
    });
  }

  private base() {
    return {
      phase: this.phase,
      kind: this.kind,
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      topic: this.question.film,
      question: this.question.question,
      tiles: this.tiles(),
      found: this.foundBy.size,
      total: this.total,
      cleared: this.cleared,
      penalties: this.penalties,
      msLeft: Math.max(0, this.phaseEndsAt - Date.now()),
    };
  }

  syncHost() {
    const view: PickCoopHostView = {
      ...this.base(),
      packName: PICK_EM_COOP.modes.find((m) => m.id === this.bankId)?.name ?? '',
      feed: this.feed,
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        found: [...this.foundBy.values()].filter((id) => id === p.id).length,
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: PickCoopPlayerView = {
      ...this.base(),
      lastGuess: this.lastGuess.get(playerId) ?? null,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
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

export const pickEmCoop: MiniGameDefinition = {
  info: PICK_EM_COOP,
  create: (ctx, modeId, options) => new PickEmCoop(ctx, modeId, options.puzzles),
};

/** For tooling: list count per bank, split into tap and typed lists. */
export const pickBankSizes = () =>
  Object.fromEntries(
    [...BANKS].map(([id, qs]) => [id, { choice: qs.filter((q) => q.list.length === 0).length, typed: qs.filter((q) => q.list.length > 0).length }]),
  );
