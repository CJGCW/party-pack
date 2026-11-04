import { INK_LEVELS, type InkState } from '../../../shared/games/inkRun';
import { PhysPuzzleScene } from '../physPuzzleScene';

/** The TV during Ink Run: everyone's level and drawings side by side (see ../physPuzzleScene). */
export class InkRunScene extends PhysPuzzleScene<InkState> {
  static readonly KEY = 'ink-run';
  protected readonly title = 'INK RUN';
  protected readonly levels = INK_LEVELS;

  constructor() {
    super(InkRunScene.KEY);
  }
}
