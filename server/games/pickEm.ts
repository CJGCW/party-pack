import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PICK_EM,
  PICK_POINTS,
  type PickHostView,
  type PickInput,
  type PickPhase,
  type PickPlayerView,
} from '../../shared/games/pickEm';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { loadQuestionFile, shuffle, type Question } from './trivia';

/** The question alone, before the options appear. */
const READ_MS = 3_000;
/** Time to make picks once the options are up. */
const ANSWER_MS = 30_000;

/** Each file in ./pickem is a bank (a mode), in the trivia format with 8 to 12 options. */
const BANK_DIR = join(import.meta.dirname, 'pickem');
const BANKS = new Map<string, Question[]>(
  readdirSync(BANK_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => [
      f.replace(/\.txt$/, ''),
      loadQuestionFile(
        join(BANK_DIR, f),
        (q) => q.correct.length >= 2 && q.wrong.length >= 2 && q.correct.length + q.wrong.length >= 8 && q.correct.length + q.wrong.length <= 12,
        'pickem',
      ),
    ]),
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

class PickEm implements MiniGame {
  private phase: PickPhase = 'question';
  private questionIndex = 0;
  private question!: Question;
  private options: string[] = [];
  private correctIndices: number[] = [];
  private picks = new Map<string, number[]>();
  private results = new Map<string, { right: number; wrong: number; points: number }>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly bankId: string,
    private readonly totalQuestions: number,
  ) {}

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
    this.results.clear();
    this.setPhase('question', READ_MS, () => this.setPhase('answering', ANSWER_MS, () => this.reveal()));
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as PickInput;
    if (this.phase !== 'answering' || input?.type !== 'answer' || !Array.isArray(input.indices)) return;
    if (this.picks.has(playerId)) return; // picks are final
    const indices = [...new Set(input.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < this.options.length);
    if (indices.length === 0) return;
    this.picks.set(playerId, indices);
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.picks.has(p.id))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    for (const [playerId, picks] of this.picks) {
      const result = pickPoints(picks, this.correctIndices);
      this.results.set(playerId, result);
      if (result.points === 0) continue;
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + result.points);
      this.ctx.addScore(playerId, result.points);
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

  syncHost() {
    const counts = this.options.map((_, i) => [...this.picks.values()].filter((p) => p.includes(i)).length);
    const view: PickHostView = {
      phase: this.phase,
      packName: PICK_EM.modes.find((m) => m.id === this.bankId)?.name ?? '',
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      topic: this.question.film,
      question: this.question.question,
      options: this.visibleOptions(),
      correctIndices: this.revealing ? this.correctIndices : null,
      counts: this.revealing ? counts : null,
      msLeft: this.msLeft(),
      players: this.ctx.players().map((p) => {
        const r = this.results.get(p.id);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          gamePoints: this.gamePoints.get(p.id) ?? 0,
          answered: this.picks.has(p.id),
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
    const view: PickPlayerView = {
      phase: this.phase,
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      topic: this.question.film,
      question: this.question.question,
      options: this.visibleOptions(),
      myPicks: this.picks.get(playerId) ?? [],
      correctIndices: this.revealing ? this.correctIndices : null,
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

/** For tooling: list count per bank. */
export const pickBankSizes = () => Object.fromEntries([...BANKS].map(([id, qs]) => [id, qs.length]));
