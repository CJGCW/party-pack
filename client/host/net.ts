import Phaser from 'phaser';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '../../shared/protocol';

const RESUME_KEY = 'party-pack-host-room';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

/**
 * Latest server state, plus an event bus scenes subscribe to:
 *  'room' (RoomState) and 'gameView' (mini-game specific host view).
 */
export const net = {
  room: null as RoomState | null,
  gameView: null as unknown,
  /** Which scene a game view is for (set by main), so a scene isn't handed another's view. */
  sceneFor: (_view: unknown): string | undefined => undefined,
  events: new Phaser.Events.EventEmitter(),
};

socket.on('connect', () => {
  // Resume the same room after a refresh or reconnect so players aren't kicked out.
  const resumeCode = sessionStorage.getItem(RESUME_KEY) ?? undefined;
  socket.emit('host:create', { resumeCode }, (res) => {
    if (res.ok) sessionStorage.setItem(RESUME_KEY, res.code);
  });
});

socket.on('room:state', (state) => {
  // Between games, forget the last game's view: the next game's scene starts before its
  // first view arrives, and must not be handed a different game's view.
  if (state.phase !== 'game') net.gameView = null;
  net.room = state;
  net.events.emit('room', state);
});

socket.on('game:host', (view) => {
  net.gameView = view;
  net.events.emit('gameView', view);
});

socket.on('room:closed', () => {
  sessionStorage.removeItem(RESUME_KEY);
  location.reload();
});

/**
 * Subscribes for the lifetime of a scene. A view the scene can't handle is logged
 * rather than thrown, so one bad message can't leave the TV stuck.
 */
export function listen(scene: Phaser.Scene, event: 'room' | 'gameView', fn: (data: any) => void) {
  const safe = (data: unknown) => {
    // Stopped part way through this same event (another listener switched scenes).
    if (!scene.sys.isActive()) return;
    if (event === 'gameView') {
      const target = net.sceneFor(data);
      if (target && target !== scene.scene.key) return;
    }
    try {
      fn(data);
    } catch (err) {
      console.error(`[${scene.scene.key}] couldn't show ${event}:`, err);
    }
  };
  net.events.on(event, safe, scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => net.events.off(event, safe, scene));
}
