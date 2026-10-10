import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANSWER_COUNT,
  MAX_HEARTS,
  TRIVIA,
  TRIVIA_QUEST,
  type QuestMonster,
  type QuestResult,
  type QuestState,
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
// A "FILM:" (or "TOPIC:") line is the banner for every question after it. A is a right answer and
// each W is a wrong one; there are always four in total. More than one A makes
// it a select-all-that-apply question. Lines starting with # are comments.

export interface Question {
  film: string;
  question: string;
  correct: string[];
  wrong: string[];
}

const BANK_DIR = join(import.meta.dirname, 'trivia');

/**
 * Reads a question file in the format above. `valid` decides which questions to keep
 * (trivia wants exactly four options; Pick 'Em wants long lists).
 */
export function loadQuestionFile(path: string, valid: (q: Question) => boolean, tag = 'trivia'): Question[] {
  const questions: Question[] = [];
  let film = '';
  let current: Question | null = null;
  const finish = () => {
    if (!current) return;
    if (current.correct.length === 0 || !valid(current)) {
      console.warn(`[${tag}] Skipping malformed question in ${path}: ${current.question}`);
    } else {
      questions.push(current);
    }
    current = null;
  };

  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(FILM|TOPIC|Q|A|W):\s*(.+)$/.exec(line);
    if (!match) {
      console.warn(`[${tag}] Ignoring line in ${path}: ${line}`);
      continue;
    }
    const [, key, value] = match;
    // TOPIC is FILM by another name, for banks that aren't about films (e.g. TV shows).
    if (key === 'FILM' || key === 'TOPIC') {
      finish();
      film = value;
    } else if (key === 'Q') {
      finish();
      current = { film, question: value, correct: [], wrong: [] };
    } else if (current && key === 'A') {
      current.correct.push(value);
    } else if (current && key === 'W') {
      current.wrong.push(value);
    }
  }
  finish();
  return questions;
}

function loadBank(file: string): Question[] {
  return loadQuestionFile(join(BANK_DIR, file), (q) => q.correct.length + q.wrong.length === ANSWER_COUNT);
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

export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
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

  constructor(
    protected readonly ctx: GameContext,
    protected readonly bankId: string,
    /** Questions in the game (0 when open-ended, as in a quest). */
    protected readonly totalQuestions: number,
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
    this.question = dealQuestion(this.bankId);
    this.answers = shuffle([...this.question.correct, ...this.question.wrong]);
    this.correctIndices = this.answers.flatMap((a, i) => (this.question.correct.includes(a) ? [i] : []));
    this.picks.clear();
    this.lastPoints.clear();
    this.setPhase('question', READ_MS, () => this.setPhase('answering', ANSWER_MS, () => this.reveal()));
  }

  onInput(playerId: string, raw: unknown) {
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
  }
}

export const trivia: MiniGameDefinition = {
  info: TRIVIA,
  create: (ctx, modeId, options) => new Trivia(ctx, modeId, options.puzzles),
};

// ---- Trivia Quest (co-op) ---------------------------------------------------------------

/** Points for landing a hit, and for everyone when a monster falls or the quest is won. */
const HIT_POINTS = 150;
const MONSTER_BONUS = 300;
const VICTORY_BONUS = 500;
/** If a monster outlasts this many extra questions beyond its health, it wins (keeps quests from dragging on). */
const MONSTER_PATIENCE = 8;

const MONSTERS: { name: string; emoji: string }[] = [
  { name: 'Grumbling Goblin', emoji: '👺' },
  { name: 'Dire Wolf', emoji: '🐺' },
  { name: 'Giant Scorpion', emoji: '🦂' },
  { name: 'Vampire Bat', emoji: '🦇' },
  { name: 'Hungry Ogre', emoji: '👹' },
  { name: 'Skeleton King', emoji: '💀' },
  { name: 'Spider Queen', emoji: '🕷️' },
  { name: 'Kraken', emoji: '🐙' },
  { name: 'Haunted Pumpkin', emoji: '🎃' },
  { name: 'Robo-Knight', emoji: '🤖' },
];
const BOSSES: { name: string; emoji: string }[] = [
  { name: 'Ancient Dragon', emoji: '🐉' },
  { name: 'Tyrant Lizard', emoji: '🦖' },
  { name: 'Lord of the Deep', emoji: '🦈' },
];

/**
 * Everyone against a string of monsters (one per puzzle; the last is a boss). Every
 * fully right answer is a hit; wrong answers cost hearts. Out of hearts, a player is
 * a ghost until they answer one right. If the whole party are ghosts, the quest fails.
 */
class TriviaQuest extends Trivia {
  private hearts = new Map<string, number>();
  private results = new Map<string, QuestResult>();
  private monsters: Omit<QuestMonster, 'hp' | 'number' | 'total'>[] = [];
  private monsterIndex = 0;
  private hp = 0;
  private questionsOnMonster = 0;
  private outcome: QuestState['outcome'] = null;
  private defeatedNow = false;
  private hitsNow = 0;

  constructor(ctx: GameContext, bankId: string, private readonly monsterCount: number) {
    super(ctx, bankId, 0);
  }

  start() {
    const party = this.ctx.players().filter((p) => p.connected).length || 1;
    for (const p of this.ctx.players()) this.hearts.set(p.id, MAX_HEARTS);
    // About one and a half hits per player for each monster, half again for the boss.
    const health = Math.max(3, Math.ceil(party * 1.5));
    const pool = shuffle([...MONSTERS]);
    this.monsters = Array.from({ length: this.monsterCount }, (_, i) => {
      const boss = this.monsterCount > 1 && i === this.monsterCount - 1;
      const kind = boss ? BOSSES[Math.floor(Math.random() * BOSSES.length)] : pool[i % pool.length];
      return { ...kind, maxHp: boss ? Math.ceil(health * 1.5) : health, boss };
    });
    this.hp = this.monsters[0].maxHp;
    super.start();
  }

  protected scoreAnswers() {
    this.results.clear();
    this.defeatedNow = false;
    this.hitsNow = 0;
    for (const p of this.ctx.players()) {
      const pick = this.picks.get(p.id);
      const share = pick ? answerShare(pick.indices, this.correctIndices) : 0;
      const hearts = this.hearts.get(p.id) ?? MAX_HEARTS;
      let result: QuestResult;
      if (hearts === 0) {
        result = share === 1 ? 'revived' : 'ghost';
        if (result === 'revived') this.hearts.set(p.id, 1);
      } else if (share === 1) {
        result = 'hit';
        this.hitsNow++;
        this.lastPoints.set(p.id, HIT_POINTS);
        this.award(p.id, HIT_POINTS);
      } else if (share > 0) {
        result = 'glance';
      } else {
        result = 'hurt';
        this.hearts.set(p.id, hearts - 1);
      }
      this.results.set(p.id, result);
    }

    this.hp = Math.max(0, this.hp - this.hitsNow);
    this.questionsOnMonster++;
    const everyone = this.ctx.players();
    if (this.hp === 0) {
      this.defeatedNow = true;
      for (const p of everyone) this.award(p.id, MONSTER_BONUS);
      if (this.monsterIndex === this.monsters.length - 1) {
        this.outcome = 'victory';
        for (const p of everyone) this.award(p.id, VICTORY_BONUS);
      }
    } else {
      const standing = everyone.filter((p) => p.connected && (this.hearts.get(p.id) ?? 0) > 0);
      const worn = this.questionsOnMonster >= this.monsters[this.monsterIndex].maxHp + MONSTER_PATIENCE;
      if (standing.length === 0 || worn) this.outcome = 'defeat';
    }
  }

  protected afterReveal() {
    if (this.outcome) {
      this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
      return;
    }
    if (this.defeatedNow) {
      this.monsterIndex++;
      this.hp = this.monsters[this.monsterIndex].maxHp;
      this.questionsOnMonster = 0;
    }
    this.startQuestion(this.questionIndex + 1);
  }

  private questState(): QuestState {
    const m = this.monsters[this.monsterIndex];
    return {
      monster: { ...m, hp: this.hp, number: this.monsterIndex + 1, total: this.monsters.length },
      outcome: this.phase === 'gameEnd' ? this.outcome : null,
      defeatedNow: this.revealing && this.defeatedNow,
      hitsNow: this.revealing ? this.hitsNow : 0,
    };
  }

  protected decorateHost(view: TriviaHostView) {
    view.packName = `Trivia Quest · ${view.packName}`;
    view.quest = this.questState();
    for (const p of view.players) {
      p.hearts = this.hearts.get(p.id) ?? MAX_HEARTS;
      p.questResult = this.revealing ? (this.results.get(p.id) ?? null) : null;
    }
  }

  protected decoratePlayer(view: TriviaPlayerView, playerId: string) {
    view.quest = this.questState();
    view.hearts = this.hearts.get(playerId) ?? MAX_HEARTS;
    view.questResult = this.revealing ? (this.results.get(playerId) ?? null) : null;
  }
}

export const triviaQuest: MiniGameDefinition = {
  info: TRIVIA_QUEST,
  create: (ctx, modeId, options) => new TriviaQuest(ctx, modeId, options.puzzles),
};

/** For tooling: question count per bank. */
export const bankSizes = () => Object.fromEntries([...BANKS].map(([id, qs]) => [id, qs.length]));
