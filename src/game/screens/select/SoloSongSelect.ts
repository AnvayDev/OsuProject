// Ported from osu.Game/Screens/Select/SoloSongSelect.cs
// Gameplay isn't ported (by decision), so starting a beatmap only plays the confirm sample where C# pushes the PlayerLoader; the editor,
// context menu actions, mods and the touch input detector aren't ported either.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { SongSelect } from './SongSelect';

export class SoloSongSelect extends SongSelect {
  private sampleConfirmSelection: Sample | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    void dependencies.resolve(AudioManager).samples.get('SongSelect/confirm-selection').then(s => this.sampleConfirmSelection = s);

    return r;
  }

  protected override onStart(): void {
    this.sampleConfirmSelection?.play();
  }
}
