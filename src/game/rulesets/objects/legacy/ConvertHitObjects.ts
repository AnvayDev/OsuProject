// Ported from osu.Game/Rulesets/Objects/Legacy/ConvertHitObject.cs, ConvertHitCircle.cs, ConvertSlider.cs, ConvertSpinner.cs, ConvertHold.cs and
// IHasLegacyHitObjectType.cs.

import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Vector2F } from '@fw/layout/Vector2F';
import type { HitSampleInfo } from '../../../audio/HitSampleInfo';
import type { IBeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { ControlPointInfo } from '../../../beatmaps/controlPoints/ControlPointInfo';
import { LegacyHitObjectType } from '../../../beatmaps/legacy/LegacyEnums';
import { HitWindows } from '../../scoring/HitWindows';
import { HitObject } from '../HitObject';
import type { SliderPath } from '../SliderPath';
import { spanCount } from '../types/Types';

/** A hit object only used for conversion, not actual gameplay. */
export abstract class ConvertHitObject extends HitObject {
  newCombo = false;

  comboOffset = 0;

  get x(): number {
    return this.position.x;
  }

  set x(value: number) {
    this.position = new Vector2F(value, this.position.y);
  }

  get y(): number {
    return this.position.y;
  }

  set y(value: number) {
    this.position = new Vector2F(this.position.x, value);
  }

  position = Vector2F.Zero;

  /** The hit object type in the legacy format. */
  legacyType = LegacyHitObjectType.Circle;

  protected override createHitWindows(): HitWindows {
    return HitWindows.Empty;
  }
}

export class ConvertHitCircle extends ConvertHitObject {
}

export class ConvertSlider extends ConvertHitObject {
  /** Scoring distance with a speed-adjusted beat length of 1 second. */
  private static readonly base_scoring_distance = 100;

  path!: SliderPath;

  get distance(): number {
    return this.path.distance;
  }

  nodeSamples: HitSampleInfo[][] = [];

  repeatCount = 0;

  get duration(): number {
    return spanCount(this) * this.distance / this.velocity;
  }

  get endTime(): number {
    return this.startTime + this.duration;
  }

  velocity = 1;

  readonly sliderVelocityMultiplierBindable = new BindableDouble(1);

  get sliderVelocityMultiplier(): number {
    return this.sliderVelocityMultiplierBindable.value;
  }

  set sliderVelocityMultiplier(value: number) {
    this.sliderVelocityMultiplierBindable.value = value;
  }

  generateTicks = true;

  constructor() {
    super();

    this.legacyType = LegacyHitObjectType.Slider;
  }

  protected override applyDefaultsToSelf(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    super.applyDefaultsToSelf(controlPointInfo, difficulty);

    const timingPoint = controlPointInfo.timingPointAt(this.startTime);

    const scoringDistance = Math.fround(ConvertSlider.base_scoring_distance) * difficulty.sliderMultiplier * this.sliderVelocityMultiplier;

    this.velocity = scoringDistance / timingPoint.beatLength;
  }
}

export class ConvertSpinner extends ConvertHitObject {
  duration = 0;

  get endTime(): number {
    return this.startTime + this.duration;
  }

  constructor() {
    super();

    this.legacyType = LegacyHitObjectType.Spinner;
  }
}

export class ConvertHold extends ConvertHitObject {
  duration = 0;

  get endTime(): number {
    return this.startTime + this.duration;
  }

  constructor() {
    super();

    this.legacyType = LegacyHitObjectType.Hold;
  }
}
