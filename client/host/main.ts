import Phaser from 'phaser';
import type { RoomState } from '../../shared/protocol';
import { TOSS_UP } from '../../shared/games/tossUp';
import { WORDLE_RACE } from '../../shared/games/wordleRace';
import { net, socket } from './net';
import { LobbyScene } from './scenes/LobbyScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SpinnerScene } from './scenes/SpinnerScene';
import { TossUpScene } from './scenes/TossUpScene';
import { WordleRaceScene } from './scenes/WordleRaceScene';
import { HEIGHT, WIDTH } from './theme';

/** Host scene for each mini game, keyed by game id. Add new games here. */
const GAME_SCENES: Record<string, string> = {
  [WORDLE_RACE.id]: WordleRaceScene.KEY,
  [TOSS_UP.id]: TossUpScene.KEY,
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
game.scene.add(WordleRaceScene.KEY, WordleRaceScene, false);
game.scene.add(TossUpScene.KEY, TossUpScene, false);
game.events.once(Phaser.Core.Events.READY, () => {
  if (net.room) showSceneFor(net.room);
  else game.scene.start(LobbyScene.KEY);
});

/** Switches to whichever scene matches the room's current phase. */
function showSceneFor(state: RoomState) {
  const key =
    state.phase === 'game' && state.gameId
      ? GAME_SCENES[state.gameId]
      : state.phase === 'spinning'
        ? SpinnerScene.KEY
        : state.phase === 'results'
          ? ResultsScene.KEY
          : LobbyScene.KEY;
  if (!key) return;
  const active = game.scene.getScenes(true)[0];
  if (active?.scene.key === key) return;
  for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
  game.scene.start(key);
}

net.events.on('room', (state: RoomState) => {
  if (game.isBooted) showSceneFor(state);
});

// Esc on the host screen abandons the current game or session.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && net.room && net.room.phase !== 'lobby') socket.emit('room:backToLobby');
});
