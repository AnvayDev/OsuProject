// Ported from osu.Game/Screens/Menu/MenuSideFlashes.cs
// There is no API, so the user is never a supporter and the skin's MenuGlow colour never applies (the base colour is always OsuColour.Blue).
// (The C# class also binds the working beatmap without using it; that binding is left out.)

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import type { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import type { Drawable } from '@fw/graphics/Drawable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import type { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import type { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { BeatSyncedContainer } from '../../graphics/containers/BeatSyncedContainer';
import { OsuColour } from '../../graphics/OsuColour';

const amplitude_dead_zone = Math.fround(0.25);
const alpha_multiplier = Math.fround((1 - amplitude_dead_zone) / Math.fround(0.55));
const kiai_multiplier = Math.fround((1 - Math.fround(amplitude_dead_zone * Math.fround(0.95))) / Math.fround(0.8));

const box_fade_in_time = 65;
const box_width = 200;

export class MenuSideFlashes extends BeatSyncedContainer {
  protected get refreshColoursEveryFlash(): boolean {
    return false;
  }

  protected get intensity(): number {
    return 2;
  }

  private leftBox!: Box;
  private rightBox!: Box;

  private colours!: OsuColour;

  constructor() {
    super();

    this.earlyActivationMilliseconds = box_fade_in_time;

    this.relativeSizeAxes = Axes.Both;
    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);

    this.children = [
      this.leftBox = new Box().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        relativeSizeAxes: Axes.Y,
        width: box_width * this.intensity,
        height: Math.fround(1.5),
        // align off-screen to make sure our edges don't become visible during parallax.
        x: -box_width,
        alpha: 0,
        blending: BlendingParameters.Additive,
      }),
      this.rightBox = new Box().with({
        anchor: Anchor.CentreRight,
        origin: Anchor.CentreRight,
        relativeSizeAxes: Axes.Y,
        width: box_width * this.intensity,
        height: Math.fround(1.5),
        x: box_width,
        alpha: 0,
        blending: BlendingParameters.Additive,
      }),
    ];

    if (!this.refreshColoursEveryFlash)
      this.updateColour();

    return r;
  }

  protected override onNewBeat(beatIndex: number, timingPoint: TimingControlPoint, effectPoint: EffectControlPoint, amplitudes: ChannelAmplitudes): void {
    if (beatIndex < 0)
      return;

    if (effectPoint.kiaiMode ? beatIndex % 2 === 0 : beatIndex % timingPoint.timeSignature.numerator === 0)
      this.flash(this.leftBox, timingPoint.beatLength, effectPoint.kiaiMode, amplitudes);
    if (effectPoint.kiaiMode ? beatIndex % 2 === 1 : beatIndex % timingPoint.timeSignature.numerator === 0)
      this.flash(this.rightBox, timingPoint.beatLength, effectPoint.kiaiMode, amplitudes);
  }

  private flash(d: Drawable, beatLength: number, kiai: boolean, amplitudes: ChannelAmplitudes): void {
    if (this.refreshColoursEveryFlash)
      this.updateColour();

    const channel = d === this.leftBox ? amplitudes.leftChannel : amplitudes.rightChannel;

    d.fadeTo(Math.min(Math.max(Math.fround(Math.fround(0.1) + Math.fround((channel - amplitude_dead_zone) / (kiai ? kiai_multiplier : alpha_multiplier))), Math.fround(0.1)), 1),
      box_fade_in_time)
      .then()
      .fadeOut(beatLength, Easing.In);
  }

  protected getBaseColour(): Colour4 {
    return this.colours.blue;
  }

  private updateColour(): void {
    const baseColour = this.getBaseColour();
    // linear colour looks better in this case, so let's use it for now.
    const gradientDark = baseColour.opacity(0).toLinear();
    const gradientLight = baseColour.opacity(Math.fround(0.6)).toLinear();

    this.leftBox.colour = ColourInfo.gradientHorizontal(gradientLight, gradientDark);
    this.rightBox.colour = ColourInfo.gradientHorizontal(gradientDark, gradientLight);
  }
}
