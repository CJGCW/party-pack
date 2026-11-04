import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { LANE_PITCHES, LANES, LEAD_MS, TEMPOS, chartFor, type Hit, type Note, type NoteRound, type NoteState } from '../../../shared/games/noteRush';
import { serverNow } from '../../clock';
import { BoardsScene, type BoardSlot } from '../boardsScene';

type Slot = BoardSlot<NoteState, NoteState>;

const BOARD_W = 320;
const BOARD_H = 520;
const LINE_Y = 450;
const LANE_COLORS = [0xff5d73, 0xffd166, 0x4cd37a, 0x5ec8f2];
const HIT_COLORS: Record<Hit, number> = { perfect: 0xffd166, good: 0x4cd37a, ok: 0x9a93b8, miss: 0xff5d73, stray: 0xff5d73 };
/** Notes are scheduled to play this far ahead. */
const SCHEDULE_AHEAD_MS = 1_500;

/** The TV during Note Rush: everyone's lanes side by side (see ../boardsScene), the same notes falling on each, and the tune playing. */
export class NoteRushScene extends BoardsScene<NoteState, NoteRound> {
  static readonly KEY = 'note-rush';
  protected readonly title = 'NOTE RUSH';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private chart: Note[] = [];
  private chartKey = '';
  private judgedAt = new Map<string, number>();
  private audio: AudioContext | null = null;
  /** Notes (by index) already handed to the audio clock. */
  private scheduled = new Set<number>();

  constructor() {
    super(NoteRushScene.KEY);
  }

  protected statusText(board: BoardView<NoteState>) {
    return `${board.boardScore}${board.state.combo >= 5 ? ` · x${board.state.combo}` : ''}`;
  }

  /** The tune stops when the game does. */
  protected setup() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      void this.audio?.close();
      this.audio = null;
    });
  }

  protected onSnapshot(slot: Slot, prev: NoteState, next: NoteState) {
    if (next.judgedId !== prev.judgedId) this.judgedAt.set(slot.playerId, performance.now());
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x140f2e, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const w = BOARD_W / LANES;
    for (let l = 0; l < LANES; l++) g.fillStyle(LANE_COLORS[l], 0.08).fillRect(l * w + 4, 40, w - 8, BOARD_H - 50);
    g.fillStyle(0xffffff, 0.8).fillRect(0, LINE_Y - 2, BOARD_W, 4);
  }

  /** Plays the tune: each note a soft pluck at its lane's pitch, handed to the audio clock a little ahead. */
  private playMusic(round: NoteRound, t: number) {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
    } catch {
      return;
    }
    const a = this.audio;
    this.chart.forEach((n, i) => {
      if (this.scheduled.has(i) || n.at < t - 50 || n.at > t + SCHEDULE_AHEAD_MS) return;
      this.scheduled.add(i);
      const when = a.currentTime + Math.max(0, (n.at - t) / 1000);
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = 'triangle';
      osc.frequency.value = LANE_PITCHES[n.lane][n.high ? 1 : 0];
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.25, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
      osc.connect(gain).connect(a.destination);
      osc.start(when);
      osc.stop(when + 0.4);
    });
    // A soft kick on each beat.
    const beat = 60_000 / TEMPOS[Math.min(round.round, TEMPOS.length - 1)];
    const next = Math.ceil(t / beat) * beat;
    const key = -Math.round(next);
    if (next - t < 300 && !this.scheduled.has(key)) {
      this.scheduled.add(key);
      const when = a.currentTime + (next - t) / 1000;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.frequency.setValueAtTime(120, when);
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      gain.gain.setValueAtTime(0.3, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.15);
      osc.connect(gain).connect(a.destination);
      osc.start(when);
      osc.stop(when + 0.16);
    }
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const v = this.view!;
    const round = v.round;
    const key = `${v.seed}|${round.round}`;
    if (key !== this.chartKey) {
      this.chartKey = key;
      this.chart = chartFor(v.seed, round.round);
      this.scheduled.clear();
    }
    const t = serverNow() - round.epoch;
    // The music plays once, with the first board.
    if (v.phase === 'play' && slot === this.slots[0]) this.playMusic(round, t);
    const s = slot.curr!.snap;
    const hit = new Set(s.hit);
    const w = BOARD_W / LANES;
    this.chart.forEach((n, i) => {
      if (hit.has(i) || n.at < t - 200 || n.at > t + LEAD_MS) return;
      const y = LINE_Y - ((n.at - t) / LEAD_MS) * (LINE_Y - 40);
      g.fillStyle(0x140f2e, 1).fillRoundedRect(n.lane * w + 8, y - 14, w - 16, 28, 10);
      g.fillStyle(LANE_COLORS[n.lane], n.at < t ? 0.4 : 1).fillRoundedRect(n.lane * w + 11, y - 11, w - 22, 22, 8);
    });
    // The last tap's judgement, flashing on its lane at the line.
    const at = this.judgedAt.get(slot.playerId);
    if (at !== undefined && s.judged) {
      const k = (performance.now() - at) / 300;
      if (k < 1) g.fillStyle(HIT_COLORS[s.judged], 0.6 * (1 - k)).fillRect(s.judgedLane * w + 4, LINE_Y - 30, w - 8, 60);
    }
  }
}
