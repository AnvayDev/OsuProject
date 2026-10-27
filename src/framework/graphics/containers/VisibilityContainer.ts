// Ported from osu.Framework/Graphics/Containers/VisibilityContainer.cs

import { Bindable, type ValueChangedEvent } from '../../bindables/Bindable';
import { Container } from './Container';

export enum Visibility {
  Hidden,
  Visible,
}

/** A container which adds a basic visibility state. */
export abstract class VisibilityContainer extends Container {
  /** The current visibility state. */
  readonly state = new Bindable<Visibility>(Visibility.Hidden);

  private didInitialHide = false;

  /**
   * Whether we should be in a hidden state when first displayed.
   * Override this and set to true to *always* perform a popIn animation even when the state is non-hidden at first display.
   */
  protected get startHidden(): boolean {
    return this.state.value === Visibility.Hidden;
  }

  protected override loadAsyncComplete(): void {
    super.loadAsyncComplete();

    if (this.startHidden) {
      // do this without triggering the StateChanged event, since hidden is a default.
      this.popOut();
      this.finishTransforms(true);
      this.didInitialHide = true;
    }
  }

  protected override loadComplete(): void {
    this.state.bindValueChanged(e => this.updateState(e), this.state.value === Visibility.Visible || !this.didInitialHide);

    super.loadComplete();
  }

  /** Show this container by setting its visibility to Visible. */
  override show(): void {
    this.state.value = Visibility.Visible;
  }

  /** Hide this container by setting its visibility to Hidden. */
  override hide(): void {
    this.state.value = Visibility.Hidden;
  }

  /** Toggle this container's visibility. */
  toggleVisibility(): void {
    this.state.value = this.state.value === Visibility.Visible ? Visibility.Hidden : Visibility.Visible;
  }

  override get propagateNonPositionalInputSubTree(): boolean {
    return super.propagateNonPositionalInputSubTree && this.state.value === Visibility.Visible;
  }

  override get propagatePositionalInputSubTree(): boolean {
    return super.propagatePositionalInputSubTree && this.state.value === Visibility.Visible;
  }

  /** Implement any transition to be played when state becomes Visible. */
  protected abstract popIn(): void;

  /**
   * Implement any transition to be played when state becomes Hidden.
   * Will be invoked once on loadComplete if startHidden is set.
   */
  protected abstract popOut(): void;

  /** Called whenever state is changed. Used to update this container's elements according to the new visibility state. */
  protected updateState(state: ValueChangedEvent<Visibility>): void {
    switch (state.newValue) {
      case Visibility.Hidden:
        this.popOut();
        break;

      case Visibility.Visible:
        this.popIn();
        break;
    }
  }
}
