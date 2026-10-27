// Ported from osu.Game/Input/GameIdleTracker.cs

import type { InputManager } from '@fw/input/InputManager';
import { IdleTracker } from './IdleTracker';

export class GameIdleTracker extends IdleTracker {
  private inputManager: InputManager | null = null;

  protected override loadComplete(): void {
    super.loadComplete();
    this.inputManager = this.getContainingInputManager();
  }

  protected override get allowIdle(): boolean {
    return this.inputManager?.focusedDrawable === null;
  }
}
