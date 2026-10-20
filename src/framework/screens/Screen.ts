// Ported from osu.Framework/Screens/Screen.cs

import type { IReadOnlyDependencyContainer } from '../allocation/DependencyContainer';
import { Game } from '../Game';
import { CompositeDrawable } from '../graphics/containers/CompositeDrawable';
import { Axes } from '../layout/Enums';
import type { IFrameBasedClock } from '../timing/IClock';
import { type IScreen, ScreenExitEvent, ScreenExtensions, ScreenTransitionEvent } from './IScreen';
import { ScreenStack } from './ScreenStack';

export class Screen extends CompositeDrawable implements IScreen {
  validForResume = true;

  validForPush = true;

  override get removeWhenNotAlive(): boolean {
    return false;
  }

  private _game!: Game;

  protected get game(): Game {
    return this._game;
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this._game = dependencies.resolve(Game);
    return r;
  }

  override updateClock(clock: IFrameBasedClock | null): void {
    super.updateClock(clock);
    if (this.parent !== null && !(this.parent instanceof ScreenStack))
      throw new Error(`Screens must always be added to a ScreenStack (attempted to add ${this.constructor.name} to ${this.parent.constructor.name})`);
  }

  onEntering(_e: ScreenTransitionEvent): void { }

  onExiting(_e: ScreenExitEvent): boolean {
    return false;
  }

  onResuming(_e: ScreenTransitionEvent): void { }

  onSuspending(_e: ScreenTransitionEvent): void { }

  // ScreenExtensions (C# extension methods on IScreen)

  push(newScreen: IScreen): void {
    ScreenExtensions.push(this, newScreen);
  }

  exit(): void {
    ScreenExtensions.exit(this);
  }

  makeCurrent(): void {
    ScreenExtensions.makeCurrent(this);
  }

  isCurrentScreen(): boolean {
    return ScreenExtensions.isCurrentScreen(this);
  }

  getChildScreen(): IScreen | null {
    return ScreenExtensions.getChildScreen(this);
  }

  getParentScreen(): IScreen | null {
    return ScreenExtensions.getParentScreen(this);
  }
}
