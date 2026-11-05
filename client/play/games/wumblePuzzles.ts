import { TRAIT_BADGES, wumble, type CritterPlayerView, type Traits } from '../../../shared/critters';
import type {
  DoorsState,
  Gate,
  LensState,
  LineUpState,
  LookalikeState,
  PickyState,
  RoomState,
  SeatingState,
  StonesState,
  SwitchState,
} from '../../../shared/games/critterGames';
import { critterScreen, grid, pieceAt, pieceIcon, svgEl, tile, type CritterUi } from '../critterScreen';
import { h } from '../dom';

const LETTERS = 'ABCD';
const live = (v: CritterPlayerView<unknown>) => v.phase === 'play' && !v.done;
const button = (label: string, click: () => void, disabled = false, secondary = false) => {
  const b = h('button', { type: 'button', class: `cr-go${secondary ? ' secondary' : ''}` }, label) as HTMLButtonElement;
  b.disabled = disabled;
  b.addEventListener('click', click);
  return b;
};
/** A puzzle's board, as an SVG: `tap` makes a shape take taps. */
function tap(el: SVGElement, click: () => void) {
  el.addEventListener('click', click);
  el.style.cursor = 'pointer';
  return el;
}

export const createTwoDoors = critterScreen<DoorsState>((ui: CritterUi) => {
  let picked: number | null = null;
  ui.hint = 'Pick a Wumble, then a door.';
  return (v) => {
    const s = v.state;
    if (picked !== null && s.critters[picked].door !== null) picked = null;
    const doors = Array.from({ length: s.doors }, (_, d) => {
      const through = s.critters.filter((c) => c.door === d || (s.answer && s.answer[s.critters.indexOf(c)] === d));
      const refused = picked !== null && s.critters[picked].refused.includes(d);
      const door = h('button', { type: 'button', class: `cr-door${refused ? ' dim' : ''}` }, h('b', {}, LETTERS[d]));
      door.append(grid(6, ...through.map((c) => pieceIcon(wumble(c.t)))));
      door.addEventListener('click', () => {
        if (picked === null || !live(v) || refused) return;
        ui.send({ type: 'send', critter: picked, door: d });
      });
      return door;
    });
    const waiting = s.critters.flatMap((c, i) =>
      c.door !== null || s.answer
        ? []
        : [tile(wumble(c.t), { on: picked === i, badge: c.refused.map((d) => `✖${LETTERS[d]}`).join(' '), click: live(v) ? () => ((picked = i), ui.redraw()) : undefined })],
    );
    ui.stage.replaceChildren(grid(2, ...doors), grid(6, ...waiting));
  };
});

export const createPickyEater = critterScreen<PickyState>((ui: CritterUi) => {
  let picks: number[] = [];
  ui.hint = 'Tap toppings, then serve.';
  const REPLY = { more: '"More!"', yuck: '"Yuck!"', yum: '"Yum!"' };
  return (v) => {
    const s = v.state;
    if (s.wants) {
      ui.stage.replaceChildren(
        ...s.customers.map((t, i) => h('div', { class: 'cr-order' }, tile(wumble(t)), h('span', { class: 'cr-food' }, s.wants![i].map((w) => s.toppings[w]).join(' ')))),
      );
      return;
    }
    const customer = s.customers[Math.min(s.serving, s.customers.length - 1)];
    const orders = [...s.orders].reverse().map((o) => h('div', { class: 'cr-order' }, h('span', { class: 'cr-food' }, o.picks.map((p) => s.toppings[p]).join(' ')), h('span', { class: `cr-reply ${o.reply}` }, REPLY[o.reply])));
    const foods = s.toppings.map((f, i) => {
      const b = h('button', { type: 'button', class: `cr-tile cr-topping${picks.includes(i) ? ' on' : ''}` }, f);
      b.addEventListener('click', () => {
        picks = picks.includes(i) ? picks.filter((p) => p !== i) : [...picks, i];
        ui.redraw();
      });
      return b;
    });
    ui.stage.replaceChildren(
      h('div', { class: 'cr-customer' }, pieceIcon(wumble(customer))),
      grid(5, ...foods),
      button('Serve!', () => {
        ui.send({ type: 'serve', picks });
        picks = [];
        ui.redraw();
      }, !picks.length || !live(v)),
      h('div', { class: 'cr-log' }, ...orders),
    );
  };
});

export const createSeatingChart = critterScreen<SeatingState>((ui: CritterUi) => {
  let picked: number | null = null;
  ui.hint = 'Pick a Wumble, then a seat. Tap a seated one to stand them up.';
  const CELL = 24;
  const GAP = 8;
  return (v) => {
    const s = v.state;
    const seats = s.answer ?? s.seats;
    if (picked !== null && seats.includes(picked)) picked = null;
    const at = (seat: number) => ({ x: (seat % s.cols) * (CELL + GAP) + CELL / 2, y: Math.floor(seat / s.cols) * (CELL + GAP) + CELL / 2 });
    const width = s.cols * CELL + (s.cols - 1) * GAP;
    const height = s.rows * CELL + (s.rows - 1) * GAP;
    const board = svgEl('svg', { viewBox: `-1 -1 ${width + 2} ${height + 2}`, class: 'cr-board' });
    for (const e of s.edges) {
      const [a, b] = [at(e.a), at(e.b)];
      board.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#6a6496', 'stroke-width': 1.2 }));
    }
    seats.forEach((who, seat) => {
      const { x, y } = at(seat);
      const rect = svgEl('rect', { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, rx: 3, fill: '#241d55', stroke: picked !== null && who === null ? '#ffd166' : '#6a6496', 'stroke-width': 0.6 });
      board.append(rect);
      if (who !== null) board.append(pieceAt(wumble(s.critters[who]), x, y, CELL * 0.92));
      const hit = svgEl('rect', { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, fill: 'transparent' });
      if (live(v)) {
        tap(hit, () => {
          if (who !== null) ui.send({ type: 'stand', seat });
          else if (picked !== null) ui.send({ type: 'sit', critter: picked, seat });
        });
      }
      board.append(hit);
    });
    for (const e of s.edges) {
      if (e.tag === null) continue;
      const [a, b] = [at(e.a), at(e.b)];
      board.append(svgEl('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 2.2, 'font-size': 6.5, 'text-anchor': 'middle' }, TRAIT_BADGES[e.tag]));
    }
    const pool = s.critters.flatMap((t, i) => (seats.includes(i) ? [] : [tile(wumble(t), { on: picked === i, click: live(v) ? () => ((picked = i), ui.redraw()) : undefined })]));
    ui.stage.replaceChildren(board, grid(5, ...pool));
  };
});

export const createLookalikes = critterScreen<LookalikeState>((ui: CritterUi) => {
  let picked: number | null = null;
  ui.hint = 'Pick a Wumble, then its robot.';
  return (v) => {
    const s = v.state;
    const matched = s.answer ?? s.matched;
    if (picked !== null && matched[picked] !== null) picked = null;
    const pair = (w: Traits, b: Traits) => h('div', { class: 'cr-pair' }, pieceIcon(wumble(w)), pieceIcon({ k: 'b', t: b }));
    const examples = grid(3, ...s.examples.map((e) => pair(e.w, e.b)));
    const done = matched.flatMap((b, i) => (b === null ? [] : [pair(s.critters[i], s.bots[b])]));
    const critters = s.critters.flatMap((t, i) => (matched[i] !== null ? [] : [tile(wumble(t), { on: picked === i, click: live(v) ? () => ((picked = i), ui.redraw()) : undefined })]));
    const bots = s.bots.flatMap((t, i) => {
      if (matched.includes(i)) return [];
      const refused = s.refused.some(([w, b]) => w === picked && b === i);
      return [tile({ k: 'b', t }, { dim: refused, click: live(v) && !refused ? () => picked !== null && ui.send({ type: 'match', critter: picked, bot: i }) : undefined })];
    });
    ui.stage.replaceChildren(h('div', { class: 'sp-label' }, 'Cousins so far'), examples, h('div', { class: 'cr-rule' }), grid(5, ...critters), grid(5, ...bots), grid(3, ...done));
  };
});

export const createRoomSort = critterScreen<RoomState>((ui: CritterUi) => {
  ui.hint = 'Tap the room this guest belongs in.';
  const CELL = 20;
  const FLOOR_GAP = 7;
  return (v) => {
    const s = v.state;
    const perFloor = s.rows * s.cols;
    const across = Math.min(s.floors, 2);
    const floorW = s.cols * CELL;
    const width = across * floorW + (across - 1) * FLOOR_GAP;
    const board = svgEl('svg', { viewBox: `-1 -1 ${width + 2} ${s.rows * CELL + 2}`, class: 'cr-board' });
    s.rooms.forEach((t, room) => {
      const floor = Math.floor(room / perFloor);
      const i = room % perFloor;
      const x = floor * (floorW + FLOOR_GAP) + (i % s.cols) * CELL;
      const y = Math.floor(i / s.cols) * CELL;
      const refused = s.refused.includes(room);
      const open = !t && !refused && live(v) && !v.revealing;
      const r = svgEl('rect', { x: x + 0.5, y: y + 0.5, width: CELL - 1, height: CELL - 1, rx: 2, fill: refused ? '#4a2038' : '#241d55', stroke: '#6a6496', 'stroke-width': 0.5 });
      board.append(open ? tap(r, () => ui.send({ type: 'room', room })) : r);
      if (t) board.append(pieceAt(wumble(t), x + CELL / 2, y + CELL / 2, CELL * 0.9));
    });
    const guest = v.revealing || !s.guest ? null : h('div', { class: 'cr-customer' }, pieceIcon(wumble(s.guest)));
    ui.stage.replaceChildren(...(guest ? [guest] : []), board);
  };
});

export const createLineUp = critterScreen<LineUpState>((ui: CritterUi) => {
  let picked: number | null = null;
  ui.hint = 'Tap two Wumbles to swap them, then check. First in line is top left.';
  return (v) => {
    const s = v.state;
    const line = s.answer ?? s.line;
    const clue = s.ladders.map((l) =>
      h(
        'div',
        { class: 'cr-ladder' },
        ...l.values.flatMap((value, i) => {
          const before = i ? [h('span', { class: 'cr-then' }, '›')] : [];
          if (value === null) return [...before, h('span', { class: 'cr-gap' }, '?')];
          const t = [-1, -1, -1, -1];
          t[l.trait] = value;
          return [...before, pieceIcon(wumble(t))];
        }),
      ),
    );
    const places = line.map((who, place) =>
      tile(wumble(s.critters[who]), {
        on: picked === place,
        good: !!s.answer || s.marks[place],
        badge: String(place + 1),
        click: live(v)
          ? () => {
              if (picked === null) picked = place;
              else if (picked === place) picked = null;
              else {
                ui.send({ type: 'swap', a: picked, b: place });
                picked = null;
              }
              ui.redraw();
            }
          : undefined,
      }),
    );
    ui.stage.replaceChildren(...clue, grid(4, ...places), button('Check the line', () => ui.send({ type: 'check' }), !live(v)));
  };
});

export const createLensLab = critterScreen<LensState>((ui: CritterUi) => {
  let picked: number | null = null;
  ui.hint = 'Pick a Wumble to walk through the lenses.';
  return (v) => {
    const s = v.state;
    if (picked !== null && !s.pool[picked]) picked = null;
    const targets = s.targets.map((target) => tile(wumble(target.t), { good: target.done, badge: target.done ? '✔' : '' }));
    const lenses = h('div', { class: 'cr-lenses' }, '🔍'.repeat(s.lenses));
    const tests = s.tests.slice(0, 5).map((test) => h('div', { class: 'cr-order' }, pieceIcon(wumble(test.from)), h('span', {}, '→'), pieceIcon(wumble(test.to)), h('span', { class: `cr-reply ${test.hit ? 'yum' : 'yuck'}` }, test.hit ? '✔' : '✖')));
    const pool = s.answer
      ? s.answer.map((t) => tile(wumble(t)))
      : s.pool.flatMap((t, i) => (t ? [tile(wumble(t), { on: picked === i, click: live(v) ? () => ((picked = i), ui.redraw()) : undefined })] : []));
    ui.stage.replaceChildren(
      h('div', { class: 'sp-label' }, 'Wanted'),
      grid(5, ...targets),
      lenses,
      grid(5, ...pool),
      button('Walk through', () => picked !== null && ui.send({ type: 'send', critter: picked }), picked === null || !live(v)),
      h('div', { class: 'cr-log' }, ...tests),
    );
  };
});

export const createSwitchback = critterScreen<SwitchState>((ui: CritterUi) => {
  let picked: number | null = null;
  ui.hint = 'Pick who goes next. Matching a test goes ✔, not matching goes ✖. Switches flip as you pass.';
  const WIDTH = 100;
  const STEP = 19;
  return (v) => {
    const s = v.state;
    if (picked !== null && s.critters[picked].home) picked = null;
    const exits = 2 ** s.depth;
    const height = (s.depth + 1) * STEP;
    const nodeAt = (node: number) => {
      const level = Math.floor(Math.log2(node + 1));
      const first = 2 ** level - 1;
      return { x: ((node - first + 0.5) / 2 ** level) * WIDTH, y: level * STEP + 8 };
    };
    const lit = new Set(s.last?.gates ?? []);
    const board = svgEl('svg', { viewBox: `0 0 ${WIDTH} ${height}`, class: 'cr-board' });
    s.gates.forEach((_, node) => {
      for (const child of [2 * node + 1, 2 * node + 2]) {
        const [a, b] = [nodeAt(node), nodeAt(child)];
        const on = lit.has(node) && (lit.has(child) || (s.last && child === s.gates.length + s.last.exit));
        board.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: on ? '#ffd166' : '#6a6496', 'stroke-width': on ? 1.4 : 0.8 }));
      }
    });
    s.gates.forEach((gate: Gate, node) => {
      const { x, y } = nodeAt(node);
      board.append(svgEl('circle', { cx: x, cy: y, r: 7.5, fill: '#241d55', stroke: '#6a6496', 'stroke-width': 0.5 }));
      if (gate.kind === 'switch') board.append(svgEl('text', { x, y: y + 3.6, 'font-size': 10, 'text-anchor': 'middle', fill: '#ffd166' }, s.flipped[node] ? '↘' : '↙'));
      else if (gate.kind === 'start') board.append(svgEl('text', { x, y: y + 3.6, 'font-size': 8, 'font-weight': 700, 'text-anchor': 'middle', fill: '#ffffff' }, 'GO'));
      else {
        const t = [-1, -1, -1, -1];
        t[gate.trait] = gate.value;
        board.append(pieceAt(wumble(t), x, y, 13));
        // A match goes left: said on the track, so it's there all game.
        const reach = 50 / 2 ** (Math.floor(Math.log2(node + 1)) + 1);
        const mark = (side: number, label: string, fill: string) => svgEl('text', { x: x + side * (reach / 2 + 3), y: y + STEP / 2 - 3, 'font-size': 5.5, 'font-weight': 700, 'text-anchor': 'middle', fill }, label);
        board.append(mark(-1, '✔', '#4cd37a'), mark(1, '✖', '#ff5d73'));
      }
    });
    s.exits.forEach((home, i) => {
      const { x, y } = nodeAt(exits - 1 + i);
      board.append(svgEl('text', { x, y: y + 2, 'font-size': 8.5, 'text-anchor': 'middle' }, home ? '🏠' : '🕳️'));
    });
    const order = s.answer ? s.answer.map((who) => tile(wumble(s.critters[who].t))) : null;
    const pool = s.critters.flatMap((c, i) => (c.home ? [] : [tile(wumble(c.t), { on: picked === i, click: live(v) ? () => ((picked = i), ui.redraw()) : undefined })]));
    const send = (start: number) => picked !== null && ui.send({ type: 'send', critter: picked, start });
    const waiting = picked === null || !live(v);
    const sends = s.gates[0]?.kind === 'start' ? [h('div', { class: 'cr-buttons' }, button('Send left', () => send(0), waiting), button('Send right', () => send(1), waiting))] : [button('Send them', () => send(0), waiting)];
    ui.stage.replaceChildren(board, ...(order ? [grid(6, ...order)] : [grid(6, ...pool), ...sends]));
  };
});

export const createSteppingStones = critterScreen<StonesState>((ui: CritterUi) => {
  const CELL = 20;
  /** Using the wand: on, and the first stone picked. */
  let wand = false;
  let first: number | null = null;
  return (v) => {
    const s = v.state;
    if (!s.swapsLeft) wand = false;
    if (!wand) first = null;
    ui.hint = wand ? 'Tap two stones next to each other to swap them.' : s.swaps ? 'Cross from left to right. Only some stones hold you, and some are out of place.' : 'Cross from left to right. Only some stones will hold you.';
    const board = svgEl('svg', { viewBox: `-1 -1 ${s.cols * CELL + 2} ${s.rows * CELL + 2}`, class: 'cr-board' });
    const centre = (cell: number) => ({ x: (cell % s.cols) * CELL + CELL / 2, y: Math.floor(cell / s.cols) * CELL + CELL / 2 });
    s.tiles.forEach((t, cell) => {
      const { x, y } = centre(cell);
      const stepping = s.path.includes(cell);
      const wrong = s.wrong.includes(cell);
      board.append(svgEl('rect', { x: x - CELL / 2 + 0.4, y: y - CELL / 2 + 0.4, width: CELL - 0.8, height: CELL - 0.8, rx: 2, fill: stepping ? '#6b5320' : '#16113a' }));
      if (t === null) return board.append(pieceAt({ k: 'x' }, x, y, CELL * 0.9));
      const stone = pieceAt({ k: 't', t }, x, y, CELL * 0.88);
      if (wrong) stone.setAttribute('opacity', '0.25');
      if (first === cell) board.append(svgEl('rect', { x: x - CELL / 2 + 0.4, y: y - CELL / 2 + 0.4, width: CELL - 0.8, height: CELL - 0.8, rx: 2, fill: 'none', stroke: '#ffd166', 'stroke-width': 1 }));
      const pick = () => {
        if (first === null) first = cell;
        else if (first === cell) first = null;
        else {
          ui.send({ type: 'swap', a: first, b: cell });
          first = null;
          wand = false;
        }
        ui.redraw();
      };
      board.append(!live(v) ? stone : wand ? tap(stone, pick) : !wrong ? tap(stone, () => ui.send({ type: 'step', cell })) : stone);
    });
    const route = s.answer ?? s.path;
    if (route.length) {
      board.append(svgEl('polyline', { points: route.map((c) => `${centre(c).x},${centre(c).y}`).join(' '), fill: 'none', stroke: '#ffffff', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9, 'pointer-events': 'none' }));
    }
    const wandBtn = s.swaps ? [button(wand ? 'Put the wand away' : `Wand (${s.swapsLeft})`, () => ((wand = !wand), ui.redraw()), !live(v) || !s.swapsLeft, true)] : [];
    ui.stage.replaceChildren(board, h('div', { class: 'cr-buttons' }, button('Back', () => ui.send({ type: 'back' }), !live(v) || !s.path.length, true), ...wandBtn));
  };
});
