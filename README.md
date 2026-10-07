# Party Pack

A Jackbox-style party game collection for your local network. One computer runs the
server and shows the **host screen** on a TV; everyone plays on their **phone's browser**.
There's nothing to install on the phones.

## Running it

Requires [Node.js](https://nodejs.org) 20.11 or newer.

```bash
npm install
npm run dev      # development, with hot reload
npm start        # production build
```

The server prints two addresses:

- **Host screen:** open `http://localhost:3000/host` on the computer connected to the TV.
- **Players:** phones go to the LAN address shown (e.g. `http://192.168.1.20:3000`), or scan
  the QR code on the host screen, then enter the room code.

Phones must be on the same Wi-Fi as the host computer. The first time it runs, Windows
asks whether Node may accept connections. Allow it on **private** networks.

The first player to join is the **VIP** and can start games from their phone. You can also
click a game on the host screen. Press **Esc** on the host screen to abandon a game.

## Games

| Game | Players | How it plays |
| --- | --- | --- |
| **Word Rush** | 1–8 | Everyone races to solve the same Wordle-style word with unlimited guesses before the timer runs out. Points go by finishing order, plus a bonus for solving in under 6 guesses. Three rounds. |

## Project layout

```
server/            Node + Express + Socket.IO (authoritative game logic)
  index.ts         HTTP/socket entry point; serves the client through Vite in dev
  rooms.ts         Rooms, players, VIP, reconnects, starting/ending games
  games/           One file per mini game, plus the registry (games/index.ts)
shared/            Types shared by server and clients
  protocol.ts      Socket events, room/player types
  games/           Per-game view and input types
client/
  host/            Phaser host screen: one scene per mini game
  play/            Phone controller (plain DOM): one controller per mini game
```

The server is authoritative: secret information (such as the Word Rush answer) never
leaves the server until it should be revealed. Each mini game sends a **host view** to the
TV and a separate **player view** to each phone.

## Adding a mini game

1. **Shared types**: add `shared/games/<game>.ts` with a `GameInfo` plus host view, player
   view and input types.
2. **Server logic**: add `server/games/<game>.ts` implementing `MiniGame` (see
   `server/games/MiniGame.ts`), then register it in `server/games/index.ts`.
3. **Host scene**: add a Phaser scene in `client/host/scenes/`, then register it in
   `client/host/main.ts` (`GAME_SCENES` and `game.scene.add`).
4. **Phone controller**: add `client/play/games/<game>.ts` returning a `Controller`, then
   register it in `CONTROLLERS` in `client/play/main.ts`.
