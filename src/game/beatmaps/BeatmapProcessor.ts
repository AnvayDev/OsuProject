// Ported from osu.Game/Beatmaps/BeatmapProcessor.cs and IBeatmapProcessor.cs

import { hasComboInformation, type IHasComboInformation } from '../rulesets/objects/types/Types';
import type { IBeatmap } from './Beatmap';

/** Provides functionality to alter a IBeatmap after it has been converted. */
export interface IBeatmapProcessor {
  /** The IBeatmap to process. This should already be converted to the applicable Ruleset. */
  readonly beatmap: IBeatmap;

  /**
   * Processes the converted beatmap prior to HitObject.ApplyDefaults being invoked.
   * Nested HitObjects generated during HitObject.ApplyDefaults will not be present by this point,
   * and no mods will have been applied to the HitObjects. This can only be used to add alterations to HitObjects generated directly through the conversion process.
   */
  preProcess(): void;

  /**
   * Processes the converted beatmap after HitObject.ApplyDefaults has been invoked.
   * Nested HitObjects generated during HitObject.ApplyDefaults will be present by this point,
   * and mods will have been applied to all HitObjects. This should be used to add alterations to HitObjects while they are in their most playable state.
   */
  postProcess(): void;
}

/** Provides functionality to alter a IBeatmap after it has been converted. */
export class BeatmapProcessor implements IBeatmapProcessor {
  constructor(readonly beatmap: IBeatmap) {
  }

  preProcess(): void {
    let lastObj: IHasComboInformation | null = null;

    for (const obj of this.beatmap.hitObjects) {
      if (!hasComboInformation(obj))
        continue;

      obj.updateComboInformation(lastObj);
      lastObj = obj;
    }
  }

  postProcess(): void {
  }
}
