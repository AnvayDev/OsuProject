// Ported from osu.Game/Screens/BackgroundScreen.cs

import type { KeyDownEvent } from '@fw/input/events/UIEvents';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScreenExitEvent, ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Screen } from '@fw/screens/Screen';
import { Easing } from '@fw/transforms/Easing';

export abstract class BackgroundScreen extends Screen {
  static readonly TRANSITION_LENGTH = 500;
  private static readonly x_movement_amount = 50;

  override get isPresent(): boolean {
    return super.isPresent || this.scheduler.hasPendingTasks;
  }

  /** Whether the entry transition (fade and slide in) is played. Set by BackgroundScreenStack.push. */
  animateEntry = true;

  protected constructor() {
    super();

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;
  }

  equals(other: BackgroundScreen | null): boolean {
    return other?.constructor === this.constructor;
  }

  protected override onKeyDown(_e: KeyDownEvent): boolean {
    // we don't want to handle escape key.
    return false;
  }

  /** Apply arbitrary changes to this background in a thread safe manner. */
  applyToBackground(action: (b: BackgroundScreen) => void): void {
    this.schedule(() => action(this));
  }

  protected override update(): void {
    super.update();

    this.scale = new Vector2(1 + BackgroundScreen.x_movement_amount / this.drawSize.x * 2);
  }

  override onEntering(e: ScreenTransitionEvent): void {
    if (this.animateEntry) {
      this.fadeOut();
      this.fadeIn(BackgroundScreen.TRANSITION_LENGTH, Easing.InOutQuart);

      this.moveToX(BackgroundScreen.x_movement_amount);
      this.moveToX(0, BackgroundScreen.TRANSITION_LENGTH, Easing.InOutQuart);
    }

    super.onEntering(e);
  }

  override onSuspending(e: ScreenTransitionEvent): void {
    this.moveToX(-BackgroundScreen.x_movement_amount, BackgroundScreen.TRANSITION_LENGTH, Easing.InOutQuart);
    super.onSuspending(e);
  }

  override onExiting(e: ScreenExitEvent): boolean {
    if (this.isLoaded) {
      this.fadeOut(BackgroundScreen.TRANSITION_LENGTH, Easing.OutExpo);
      this.moveToX(BackgroundScreen.x_movement_amount, BackgroundScreen.TRANSITION_LENGTH, Easing.OutExpo);
    }

    return super.onExiting(e);
  }

  override onResuming(e: ScreenTransitionEvent): void {
    if (this.isLoaded)
      this.moveToX(0, BackgroundScreen.TRANSITION_LENGTH, Easing.OutExpo);

    super.onResuming(e);
  }
}
