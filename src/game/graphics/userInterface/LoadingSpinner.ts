// Ported from osu.Game/Graphics/UserInterface/LoadingSpinner.cs

import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Container } from '@fw/graphics/containers/Container';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, RotationDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import type { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { TrianglesV2 } from '../backgrounds/TrianglesV2';
import { BeatSyncedContainer } from '../containers/BeatSyncedContainer';

const spin_duration = 3150;

class LoadingSpinnerBeatSyncer extends BeatSyncedContainer {
  constructor(private readonly onBeat: (beatLength: number) => void) {
    super();

    this.allowMistimedEventFiring = false;
  }

  protected override onNewBeat(beatIndex: number, timingPoint: TimingControlPoint, effectPoint: EffectControlPoint, amplitudes: ChannelAmplitudes): void {
    super.onNewBeat(beatIndex, timingPoint, effectPoint, amplitudes);

    let beatLength = timingPoint.beatLength;
    let beatsPerStep = 1;

    // Ensure rotation duration is long enough to be visually smooth at 100+ BPM.
    while (beatLength < 600) {
      beatLength *= 2;
      beatsPerStep *= 2;
    }

    this.earlyActivationMilliseconds = beatLength / 3;

    // Skip beats that don't align with the current step.
    if (beatIndex % beatsPerStep !== 0)
      return;

    this.onBeat(beatLength);
  }
}

/** A loading spinner. */
export class LoadingSpinner extends VisibilityContainer {
  static readonly TRANSITION_DURATION = 500;

  private readonly spinner: SpriteIcon;

  protected override get startHidden(): boolean {
    return true;
  }

  protected mainContents: Container;

  private readonly triangles: TrianglesV2;

  private readonly trianglesMasking: Container | null = null;

  private readonly withBox: boolean;

  private targetRotation = 0;

  /**
   * Construct a new loading spinner.
   * @param withBox Whether the spinner should have a surrounding black box for visibility.
   * @param inverted Whether colours should be inverted (black spinner instead of white).
   */
  constructor(withBox = false, inverted = false) {
    super();

    this.withBox = withBox;

    this.size = new Vector2(60);

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    let spinner!: SpriteIcon;
    let triangles!: TrianglesV2;

    if (withBox) {
      this.child = this.mainContents = new Container().with({
        relativeSizeAxes: Axes.Both,
        masking: true,
        cornerRadius: 20,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        children: [
          new Box().with({
            colour: inverted ? Colour4.White : Colour4.Black,
            relativeSizeAxes: Axes.Both,
            alpha: Math.fround(0.7),
          }),
          triangles = new TrianglesV2().with({
            relativeSizeAxes: Axes.Both,
            colour: inverted ? Colour4.White : Colour4.Black,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            alpha: Math.fround(0.2),
            scaleAdjust: Math.fround(0.4),
            velocity: Math.fround(0.8),
            spawnRatio: 2,
          }),
          spinner = new SpriteIcon().with({
            anchor: Anchor.Centre,
            origin: Anchor.Custom,
            colour: inverted ? Colour4.Black : Colour4.White,
            scale: new Vector2(Math.fround(0.6)),
            relativeSizeAxes: Axes.Both,
            icon: FontAwesome.Solid.CircleNotch,
          }),
        ],
      });
    } else {
      let trianglesMasking!: Container;

      this.children = [
        this.mainContents = new Container().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          children: [
            spinner = new SpriteIcon().with({
              anchor: Anchor.Centre,
              origin: Anchor.Custom,
              colour: inverted ? Colour4.Black : Colour4.White,
              relativeSizeAxes: Axes.Both,
              icon: FontAwesome.Solid.CircleNotch,
            }),
          ],
        }),
        trianglesMasking = new Container().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          size: new Vector2(Math.fround(0.8)),
          masking: true,
          cornerRadius: 20,
          children: [
            triangles = new TrianglesV2().with({
              anchor: Anchor.Centre,
              origin: Anchor.Centre,
              alpha: Math.fround(0.4),
              colour: ColourInfo.gradientVertical(
                inverted ? Colour4.Black.opacity(0) : Colour4.White.opacity(0),
                inverted ? Colour4.Black : Colour4.White),
              relativeSizeAxes: Axes.Both,
              scaleAdjust: Math.fround(0.4),
              spawnRatio: 4,
            }),
          ],
        }),
      ];

      this.trianglesMasking = trianglesMasking;
    }

    this.spinner = spinner;
    this.triangles = triangles;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.spinner.spin(spin_duration, RotationDirection.Clockwise);
    this.addInternal(new LoadingSpinnerBeatSyncer(beatLength => this.onBeat(beatLength)));
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // Font awesome icon isn't centered perfectly.
    this.spinner.originPosition = this.spinner.drawSize.mul(Math.fround(0.4963333333));

    if (this.withBox) {
      this.mainContents.cornerRadius = this.mainContents.drawWidth / 4;
      this.triangles.rotation = -this.mainContents.rotation;
    } else {
      this.trianglesMasking!.cornerRadius = this.mainContents.drawWidth / 2;
    }
  }

  protected override popIn(): void {
    if (this.alpha < 0.5) {
      // reset animation if the user can't see us.
      this.targetRotation = 0;
      this.mainContents.rotateTo(0);
    }

    this.mainContents.scaleTo(1, LoadingSpinner.TRANSITION_DURATION, Easing.OutQuint);

    // Very slight delay to avoid spinner flickering briefly during minimal loads.
    // Note that we still use fade in here because it is important for input blocking cases (see `LoadingLayer`).
    this.fadeTo(Math.fround(0.01), 50)
      .then()
      .fadeIn(LoadingSpinner.TRANSITION_DURATION, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.mainContents.scaleTo(Math.fround(0.6), LoadingSpinner.TRANSITION_DURATION, Easing.OutQuint);
    this.fadeOut(LoadingSpinner.TRANSITION_DURATION / 2, Easing.OutQuint);
  }

  private onBeat(beatLength: number): void {
    this.targetRotation += 90;
    this.mainContents.rotateTo(this.targetRotation, beatLength, Easing.InOutQuart);
  }
}
