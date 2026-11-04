import { wumble, type Piece, type Traits } from '../../../shared/critters';
import { ROOM_LEVELS, ROOM_SORT, type RoomState } from '../../../shared/games/critterGames';
import { critterGame, randInt, shuffled, type Board } from './engine';

export interface RoomPuzzle {
  rows: number;
  cols: number;
  floors: number;
  /** By room: its guest. */
  guests: Traits[];
  /** The rooms that are already taken. */
  clues: number[];
}
interface RoomBoard extends Board {
  order: number[];
  rooms: (Traits | null)[];
  refused: number[];
}

export function makeRooms(level: number): RoomPuzzle {
  const { rows, cols, floors, clues } = ROOM_LEVELS[level - 1];
  const [rowTrait, colTrait, floorTrait] = shuffled([0, 1, 2, 3]);
  const rowOptions = shuffled([0, 1, 2, 3, 4]);
  const colOptions = shuffled([0, 1, 2, 3, 4]);
  const floorOptions = shuffled([0, 1, 2, 3, 4]);
  const guests: Traits[] = [];
  for (let f = 0; f < floors; f++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = [randInt(5), randInt(5), randInt(5), randInt(5)];
        t[rowTrait] = rowOptions[r];
        t[colTrait] = colOptions[c];
        if (floors > 1) t[floorTrait] = floorOptions[f];
        guests.push(t);
      }
    }
  }
  // Clues as spread out as they'll go: shared between the floors, in different rows and columns
  // where possible.
  const picked: number[] = [];
  const rowOf = (room: number) => Math.floor(room / cols) % rows;
  const floorOf = (room: number) => Math.floor(room / (rows * cols));
  const perFloor = Math.ceil(clues / floors);
  for (const room of shuffled(guests.map((_, i) => i))) {
    if (picked.length >= clues) break;
    const onFloor = picked.filter((p) => floorOf(p) === floorOf(room));
    if (onFloor.length < perFloor && !picked.some((p) => rowOf(p) === rowOf(room) || p % cols === room % cols)) picked.push(room);
  }
  for (const room of shuffled(guests.map((_, i) => i))) {
    if (picked.length < clues && !picked.includes(room) && picked.filter((p) => floorOf(p) === floorOf(room)).length < perFloor) picked.push(room);
  }
  return { rows, cols, floors, guests, clues: picked };
}

export const roomSort = critterGame<RoomPuzzle, RoomBoard>({
  info: ROOM_SORT,
  levels: ROOM_LEVELS,
  make: makeRooms,
  board(z) {
    const order = shuffled(z.guests.map((_, i) => i).filter((r) => !z.clues.includes(r)));
    return { got: 0, goal: order.length, order, refused: [], rooms: z.guests.map((t, i) => (z.clues.includes(i) ? t : null)) };
  },
  input(z, b, raw) {
    const input = raw as { type?: string; room?: number };
    const { room } = input;
    if (input.type !== 'room' || !Number.isInteger(room) || room! < 0 || room! >= z.guests.length) return false;
    if (b.got >= b.goal || b.rooms[room!] !== null || b.refused.includes(room!)) return false;
    const home = b.order[b.got];
    if (home === room) {
      b.rooms[room!] = z.guests[home];
      b.got++;
      b.refused = [];
      b.note = { text: 'Checked in!', kind: 'good' };
    } else {
      b.refused.push(room!);
      b.triesLeft--;
      b.note = { text: 'Wrong room!', kind: 'bad' };
    }
    return true;
  },
  phone(z, b, reveal): RoomState {
    return {
      rows: z.rows,
      cols: z.cols,
      floors: z.floors,
      rooms: reveal ? z.guests : b.rooms,
      guest: b.got < b.goal ? z.guests[b.order[b.got]] : null,
      refused: b.refused,
      next: b.got,
      total: b.goal,
    };
  },
  stage(z, reveal) {
    const perFloor = z.rows * z.cols;
    return Array.from({ length: z.floors }, (_, f) => ({
      label: z.floors > 1 ? `Floor ${f + 1}` : undefined,
      cols: z.cols,
      pieces: Array.from({ length: perFloor }, (_, i): Piece => {
        const room = f * perFloor + i;
        return reveal || z.clues.includes(room) ? wumble(z.guests[room]) : { k: 'x', dim: true };
      }),
    }));
  },
});
