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
import { PICK_EM, PICK_EM_COOP } from '../../shared/games/pickEm';
import { RACK_ATTACK } from '../../shared/games/rackAttack';
import { TOSS_UP } from '../../shared/games/tossUp';
import { TRIVIA, TRIVIA_QUEST } from '../../shared/games/trivia';
import { WOOCHAWARE } from '../../shared/games/woochaware';
import { WORDLE_RACE } from '../../shared/games/wordleRace';
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
  [EXTERNAL.id]: ExternalScene.KEY,
  [WOOCHAWARE.id]: WoochaWareScene.KEY,
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
game.scene.add(ExternalScene.KEY, ExternalScene, false);
game.scene.add(WoochaWareScene.KEY, WoochaWareScene, false);
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
