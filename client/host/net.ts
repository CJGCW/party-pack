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
  if (state.phase === 'lobby') net.gameView = null;
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

/** Subscribes for the lifetime of a scene. */
export function listen(scene: Phaser.Scene, event: 'room' | 'gameView', fn: (data: any) => void) {
  net.events.on(event, fn, scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => net.events.off(event, fn, scene));
}
