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
| **Word Rush** | 1–8 | Everyone races to solve the same Wordle-style word with unlimited guesses before the timer runs out. Each solve scores (seconds left − 8s per guess) × 10, minimum 100. Guesses don't take time off the clock; they only lower your score. Three rounds. **Normal** (2½-minute rounds) uses words with a dictionary definition, shown at the reveal; **Hard** (4-minute rounds) uses obscure words with none. |

### Testing with bots

To test without enough people, add bot players that really play (they solve the word
using their guess colours):

```bash
npm run bot -- ABCD 3 --start
```

This adds 3 bots to room `ABCD`. `--start` makes a bot start the game, which only works
if the bots joined an empty room so one of them is the VIP. Add `--hard` for hard mode.

### Word Rush word list

Any 5-letter English word (from `an-array-of-english-words`) is accepted as a guess and can be a
secret answer. Offensive words are filtered out of the answers using two maintained lists
(`obscenity` and `naughty-words`). If an inappropriate word slips through, add it to
`EXTRA_BLOCKED` in `server/games/words.ts`. If an innocent word is wrongly blocked, add it to
`ALLOWED`.

When a word is revealed, its definition is shown from WordNet (`wordnet-db`), an offline
dictionary, so no internet is needed. WordNet defines about half the 5-letter words
(names like PARIS don't count). Normal mode only picks words it can define; Hard mode only
picks the ones it can't.

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

1. **Shared types**: add `shared/games/<game>.ts` with a `GameInfo` (including at least one
   entry in `modes`; the lobby shows a start button per mode) plus host view, player view and
   input types.
2. **Server logic**: add `server/games/<game>.ts` implementing `MiniGame` (see
   `server/games/MiniGame.ts`), then register it in `server/games/index.ts`.
3. **Host scene**: add a Phaser scene in `client/host/scenes/`, then register it in
   `client/host/main.ts` (`GAME_SCENES` and `game.scene.add`).
4. **Phone controller**: add `client/play/games/<game>.ts` returning a `Controller`, then
   register it in `CONTROLLERS` in `client/play/main.ts`.
