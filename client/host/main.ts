import Phaser from 'phaser';
import type { RoomState } from '../../shared/protocol';
import { CLUE_CREW } from '../../shared/games/clueCrew';
import { BLOCKBUSTERS } from '../../shared/games/blockbusters';
import { CONCENTRATION } from '../../shared/games/concentration';
import { EXTERNAL } from '../../shared/games/external';
import { TWENTY_ONE } from '../../shared/games/twentyOne';
import { LONGEST_WORD } from '../../shared/games/longestWord';
import { MAZE_RACE } from '../../shared/games/mazeRace';
import { PEG_DROP } from '../../shared/games/pegDrop';
import { SPIRAL_SHOT } from '../../shared/games/spiralShot';
import { STAR_SPLAT } from '../../shared/games/starSplat';
import { CAVE_FLYER } from '../../shared/games/caveFlyer';
import { STACKER } from '../../shared/games/stacker';
import { TILE_TILT } from '../../shared/games/tileTilt';
import { TEMPEST_RUN } from '../../shared/games/tempestRun';
import { HELIX_DROP } from '../../shared/games/helixDrop';
import { SKY_HOP } from '../../shared/games/skyHop';
import { SNOW_CHASE } from '../../shared/games/snowChase';
import { ROAD_HOP } from '../../shared/games/roadHop';
import { POPPIT } from '../../shared/games/poppit';
import { UNBLOCK_CAR } from '../../shared/games/unblockCar';
import { MINESWEEPER } from '../../shared/games/minesweeper';
import { PIPE_FLOW } from '../../shared/games/pipeFlow';
import { LIGHT_TRAILS } from '../../shared/games/lightTrails';
import { BUMP_RING } from '../../shared/games/bumpRing';
import { HEX_HEAT } from '../../shared/games/hexHeat';
import { FRUIT_RUSH } from '../../shared/games/fruitRush';
import { SKY_JOUST } from '../../shared/games/skyJoust';
import { KEEP_GUARD } from '../../shared/games/keepGuard';
import { BLAST_GRID } from '../../shared/games/blastGrid';
import { TANK_YARD } from '../../shared/games/tankYard';
import { BUBBLE_BRAWL } from '../../shared/games/bubbleBrawl';
import { GEM_RUSH } from '../../shared/games/gemRush';
import { BRICK_BASH } from '../../shared/games/brickBash';
import { CASTLE_CRUSH } from '../../shared/games/castleCrush';
import { STRIKE_ZONE } from '../../shared/games/strikeZone';
import { IDOL_TOWER } from '../../shared/games/idolTower';
import { INK_RUN } from '../../shared/games/inkRun';
import { GIZMO_GOAL } from '../../shared/games/gizmoGoal';
import { GRAVITY_UI } from '../../shared/games/tankGravity';
import { TURNS_UI } from '../../shared/games/mineTurns';
import { PICK_EM, PICK_EM_COOP } from '../../shared/games/pickEm';
import { RACK_ATTACK } from '../../shared/games/rackAttack';
import { TOSS_UP } from '../../shared/games/tossUp';
import { TRIVIA, TRIVIA_QUEST } from '../../shared/games/trivia';
import { WOOCHAWARE } from '../../shared/games/woochaware';
import { WORDLE_RACE } from '../../shared/games/wordleRace';
import { SNATCH } from '../../shared/games/snatch';
import { ROCK_SOLID } from '../../shared/games/rockSolid';
import { FLAG_SIGNAL } from '../../shared/games/flagSignal';
import { WIND_UP } from '../../shared/games/windUp';
import { POWER_BEAT } from '../../shared/games/powerBeat';
import { POP_CHAIN } from '../../shared/games/popChain';
import { HEAD_BALL } from '../../shared/games/headBall';
import { MOON_DROP } from '../../shared/games/moonDrop';
import { DODGE_BOX } from '../../shared/games/dodgeBox';
import { BAR_DASH } from '../../shared/games/barDash';
import { BALL_COUNT } from '../../shared/games/ballCount';
import { CROWD_SPOT } from '../../shared/games/crowdSpot';
import { FACE_FIX } from '../../shared/games/faceFix';
import { SKETCH_IT } from '../../shared/games/sketchIt';
import { NOTE_RUSH } from '../../shared/games/noteRush';
import { COPY_CAT } from '../../shared/games/copyCat';
import { GLIDE_DROP } from '../../shared/games/glideDrop';
import { MARBLE_RALLY } from '../../shared/games/marbleRally';
import { MAZE_MUNCHER } from '../../shared/games/mazeMuncher';
import { WALKER_RESCUE } from '../../shared/games/walkerRescue';
import { CASTLE_SIEGE } from '../../shared/games/castleSiege';
import { net, socket } from './net';
import { BlockbustersScene } from './scenes/BlockbustersScene';
import { ClueCrewScene } from './scenes/ClueCrewScene';
import { ConcentrationScene } from './scenes/ConcentrationScene';
import { ExternalScene } from './scenes/ExternalScene';
import { LobbyScene } from './scenes/LobbyScene';
import { LongestWordScene } from './scenes/LongestWordScene';
import { MazeRaceScene } from './scenes/MazeRaceScene';
import { PegDropScene } from './scenes/PegDropScene';
import { SpiralShotScene } from './scenes/SpiralShotScene';
import { StarSplatScene } from './scenes/StarSplatScene';
import { CaveFlyerScene } from './scenes/CaveFlyerScene';
import { StackerScene } from './scenes/StackerScene';
import { TileTiltScene } from './scenes/TileTiltScene';
import { TempestRunScene } from './scenes/TempestRunScene';
import { HelixDropScene } from './scenes/HelixDropScene';
import { SkyHopScene } from './scenes/SkyHopScene';
import { SnowChaseScene } from './scenes/SnowChaseScene';
import { RoadHopScene } from './scenes/RoadHopScene';
import { PoppitScene } from './scenes/PoppitScene';
import { UnblockCarScene } from './scenes/UnblockCarScene';
import { MinesweeperScene } from './scenes/MinesweeperScene';
import { PipeFlowScene } from './scenes/PipeFlowScene';
import { LightTrailsScene } from './scenes/LightTrailsScene';
import { BumpRingScene } from './scenes/BumpRingScene';
import { HexHeatScene } from './scenes/HexHeatScene';
import { FruitRushScene } from './scenes/FruitRushScene';
import { SkyJoustScene } from './scenes/SkyJoustScene';
import { KeepGuardScene } from './scenes/KeepGuardScene';
import { BlastGridScene } from './scenes/BlastGridScene';
import { TankYardScene } from './scenes/TankYardScene';
import { BubbleBrawlScene } from './scenes/BubbleBrawlScene';
import { GemRushScene } from './scenes/GemRushScene';
import { BrickBashScene } from './scenes/BrickBashScene';
import { CastleCrushScene } from './scenes/CastleCrushScene';
import { StrikeZoneScene } from './scenes/StrikeZoneScene';
import { IdolTowerScene } from './scenes/IdolTowerScene';
import { InkRunScene } from './scenes/InkRunScene';
import { GizmoGoalScene } from './scenes/GizmoGoalScene';
import { TankGravityScene } from './scenes/TankGravityScene';
import { MineTurnsScene } from './scenes/MineTurnsScene';
import { PickEmCoopScene } from './scenes/PickEmCoopScene';
import { PickEmScene } from './scenes/PickEmScene';
import { RackAttackScene } from './scenes/RackAttackScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SpinnerScene } from './scenes/SpinnerScene';
import { StandingsScene } from './scenes/StandingsScene';
import { TossUpScene } from './scenes/TossUpScene';
import { TriviaScene } from './scenes/TriviaScene';
import { TwentyOneScene } from './scenes/TwentyOneScene';
import { WoochaWareScene } from './scenes/WoochaWareScene';
import { WordleRaceScene } from './scenes/WordleRaceScene';
import { SnatchScene } from './scenes/SnatchScene';
import { RockSolidScene } from './scenes/RockSolidScene';
import { FlagSignalScene } from './scenes/FlagSignalScene';
import { WindUpScene } from './scenes/WindUpScene';
import { PowerBeatScene } from './scenes/PowerBeatScene';
import { PopChainScene } from './scenes/PopChainScene';
import { HeadBallScene } from './scenes/HeadBallScene';
import { MoonDropScene } from './scenes/MoonDropScene';
import { DodgeBoxScene } from './scenes/DodgeBoxScene';
import { BarDashScene } from './scenes/BarDashScene';
import { BallCountScene } from './scenes/BallCountScene';
import { CrowdSpotScene } from './scenes/CrowdSpotScene';
import { FaceFixScene } from './scenes/FaceFixScene';
import { SketchItScene } from './scenes/SketchItScene';
import { NoteRushScene } from './scenes/NoteRushScene';
import { CopyCatScene } from './scenes/CopyCatScene';
import { GlideDropScene } from './scenes/GlideDropScene';
import { MarbleRallyScene } from './scenes/MarbleRallyScene';
import { MazeMuncherScene } from './scenes/MazeMuncherScene';
import { WalkerRescueScene } from './scenes/WalkerRescueScene';
import { CastleSiegeScene } from './scenes/CastleSiegeScene';
import { TV_ADDONS } from './addons';
import { HEIGHT, WIDTH } from './theme';

/** Host scene for each mini game, keyed by game id. Add new games here. */
const GAME_SCENES: Record<string, string> = {
  [WORDLE_RACE.id]: WordleRaceScene.KEY,
  [TOSS_UP.id]: TossUpScene.KEY,
  [TRIVIA.id]: TriviaScene.KEY,
  [TRIVIA_QUEST.id]: TriviaScene.KEY,
  [PICK_EM.id]: PickEmScene.KEY,
  [PICK_EM_COOP.id]: PickEmCoopScene.KEY,
  [CLUE_CREW.id]: ClueCrewScene.KEY,
  [BLOCKBUSTERS.id]: BlockbustersScene.KEY,
  [CONCENTRATION.id]: ConcentrationScene.KEY,
  [TWENTY_ONE.id]: TwentyOneScene.KEY,
  [RACK_ATTACK.id]: RackAttackScene.KEY,
  [LONGEST_WORD.id]: LongestWordScene.KEY,
  [PEG_DROP.id]: PegDropScene.KEY,
  [MAZE_RACE.id]: MazeRaceScene.KEY,
  [SPIRAL_SHOT.id]: SpiralShotScene.KEY,
  [STAR_SPLAT.id]: StarSplatScene.KEY,
  [CAVE_FLYER.id]: CaveFlyerScene.KEY,
  [STACKER.id]: StackerScene.KEY,
  [TILE_TILT.id]: TileTiltScene.KEY,
  [TEMPEST_RUN.id]: TempestRunScene.KEY,
  [HELIX_DROP.id]: HelixDropScene.KEY,
  [SKY_HOP.id]: SkyHopScene.KEY,
  [SNOW_CHASE.id]: SnowChaseScene.KEY,
  [ROAD_HOP.id]: RoadHopScene.KEY,
  [POPPIT.id]: PoppitScene.KEY,
  [UNBLOCK_CAR.id]: UnblockCarScene.KEY,
  [MINESWEEPER.id]: MinesweeperScene.KEY,
  [PIPE_FLOW.id]: PipeFlowScene.KEY,
  [LIGHT_TRAILS.id]: LightTrailsScene.KEY,
  [BUMP_RING.id]: BumpRingScene.KEY,
  [HEX_HEAT.id]: HexHeatScene.KEY,
  [FRUIT_RUSH.id]: FruitRushScene.KEY,
  [SKY_JOUST.id]: SkyJoustScene.KEY,
  [KEEP_GUARD.id]: KeepGuardScene.KEY,
  [BLAST_GRID.id]: BlastGridScene.KEY,
  [TANK_YARD.id]: TankYardScene.KEY,
  [BUBBLE_BRAWL.id]: BubbleBrawlScene.KEY,
  [GEM_RUSH.id]: GemRushScene.KEY,
  [BRICK_BASH.id]: BrickBashScene.KEY,
  [CASTLE_CRUSH.id]: CastleCrushScene.KEY,
  [STRIKE_ZONE.id]: StrikeZoneScene.KEY,
  [IDOL_TOWER.id]: IdolTowerScene.KEY,
  [INK_RUN.id]: InkRunScene.KEY,
  [GIZMO_GOAL.id]: GizmoGoalScene.KEY,
  // Tank Yard's Gravity mode (its views say to use this).
  [GRAVITY_UI]: TankGravityScene.KEY,
  // Mine Dash's Turns mode.
  [TURNS_UI]: MineTurnsScene.KEY,
  [EXTERNAL.id]: ExternalScene.KEY,
  [WOOCHAWARE.id]: WoochaWareScene.KEY,
  [SNATCH.id]: SnatchScene.KEY,
  [ROCK_SOLID.id]: RockSolidScene.KEY,
  [FLAG_SIGNAL.id]: FlagSignalScene.KEY,
  [WIND_UP.id]: WindUpScene.KEY,
  [POWER_BEAT.id]: PowerBeatScene.KEY,
  [POP_CHAIN.id]: PopChainScene.KEY,
  [HEAD_BALL.id]: HeadBallScene.KEY,
  [MOON_DROP.id]: MoonDropScene.KEY,
  [DODGE_BOX.id]: DodgeBoxScene.KEY,
  [BAR_DASH.id]: BarDashScene.KEY,
  [BALL_COUNT.id]: BallCountScene.KEY,
  [CROWD_SPOT.id]: CrowdSpotScene.KEY,
  [FACE_FIX.id]: FaceFixScene.KEY,
  [SKETCH_IT.id]: SketchItScene.KEY,
  [NOTE_RUSH.id]: NoteRushScene.KEY,
  [COPY_CAT.id]: CopyCatScene.KEY,
  [GLIDE_DROP.id]: GlideDropScene.KEY,
  [MARBLE_RALLY.id]: MarbleRallyScene.KEY,
  [MAZE_MUNCHER.id]: MazeMuncherScene.KEY,
  [WALKER_RESCUE.id]: WalkerRescueScene.KEY,
  [CASTLE_SIEGE.id]: CastleSiegeScene.KEY,
};

await document.fonts.load('600 32px Fredoka').catch(() => undefined);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#140f2e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

// Scenes don't auto-start: the room state decides which one is showing.
game.scene.add(LobbyScene.KEY, LobbyScene, false);
game.scene.add(SpinnerScene.KEY, SpinnerScene, false);
game.scene.add(ResultsScene.KEY, ResultsScene, false);
game.scene.add(StandingsScene.KEY, StandingsScene, false);
game.scene.add(WordleRaceScene.KEY, WordleRaceScene, false);
game.scene.add(TossUpScene.KEY, TossUpScene, false);
game.scene.add(TriviaScene.KEY, TriviaScene, false);
game.scene.add(PickEmScene.KEY, PickEmScene, false);
game.scene.add(PickEmCoopScene.KEY, PickEmCoopScene, false);
game.scene.add(ClueCrewScene.KEY, ClueCrewScene, false);
game.scene.add(BlockbustersScene.KEY, BlockbustersScene, false);
game.scene.add(ConcentrationScene.KEY, ConcentrationScene, false);
game.scene.add(TwentyOneScene.KEY, TwentyOneScene, false);
game.scene.add(RackAttackScene.KEY, RackAttackScene, false);
game.scene.add(LongestWordScene.KEY, LongestWordScene, false);
game.scene.add(PegDropScene.KEY, PegDropScene, false);
game.scene.add(MazeRaceScene.KEY, MazeRaceScene, false);
game.scene.add(SpiralShotScene.KEY, SpiralShotScene, false);
game.scene.add(StarSplatScene.KEY, StarSplatScene, false);
game.scene.add(CaveFlyerScene.KEY, CaveFlyerScene, false);
game.scene.add(StackerScene.KEY, StackerScene, false);
game.scene.add(TileTiltScene.KEY, TileTiltScene, false);
game.scene.add(TempestRunScene.KEY, TempestRunScene, false);
game.scene.add(HelixDropScene.KEY, HelixDropScene, false);
game.scene.add(SkyHopScene.KEY, SkyHopScene, false);
game.scene.add(SnowChaseScene.KEY, SnowChaseScene, false);
game.scene.add(RoadHopScene.KEY, RoadHopScene, false);
game.scene.add(PoppitScene.KEY, PoppitScene, false);
game.scene.add(UnblockCarScene.KEY, UnblockCarScene, false);
game.scene.add(MinesweeperScene.KEY, MinesweeperScene, false);
game.scene.add(PipeFlowScene.KEY, PipeFlowScene, false);
game.scene.add(LightTrailsScene.KEY, LightTrailsScene, false);
game.scene.add(BumpRingScene.KEY, BumpRingScene, false);
game.scene.add(HexHeatScene.KEY, HexHeatScene, false);
game.scene.add(FruitRushScene.KEY, FruitRushScene, false);
game.scene.add(SkyJoustScene.KEY, SkyJoustScene, false);
game.scene.add(KeepGuardScene.KEY, KeepGuardScene, false);
game.scene.add(BlastGridScene.KEY, BlastGridScene, false);
game.scene.add(TankYardScene.KEY, TankYardScene, false);
game.scene.add(BubbleBrawlScene.KEY, BubbleBrawlScene, false);
game.scene.add(GemRushScene.KEY, GemRushScene, false);
game.scene.add(BrickBashScene.KEY, BrickBashScene, false);
game.scene.add(CastleCrushScene.KEY, CastleCrushScene, false);
game.scene.add(StrikeZoneScene.KEY, StrikeZoneScene, false);
game.scene.add(IdolTowerScene.KEY, IdolTowerScene, false);
game.scene.add(InkRunScene.KEY, InkRunScene, false);
game.scene.add(GizmoGoalScene.KEY, GizmoGoalScene, false);
game.scene.add(TankGravityScene.KEY, TankGravityScene, false);
game.scene.add(MineTurnsScene.KEY, MineTurnsScene, false);
game.scene.add(ExternalScene.KEY, ExternalScene, false);
game.scene.add(WoochaWareScene.KEY, WoochaWareScene, false);
game.scene.add(SnatchScene.KEY, SnatchScene, false);
game.scene.add(RockSolidScene.KEY, RockSolidScene, false);
game.scene.add(FlagSignalScene.KEY, FlagSignalScene, false);
game.scene.add(WindUpScene.KEY, WindUpScene, false);
game.scene.add(PowerBeatScene.KEY, PowerBeatScene, false);
game.scene.add(PopChainScene.KEY, PopChainScene, false);
game.scene.add(HeadBallScene.KEY, HeadBallScene, false);
game.scene.add(MoonDropScene.KEY, MoonDropScene, false);
game.scene.add(DodgeBoxScene.KEY, DodgeBoxScene, false);
game.scene.add(BarDashScene.KEY, BarDashScene, false);
game.scene.add(BallCountScene.KEY, BallCountScene, false);
game.scene.add(CrowdSpotScene.KEY, CrowdSpotScene, false);
game.scene.add(FaceFixScene.KEY, FaceFixScene, false);
game.scene.add(SketchItScene.KEY, SketchItScene, false);
game.scene.add(NoteRushScene.KEY, NoteRushScene, false);
game.scene.add(CopyCatScene.KEY, CopyCatScene, false);
game.scene.add(GlideDropScene.KEY, GlideDropScene, false);
game.scene.add(MarbleRallyScene.KEY, MarbleRallyScene, false);
game.scene.add(MazeMuncherScene.KEY, MazeMuncherScene, false);
game.scene.add(WalkerRescueScene.KEY, WalkerRescueScene, false);
game.scene.add(CastleSiegeScene.KEY, CastleSiegeScene, false);
// Machine-local add-on games (see ./addons).
for (const addOn of TV_ADDONS) {
  GAME_SCENES[addOn.gameId] = addOn.Scene.KEY;
  game.scene.add(addOn.Scene.KEY, addOn.Scene, false);
}
game.events.once(Phaser.Core.Events.READY, () => {
  if (net.room) showSceneFor(net.room);
  else game.scene.start(LobbyScene.KEY);
});

/** Switches to whichever scene matches the room's current phase. */
function showSceneFor(state: RoomState) {
  const key =
    state.phase === 'game' && state.gameId
      ? sceneForView(net.gameView, state.gameId)
      : state.phase === 'spinning'
        ? SpinnerScene.KEY
        : state.phase === 'standings'
          ? StandingsScene.KEY
          : state.phase === 'results'
            ? ResultsScene.KEY
            : LobbyScene.KEY;
  if (!key) return;
  // Stop every other scene that's anywhere past idle, including one stuck part way
  // through starting (which still draws and listens but isn't "active").
  const idle = [Phaser.Scenes.PENDING, Phaser.Scenes.SHUTDOWN, Phaser.Scenes.DESTROYED];
  for (const s of game.scene.getScenes(false)) {
    if (s.scene.key !== key && !idle.includes(s.sys.settings.status)) game.scene.stop(s.scene.key);
  }
  if (!game.scene.getScene(key)?.sys.isActive()) game.scene.start(key);
}

net.events.on('room', (state: RoomState) => {
  if (game.isBooted) showSceneFor(state);
});

/** A game can hand a question to another game's scene (Trivia mixes in Pick 'Em lists). */
function sceneForView(view: unknown, gameId: string) {
  return GAME_SCENES[(view as { asGame?: string } | null)?.asGame ?? gameId];
}
net.sceneFor = (view) => (net.room?.gameId ? sceneForView(view, net.room.gameId) : undefined);

// Registered before any scene's listener, so the right scene is up before views are handed out.
net.events.on('gameView', () => {
  if (game.isBooted && net.room) showSceneFor(net.room);
});

// Esc on the host screen abandons the current game or session.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && net.room && net.room.phase !== 'lobby') socket.emit('room:backToLobby');
});
