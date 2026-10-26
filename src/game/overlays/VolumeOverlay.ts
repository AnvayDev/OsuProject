// Ported from osu.Game/Overlays/VolumeOverlay.cs

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Visibility, VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { HoverEvent, HoverLostEvent, MouseMoveEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { SelectionCycleFillFlowContainer } from '../graphics/containers/SelectionCycleFillFlowContainer';
import { OsuColour } from '../graphics/OsuColour';
import { GlobalAction } from '../input/bindings/GlobalAction';
import { MasterVolumeMeter } from './volume/MasterVolumeMeter';
import { VolumeMeter } from './volume/VolumeMeter';

const offset = 10;

export class VolumeOverlay extends VisibilityContainer {
  readonly isMuted = new Bindable<boolean>(false);

  private volumeMeterMaster!: VolumeMeter;
  private volumeMeterEffect!: VolumeMeter;
  private volumeMeterMusic!: VolumeMeter;

  private volumeMeters!: SelectionCycleFillFlowContainer<VolumeMeter>;

  // [Cached]
  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cache(this);
    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const audio = dependencies.resolve(AudioManager);
    const colours = dependencies.resolve(OsuColour);

    this.autoSizeAxes = Axes.X;
    this.relativeSizeAxes = Axes.Y;

    let master!: MasterVolumeMeter;

    this.addRange([
      new Box().with({
        relativeSizeAxes: Axes.Y,
        width: 300,
        colour: ColourInfo.gradientHorizontal(Colour4.Black.opacity(Math.fround(0.75)), Colour4.Black.opacity(0)),
      }),
      new FillFlowContainer().with({
        direction: FillDirection.Vertical,
        autoSizeAxes: Axes.Both,
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        spacing: new Vector2(0, offset),
        margin: MarginPadding.of({ left: offset }),
        children: [
          this.volumeMeters = new SelectionCycleFillFlowContainer<VolumeMeter>().with({
            direction: FillDirection.Vertical,
            autoSizeAxes: Axes.Both,
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            spacing: new Vector2(0, offset),
            children: [
              // (AudioSettingsStrings.EffectVolume / MasterVolume / MusicVolume, upper-cased)
              this.volumeMeterEffect = new VolumeMeter('EFFECT', 125, colours.blueDarker),
              this.volumeMeterMaster = master = new MasterVolumeMeter('MASTER', 150, colours.pinkDarker),
              this.volumeMeterMusic = new VolumeMeter('MUSIC', 125, colours.blueDarker),
            ],
          }),
        ],
      }),
    ]);

    master.isMuted.bindTarget = this.isMuted;

    this.volumeMeterMaster.bindable.bindTo(audio.volume);
    this.volumeMeterEffect.bindable.bindTo(audio.volumeSample);
    this.volumeMeterMusic.bindable.bindTo(audio.volumeTrack);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    for (const volumeMeter of this.volumeMeters.children)
      volumeMeter.bindable.valueChanged.add(() => this.show());
  }

  adjust(action: GlobalAction, amount = 1, isPrecise = false): boolean {
    if (!this.isLoaded) return false;

    switch (action) {
      case GlobalAction.DecreaseVolume:
        if (this.state.value === Visibility.Hidden)
          this.show();
        else
          this.volumeMeters.selected?.decrease(amount, isPrecise);
        return true;

      case GlobalAction.IncreaseVolume:
        if (this.state.value === Visibility.Hidden)
          this.show();
        else
          this.volumeMeters.selected?.increase(amount, isPrecise);
        return true;

      case GlobalAction.NextVolumeMeter:
        if (this.state.value !== Visibility.Visible)
          return false;

        this.volumeMeters.selectNext();
        this.show();
        return true;

      case GlobalAction.PreviousVolumeMeter:
        if (this.state.value !== Visibility.Visible)
          return false;

        this.volumeMeters.selectPrevious();
        this.show();
        return true;

      case GlobalAction.ToggleMute:
        this.show();
        this.volumeMeters.children.filter(m => m instanceof MasterVolumeMeter)[0].toggleMute();
        return true;
    }

    return false;
  }

  focusMasterVolume(): void {
    this.volumeMeters.select(this.volumeMeterMaster);
  }

  override show(): void {
    // Focus on the master meter as a default if previously hidden
    if (this.state.value === Visibility.Hidden)
      this.focusMasterVolume();

    if (this.state.value === Visibility.Visible)
      this.schedulePopOut();

    super.show();
  }

  protected override popIn(): void {
    this.clearTransforms();
    this.fadeIn(100);

    this.schedulePopOut();
  }

  protected override popOut(): void {
    this.fadeOut(100);
  }

  protected override onMouseMove(e: MouseMoveEvent): boolean {
    // keep the scheduled event correctly timed as long as we have movement.
    this.schedulePopOut();
    return super.onMouseMove(e);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.schedulePopOut();
    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.schedulePopOut();
    super.onHoverLost(e);
  }

  private popOutDelegate: ScheduledDelegate | null = null;

  private schedulePopOut(): void {
    this.popOutDelegate?.cancel();
    // (this.Delay(1000).Schedule(..., out popOutDelegate): no transform delay is active here, so it is a delay of 1000)
    this.popOutDelegate = this.scheduler.addDelayed(() => {
      if (!this.isHovered)
        this.hide();
    }, 1000);
  }
}
