import {
  BEAST_AT_MS,
  BEAST_SHARE,
  BEAST_START_BEHIND,
  CRASH_MS,
  GATE_WIDTH,
  HEADING_GAIN,
  MAX_HEADING,
  ROUND_MS,
  ROW_GAP,
  SKIER_R,
  SNOW_CHASE,
  TICK_HZ,
  TREE_R,
  VIEW_W,
  gateInRow,
  speedAt,
  treesInRow,
  type SnowBoardState,
  type SnowPlayerState,
} from '../../shared/games/snowChase';
import type { SteerInput } from '../../shared/games/tempestRun';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Skier {
  seed: number;
  x: number;
  y: number;
  heading: number;
  /** Stopped after hitting a tree, until this time (ms into the round). */
  crashedUntil: number;
  /** Trees already hit (you don't hit the same one twice), and gates passed. */
  hit: Set<number>;
  gates: number;
  /** How far down the beast is, once it's come. */
  beastY: number | null;
}

export function newSkier(seed: number): Skier {
  return { seed, x: VIEW_W / 2, y: 0, heading: 0, crashedUntil: 0, hit: new Set(), gates: 0, beastY: null };
}

/** Skis on by `dt` seconds, `roundMs` into the round. Returns true if the beast caught them. */
export function skiOn(s: Skier, dt: number, roundMs: number) {
  const before = s.y;
  if (roundMs >= s.crashedUntil) {
    const speed = speedAt(roundMs) * (0.4 + 0.6 * Math.cos(s.heading));
    s.x = Math.max(SKIER_R, Math.min(VIEW_W - SKIER_R, s.x + Math.sin(s.heading) * speed * dt));
    s.y += Math.cos(s.heading) * speed * dt;
  }
  // Trees near enough to hit.
  const row = Math.round(s.y / ROW_GAP);
  for (let n = row - 1; n <= row + 1; n++) {
    for (const t of treesInRow(s.seed, n)) {
      if (s.hit.has(t.id) || Math.hypot(t.x - s.x, t.y - s.y) > TREE_R + SKIER_R * 0.8) continue;
      s.hit.add(t.id);
      s.crashedUntil = roundMs + CRASH_MS;
    }
    // A gate passed between its flags.
    const gate = gateInRow(s.seed, n);
    if (gate && before < gate.y && s.y >= gate.y && s.x > gate.left && s.x < gate.left + GATE_WIDTH) s.gates++;
  }
  // The beast.
  if (roundMs >= BEAST_AT_MS) {
    s.beastY = s.beastY === null ? s.y - BEAST_START_BEHIND : s.beastY + speedAt(roundMs) * BEAST_SHARE * dt;
    if (s.beastY >= s.y - SKIER_R) return true;
  }
  return false;
}

class SnowChase extends BoardsGame<Skier, SnowBoardState, SnowPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newSkier(seed);
  }

  protected stepBoard(s: Skier, dt: number, roundMs: number) {
    return skiOn(s, dt, roundMs);
  }

  protected boardInput(s: Skier, raw: unknown) {
    const input = raw as SteerInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) s.heading = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, input.angle * HEADING_GAIN));
    return false;
  }

  /** Gates passed (shown on the TV; survival decides the points). */
  protected boardScore(s: Skier) {
    return s.gates;
  }

  protected hostState(s: Skier): SnowBoardState {
    return {
      x: Math.round(s.x),
      y: Math.round(s.y),
      heading: Math.round(s.heading * 100) / 100,
      crashed: this.roundMs() < s.crashedUntil,
      beastBehind: s.beastY === null ? null : Math.round(s.y - s.beastY),
      gates: s.gates,
    };
  }

  protected playerState(s: Skier): SnowPlayerState {
    return { gates: s.gates, beastBehind: s.beastY === null ? null : Math.round((s.y - s.beastY) / 10) * 10 };
  }
}

export const snowChase: MiniGameDefinition = {
  info: SNOW_CHASE,
  create: (ctx, _modeId, options) => new SnowChase(ctx, options.puzzles),
};
