// Ported from osu.Game.Rulesets.Osu/Beatmaps/OsuBeatmapConverter.cs

import { Vector2F } from '@fw/layout/Vector2F';
import type { Beatmap, IBeatmap } from '../../../beatmaps/Beatmap';
import { BeatmapConverter } from '../../../beatmaps/BeatmapConverter';
import type { LegacyControlPointInfo } from '../../../beatmaps/legacy/LegacyControlPointInfo';
import type { HitObject } from '../../objects/HitObject';
import { hasCombo, hasDuration, hasGenerateTicks, hasPath, hasPosition, hasRepeats, hasSliderVelocity } from '../../objects/types/Types';
import { HitCircle } from '../objects/HitCircle';
import { OsuHitObject } from '../objects/OsuHitObject';
import { Slider } from '../objects/Slider';
import { Spinner } from '../objects/Spinner';
import { OsuBeatmap } from './OsuBeatmap';

/** OsuPlayfield.BASE_SIZE / 2: where a spinner without a position sits. */
const playfield_centre = new Vector2F(256, 192);

export class OsuBeatmapConverter extends BeatmapConverter<OsuHitObject> {
  override canConvert(): boolean {
    return this.beatmap.hitObjects.every(h => hasPosition(h));
  }

  protected override isConverted(obj: HitObject): obj is OsuHitObject {
    return obj instanceof OsuHitObject;
  }

  protected override convertHitObject(original: HitObject, beatmap: IBeatmap): Iterable<OsuHitObject> {
    const positionData = hasPosition(original) ? original : null;
    const comboData = hasCombo(original) ? original : null;
    const sliderVelocityData = hasSliderVelocity(original) ? original : null;
    const generateTicksData = hasGenerateTicks(original) ? original : null;

    if (hasPath(original) && hasRepeats(original)) {
      const slider = new Slider();
      slider.startTime = original.startTime;
      slider.samples = original.samples;
      slider.path = original.path;
      slider.nodeSamples = original.nodeSamples;
      slider.repeatCount = original.repeatCount;
      slider.position = positionData?.position ?? Vector2F.Zero;
      slider.newCombo = comboData?.newCombo ?? false;
      slider.comboOffset = comboData?.comboOffset ?? 0;
      // prior to v8, speed multipliers don't adjust for how many ticks are generated over the same distance.
      // this results in more (or less) ticks being generated in <v8 maps for the same time duration.
      slider.tickDistanceMultiplier = beatmap.beatmapVersion < 8
        ? Math.fround(1) / (beatmap.controlPointInfo as LegacyControlPointInfo).difficultyPointAt(original.startTime).sliderVelocity
        : 1;
      slider.generateTicks = generateTicksData?.generateTicks ?? true;
      slider.sliderVelocityMultiplier = sliderVelocityData?.sliderVelocityMultiplier ?? 1;
      return [slider];
    }

    if (hasDuration(original)) {
      const spinner = new Spinner();
      spinner.startTime = original.startTime;
      spinner.samples = original.samples;
      spinner.endTime = original.endTime;
      spinner.position = positionData?.position ?? playfield_centre;
      spinner.newCombo = comboData?.newCombo ?? false;
      spinner.comboOffset = comboData?.comboOffset ?? 0;
      return [spinner];
    }

    const circle = new HitCircle();
    circle.startTime = original.startTime;
    circle.samples = original.samples;
    circle.position = positionData?.position ?? Vector2F.Zero;
    circle.newCombo = comboData?.newCombo ?? false;
    circle.comboOffset = comboData?.comboOffset ?? 0;
    return [circle];
  }

  protected override createBeatmap(): Beatmap<OsuHitObject> {
    return new OsuBeatmap();
  }
}
