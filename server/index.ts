import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { RoomManager, type IO } from './rooms';

const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === 'production';
const projectRoot = resolve(import.meta.dirname, '..');

/** Best guess at this machine's address on the local network, so phones can reach it. */
function lanAddress(): string {
  const candidates = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  return (
    candidates.find((a) => a.startsWith('192.168.')) ??
    candidates.find((a) => a.startsWith('10.')) ??
    candidates[0] ??
    'localhost'
  );
}

const joinUrl = `http://${lanAddress()}${PORT === 80 ? '' : `:${PORT}`}`;

const app = express();
const httpServer = createServer(app);
const io: IO = new Server(httpServer);
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

  socket.on('room:startGame', ({ gameId }, ack) => {
    const room = roomOf();
    if (!room || !room.canControl(socket)) return ack({ ok: false, error: 'Only the host or VIP can start games.' });
    const error = room.startGame(gameId);
    ack(error ? { ok: false, error } : { ok: true });
  });

  socket.on('room:backToLobby', () => {
    const room = roomOf();
    if (room?.canControl(socket)) room.endGame();
  });

  socket.on('game:input', (input) => roomOf()?.handleInput(socket, input));

  socket.on('disconnect', () => roomOf()?.handleDisconnect(socket));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Party Pack is running!\n');
  console.log(`  Host screen (open on the TV/laptop): http://localhost:${PORT}/host`);
  console.log(`  Players join on their phones at:     ${joinUrl}\n`);
});
