// Ported from osu.Game.Rulesets.Osu/Objects/SliderRepeat.cs

import type { Slider } from './Slider';
import { SliderEndCircle } from './SliderEndCircle';

export class SliderRepeat extends SliderEndCircle {
  pathProgress = 0;

  constructor(slider: Slider) {
    super(slider);
  }
}
