// Ported from osu.Game/Overlays/WaveOverlayContainer.cs

import type { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { OsuFocusedOverlayContainer } from '../graphics/containers/OsuFocusedOverlayContainer';
import { WaveContainer } from '../graphics/containers/WaveContainer';

export abstract class WaveOverlayContainer extends OsuFocusedOverlayContainer {
  protected readonly waves: WaveContainer;

  protected override get blockNonPositionalInput(): boolean {
    return true;
  }

  protected override get content(): Container<Drawable> {
    return this.waves;
  }

  static readonly WIDTH_PADDING = 80;

  protected override get startHidden(): boolean {
    return true;
  }

  // `WaveContainer` plays PopIn/PopOut samples, so we disable the overlay-level one as to not double-up sample playback.
  protected override get popInSampleName(): string | null {
    return '';
  }

  protected override get popOutSampleName(): string | null {
    return '';
  }

  static readonly HORIZONTAL_PADDING = 50;

  protected constructor() {
    super();

    this.addInternal(this.waves = new WaveContainer().with({
      relativeSizeAxes: Axes.Both,
    }));
  }

  protected override popIn(): void {
    this.waves.show();
    this.fadeIn(100, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.waves.hide();
    this.fadeOut(WaveContainer.DISAPPEAR_DURATION, Easing.InQuint)
      // base call is responsible for stopping preview tracks.
      // delay it until the fade has concluded to ensure that nothing inside the overlay has triggered
      // another preview track playback in the meantime, leaving an "orphaned" preview playing.
      .onComplete(() => super.popOut());
  }
}
