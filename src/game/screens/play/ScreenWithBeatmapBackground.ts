// Ported from osu.Game/Screens/Play/ScreenWithBeatmapBackground.cs

import type { BackgroundScreen } from '../BackgroundScreen';
import { BackgroundScreenBeatmap } from '../backgrounds/BackgroundScreenBeatmap';
import { OsuScreen } from '../OsuScreen';

export abstract class ScreenWithBeatmapBackground extends OsuScreen {
  protected override createBackground(): BackgroundScreen | null {
    return new BackgroundScreenBeatmap(this.beatmap.value);
  }

  override applyToBackground(action: (b: BackgroundScreenBeatmap) => void): void {
    super.applyToBackground(b => action(b as BackgroundScreenBeatmap));
  }
}
