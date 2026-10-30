import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANSWER_COUNT,
  MAX_LIVES,
  TRIVIA,
  TRIVIA_QUEST,
  type TeamResult,
  type TeamState,
  type TriviaHostView,
  type TriviaInput,
  type TriviaPhase,
  type TriviaPlayerView,
} from '../../shared/games/trivia';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { embeddedList, hasLists, type EmbeddedList } from './pickEm';
import { loadQuestionFile, shuffle, type Question } from './questions';

/** The question alone, before the answers appear. */
const READ_MS = 3_000;
/** Time to pick an answer once they're up. */
const ANSWER_MS = 20_000;
/** With lists mixed in, the share of questions that are Pick 'Em lists instead. */
const LIST_SHARE = 0.25;

// Scoring: a right answer is worth BASE_POINTS plus up to SPEED_BONUS more the
// sooner it was locked in (all of it at once, none of it at the buzzer).
const BASE_POINTS = 500;
const SPEED_BONUS = 500;

/**
 * Points for one player's answer. For select-all questions, partial credit: the
 * share of right answers picked, minus the share of wrong answers picked (never
 * below 0). Picking every option therefore scores nothing unless they're all right.
 */
export function questionPoints(msLeft: number, picked: number[], correct: number[]): number {
  const share = answerShare(picked, correct);
  const full = BASE_POINTS + (SPEED_BONUS * Math.max(0, msLeft)) / ANSWER_MS;
  return Math.round(share * full);
}

/** How right an answer is, 0 to 1 (1 only when it's exactly the right answers). */
export function answerShare(picked: number[], correct: number[]): number {
  const right = picked.filter((i) => correct.includes(i)).length;
  const wrong = picked.length - right;
  const wrongOptions = ANSWER_COUNT - correct.length;
  return Math.max(0, right / correct.length - (wrongOptions > 0 ? wrong / wrongOptions : 0));
}

// ---- Question banks -----------------------------------------------------------
//
// Each file in ./trivia is one bank (one mode), in the format described in ./questions.

const BANK_DIR = join(import.meta.dirname, 'trivia');

function loadBank(file: string): Question[] {
  return loadQuestionFile(
    join(BANK_DIR, file),
    (q) => q.correct.length > 0 && q.correct.length + q.wrong.length === ANSWER_COUNT && q.list.length === 0,
  );
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

// ---- Game -----------------------------------------------------------------------

class Trivia implements MiniGame {
  protected phase: TriviaPhase = 'question';
  protected questionIndex = 0;
  protected question!: Question;
  /** Answers in the order shown, and which of them are right. */
  protected answers: string[] = [];
  protected correctIndices: number[] = [];
  /** Player id -> the answers they locked in and the time left when they did. */
  protected picks = new Map<string, { indices: number[]; msLeft: number }>();
  protected lastPoints = new Map<string, number>();
  protected gamePoints = new Map<string, number>();
  protected phaseEndsAt = 0;
  protected timer: NodeJS.Timeout | null = null;
  /** A Pick 'Em list being played in place of a question, when lists are mixed in. */
  protected list: EmbeddedList | null = null;
  private listPlayed = false;

  constructor(
    protected readonly ctx: GameContext,
    protected readonly bankId: string,
    /** Questions in the game (0 when open-ended, as in a quest). */
    protected readonly totalQuestions: number,
    private readonly mixLists = false,
  ) {}

  start() {
    this.startQuestion(0);
  }

  protected setPhase(phase: TriviaPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  protected startQuestion(index: number) {
    this.questionIndex = index;
    // Lists come up now and then, and at least once in a game of two or more questions.
    const lastChance = this.totalQuestions > 1 && index === this.totalQuestions - 1 && !this.listPlayed;
    if (this.mixLists && hasLists(this.bankId) && (lastChance || Math.random() < LIST_SHARE)) {
      this.listPlayed = true;
      this.startList();
      return;
    }
    this.question = dealQuestion(this.bankId);
    this.ctx.showingQuestion({ banner: this.question.film, question: this.question.question, answers: this.question.correct, wrong: this.question.wrong });
    this.answers = shuffle([...this.question.correct, ...this.question.wrong]);
    this.correctIndices = this.answers.flatMap((a, i) => (this.question.correct.includes(a) ? [i] : []));
    this.picks.clear();
    this.lastPoints.clear();
    this.setPhase('question', READ_MS, () => this.setPhase('answering', ANSWER_MS, () => this.reveal()));
  }

  /** A Pick 'Em list in place of this question; it hands back when its reveal is over. */
  private startList() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const list = embeddedList(
      { ...this.ctx, addScore: (id, points) => this.award(id, points), finish: () => this.listFinished(list) },
      this.bankId,
      this.isTeam,
      this.listHeading(),
    );
    this.list = list;
    list.game.start();
  }

  private listFinished(list: EmbeddedList) {
    if (this.list !== list) return;
    list.game.dispose();
    this.list = null;
    this.afterList(list.found());
  }

  /** Shown on a mixed-in list in place of "List 1 of 1". */
  protected listHeading() {
    return `Question ${this.questionIndex + 1} of ${this.totalQuestions}`;
  }

  /** Team Trivia plays mixed-in lists co-op. */
  protected get isTeam() {
    return false;
  }

  /** After a mixed-in list (its points are already scored): on as after a question's reveal. */
  protected afterList(_found: number) {
    this.afterReveal();
  }

  onInput(playerId: string, raw: unknown) {
    if (this.list) return this.list.game.onInput(playerId, raw);
    const input = raw as TriviaInput;
    if (this.phase !== 'answering' || input?.type !== 'answer' || !Array.isArray(input.indices)) return;
    if (this.picks.has(playerId)) return; // answers are final
    const indices = [...new Set(input.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < this.answers.length);
    // A normal question takes exactly one answer; select-all takes one or more.
    if (indices.length === 0 || (!this.multi && indices.length !== 1)) return;
    this.picks.set(playerId, { indices, msLeft: this.msLeft() });

    // Reveal as soon as everyone still here has answered.
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.picks.has(p.id))) this.reveal();
    else this.syncAll();
  }

  /** Giving up: no answer to this question (in Team Trivia that costs a life, as a missed answer does). */
  giveUp(playerId: string) {
    if (this.list) return this.list.game.giveUp?.(playerId);
    if (!this.canGiveUp(playerId)) return;
    this.picks.set(playerId, { indices: [], msLeft: 0 });
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.picks.has(p.id))) this.reveal();
    else this.syncAll();
  }

  private canGiveUp(playerId: string) {
    return (this.phase === 'question' || this.phase === 'answering') && !this.picks.has(playerId);
  }

  private reveal() {
    this.scoreAnswers();
    this.setPhase('reveal', PUZZLE_RESULT_MS, () => this.afterReveal());
  }

  protected award(playerId: string, points: number) {
    this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
    this.ctx.addScore(playerId, points);
  }

  /** Scores everyone's answer to the question just revealed. */
  protected scoreAnswers() {
    for (const [playerId, pick] of this.picks) {
      const points = questionPoints(pick.msLeft, pick.indices, this.correctIndices);
      if (points === 0) continue;
      this.lastPoints.set(playerId, points);
      this.award(playerId, points);
    }
  }

  /** After the reveal: the next question, or the end of the game. */
  protected afterReveal() {
    const isLast = this.questionIndex >= this.totalQuestions - 1;
    if (!isLast) this.startQuestion(this.questionIndex + 1);
    // With a single question, round scores would just repeat the reveal, so skip them.
    else if (this.totalQuestions === 1) this.ctx.finish();
    else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
  }

  /** Extra fields for the host and player views (Trivia Quest adds its state). */
  protected decorateHost(_view: TriviaHostView) {}
  protected decoratePlayer(_view: TriviaPlayerView, _playerId: string) {}

  protected msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private get multi() {
    return this.question.correct.length > 1;
  }

  protected get revealing() {
    return this.phase === 'reveal' || this.phase === 'gameEnd';
  }

  /** Answers are hidden until the reading time is over. */
  private visibleAnswers() {
    return this.phase === 'question' ? [] : this.answers;
  }

  syncHost() {
    if (this.list) return this.list.game.syncHost();
    const counts = this.answers.map((_, i) => [...this.picks.values()].filter((p) => p.indices.includes(i)).length);
    const view: TriviaHostView = {
      phase: this.phase,
      packName: TRIVIA.modes.find((m) => m.id === this.bankId)?.name ?? '',
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      film: this.question.film,
      question: this.question.question,
      answers: this.visibleAnswers(),
      multi: this.multi,
      correctIndices: this.revealing ? this.correctIndices : null,
      counts: this.revealing ? counts : null,
      msLeft: this.msLeft(),
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        answered: this.picks.has(p.id),
        correct: this.revealing ? (this.lastPoints.get(p.id) ?? 0) > 0 : null,
        questionPoints: this.lastPoints.get(p.id) ?? 0,
      })),
    };
    this.decorateHost(view);
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    if (this.list) return this.list.game.syncPlayer(playerId);
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: TriviaPlayerView = {
      phase: this.phase,
      questionNumber: this.questionIndex + 1,
      totalQuestions: this.totalQuestions,
      film: this.question.film,
      question: this.question.question,
      answers: this.visibleAnswers(),
      multi: this.multi,
      myAnswers: this.picks.get(playerId)?.indices ?? [],
      correctIndices: this.revealing ? this.correctIndices : null,
      questionPoints: this.lastPoints.get(playerId) ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      msLeft: this.msLeft(),
      canGiveUp: this.canGiveUp(playerId),
      gaveUp: !this.revealing && this.picks.get(playerId)?.indices.length === 0,
    };
    this.decoratePlayer(view, playerId);
    this.ctx.sendPlayer(playerId, view);
  }

  protected syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.list?.game.dispose();
    this.list = null;
  }
}

export const trivia: MiniGameDefinition = {
  info: TRIVIA,
  create: (ctx, modeId, options) => new Trivia(ctx, modeId, options.puzzles, options.mixLists),
};

// ---- Team Trivia (co-op) ----------------------------------------------------------------

/** Points for a correct answer, and for everyone when a stage is cleared or the challenge is won. */
// On the shared scale: a stage (one puzzle) comes to about 700 with a couple of right answers,
// and the final one to about 1,000 with the completion bonus.
const CORRECT_POINTS = 150;
const STAGE_BONUS = 400;
const COMPLETE_BONUS = 300;
/** A stage still not cleared this many questions beyond what it needs ends the challenge (so it can't drag on). */
const STAGE_PATIENCE = 8;

/**
 * The team works through stages (one per puzzle; the last needs more). Every fully
 * right answer counts toward the stage; wrong answers cost lives. Out of lives, a
 * player is out until they answer one right. If everyone is out, the challenge fails.
 */
class TeamTrivia extends Trivia {
  private lives = new Map<string, number>();
  private results = new Map<string, TeamResult>();
  private needed: number[] = [];
  private stageIndex = 0;
  private correct = 0;
  private questionsOnStage = 0;
  private outcome: TeamState['outcome'] = null;
  private clearedNow = false;
  private correctNow = 0;

  constructor(ctx: GameContext, bankId: string, private readonly stageCount: number, mixLists = false) {
    super(ctx, bankId, 0, mixLists);
  }

  protected get isTeam() {
    return true;
  }

  protected listHeading() {
    return `Stage ${this.stageIndex + 1} of ${this.needed.length}`;
  }

  /** Every answer the team found on a mixed-in list counts toward the stage (and costs no lives). */
  protected afterList(found: number) {
    this.results.clear();
    this.clearedNow = false;
    this.correctNow = found;
    this.advanceStage();
    this.afterReveal();
  }

  start() {
    const team = this.ctx.players().filter((p) => p.connected).length || 1;
    for (const p of this.ctx.players()) this.lives.set(p.id, MAX_LIVES);
    // About one and a half correct answers per player for each stage, half again for the final one.
    const base = Math.max(3, Math.ceil(team * 1.5));
    this.needed = Array.from({ length: this.stageCount }, (_, i) =>
      this.stageCount > 1 && i === this.stageCount - 1 ? Math.ceil(base * 1.5) : base,
    );
    super.start();
  }

  protected scoreAnswers() {
    this.results.clear();
    this.clearedNow = false;
    this.correctNow = 0;
    for (const p of this.ctx.players()) {
      const pick = this.picks.get(p.id);
      const share = pick ? answerShare(pick.indices, this.correctIndices) : 0;
      const lives = this.lives.get(p.id) ?? MAX_LIVES;
      let result: TeamResult;
      if (lives === 0) {
        result = share === 1 ? 'back' : 'out';
        if (result === 'back') this.lives.set(p.id, 1);
      } else if (share === 1) {
        result = 'correct';
        this.correctNow++;
        this.lastPoints.set(p.id, CORRECT_POINTS);
        this.award(p.id, CORRECT_POINTS);
      } else if (share > 0) {
        result = 'partial';
      } else {
        result = 'wrong';
        this.lives.set(p.id, lives - 1);
      }
      this.results.set(p.id, result);
    }
    this.advanceStage();
  }

  /** Adds this question's correct answers to the stage: cleared, complete, or failed. */
  private advanceStage() {
    const needed = this.needed[this.stageIndex];
    this.correct = Math.min(needed, this.correct + this.correctNow);
    this.questionsOnStage++;
    const everyone = this.ctx.players();
    if (this.correct >= needed) {
      this.clearedNow = true;
      for (const p of everyone) this.award(p.id, STAGE_BONUS);
      if (this.stageIndex === this.needed.length - 1) {
        this.outcome = 'complete';
        for (const p of everyone) this.award(p.id, COMPLETE_BONUS);
      }
    } else {
      const stillIn = everyone.filter((p) => p.connected && (this.lives.get(p.id) ?? 0) > 0);
      const stalled = this.questionsOnStage >= needed + STAGE_PATIENCE;
      if (stillIn.length === 0 || stalled) this.outcome = 'failed';
    }
  }

  protected afterReveal() {
    if (this.outcome) {
      this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
      return;
    }
    if (this.clearedNow) {
      this.stageIndex++;
      this.correct = 0;
      this.questionsOnStage = 0;
    }
    this.startQuestion(this.questionIndex + 1);
  }

  private teamState(): TeamState {
    return {
      stage: {
        number: this.stageIndex + 1,
        total: this.needed.length,
        needed: this.needed[this.stageIndex],
        correct: this.correct,
        final: this.needed.length > 1 && this.stageIndex === this.needed.length - 1,
      },
      outcome: this.phase === 'gameEnd' ? this.outcome : null,
      clearedNow: this.revealing && this.clearedNow,
      correctNow: this.revealing ? this.correctNow : 0,
    };
  }

  protected decorateHost(view: TriviaHostView) {
    view.team = this.teamState();
    for (const p of view.players) {
      p.lives = this.lives.get(p.id) ?? MAX_LIVES;
      p.teamResult = this.revealing ? (this.results.get(p.id) ?? null) : null;
    }
  }

  protected decoratePlayer(view: TriviaPlayerView, playerId: string) {
    view.team = this.teamState();
    view.lives = this.lives.get(playerId) ?? MAX_LIVES;
    view.teamResult = this.revealing ? (this.results.get(playerId) ?? null) : null;
  }
}

export const triviaQuest: MiniGameDefinition = {
  info: TRIVIA_QUEST,
  create: (ctx, modeId, options) => new TeamTrivia(ctx, modeId, options.puzzles, options.mixLists),
};

/** For tooling: question count per bank. */
export const bankSizes = () => Object.fromEntries([...BANKS].map(([id, qs]) => [id, qs.length]));

/** A bank's questions (e.g. for Blockbusters, which picks them by the answer's first letter). */
export const triviaBank = (bankId: string): readonly Question[] => BANKS.get(bankId) ?? [];
