import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOARD_WORDS,
  CLUE_CREW,
  MAX_CLUE_NUMBER,
  type CardKind,
  type CrewClue,
  type CrewHostView,
  type CrewInput,
  type CrewPhase,
  type CrewPlayerView,
  type CrewResult,
} from '../../shared/games/clueCrew';
import { ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { isOffensive } from './words';

/** Clues and votes have no time limit; this often, check whether someone dropped out mid-turn. */
const PRESENCE_CHECK_MS = 2_000;
/** How long the result of a vote shows before play carries on. */
const RESULT_MS = 2_500;
/** Traps on each player's key. */
const TRAPS_PER_PLAYER = 2;
/**
 * On the shared scale, per round: finding every target is worth 700 a round to everyone (split
 * among the targets), and winning another 300 a round. The clue-giver gets a little extra.
 */
const FIND_POINTS_PER_ROUND = 700;
const WIN_POINTS_PER_ROUND = 300;
const GIVER_BONUS = 50;

const WORDS = readFileSync(join(import.meta.dirname, 'cluecrew', 'words.txt'), 'utf8')
  .split(/\r?\n/)
  .map((w) => w.trim().toUpperCase())
  .filter((w) => w && !w.startsWith('#') && /^[A-Z]+$/.test(w) && !isOffensive(w.toLowerCase()));

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Why a clue isn't allowed, or null if it's fine: one word, and not a word on the board or a form of one. */
export function clueProblem(raw: string, board: string[]): string | null {
  const word = raw.trim().toUpperCase();
  if (!/^[A-Z]{2,20}$/.test(word)) return 'One word, letters only.';
  for (const b of board) {
    if (word === b) return `${b} is on the board.`;
    const [short, long] = word.length <= b.length ? [word, b] : [b, word];
    if (short.length >= 3 && long.includes(short)) return `Too close to ${b}, which is on the board.`;
  }
  return null;
}

class ClueCrew implements MiniGame {
  private phase: CrewPhase = 'clue';
  private words: string[] = [];
  private found: boolean[] = [];
  /** Each player's secret key. */
  private keys = new Map<string, CardKind[]>();
  /** Turn order, fixed at the start. */
  private order: string[] = [];
  private turnIndex = 0;
  private clue: CrewClue | null = null;
  private guessesLeft = 0;
  private votes = new Map<string, number | 'stop'>();
  private last: CrewResult | null = null;
  private outcome: CrewHostView['outcome'] = null;
  private clueError: string | null = null;
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private presenceCheck: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalRounds: number,
  ) {}

  private get targets() {
    const all = new Set<number>();
    for (const key of this.keys.values()) key.forEach((k, i) => k === 'target' && all.add(i));
    return all;
  }

  private get giverId() {
    return this.order[this.turnIndex % this.order.length];
  }

  start() {
    const players = this.ctx.players().filter((p) => p.connected);
    this.order = shuffle(players.map((p) => p.id));
    const n = this.order.length;
    this.words = shuffle([...WORDS]).slice(0, BOARD_WORDS);
    this.found = this.words.map(() => false);

    // About two targets per clue the team will get, at least one each and at most 15.
    const targetCount = Math.max(n, Math.min(15, Math.round(2.2 * n * this.totalRounds)));
    const cards = shuffle(this.words.map((_, i) => i));
    const targets = cards.slice(0, targetCount);
    const others = cards.slice(targetCount);
    for (const id of this.order) this.keys.set(id, this.words.map(() => 'neutral' as CardKind));
    // Every target is known by one player (round-robin), and some by a second.
    targets.forEach((card, i) => {
      const owner = this.order[i % n];
      this.keys.get(owner)![card] = 'target';
      if (n > 1 && Math.random() < 0.25) {
        const second = this.order[((i % n) + 1 + Math.floor(Math.random() * (n - 1))) % n];
        this.keys.get(second)![card] = 'target';
      }
    });
    // Each player's traps are among the words that aren't targets for anyone.
    for (const id of this.order) {
      for (const card of shuffle([...others]).slice(0, TRAPS_PER_PLAYER)) this.keys.get(id)![card] = 'trap';
    }
    this.turnIndex = -1;
    this.nextTurn();
    this.presenceCheck = setInterval(() => this.checkPresence(), PRESENCE_CHECK_MS);
  }

  /** A phase that moves on by itself after `ms`, or (clue and guess) waits for players. */
  private setPhase(phase: CrewPhase, ms: number | null, next?: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + (ms ?? 0);
    if (this.timer) clearTimeout(this.timer);
    this.timer = ms !== null && next ? setTimeout(next, ms) : null;
    this.syncAll();
  }

  /** With no time limits, a turn would stall if the clue-giver leaves or the last voter does. */
  private checkPresence() {
    if (this.phase !== 'clue' && this.phase !== 'guess') return;
    const giver = this.ctx.players().find((p) => p.id === this.giverId);
    if (!giver?.connected) return this.nextTurn();
    const guessers = this.guessers();
    if (this.phase === 'guess' && guessers.length > 0 && guessers.every((p) => this.votes.has(p.id))) this.resolveVote();
  }

  /** Targets this player still has to give clues for. */
  private targetsLeftFor(id: string) {
    return (this.keys.get(id) ?? []).filter((k, i) => k === 'target' && !this.found[i]).length;
  }

  /** On to the next clue-giver, skipping anyone who's gone or has nothing left to clue. */
  private nextTurn() {
    const n = this.order.length;
    for (let tries = 0; tries <= n; tries++) {
      this.turnIndex++;
      if (this.turnIndex >= n * this.totalRounds) return this.end('outOfTurns');
      const giver = this.ctx.players().find((p) => p.id === this.giverId);
      if (giver?.connected && this.targetsLeftFor(giver.id) > 0) break;
    }
    this.clue = null;
    this.clueError = null;
    this.votes.clear();
    this.last = null;
    this.setPhase('clue', null);
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as CrewInput;
    if (!input) return;
    if (this.phase === 'clue' && input.type === 'clue' && playerId === this.giverId) {
      const word = String(input.word ?? '');
      const number = Math.round(Number(input.number));
      const problem = clueProblem(word, this.words) ?? (number >= 1 && number <= MAX_CLUE_NUMBER ? null : `Pick a number from 1 to ${MAX_CLUE_NUMBER}.`);
      if (problem) {
        this.clueError = problem;
        this.syncPlayer(playerId);
        return;
      }
      this.clueError = null;
      this.clue = { word: word.trim().toUpperCase(), number };
      this.guessesLeft = number + 1;
      this.startGuess();
      return;
    }
    if (this.phase !== 'guess' || playerId === this.giverId) return;
    if (input.type === 'stop') this.votes.set(playerId, 'stop');
    else if (input.type === 'vote' && Number.isInteger(input.index) && input.index >= 0 && input.index < this.words.length && !this.found[input.index]) {
      this.votes.set(playerId, input.index);
    } else return;
    if (this.guessers().every((p) => this.votes.has(p.id))) this.resolveVote();
    else this.syncAll();
  }

  /** The clue-giver giving up: no clue this turn, on to the next player. */
  giveUp(playerId: string) {
    if (this.phase === 'clue' && playerId === this.giverId) this.nextTurn();
  }

  private guessers() {
    return this.ctx.players().filter((p) => p.connected && p.id !== this.giverId);
  }

  private startGuess() {
    this.votes.clear();
    this.setPhase('guess', null);
  }

  /** The most-voted choice wins (ties broken at random). */
  private resolveVote() {
    const tally = new Map<number | 'stop', number>();
    for (const v of this.votes.values()) tally.set(v, (tally.get(v) ?? 0) + 1);
    const top = Math.max(0, ...tally.values());
    const leaders = [...tally].filter(([, c]) => c === top).map(([v]) => v);
    const choice = leaders.length ? leaders[Math.floor(Math.random() * leaders.length)] : 'stop';

    if (choice === 'stop') {
      this.last = { index: null, kind: 'stop' };
      return this.setPhase('result', RESULT_MS, () => this.nextTurn());
    }
    const kind = this.keys.get(this.giverId)![choice];
    this.last = { index: choice, kind };
    if (kind === 'trap') return this.setPhase('result', RESULT_MS, () => this.end('trap'));
    if (kind === 'neutral') return this.setPhase('result', RESULT_MS, () => this.nextTurn());

    this.found[choice] = true;
    const perTarget = Math.floor((FIND_POINTS_PER_ROUND * this.totalRounds) / this.targets.size / 10) * 10;
    for (const p of this.ctx.players()) this.award(p.id, perTarget);
    this.award(this.giverId, GIVER_BONUS);
    this.guessesLeft--;
    const allFound = [...this.targets].every((i) => this.found[i]);
    this.setPhase('result', RESULT_MS, () => {
      if (allFound) this.end('complete');
      else if (this.guessesLeft > 0 && this.targetsLeftFor(this.giverId) > 0) this.startGuess();
      else this.nextTurn();
    });
  }

  private award(playerId: string, points: number) {
    this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
    this.ctx.addScore(playerId, points);
  }

  private end(outcome: NonNullable<CrewHostView['outcome']>) {
    this.outcome = outcome;
    if (outcome === 'complete') for (const p of this.ctx.players()) this.award(p.id, WIN_POINTS_PER_ROUND * this.totalRounds);
    this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private base() {
    const n = this.order.length;
    const turn = Math.min(this.turnIndex, n * this.totalRounds - 1);
    const giver = this.ctx.players().find((p) => p.id === this.giverId);
    const voteCounts = this.words.map(() => 0);
    let stopVotes = 0;
    for (const v of this.votes.values()) {
      if (v === 'stop') stopVotes++;
      else voteCounts[v]++;
    }
    const targets = this.targets;
    return {
      phase: this.phase,
      round: Math.floor(turn / n) + 1,
      totalRounds: this.totalRounds,
      turn: (turn % n) + 1,
      turnsPerRound: n,
      giverId: this.giverId,
      giverName: giver?.name ?? '',
      clue: this.clue,
      guessesLeft: this.guessesLeft,
      cards: this.words.map((word, i) => ({ word, found: this.found[i] })),
      found: [...targets].filter((i) => this.found[i]).length,
      totalTargets: targets.size,
      voteCounts,
      stopVotes,
      last: this.last,
      outcome: this.outcome,
      msLeft: this.msLeft(),
    };
  }

  syncHost() {
    const view: CrewHostView = {
      ...this.base(),
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        voted: this.votes.has(p.id),
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: CrewPlayerView = {
      ...this.base(),
      isGiver: playerId === this.giverId,
      // Someone who joined after the start has no key: everything's neutral to them.
      key: this.keys.get(playerId) ?? this.words.map(() => 'neutral'),
      myTargetsLeft: this.targetsLeftFor(playerId),
      myVote: this.votes.get(playerId) ?? null,
      clueError: playerId === this.giverId ? this.clueError : null,
      canGiveUp: this.phase === 'clue' && playerId === this.giverId,
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
    if (this.presenceCheck) clearInterval(this.presenceCheck);
    this.timer = null;
    this.presenceCheck = null;
  }
}

export const clueCrew: MiniGameDefinition = {
  info: CLUE_CREW,
  create: (ctx, _modeId, options) => new ClueCrew(ctx, options.puzzles),
};

/** For tooling: how many words the board can draw from. */
export const clueCrewWordCount = () => WORDS.length;
