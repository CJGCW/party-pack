import express from 'express';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { loadCertificate } from './certificate';
import { config } from './config';
import { Room, RoomManager, type IO } from './rooms';

const PORT = Number(process.env.PORT ?? 3000);
/** Phones join here when HTTPS is on (it is whenever WoochaWare is). */
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? PORT + 443);
const isProd = process.env.NODE_ENV === 'production';
const projectRoot = resolve(import.meta.dirname, '..');

/** VPN and virtual-machine adapters, which phones on the Wi-Fi can't reach. */
const VIRTUAL_ADAPTER = /vpn|nord|tailscale|zerotier|wireguard|virtualbox|vmware|hyper-v|vethernet|wsl|docker/i;

/**
 * Best guess at this machine's address on the local network, so phones can reach it.
 * PARTY_PACK_HOST overrides the guess.
 */
function lanAddress(): string {
  if (process.env.PARTY_PACK_HOST) return process.env.PARTY_PACK_HOST;
  const candidates = Object.entries(networkInterfaces())
    .filter(([name]) => !VIRTUAL_ADAPTER.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
    // Self-assigned (no network) and VirtualBox's default host-only range.
    .filter((a) => !a.startsWith('169.254.') && !a.startsWith('192.168.56.'));
  return (
    candidates.find((a) => a.startsWith('192.168.')) ??
    candidates.find((a) => a.startsWith('10.')) ??
    candidates[0] ??
    'localhost'
  );
}

const lan = lanAddress();
const joinUrl = config.woochaware ? `https://${lan}:${HTTPS_PORT}` : `http://${lan}${PORT === 80 ? '' : `:${PORT}`}`;

const app = express();
const httpServer = createServer(app);
// The same app over HTTPS for phones, sharing the rooms and sockets. Only WoochaWare's
// motion games need it, so it's off along with WoochaWare.
const httpsServer = config.woochaware ? createHttpsServer(loadCertificate(lan), app) : null;
// The Android app's screens live inside it (at http://localhost), so let them connect from there.
const io: IO = new Server(httpServer, { cors: { origin: ['http://localhost', 'https://localhost'] } });
if (httpsServer) io.attach(httpsServer);
const rooms = new RoomManager(io, joinUrl);

app.get('/host', (_req, res) => res.redirect('/host.html'));

if (isProd) {
  app.use(express.static(resolve(projectRoot, 'dist')));
} else {
  // In development, Vite serves the client with hot reload on the same port.
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({
    configFile: resolve(projectRoot, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  app.use(vite.middlewares);
  // Hot reload's websocket lives on the HTTP server; pass HTTPS pages' connections to it too.
  httpsServer?.on('upgrade', (req, socket, head) => {
    if (req.headers['sec-websocket-protocol'] === 'vite-hmr') httpServer.emit('upgrade', req, socket, head);
  });
}

io.on('connection', (socket) => {
  const roomOf = () => (socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined);

  socket.on('host:create', ({ resumeCode }, ack) => {
    const room = (resumeCode && rooms.get(resumeCode)) || rooms.create();
    room.attachHost(socket);
    ack({ ok: true, code: room.code });
  });

  socket.on('player:join', ({ code, name, sessionId }, ack) => {
    const room = rooms.get(String(code ?? ''));
    if (!room) return ack({ ok: false, error: 'Room not found. Check the code on the TV.' });
    const result = room.addOrRejoinPlayer(socket, String(name ?? ''), String(sessionId ?? ''));
    if (typeof result === 'string') return ack({ ok: false, error: result });
    ack({ ok: true, playerId: result.id });
  });

  /** Runs a VIP/host-only room action and reports any error back to the caller. */
  const controlled = (ack: (res: { ok: true } | { ok: false; error: string }) => void, action: (room: Room) => string | null) => {
    const room = roomOf();
    if (!room || !room.canControl(socket)) return ack({ ok: false, error: 'Only the host or VIP can do that.' });
    const error = action(room);
    ack(error ? { ok: false, error } : { ok: true });
  };

  socket.on('room:updateSettings', (settings, ack) => controlled(ack, (room) => room.updateSettings(settings)));
  socket.on('room:startSession', (ack) => controlled(ack, (room) => room.startSession()));
  socket.on('room:startGame', ({ gameId, modeId, microgameId }, ack) =>
    controlled(ack, (room) => room.startGame(gameId, modeId, microgameId)),
  );

  socket.on('room:backToLobby', () => {
    const room = roomOf();
    if (room?.canControl(socket)) room.returnToLobby();
  });

  socket.on('game:input', (input) => roomOf()?.handleInput(socket, input));
  socket.on('game:giveUp', () => roomOf()?.handleGiveUp(socket));
  socket.on('room:call', ({ option }, ack) => {
    const room = roomOf();
    const error = room ? room.call(socket, option === null || option === undefined ? null : String(option)) : 'Not in a room.';
    ack(error ? { ok: false, error } : { ok: true });
  });
  socket.on('game:flag', ({ key, flagged }, ack) => {
    const room = roomOf();
    const error = room ? room.flagQuestion(socket, String(key), !!flagged) : 'Not in a room.';
    ack(error ? { ok: false, error } : { ok: true });
  });

  socket.on('disconnect', () => roomOf()?.handleDisconnect(socket));
});

httpsServer?.listen(HTTPS_PORT, '0.0.0.0');
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Party Pack is running!\n');
  console.log(`  Host screen (open on the TV/laptop): http://localhost:${PORT}/host`);
  console.log(`  Players join on their phones at:     ${joinUrl}\n`);
  if (httpsServer) {
    console.log("  Phones warn that the connection isn't private (the certificate is self-signed):");
    console.log('  tap Advanced, then Proceed / Visit website. Each phone only has to do this once.\n');
  }
  if (config.woochaDebug) console.log('  WOOCHAWARE DEBUG: the VIP picks a WoochaWare microgame to practise.\n');
  else if (config.debugMode) console.log('  DEBUG MODE: the VIP picks each game directly (no wheel).\n');
  if (!config.woochaware) console.log('  WoochaWare is off (and so is HTTPS).\n');
});
