// Ported from osu.Game/Graphics/Containers/HoldToConfirmContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Container } from '@fw/graphics/containers/Container';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';

/**
 * A container which adds a common "hold-to-perform" pattern to a container.
 * This container does not handle triggering the hold/abort operations. To use this class, please call beginConfirm and abortConfirm when necessary.
 * The progress is exposed as a transforming bindable which smoothly tracks the progress of a hold operation. It can be used for animating
 * and displaying progress directly.
 */
export abstract class HoldToConfirmContainer extends Container {
  static readonly DANGEROUS_HOLD_ACTIVATION_DELAY = 500;

  private static readonly fadeout_delay = 200;

  /** Whether the associated action is considered dangerous, warranting a longer hold. */
  readonly isDangerousAction: boolean;

  /** The action to perform when a hold successfully completes. */
  action: (() => void) | null = null;

  private _fired = false;

  /** Whether currently in a fired state (and the confirm action has been sent). */
  get fired(): boolean {
    return this._fired;
  }

  private confirming = false;

  private readonly _holdActivationDelay = new Bindable<number>(0);

  /** The current activation delay for this control. */
  get holdActivationDelay(): Bindable<number> {
    return this._holdActivationDelay;
  }

  private readonly _progress = new BindableDouble();

  /** The progress of any ongoing hold operation. 0 means no hold has started; 1 means a hold has been completed. */
  get progress(): Bindable<number> {
    return this._progress;
  }

  /** Whether the overlay should be allowed to return from a fired state. */
  protected get allowMultipleFires(): boolean {
    return false;
  }

  private config!: OsuConfigManager;

  protected constructor(isDangerousAction = false) {
    super();

    this.isDangerousAction = isDangerousAction;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.config = dependencies.resolve(OsuConfigManager);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.isDangerousAction)
      this._holdActivationDelay.value = HoldToConfirmContainer.DANGEROUS_HOLD_ACTIVATION_DELAY;
    else
      this.config.bindWith(OsuSetting.UIHoldActivationDelay, this._holdActivationDelay);
  }

  /**
   * Begin a new confirmation. Should be called when the container is interacted with (ie. the user presses a key).
   * Calling this method when already in the process of confirming has no effect.
   */
  protected beginConfirm(): void {
    if (this.confirming || (!this.allowMultipleFires && this._fired)) return;

    this.confirming = true;

    this.transformBindableTo(this._progress, 1, this._holdActivationDelay.value * (1 - this._progress.value), Easing.Out).onComplete(() => this.confirm());
  }

  /** Abort any ongoing confirmation. Should be called when the container's interaction is no longer valid (ie. the user releases a key). */
  protected abortConfirm(): void {
    if (!this.confirming || (!this.allowMultipleFires && this._fired)) return;

    this.confirming = false;
    this._fired = false;

    this
      .transformBindableTo(this._progress, this._progress.value)
      .delay(200)
      .append(o => o.transformBindableTo(this._progress, 0, HoldToConfirmContainer.fadeout_delay, Easing.InSine));
  }

  /** A method which is invoked when the confirmation sequence completes successfully. By default, will fire the associated action. */
  protected confirm(): void {
    this.action?.();
    this._fired = true;
  }
}
