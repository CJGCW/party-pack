import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANSWER_COUNT,
  TRIVIA,
  type TriviaHostView,
  type TriviaInput,
  type TriviaPhase,
  type TriviaPlayerView,
} from '../../shared/games/trivia';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/** The question alone, before the answers appear. */
const READ_MS = 3_000;
/** Time to pick an answer once they're up. */
const ANSWER_MS = 20_000;

// Scoring: a right answer is worth BASE_POINTS plus up to SPEED_BONUS more the
// sooner it was locked in (all of it at once, none of it at the buzzer).
const BASE_POINTS = 500;
const SPEED_BONUS = 500;

export function questionPoints(msLeft: number): number {
  return BASE_POINTS + Math.round((SPEED_BONUS * Math.max(0, msLeft)) / ANSWER_MS);
}

// ---- Question banks -----------------------------------------------------------
//
// Each file in ./trivia is one bank (one mode). Questions are blocks like:
//
//   FILM: The Lion King
//
//   Q: Who voices adult Simba?
//   A: Matthew Broderick
//   W: Jonathan Taylor Thomas
//   W: Nathan Lane
//   W: Jeremy Irons
//
// A "FILM:" line applies to every question after it. A is the right answer and
// each W is a wrong one. Lines starting with # are comments.

interface Question {
  film: string;
  question: string;
  correct: string;
  wrong: string[];
}

const BANK_DIR = join(import.meta.dirname, 'trivia');

function loadBank(file: string): Question[] {
  const questions: Question[] = [];
  let film = '';
  let current: Question | null = null;
  const finish = () => {
    if (!current) return;
    if (!current.correct || current.wrong.length !== ANSWER_COUNT - 1) {
      console.warn(`[trivia] Skipping malformed question in ${file}: ${current.question}`);
    } else {
      questions.push(current);
    }
    current = null;
  };

  for (const raw of readFileSync(join(BANK_DIR, file), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(FILM|Q|A|W):\s*(.+)$/.exec(line);
    if (!match) {
      console.warn(`[trivia] Ignoring line in ${file}: ${line}`);
      continue;
    }
    const [, key, value] = match;
    if (key === 'FILM') {
      finish();
      film = value;
    } else if (key === 'Q') {
      finish();
      current = { film, question: value, correct: '', wrong: [] };
    } else if (current && key === 'A') {
      current.correct = value;
    } else if (current && key === 'W') {
      current.wrong.push(value);
    }
  }
  finish();
  return questions;
}

/** Bank file for each mode id, e.g. disney-pixar -> disney-pixar.txt */
const BANKS = new Map<string, Question[]>(
  readdirSync(BANK_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => [f.replace(/\.txt$/, ''), loadBank(f)]),
);

/** Dealt from a shuffled deck per bank, so questions don't repeat until all are used. */
const decks = new Map<string, Question[]>();
function dealQuestion(bankId: string): Question {
  let deck = decks.get(bankId);
  if (!deck || deck.length === 0) {
    deck = shuffle([...(BANKS.get(bankId) ?? [])]);
    decks.set(bankId, deck);
  }
  return deck.pop()!;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ---- Game -----------------------------------------------------------------------

class Trivia implements MiniGame {
  private phase: TriviaPhase = 'question';
  private questionIndex = 0;
  private question!: Question;
  /** Answers in the order shown, and which of them is right. */
  private answers: string[] = [];
  private correctIndex = 0;
  /** Player id -> chosen answer index and the time left when they chose it. */
  private picks = new Map<string, { index: number; msLeft: number }>();
  private lastPoints = new Map<string, number>();
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

  private setPhase(phase: TriviaPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startQuestion(index: number) {
    this.questionIndex = index;
    this.question = dealQuestion(this.bankId);
    this.answers = shuffle([this.question.correct, ...this.question.wrong]);
    this.correctIndex = this.answers.indexOf(this.question.correct);
    this.picks.clear();
    this.lastPoints.clear();
    this.setPhase('question', READ_MS, () => this.setPhase('answering', ANSWER_MS, () => this.reveal()));
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as TriviaInput;
    if (this.phase !== 'answering' || input?.type !== 'answer') return;
    if (!Number.isInteger(input.index) || input.index < 0 || input.index >= this.answers.length) return;
    if (this.picks.has(playerId)) return; // answers are final
    this.picks.set(playerId, { index: input.index, msLeft: this.msLeft() });

    // Reveal as soon as everyone still here has answered.
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.picks.has(p.id))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    for (const [playerId, pick] of this.picks) {
      if (pick.index !== this.correctIndex) continue;
      const points = questionPoints(pick.msLeft);
      this.lastPoints.set(playerId, points);
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
      this.ctx.addScore(playerId, points);
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

  /** Answers are hidden until the reading time is over. */
  private visibleAnswers() {
    return this.phase === 'question' ? [] : this.answers;
  }

  syncHost() {
    const counts = this.answers.map((_, i) => [...this.picks.values()].filter((p) => p.index === i).length);
    const view: TriviaHostView = {
      phase: this.phase,
      packName: TRIVIA.modes.find((m) => m.id === this.bankId)?.name ?? '',
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      film: this.question.film,
      question: this.question.question,
      answers: this.visibleAnswers(),
      correctIndex: this.revealing ? this.correctIndex : null,
      counts: this.revealing ? counts : null,
      msLeft: this.msLeft(),
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        answered: this.picks.has(p.id),
        correct: this.revealing ? this.picks.get(p.id)?.index === this.correctIndex : null,
        questionPoints: this.lastPoints.get(p.id) ?? 0,
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: TriviaPlayerView = {
      phase: this.phase,
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      film: this.question.film,
      question: this.question.question,
      answers: this.visibleAnswers(),
      myAnswer: this.picks.get(playerId)?.index ?? null,
      correctIndex: this.revealing ? this.correctIndex : null,
      questionPoints: this.lastPoints.get(playerId) ?? 0,
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

export const trivia: MiniGameDefinition = {
  info: TRIVIA,
  create: (ctx, modeId, options) => new Trivia(ctx, modeId, options.puzzles),
};

/** For tooling: question count per bank. */
export const bankSizes = () => Object.fromEntries([...BANKS].map(([id, qs]) => [id, qs.length]));
