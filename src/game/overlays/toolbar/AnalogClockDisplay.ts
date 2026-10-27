// Ported from osu.Game/Overlays/Toolbar/AnalogClockDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Circle } from '@fw/graphics/shapes/Circle';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { ClockDisplay } from './ClockDisplay';

const hand_thickness = Math.fround(2.4);

export class AnalogClockDisplay extends ClockDisplay {
  private hour!: Drawable;
  private minute!: Drawable;
  private second!: Drawable;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.size = new Vector2(22);

    this.internalChildren = [
      new CircularContainer().with({
        relativeSizeAxes: Axes.Both,
        masking: true,
        borderThickness: 2,
        borderColour: Colour4.White,
        child: new Box().with({
          alwaysPresent: true,
          alpha: 0,
          relativeSizeAxes: Axes.Both,
        }),
      }),
      this.hour = new LargeHand(Math.fround(0.34)),
      this.minute = new LargeHand(Math.fround(0.48)),
      this.second = new SecondHand(),
      new CentreCircle().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
      }),
    ];

    return r;
  }

  protected override updateDisplay(now: Date): void {
    const secondFractional = Math.fround(now.getSeconds() / 60);
    const minuteFractional = Math.fround((now.getMinutes() + secondFractional) / 60);
    const hourFractional = Math.fround(((minuteFractional + now.getHours()) % 12) / 12);

    this.updateRotation(this.hour, hourFractional);
    this.updateRotation(this.minute, minuteFractional);
    this.updateRotation(this.second, secondFractional);
  }

  private updateRotation(hand: Drawable, fraction: number): void {
    const duration = 320;

    const rotation = Math.fround(fraction * 360 - 90);

    // The case where a hand is completing a rotation.
    // Animate and then move back one full rotation so we don't need to track outside of 0..360
    if (Math.abs(hand.rotation - rotation) > 180) {
      let animRotation = rotation;
      while (animRotation < hand.rotation)
        animRotation += 180;

      hand.rotateTo(animRotation, duration, Easing.OutElastic)
        .then()
        .rotateTo(rotation);
    } else
      hand.rotateTo(rotation, duration, Easing.OutElastic);
  }
}

/** (AnalogClockDisplay.CentreCircle) */
class CentreCircle extends CompositeDrawable {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.internalChildren = [
      new Circle().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        size: new Vector2(hand_thickness),
        colour: Colour4.White,
      }),
      new Circle().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        size: new Vector2(Math.fround(hand_thickness * Math.fround(0.7))),
        colour: colours.pinkLight,
      }),
    ];

    return r;
  }
}

/** (AnalogClockDisplay.SecondHand) */
class SecondHand extends CompositeDrawable {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.relativeSizeAxes = Axes.X;
    this.width = Math.fround(0.66);

    this.height = Math.fround(hand_thickness * Math.fround(0.7));
    this.anchor = Anchor.Centre;
    this.origin = Anchor.Custom;

    this.originPosition = new Vector2(this.height * 2, this.height / 2);

    this.internalChildren = [
      new Circle().with({
        colour: colours.pinkLight,
        relativeSizeAxes: Axes.Both,
      }),
    ];

    return r;
  }
}

/** (AnalogClockDisplay.LargeHand) */
class LargeHand extends CompositeDrawable {
  constructor(length: number) {
    super();

    this.width = length;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Custom;

    this.originPosition = new Vector2(hand_thickness / 2); // offset x also, to ensure the centre of the line is centered on the face.

    this.height = hand_thickness;

    this.internalChildren = [
      new Circle().with({
        colour: Colour4.White,
        relativeSizeAxes: Axes.Both,
        borderThickness: Math.fround(0.7),
        borderColour: colours.gray2,
      }),
    ];

    this.relativeSizeAxes = Axes.X;

    return r;
  }
}
