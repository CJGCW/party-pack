import type { GameInfo } from '../protocol';

export const WOOCHAWARE: GameInfo = {
  id: 'woochaware',
  name: 'WoochaWare',
  description: 'Rapid-fire microgames on your phone. Read the command, do it fast!',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'A string of microgames that keeps speeding up.' }],
};

/** One microgame: the server picks these, the phone plays them, the TV shows the command. */
export interface MicrogameInfo {
  id: string;
  /** Title, e.g. "Bug Off". */
  name: string;
  /** The one-word order shown as it starts, e.g. "SWAT!". */
  command: string;
  /** What to do, for the debug list. */
  hint: string;
  /** Play time at level 1; faster levels get less (see LEVEL_SPEED). */
  durationMs: number;
  /** Played by moving the phone rather than touching it (touch still works as a fallback). */
  controls?: MotionControls;
  /** Played with the phone turned sideways. */
  landscape?: boolean;
}

/** tilt: tip it like a tray. steer: turn it like a steering wheel. shake: gentle shakes. still: hold it steady. */
export type MotionControls = 'tilt' | 'steer' | 'shake' | 'still';

/** How to hold the phone, for the TV and phones. */
export function controlsHint(info: MicrogameInfo): string {
  const how = {
    tilt: 'Tilt your phone',
    steer: 'Turn your phone like a steering wheel',
    shake: 'Shake your phone gently',
    still: 'Hold your phone steady',
  };
  const parts = [info.landscape ? 'Turn your phone sideways' : '', info.controls ? how[info.controls] : ''];
  return parts.filter(Boolean).join(' · ');
}

export const MICROGAMES = [
  { id: 'swat', name: 'Bug Off', command: 'SWAT!', hint: 'Tap every fly.', durationMs: 5000 },
  { id: 'pump', name: 'Big Bang Balloon', command: 'PUMP!', hint: 'Tap fast until the balloon pops.', durationMs: 4500 },
  { id: 'pour', name: "Fill 'Er Up", command: 'POUR!', hint: 'It pours by itself. Tap to stop it between the lines.', durationMs: 5000 },
  { id: 'pull', name: 'Carrot Top', command: 'PULL!', hint: 'Drag the carrot up out of the ground.', durationMs: 5000 },
  { id: 'slice', name: 'Fruit Salad', command: 'SLICE!', hint: 'Swipe through every fruit.', durationMs: 5000 },
  { id: 'trace', name: 'Steady Hand', command: 'TRACE!', hint: 'Drag along the path without leaving it.', durationMs: 6000 },
  { id: 'answer', name: 'Cold Call', command: 'ANSWER!', hint: 'Tap the phone that is ringing.', durationMs: 3500 },
  { id: 'sneak', name: 'Bone Thief', command: 'SNEAK!', hint: "Drag the bone away. Freeze when the dog looks!", durationMs: 6500 },
  { id: 'catch', name: 'Egg Drop', command: 'CATCH!', hint: 'Slide the basket under every egg.', durationMs: 5500 },
  { id: 'scrub', name: 'Dish Duty', command: 'SCRUB!', hint: 'Rub the plate clean.', durationMs: 5000 },
  { id: 'twirl', name: 'Dough Boy', command: 'TWIRL!', hint: 'Circle your finger to spin the pizza.', durationMs: 5000 },
  { id: 'saw', name: 'Lumberjack', command: 'SAW!', hint: 'Drag back and forth to saw the log.', durationMs: 5000 },
  { id: 'jump', name: 'Skip It', command: 'JUMP!', hint: 'Tap to jump over the rope.', durationMs: 6000 },
  { id: 'bounce', name: 'Keepy Uppy', command: 'KEEP IT UP!', hint: "Tap the ball so it doesn't land.", durationMs: 5500 },
  { id: 'maze', name: 'Lost Marble', command: 'ESCAPE!', hint: 'Drag the marble out without touching walls.', durationMs: 7000 },
  { id: 'odd', name: 'Odd One Out', command: 'FIND IT!', hint: "Tap the one that's different.", durationMs: 4000 },
  { id: 'targets', name: 'Shooting Gallery', command: 'SHOOT!', hint: 'Tap every target.', durationMs: 5000 },
  { id: 'flip', name: 'Flapjack', command: 'FLIP!', hint: "Swipe up when it's golden. Not raw, not burnt!", durationMs: 5000 },
  { id: 'stack', name: 'Tower Time', command: 'STACK!', hint: 'Tap to drop each block on the tower.', durationMs: 7000 },
  { id: 'shade', name: 'Sun Screen', command: 'SHADE!', hint: 'Keep the umbrella over them.', durationMs: 5000 },
  { id: 'dodge', name: 'Rock Slide', command: 'DODGE!', hint: 'Drag to dodge the falling rocks.', durationMs: 5000 },
  { id: 'cannon', name: 'Cannon Ball', command: 'FIRE!', hint: "Tap when it's aimed at the target.", durationMs: 5000 },
  { id: 'scan', name: 'Self Checkout', command: 'SCAN!', hint: 'Drag the barcode over the red laser.', durationMs: 5000 },
  { id: 'pick', name: 'Nose Job', command: 'PICK!', hint: 'Get your finger in the nostril.', durationMs: 4500 },
  { id: 'zip', name: 'Zip It', command: 'ZIP!', hint: 'Drag the zipper all the way up.', durationMs: 4000 },
  // Motion games: tilt, turn or gently shake the phone.
  { id: 'roll', name: 'Hole in One', command: 'ROLL!', hint: 'Tilt to roll the ball into the hole. Miss the traps!', durationMs: 6500, controls: 'tilt' },
  { id: 'balance', name: 'Tray Trouble', command: 'BALANCE!', hint: "Tilt to keep the drink on the tray when the wind blows.", durationMs: 6000, controls: 'tilt' },
  { id: 'level', name: 'Spirit Level', command: 'LEVEL IT!', hint: 'Tilt until the bubble sits in the ring, and hold it.', durationMs: 6000, controls: 'tilt' },
  { id: 'search', name: 'Lights Out', command: 'SEARCH!', hint: 'Tilt to move the flashlight and find the cat.', durationMs: 6000, controls: 'tilt' },
  { id: 'ski', name: 'Slalom', command: 'SLALOM!', hint: 'Tilt left and right to ski through every gate.', durationMs: 6500, controls: 'tilt' },
  { id: 'drive', name: 'Road Trip', command: 'STEER!', hint: 'Turn the phone like a wheel to dodge the cones.', durationMs: 6000, controls: 'steer', landscape: true },
  { id: 'tea', name: 'Tea Time', command: 'POUR!', hint: 'Turn the phone clockwise to pour, back to stop at the line.', durationMs: 6500, controls: 'steer' },
  { id: 'dial', name: 'Safe Cracker', command: 'TURN!', hint: 'Turn the phone to spin the dial to the number.', durationMs: 6000, controls: 'steer' },
  { id: 'ketchup', name: 'Ketchup', command: 'SHAKE!', hint: 'Shake gently to get the ketchup out.', durationMs: 5000, controls: 'shake' },
  { id: 'spoon', name: 'Egg and Spoon', command: 'STEADY!', hint: "Keep the egg on the spoon. Don't jiggle!", durationMs: 6000, controls: 'still' },
] as const satisfies readonly MicrogameInfo[];

export type MicrogameId = (typeof MICROGAMES)[number]['id'];

export function findMicrogame(id: string): MicrogameInfo | undefined {
  return MICROGAMES.find((m) => m.id === id);
}

/** Levels 1-3: faster and harder. Play time is the microgame's durationMs times this. */
export const LEVEL_SPEED = [1, 0.85, 0.72] as const;
export const MAX_LEVEL = 3;

/** After a microgame's play time, how long the server waits for the phones' results. */
export const PLAY_GRACE_MS = 800;

export function playTime(info: MicrogameInfo, level: number): number {
  return Math.round(info.durationMs * LEVEL_SPEED[Math.min(MAX_LEVEL, Math.max(1, level)) - 1]);
}

/**
 * 'intro': the command, big, before the microgame starts.
 * 'play': everyone plays it on their phone.
 * 'result': who made it.
 * 'stageEnd': after each set of microgames (one "puzzle"), the stage's results.
 * 'gameEnd': round scores.
 */
export type WoochaPhase = 'intro' | 'play' | 'result' | 'stageEnd' | 'gameEnd';

interface WoochaViewBase {
  phase: WoochaPhase;
  /** Index of the current microgame in the whole game, from 0. */
  round: number;
  totalRounds: number;
  /** Stage (puzzle) number from 1, and how many. */
  stage: number;
  totalStages: number;
  microgameId: string;
  level: number;
  /** Same seed on every phone, so everyone gets the same layout. */
  seed: number;
  /** Play time for this microgame at this level. */
  durationMs: number;
  msLeft: number;
  /** Debug practice: one microgame at each level, no scoring screens. */
  practice: boolean;
  /** At 'intro': this microgame is faster than the last one, so announce it. */
  speedUp: boolean;
}

export interface WoochaHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** This microgame: true won, false failed, null still playing. */
  result: boolean | null;
  /** Microgames won in the current stage. */
  stageWins: number;
}

export interface WoochaHostView extends WoochaViewBase {
  players: WoochaHostPlayer[];
  /** Microgames in each stage. */
  perStage: number;
}

export interface WoochaPlayerView extends WoochaViewBase {
  /** This microgame's result as the server has it (null until reported). */
  myResult: boolean | null;
  stageWins: number;
  perStage: number;
  gamePoints: number;
  score: number;
}

/** Sent once per microgame when the phone wins or fails it. */
export type WoochaInput = { type: 'result'; round: number; won: boolean };
