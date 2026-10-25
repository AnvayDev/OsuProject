// Ported from osu.Game/Input/IdleTracker.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { type Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Component } from '@fw/graphics/Component';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import { KeyDownEvent, KeyUpEvent, MouseDownEvent, MouseMoveEvent, MouseUpEvent, type UIEvent } from '@fw/input/events/UIEvents';
import type { IHandleGlobalKeyboardInput } from '@fw/input/IHandleGlobalKeyboardInput';
import { PlatformAction } from '@fw/input/PlatformAction';
import { Axes } from '@fw/layout/Enums';
import { GameHost } from '@fw/platform/GameHost';
import { GlobalAction } from './bindings/GlobalAction';

/** Track whether the end-user is in an idle state, based on their last interaction with the game. */
export class IdleTracker extends Component implements IKeyBindingHandler<PlatformAction | GlobalAction>, IHandleGlobalKeyboardInput {
  readonly handlesGlobalKeyboardInput = true;

  readonly keyBindingActionTypes = [PlatformAction, GlobalAction];

  private readonly timeToIdle: number;

  private lastInteractionTime = 0;

  protected get timeSpentIdle(): number {
    return this.clock!.currentTime - this.lastInteractionTime;
  }

  /** Whether the user is currently in an idle state. */
  get isIdle(): Bindable<boolean> {
    return this.isIdleBindable;
  }

  private readonly isIdleBindable = new BindableBool();

  /** Whether the game can currently enter an idle state. */
  protected get allowIdle(): boolean {
    return true;
  }

  /** @param timeToIdle The length in milliseconds until an idle state should be assumed. */
  constructor(timeToIdle: number) {
    super();

    this.timeToIdle = timeToIdle;
    this.relativeSizeAxes = Axes.Both;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.updateLastInteractionTime();
  }

  protected override update(): void {
    super.update();
    this.isIdleBindable.value = this.timeSpentIdle > this.timeToIdle && this.allowIdle;
  }

  onPressed(_e: KeyBindingPressEvent<PlatformAction | GlobalAction>): boolean {
    return this.updateLastInteractionTime();
  }

  onReleased(_e: KeyBindingReleaseEvent<PlatformAction | GlobalAction>): void {
    this.updateLastInteractionTime();
  }

  private host!: GameHost;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.host = dependencies.resolve(GameHost);
    return r;
  }

  protected override handle(e: UIEvent): boolean {
    // Even when not active, `MouseMoveEvent`s will arrive.
    // We don't want these to trigger a non-idle state as it's quite often the user interacting
    // with other windows while osu! is in the background.
    if (!this.host.isActive.value)
      return super.handle(e);

    if (e instanceof KeyDownEvent || e instanceof KeyUpEvent || e instanceof MouseDownEvent || e instanceof MouseUpEvent || e instanceof MouseMoveEvent)
      return this.updateLastInteractionTime();

    return super.handle(e);
  }

  private updateLastInteractionTime(): boolean {
    this.lastInteractionTime = this.clock!.currentTime;
    return false;
  }
}
