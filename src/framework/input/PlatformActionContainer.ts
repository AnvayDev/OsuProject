// Ported from osu.Framework/Input/PlatformActionContainer.cs

import type { IReadOnlyDependencyContainer } from '../allocation/DependencyContainer';
import { GameHost } from '../platform/GameHost';
import { type IKeyBinding, KeyBindingContainer, KeyCombinationMatchingMode, SimultaneousBindingMode } from './bindings/KeyBindings';
import type { IHandleGlobalKeyboardInput } from './IHandleGlobalKeyboardInput';
import { PlatformAction } from './PlatformAction';

/**
 * Provides actions that are expected to have different key bindings per platform.
 * The framework will always contain one top-level instance of this class, but extra instances
 * can be created to handle events that should trigger specifically on a focused drawable.
 * Will send repeat events by default.
 */
export class PlatformActionContainer extends KeyBindingContainer<PlatformAction> implements IHandleGlobalKeyboardInput {
  readonly handlesGlobalKeyboardInput = true;

  private host!: GameHost;

  constructor() {
    super(PlatformAction, SimultaneousBindingMode.None, KeyCombinationMatchingMode.Modifiers);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.host = dependencies.resolve(GameHost);
    return r;
  }

  override get defaultKeyBindings(): readonly IKeyBinding[] {
    return this.host.platformKeyBindings;
  }

  protected override get prioritised(): boolean {
    return true;
  }
}
