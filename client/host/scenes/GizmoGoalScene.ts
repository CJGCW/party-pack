import { GIZMO_LEVELS, type GizmoState } from '../../../shared/games/gizmoGoal';
import { PhysPuzzleScene } from '../physPuzzleScene';

/** The TV during Gizmo Goal: everyone's machine side by side (see ../physPuzzleScene). */
export class GizmoGoalScene extends PhysPuzzleScene<GizmoState> {
  static readonly KEY = 'gizmo-goal';
  protected readonly title = 'GIZMO GOAL';
  protected readonly levels = GIZMO_LEVELS;

  constructor() {
    super(GizmoGoalScene.KEY);
  }
}
