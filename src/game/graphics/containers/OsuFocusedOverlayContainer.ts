// Ported from osu.Game/Graphics/Containers/OsuFocusedOverlayContainer.cs
// IPreviewTrackOwner is a [Cached] interface: the overlay caches itself as one for its children.

import { type IReadOnlyDependencyContainer, DependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { FocusedOverlayContainer } from '@fw/graphics/containers/FocusedOverlayContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { MouseDownEvent, MouseUpEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import type { Vector2 } from '@fw/layout/Vector2';
import { IPreviewTrackOwner } from '../../audio/IPreviewTrackOwner';
import { PreviewTrackManager } from '../../audio/PreviewTrackManager';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { IOverlayManager } from '../../overlays/IOverlayManager';
import { OverlayActivation } from '../../overlays/OverlayActivation';

export abstract class OsuFocusedOverlayContainer extends FocusedOverlayContainer implements IPreviewTrackOwner, IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  readonly isPreviewTrackOwner = true;

  protected readonly overlayActivationMode = new Bindable<OverlayActivation>(OverlayActivation.All);

  protected get popInSampleName(): string | null {
    return 'UI/overlay-pop-in';
  }

  protected get popOutSampleName(): string | null {
    return 'UI/overlay-pop-out';
  }

  protected get popInOutSampleBalance(): number {
    return 0;
  }

  protected override get blockNonPositionalInput(): boolean {
    return true;
  }

  /**
   * Temporary to allow for overlays in the main screen content to not dim themselves.
   * Should be eventually replaced by dimming which is aware of the target dim container (traverse parent for certain interface type?).
   */
  protected get dimMainContent(): boolean {
    return true;
  }

  private overlayManager: IOverlayManager | null = null;

  private previewTrackManager!: PreviewTrackManager;

  private samplePopIn: Sample | null = null;
  private samplePopOut: Sample | null = null;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.overlayManager = dependencies.get(IOverlayManager);
    this.previewTrackManager = dependencies.resolve(PreviewTrackManager);

    const audio = dependencies.get(AudioManager);

    if (this.popInSampleName)
      this.samplePopIn = await audio?.samples.get(this.popInSampleName) ?? null;

    if (this.popOutSampleName)
      this.samplePopOut = await audio?.samples.get(this.popOutSampleName) ?? null;
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cacheAs(IPreviewTrackOwner, this);
    return dependencies;
  }

  protected override loadComplete(): void {
    if (this.overlayManager !== null)
      this.overlayActivationMode.bindTo(this.overlayManager.overlayActivationMode);

    this.overlayActivationMode.bindValueChanged(mode => {
      if (mode.newValue === OverlayActivation.Disabled)
        this.state.value = Visibility.Hidden;
    }, true);

    super.loadComplete();
  }

  /**
   * Whether mouse input should be blocked screen-wide while this overlay is visible.
   * Performing mouse actions outside of the valid extents will hide the overlay.
   */
  get blockScreenWideMouse(): boolean {
    return this.blockPositionalInput;
  }

  // receive input outside our bounds so we can trigger a close event on ourselves.
  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.blockScreenWideMouse || super.receivePositionalInputAt(screenSpacePos);
  }

  private closeOnMouseUp = false;

  protected override onMouseDown(e: MouseDownEvent): boolean {
    this.closeOnMouseUp = !super.receivePositionalInputAt(e.screenSpaceMousePosition);

    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (this.closeOnMouseUp && !super.receivePositionalInputAt(e.screenSpaceMousePosition))
      this.hide();

    super.onMouseUp(e);
  }

  protected override onScroll(e: ScrollEvent): boolean {
    // allow for controlling volume when alt is held.
    // mostly for compatibility with osu-stable.
    if (e.altPressed) return false;

    return true;
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat)
      return false;

    switch (e.action) {
      case GlobalAction.Back:
        this.hide();
        return true;

      case GlobalAction.Select:
        return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }

  protected override updateState(state: ValueChangedEvent<Visibility>): void {
    const didChange = state.newValue !== state.oldValue;

    switch (state.newValue) {
      case Visibility.Visible:
        if (this.overlayActivationMode.value === OverlayActivation.Disabled) {
          // todo: visual/audible feedback that this operation could not complete.
          this.state.value = Visibility.Hidden;
          return;
        }

        if (didChange && this.samplePopIn !== null) {
          this.samplePopIn.balance.value = this.popInOutSampleBalance;
          this.samplePopIn.play();
        }

        if (this.blockScreenWideMouse && this.dimMainContent) this.overlayManager?.showBlockingOverlay(this);
        break;

      case Visibility.Hidden:
        if (didChange && this.samplePopOut !== null) {
          this.samplePopOut.balance.value = this.popInOutSampleBalance;
          this.samplePopOut.play();
        }

        if (this.blockScreenWideMouse) this.overlayManager?.hideBlockingOverlay(this);
        break;
    }

    super.updateState(state);
  }

  protected override popOut(): void {
    this.previewTrackManager.stopAnyPlaying(this);
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.overlayManager?.hideBlockingOverlay(this);
  }
}
