// Ported from osu.Framework/Threading/AudioThread.cs (manager registration and the per-frame update; the browser has no separate audio thread,
// so GameHost runs it once per frame, before the scene graph update).

import type { AudioManager } from '../audio/AudioManager';

export class AudioThread {
  private readonly managers: AudioManager[] = [];

  /** @internal */
  registerManager(manager: AudioManager): void {
    if (this.managers.includes(manager))
      throw new Error('May not register the same AudioManager multiple times.');

    this.managers.push(manager);
  }

  /** @internal */
  unregisterManager(manager: AudioManager): void {
    const i = this.managers.indexOf(manager);
    if (i >= 0) this.managers.splice(i, 1);
  }

  onNewFrame(): void {
    for (const manager of [...this.managers])
      manager.update();
  }
}
