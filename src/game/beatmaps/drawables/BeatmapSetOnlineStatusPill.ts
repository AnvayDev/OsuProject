// Ported from osu.Game/Beatmaps/Drawables/BeatmapSetOnlineStatusPill.cs
// Tooltips (IHasTooltip) aren't ported yet.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { BeatmapOnlineStatus, getOnlineStatusDescription } from '../BeatmapOnlineStatus';

const animation_duration = 400;

export class BeatmapSetOnlineStatusPill extends CircularContainer {
  /** Whether to show BeatmapOnlineStatus.None as "unknown" instead of fading out. */
  showUnknownStatus = false;

  /** Whether changing status performs transition transforms. */
  animated = true;

  get status(): BeatmapOnlineStatus {
    return this._status;
  }

  set status(value: BeatmapOnlineStatus) {
    if (this._status === value)
      return;

    this._status = value;

    if (this.isLoaded)
      this.updateState();
  }

  private _status = BeatmapOnlineStatus.None;

  set textSize(value: number) {
    this.statusText.font = this.statusText.font.with({ size: value });
  }

  set textPadding(value: MarginPadding) {
    this.statusText.padding = value;
  }

  private readonly statusText: OsuSpriteText;
  private readonly background: Box;

  private colours!: OsuColour;

  private colourProvider: OverlayColourProvider | null = null;

  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;
    this.masking = true;

    this.alpha = 0;

    this.children = [
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.Black,
      }),
      this.statusText = new OsuSpriteText().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        font: withFont(OsuFont.Default, { weight: FontWeight.Bold }),
      }),
    ];

    this.status = BeatmapOnlineStatus.None;
    this.textPadding = MarginPadding.of({ horizontal: 4, bottom: 1 });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colours = dependencies.resolve(OsuColour);
    this.colourProvider = dependencies.get(OverlayColourProvider);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateState();
    this.finishTransforms(true);
  }

  private updateState(): void {
    let duration = this.animated ? animation_duration : 0;

    if (this.status === BeatmapOnlineStatus.None && !this.showUnknownStatus) {
      this.fadeOut(duration, Easing.OutQuint);
      return;
    }

    // The autosize animation on this component is intended to animate horizontal sizing only.
    // To avoid vertical autosize animating from zero to non-zero, only apply the duration
    // after we have a valid size.
    if (this.height > 0) {
      this.autoSizeDuration = Math.fround(duration);
      this.autoSizeEasing = Easing.OutQuint;
    }

    this.fadeIn(duration, Easing.OutQuint);

    // Handle the case where transition from hidden to non-hidden may cause
    // a fade from a colour that doesn't make sense (due to not being able to see the previous colour).
    if (this.alpha === 0)
      duration = 0;

    let statusTextColour: Colour4;

    if (this.colourProvider !== null)
      statusTextColour = this._status === BeatmapOnlineStatus.Graveyard ? this.colourProvider.background1 : this.colourProvider.background3;
    else
      statusTextColour = this._status === BeatmapOnlineStatus.Graveyard ? this.colours.greySeaFoamLight : Colour4.Black;

    this.statusText.fadeColour(statusTextColour, duration, Easing.OutQuint);
    this.background.fadeColour(OsuColour.forBeatmapSetOnlineStatus(this.status) ?? this.colourProvider?.light1 ?? this.colours.greySeaFoamLighter, duration, Easing.OutQuint);

    this.statusText.text = getOnlineStatusDescription(this.status).toUpperCase();
  }
}
