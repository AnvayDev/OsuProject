// Ported from osu.Game/Overlays/Toolbar/ToolbarMusicButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import type { Container } from '@fw/graphics/containers/Container';
import { Box } from '@fw/graphics/shapes/Box';
import type { KeyDownEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import type { TransformSequence } from '@fw/transforms/TransformSequence';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { NowPlayingOverlay } from '../NowPlayingOverlay';
import { VolumeOverlay } from '../VolumeOverlay';
import { TOOLBAR_HEIGHT } from './ToolbarButton';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarMusicButton extends ToolbarOverlayToggleButton {
  private volumeBar!: Box;

  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  constructor() {
    super();

    this.hotkey = GlobalAction.ToggleNowPlaying;
    this.buttonContent.autoSizeAxes = Axes.X;
  }

  private audio!: AudioManager;

  private volume: VolumeOverlay | null = null;

  private globalVolume!: Bindable<number>;
  private volumeDisplay!: Container;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.stateContainer = dependencies.get(NowPlayingOverlay);
    this.volume = dependencies.get(VolumeOverlay);

    this.audio = dependencies.resolve(AudioManager);

    this.flow.padding = MarginPadding.of({ horizontal: TOOLBAR_HEIGHT / 4 });
    this.flow.add(this.volumeDisplay = new CircularContainer().with({
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      width: 3,
      height: this.iconContainer.height,
      margin: MarginPadding.of({ left: 7.5, right: 2.5 }),
      masking: true,
      children: [
        new Box().with({
          relativeSizeAxes: Axes.Both,
          colour: Colour4.White.opacity(Math.fround(0.25)),
        }),
        this.volumeBar = new Box().with({
          relativeSizeAxes: Axes.Both,
          height: 0,
          anchor: Anchor.BottomLeft,
          origin: Anchor.BottomLeft,
          colour: Colour4.White,
        }),
      ],
    }));

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.globalVolume = this.audio.volume.getBoundCopy();
    this.globalVolume.bindValueChanged(v => this.volumeBar.resizeHeightTo(Math.fround(v.newValue), 200, Easing.OutQuint), true);
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (!this.isHovered)
      return false;

    switch (e.key) {
      case Key.Up:
        this.focusForAdjustment();
        this.volume?.adjust(GlobalAction.IncreaseVolume);
        return true;

      case Key.Down:
        this.focusForAdjustment();
        this.volume?.adjust(GlobalAction.DecreaseVolume);
        return true;
    }

    return super.onKeyDown(e);
  }

  protected override onScroll(e: ScrollEvent): boolean {
    this.focusForAdjustment();
    this.volume?.adjust(GlobalAction.IncreaseVolume, e.scrollDelta.y, e.isPrecise);
    return true;
  }

  private focusForAdjustment(): void {
    this.volume?.focusMasterVolume();
    this.expandVolumeBarTemporarily();
  }

  private expandTransform: TransformSequence<Container> | null = null;
  private contractTransform: ScheduledDelegate | null = null;

  private expandVolumeBarTemporarily(): void {
    // avoid starting a new transform if one is already active.
    if (this.expandTransform === null) {
      this.expandTransform = this.volumeDisplay.resizeWidthTo(6, 500, Easing.OutQuint);
      this.expandTransform.finally(() => this.expandTransform = null);
    }

    this.contractTransform?.cancel();
    this.contractTransform = this.scheduler.addDelayed(() => {
      this.volumeDisplay.resizeWidthTo(3, 500, Easing.OutQuint);
    }, 1000);
  }
}
