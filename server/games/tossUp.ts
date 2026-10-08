import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HIDDEN,
  TOSS_UP,
  layoutPuzzle,
  normalizeAnswer,
  type TossUpGuess,
  type TossUpHostView,
  type TossUpInput,
  type TossUpPhase,
  type TossUpPlayerView,
} from '../../shared/games/tossUp';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/**
 * Every puzzle is worth the same: there's no way to tell how hard a puzzle is, so
 * none should count for more.
 */
const PUZZLE_VALUE = 750;

const INTRO_MS = 4_000;
/** Time between letters appearing. */
const REVEAL_INTERVAL_MS = 2_000;
/** Time the buzzer gets to type their answer. */
const ANSWER_MS = 45_000;
/** Pause after a wrong answer before letters start appearing again. */
const WRONG_PAUSE_MS = 2_500;
/** Last chance to buzz once every letter is showing. */
const FULL_BOARD_GRACE_MS = 5_000;

// ---- Puzzle bank -------------------------------------------------------------

interface Puzzle {
  category: string;
  text: string;
  lines: string[];
}

function loadPuzzles(): Puzzle[] {
  const file = readFileSync(join(import.meta.dirname, 'puzzles.txt'), 'utf8');
  const puzzles: Puzzle[] = [];
  for (const raw of file.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [category, text] = line.split('|').map((s) => s.trim().toUpperCase());
    const lines = text && category ? layoutPuzzle(text) : null;
    if (!lines || !/[A-Z]/.test(text)) {
      console.warn(`[letter drop] Skipping puzzle that doesn't fit the board: ${line}`);
      continue;
    }
    puzzles.push({ category, text, lines });
  }
  return puzzles;
}

const PUZZLES = loadPuzzles();

/** Dealt from a shuffled deck so puzzles don't repeat until every one has been used. */
let deck: Puzzle[] = [];
function dealPuzzle(): Puzzle {
  if (deck.length === 0) {
    deck = [...PUZZLES];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop()!;
}

// ---- Game -------------------------------------------------------------------

class TossUp implements MiniGame {
  private phase: TossUpPhase = 'intro';
  private puzzleIndex = 0;
  private puzzle!: Puzzle;
  /** Positions ("line:col") of letters still hidden, in the random order they'll appear. */
  private hiddenOrder: string[] = [];
  private hidden = new Set<string>();
  private lockedOut = new Set<string>();
  /** Points each player has earned in this game (shown on the round scores screen). */
  private gamePoints = new Map<string, number>();
  private buzzerId: string | null = null;
  private lastGuess: TossUpGuess | null = null;
  private solvedBy: string | null = null;
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private get value() {
    return PUZZLE_VALUE;
  }

  private schedule(ms: number, next: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.phaseEndsAt = Date.now() + ms;
    this.timer = setTimeout(next, ms);
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    this.puzzle = dealPuzzle();
    this.lockedOut.clear();
    this.buzzerId = null;
    this.lastGuess = null;
    this.solvedBy = null;

    const positions: string[] = [];
    this.puzzle.lines.forEach((line, l) => {
      [...line].forEach((ch, c) => {
        if (/[A-Z]/.test(ch)) positions.push(`${l}:${c}`);
      });
    });
    this.hidden = new Set(positions);
    this.hiddenOrder = positions.sort(() => Math.random() - 0.5);

    this.phase = 'intro';
    this.schedule(INTRO_MS, () => this.resumeRevealing(REVEAL_INTERVAL_MS));
    this.syncAll();
  }

  /** Continue showing letters after `delayMs`. */
  private resumeRevealing(delayMs: number) {
    this.phase = 'revealing';
    this.buzzerId = null;
    this.schedule(delayMs, () => this.revealNext());
    this.syncAll();
  }

  private revealNext() {
    const next = this.hiddenOrder.shift();
    if (next) this.hidden.delete(next);

    if (this.hiddenOrder.length > 0) {
      this.schedule(REVEAL_INTERVAL_MS, () => this.revealNext());
    } else {
      // Every letter is showing; give one last chance to buzz.
      this.schedule(FULL_BOARD_GRACE_MS, () => this.finishPuzzle(null));
    }
    this.syncAll();
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as TossUpInput;
    if (input?.type === 'buzz') this.buzz(playerId);
    else if (input?.type === 'answer' && typeof input.text === 'string') this.answer(playerId, input.text);
  }

  private buzz(playerId: string) {
    // First buzz wins; the server decides, so ties can't happen.
    if (this.phase !== 'revealing' || this.lockedOut.has(playerId)) return;
    this.phase = 'buzzed';
    this.buzzerId = playerId;
    this.lastGuess = null;
    this.schedule(ANSWER_MS, () => this.wrongAnswer(playerId, ''));
    this.syncAll();
  }

  private answer(playerId: string, text: string) {
    if (this.phase !== 'buzzed' || this.buzzerId !== playerId) return;
    const guess = text.trim().slice(0, 80);
    if (normalizeAnswer(guess) === normalizeAnswer(this.puzzle.text)) {
      this.lastGuess = { playerId, name: this.nameOf(playerId), text: guess, correct: true };
      this.ctx.addScore(playerId, this.value);
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + this.value);
      this.finishPuzzle(playerId);
    } else {
      this.wrongAnswer(playerId, guess);
    }
  }

  /** Wrong answer or ran out of time: that player is locked out of this puzzle. */
  private wrongAnswer(playerId: string, guess: string) {
    this.lockedOut.add(playerId);
    this.lastGuess = { playerId, name: this.nameOf(playerId), text: guess, correct: false };

    const stillIn = this.ctx.players().filter((p) => p.connected && !this.lockedOut.has(p.id));
    if (stillIn.length === 0) {
      this.finishPuzzle(null);
    } else if (this.hiddenOrder.length === 0) {
      // Board is already full: just reopen buzzing for the grace period.
      this.phase = 'revealing';
      this.buzzerId = null;
      this.schedule(FULL_BOARD_GRACE_MS, () => this.finishPuzzle(null));
      this.syncAll();
    } else {
      this.resumeRevealing(WRONG_PAUSE_MS);
    }
  }

  private finishPuzzle(solvedBy: string | null) {
    this.solvedBy = solvedBy;
    this.buzzerId = null;
    this.hidden.clear();
    this.hiddenOrder = [];
    this.phase = solvedBy ? 'solved' : 'unsolved';

    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.schedule(PUZZLE_RESULT_MS, () => {
      if (!isLast) return this.startPuzzle(this.puzzleIndex + 1);
      this.phase = 'gameEnd';
      this.schedule(ROUND_SCORES_MS, () => this.ctx.finish());
      this.syncAll();
    });
    this.syncAll();
  }

  private nameOf(playerId: string) {
    return this.ctx.players().find((p) => p.id === playerId)?.name ?? '?';
  }

  /** Board lines with unrevealed letters masked. */
  private maskedLines(): string[] {
    return this.puzzle.lines.map((line, l) =>
      [...line].map((ch, c) => (this.hidden.has(`${l}:${c}`) ? HIDDEN : ch)).join(''),
    );
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  syncHost() {
    const view: TossUpHostView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      value: this.value,
      category: this.puzzle.category,
      lines: this.maskedLines(),
      buzzerId: this.buzzerId,
      msLeft: this.msLeft(),
      lastGuess: this.lastGuess,
      solvedBy: this.solvedBy,
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        lockedOut: this.lockedOut.has(p.id),
        gamePoints: this.gamePoints.get(p.id) ?? 0,
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const lockedOut = this.lockedOut.has(playerId);
    const view: TossUpPlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      value: this.value,
      category: this.puzzle.category,
      lines: this.maskedLines(),
      msLeft: this.msLeft(),
      score: player.score,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      canBuzz: this.phase === 'revealing' && !lockedOut,
      answering: this.phase === 'buzzed' && this.buzzerId === playerId,
      lockedOut,
      buzzerName: this.buzzerId ? this.nameOf(this.buzzerId) : null,
      lastGuess: this.lastGuess,
      solvedByName: this.solvedBy ? this.nameOf(this.solvedBy) : null,
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

export const tossUp: MiniGameDefinition = {
  info: TOSS_UP,
  create: (ctx, _modeId, options) => new TossUp(ctx, options.puzzles),
};

/** For tests and tooling. */
export const puzzleCount = () => PUZZLES.length;
