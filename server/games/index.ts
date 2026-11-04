import { config } from '../config';
import type { MiniGameDefinition } from './MiniGame';
import { loadAddOns } from './addons';
import { blockbusters } from './blockbusters';
import { clueCrew } from './clueCrew';
import { concentration } from './concentration';
import { external } from './external';
import { longestWord } from './longestWord';
import { mazeRace } from './mazeRace';
import { pegDrop } from './pegDrop';
import { spiralShot } from './spiralShot';
import { starSplat } from './starSplat';
import { twoDoors, pickyEater, seatingChart, lookalikes, roomSort, lineUp, lensLab, switchback, steppingStones } from './critters';
import { caveFlyer } from './caveFlyer';
import { stacker } from './stacker';
import { tileTilt } from './tileTilt';
import { tempestRun } from './tempestRun';
import { helixDrop } from './helixDrop';
import { skyHop } from './skyHop';
import { snowChase } from './snowChase';
import { roadHop } from './roadHop';
import { poppit } from './poppit';
import { unblockCar } from './unblockCar';
import { minesweeper } from './minesweeper';
import { pipeFlow } from './pipeFlow';
import { lightTrails } from './lightTrails';
import { bumpRing } from './bumpRing';
import { hexHeat } from './hexHeat';
import { fruitRush } from './fruitRush';
import { skyJoust } from './skyJoust';
import { keepGuard } from './keepGuard';
import { blastGrid } from './blastGrid';
import { tankYard } from './tankYard';
import { bubbleBrawl } from './bubbleBrawl';
import { gemRush } from './gemRush';
import { brickBash } from './brickBash';
import { castleCrush } from './castleCrush';
import { strikeZone } from './strikeZone';
import { idolTower } from './idolTower';
import { inkRun } from './inkRun';
import { gizmoGoal } from './gizmoGoal';
import { pickEm, pickEmCoop } from './pickEm';
import { tossUp } from './tossUp';
import { rackAttack } from './rackAttack';
import { trivia, triviaQuest } from './trivia';
import { twentyOne } from './twentyOne';
import { woochaware } from './woochaware';
import { wordleRace } from './wordleRace';
import { snatch } from './snatch';
import { rockSolid } from './rockSolid';
import { flagSignal } from './flagSignal';
import { windUp } from './windUp';
import { powerBeat } from './powerBeat';
import { popChain } from './popChain';
import { headBall } from './headBall';
import { moonDrop } from './moonDrop';
import { dodgeBox } from './dodgeBox';
import { barDash } from './barDash';
import { ballCount } from './ballCount';
import { crowdSpot } from './crowdSpot';
import { faceFix } from './faceFix';
import { sketchIt } from './sketchIt';
import { noteRush } from './noteRush';
import { copyCat } from './copyCat';
import { glideDrop } from './glideDrop';
import { marbleRally } from './marbleRally';
import { mazeMuncher } from './mazeMuncher';
import { walkerRescue } from './walkerRescue';
import { castleSiege } from './castleSiege';

/** Every mini game in the pack. Add new games here. WoochaWare can be turned off in the config. */
export const GAMES: MiniGameDefinition[] = [
  wordleRace, tossUp, trivia, triviaQuest, pickEm, pickEmCoop, rackAttack, clueCrew, concentration, blockbusters, twentyOne, longestWord, pegDrop, mazeRace, spiralShot, starSplat, caveFlyer, stacker, tileTilt, tempestRun, helixDrop, skyHop, snowChase, roadHop, poppit, unblockCar, minesweeper, pipeFlow, lightTrails, bumpRing, hexHeat, fruitRush, skyJoust, keepGuard, blastGrid, tankYard, bubbleBrawl, gemRush, brickBash, castleCrush, strikeZone, idolTower, inkRun, gizmoGoal, snatch, rockSolid, flagSignal, windUp, powerBeat, popChain, headBall, moonDrop, dodgeBox, barDash, ballCount, crowdSpot, faceFix, sketchIt, noteRush, copyCat, glideDrop, marbleRally, mazeMuncher, walkerRescue, castleSiege, twoDoors, pickyEater, seatingChart, lookalikes, roomSort, lineUp, lensLab, switchback, steppingStones,
  ...(config.woochaware ? [woochaware] : []),
  // Machine-local add-ons, if any (see ./addons).
  ...(await loadAddOns()),
];

export function findGame(id: string): MiniGameDefinition | undefined {
  // Games played away from the app aren't a slice of their own (each one the VIP lists is), so they're not in GAMES.
  return GAMES.find((g) => g.info.id === id) ?? (id === external.info.id ? external : undefined);
}
