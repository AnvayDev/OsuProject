// Ported from osu.Game/Overlays/Dialog/PopupDialogDangerousButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { ValueChangedEvent } from '@fw/bindables/Bindable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Axes } from '@fw/layout/Enums';
import { HoldToConfirmContainer } from '../../graphics/containers/HoldToConfirmContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { PopupDialogButton } from './PopupDialogButton';

export class PopupDialogDangerousButton extends PopupDialogButton {
  private progressBox!: Box;
  private confirmContainer!: DangerousConfirmContainer;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.buttonColour = dependencies.resolve(OsuColour).red3;

    this.colourContainer.add(this.progressBox = new Box().with({
      relativeSizeAxes: Axes.Both,
      blending: BlendingParameters.Additive,
    }));

    this.addInternal(this.confirmContainer = new DangerousConfirmContainer().with({
      action: () => this.action?.(),
      relativeSizeAxes: Axes.Both,
    }));

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.confirmContainer.progress.bindValueChanged(progress => this.progressBox.width = Math.fround(progress.newValue), true);
  }
}

class DangerousConfirmContainer extends HoldToConfirmContainer {
  constructor() {
    super(true);
  }

  private tickSample: Sample | null = null;
  private confirmSample: Sample | null = null;
  private lastTickPlaybackTime = 0;
  private mouseDown = false;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const audio = dependencies.resolve(AudioManager);
    void audio.samples.get('UI/dialog-dangerous-tick').then(s => this.tickSample = s);
    void audio.samples.get('UI/dialog-dangerous-select').then(s => this.confirmSample = s);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.progress.bindValueChanged(p => this.progressChanged(p));
  }

  protected override confirm(): void {
    this.confirmSample?.play();
    super.confirm();
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    this.beginConfirm();
    this.mouseDown = true;
    return true;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (!e.hasAnyButtonPressed) {
      this.abortConfirm();
      this.mouseDown = false;
    }
  }

  protected override onHover(e: HoverEvent): boolean {
    if (this.mouseDown)
      this.beginConfirm();

    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);

    if (!this.mouseDown) return;

    this.abortConfirm();
  }

  private progressChanged(progress: ValueChangedEvent<number>): void {
    if (progress.newValue < progress.oldValue)
      return;

    if (this.clock!.currentTime - this.lastTickPlaybackTime < 40)
      return;

    if (this.tickSample === null)
      return;

    const channel = this.tickSample.getChannel();

    channel.frequency.value = 1 + progress.newValue;
    channel.volume.value = Math.fround(0.1) + progress.newValue / 2;

    channel.play();

    this.lastTickPlaybackTime = this.clock!.currentTime;
  }
}
