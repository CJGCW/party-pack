import {
  BLOCKBUSTERS,
  boardSize,
  winningPath,
  type BlockbustersHex,
  type BlockbustersHostView,
  type BlockbustersInput,
  type BlockbustersPhase,
  type BlockbustersPlayerView,
  type Team,
} from '../../shared/games/blockbusters';
import { ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { matchAnswer } from './pickEm';
import { shuffle, type Question } from './questions';
import { triviaBank } from './trivia';

const PICK_MS = 15_000;
const BUZZ_MS = 12_000;
/** Time to type an answer once you've buzzed. */
const ANSWER_MS = 15_000;
const RESULT_MS = 2_500;
const BOARD_END_MS = 5_000;
/** Questions tried on one hexagon before the team in control picks again. */
const QUESTIONS_PER_HEX = 2;
/**
 * On the shared scale: to whoever answers right, and to everyone on a team that wins a board, so
 * a board comes to about 1,000 for a winner who answered several.
 */
const CORRECT_POINTS = 100;
const WIN_POINTS = 500;

const other = (team: Team): Team => (team === 'red' ? 'white' : 'red');

/** The letter a question's answer starts with, ignoring "The", "A" and "An" and any quotes. */
export function answerLetter(answer: string): string | null {
  const word = answer.replace(/^[^A-Za-z0-9]+/, '').replace(/^(the|a|an)\s+/i, '').replace(/^[^A-Za-z]+/, '');
  const letter = word[0]?.toUpperCase();
  return letter && /[A-Z]/.test(letter) ? letter : null;
}

/**
 * Ways to type an answer that count as right (on top of the matcher forgiving case, accents and
 * small typos): without a leading "The", just the quoted part of a song or film title, without
 * a bracketed note, and a name's last word ("Shakespeare" for "William Shakespeare").
 */
export function answerForms(answer: string): string[] {
  const forms = new Set([answer]);
  const bare = answer.replace(/^(the|a|an)\s+/i, '');
  forms.add(bare);
  const quoted = /"([^"]+)"/.exec(answer);
  if (quoted) forms.add(quoted[1]);
  const unbracketed = answer.replace(/\s*\([^)]*\)/g, '').trim();
  if (unbracketed) forms.add(unbracketed);
  const words = bare.split(/\s+/);
  const last = words.at(-1)!;
  if (words.length >= 2 && words.length <= 3 && words.every((w) => /^[A-Z]/.test(w)) && last.length >= 4) forms.add(last);
  return [...forms];
}

/** Whether a typed answer is right. */
export const isRightAnswer = (text: string, answer: string) => matchAnswer(text, [answerForms(answer)]) === 0;

/** A bank's single-answer questions by the first letter of their answer. */
export function questionsByLetter(questions: readonly Question[]) {
  const byLetter = new Map<string, Question[]>();
  for (const q of questions) {
    if (q.correct.length !== 1 || q.list.length > 0) continue;
    const letter = answerLetter(q.correct[0]);
    if (letter) byLetter.set(letter, [...(byLetter.get(letter) ?? []), q]);
  }
  return byLetter;
}

/** Letters for a board, all different, favouring letters with more questions to choose from. */
export function pickLetters(byLetter: Map<string, Question[]>, count: number): string[] {
  const pool = [...byLetter].map(([letter, qs]) => ({ letter, weight: Math.min(4, qs.length) }));
  const letters: string[] = [];
  while (letters.length < count && pool.length) {
    let r = Math.random() * pool.reduce((sum, p) => sum + p.weight, 0);
    const i = pool.findIndex((p) => (r -= p.weight) < 0);
    letters.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0].letter);
  }
  // A bank with too few letters: repeat some rather than leave gaps.
  while (letters.length < count) letters.push(letters[letters.length % Math.max(1, letters.length)] ?? 'A');
  return shuffle(letters);
}

class Blockbusters implements MiniGame {
  private phase: BlockbustersPhase = 'pick';
  private board = 0;
  private cols = 4;
  private rows = 4;
  private hexes: BlockbustersHex[] = [];
  private teams = new Map<string, Team>();
  private control: Team = 'red';
  private current: number | null = null;
  private question: Question | null = null;
  private guess: string | null = null;
  private questionsOnHex = 0;
  private buzzer: string | null = null;
  private lockedOut = new Set<Team>();
  private correct: boolean | null = null;
  private winner: Team | null = null;
  private path: number[] = [];
  private wins: Record<Team, number> = { red: 0, white: 0 };
  private gamePoints = new Map<string, number>();
  private byLetter: Map<string, Question[]>;
  /** Questions already asked this game, so they don't come round again too soon. */
  private asked = new Set<Question>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly bankId: string,
    private readonly totalBoards: number,
  ) {
    this.byLetter = questionsByLetter(triviaBank(bankId));
  }

  start() {
    // Teams: alternate down a shuffled list, so with an odd number Red is the smaller team.
    const players = shuffle(this.ctx.players().filter((p) => p.connected));
    players.forEach((p, i) => this.teams.set(p.id, i % 2 === 0 ? 'white' : 'red'));
    const size = boardSize(players.length);
    this.cols = size.cols;
    this.rows = size.rows;
    this.control = Math.random() < 0.5 ? 'red' : 'white';
    this.startBoard(1);
  }

  private setPhase(phase: BlockbustersPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startBoard(board: number) {
    this.board = board;
    this.hexes = pickLetters(this.byLetter, this.cols * this.rows).map((letter) => ({ letter, owner: null }));
    this.winner = null;
    this.path = [];
    this.startPick();
  }

  private startPick() {
    this.current = null;
    this.question = null;
    this.guess = null;
    this.buzzer = null;
    this.correct = null;
    this.setPhase('pick', PICK_MS, () => {
      // Nobody chose in time: pick for them.
      const open = this.hexes.flatMap((h, i) => (h.owner ? [] : [i]));
      this.choose(open[Math.floor(Math.random() * open.length)]);
    });
  }

  private choose(index: number) {
    this.current = index;
    this.questionsOnHex = 0;
    this.askQuestion();
  }

  /** A question whose answer starts with the hexagon's letter, preferring ones not yet asked. */
  private askQuestion() {
    const letter = this.hexes[this.current!].letter;
    const candidates = this.byLetter.get(letter) ?? [];
    const fresh = candidates.filter((q) => !this.asked.has(q));
    const question = shuffle([...(fresh.length ? fresh : candidates)])[0] ?? null;
    if (!question) return this.startPick();
    this.asked.add(question);
    this.question = question;
    this.questionsOnHex++;
    this.buzzer = null;
    this.correct = null;
    this.lockedOut.clear();
    this.openBuzzers();
  }

  private openBuzzers() {
    this.buzzer = null;
    this.guess = null;
    this.setPhase('question', BUZZ_MS, () => this.noAnswer());
  }

  /** Nobody (else) buzzed: show the answer, then another question or back to picking. */
  private noAnswer() {
    this.correct = null;
    this.buzzer = null;
    this.setPhase('result', RESULT_MS, () => (this.questionsOnHex < QUESTIONS_PER_HEX ? this.askQuestion() : this.startPick()));
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as BlockbustersInput;
    const team = this.teams.get(playerId);
    if (!input || !team) return;

    if (this.phase === 'pick' && input.type === 'pick' && team === this.control) {
      const hex = this.hexes[input.index];
      if (Number.isInteger(input.index) && hex && !hex.owner) this.choose(input.index);
      return;
    }
    if (this.phase === 'question' && input.type === 'buzz' && !this.lockedOut.has(team)) {
      this.buzzer = playerId;
      this.setPhase('answer', ANSWER_MS, () => this.answer(null));
      return;
    }
    if (this.phase === 'answer' && input.type === 'answer' && playerId === this.buzzer && typeof input.text === 'string') {
      this.answer(input.text.trim().slice(0, 80));
    }
  }

  private answer(text: string | null) {
    const team = this.teams.get(this.buzzer!)!;
    this.guess = text;
    this.correct = !!text && isRightAnswer(text, this.question!.correct[0]);
    if (this.correct) {
      this.award(this.buzzer!, CORRECT_POINTS);
      this.hexes[this.current!].owner = team;
      this.control = team;
      const path = winningPath(
        this.hexes.map((h) => h.owner),
        team,
        this.cols,
        this.rows,
      );
      this.setPhase('result', RESULT_MS, () => (path ? this.endBoard(team, path) : this.boardFull() ? this.endBoard(null, []) : this.startPick()));
      return;
    }
    // Wrong (or too slow): their team is out of this question; the other team gets a go.
    this.lockedOut.add(team);
    const bothOut = this.lockedOut.has('red') && this.lockedOut.has('white');
    this.setPhase('result', RESULT_MS, () => {
      if (!bothOut && this.hasPlayers(other(team))) this.openBuzzers();
      else if (this.questionsOnHex < QUESTIONS_PER_HEX) this.askQuestion();
      else this.startPick();
    });
  }

  private hasPlayers(team: Team) {
    return this.ctx.players().some((p) => p.connected && this.teams.get(p.id) === team);
  }

  private boardFull() {
    return this.hexes.every((h) => h.owner);
  }

  private award(playerId: string, points: number) {
    this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
    this.ctx.addScore(playerId, points);
  }

  private endBoard(winner: Team | null, path: number[]) {
    this.winner = winner;
    this.path = path;
    if (winner) {
      this.wins[winner]++;
      for (const [id, team] of this.teams) if (team === winner) this.award(id, WIN_POINTS);
      // The losers start the next board.
      this.control = other(winner);
    }
    const isLast = this.board >= this.totalBoards;
    this.setPhase('boardEnd', BOARD_END_MS, () => {
      if (!isLast) this.startBoard(this.board + 1);
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private base() {
    const buzzer = this.buzzer ? this.ctx.players().find((p) => p.id === this.buzzer) : undefined;
    return {
      phase: this.phase,
      board: this.board,
      totalBoards: this.totalBoards,
      cols: this.cols,
      rows: this.rows,
      hexes: this.hexes,
      control: this.control,
      current: this.current,
      question: this.question?.question ?? null,
      guess: this.phase === 'result' ? this.guess : null,
      buzzer: buzzer ? { id: buzzer.id, name: buzzer.name, team: this.teams.get(buzzer.id)! } : null,
      lockedOut: [...this.lockedOut],
      correct: this.phase === 'result' ? this.correct : null,
      answer: this.phase === 'result' ? (this.question?.correct[0] ?? null) : null,
      winner: this.winner,
      winningPath: this.path,
      wins: { ...this.wins },
      msLeft: this.msLeft(),
    };
  }

  syncHost() {
    const view: BlockbustersHostView = {
      ...this.base(),
      topic: BLOCKBUSTERS.modes.find((m) => m.id === this.bankId)?.name ?? '',
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        team: this.teams.get(p.id) ?? null,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: BlockbustersPlayerView = {
      ...this.base(),
      myTeam: this.teams.get(playerId) ?? null,
      isBuzzer: this.buzzer === playerId,
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

export const blockbusters: MiniGameDefinition = {
  info: BLOCKBUSTERS,
  create: (ctx, modeId, options) => new Blockbusters(ctx, modeId, options.puzzles),
};
