// Ported from osu.Framework/Screens/IScreen.cs, ScreenTransitionEvent.cs and ScreenExitEvent.cs.
// ScreenExtensions' C# extension methods are free functions here; Screen also exposes them as methods (this.push(...), this.exit()).

import type { Drawable } from '../graphics/Drawable';
import { ScreenStack } from './ScreenStack';

export interface IScreen extends Drawable {
  /** Whether this IScreen can be resumed. */
  validForResume: boolean;

  /** Whether this IScreen can be pushed. */
  validForPush: boolean;

  /** Invoked when this IScreen is entering from a parent IScreen. */
  onEntering(e: ScreenTransitionEvent): void;

  /** Invoked when this IScreen is exiting to a parent IScreen. Returns true to cancel the exit process. */
  onExiting(e: ScreenExitEvent): boolean;

  /** Invoked when this IScreen is entered from a child IScreen. */
  onResuming(e: ScreenTransitionEvent): void;

  /** Invoked when this IScreen is exited to a child IScreen. */
  onSuspending(e: ScreenTransitionEvent): void;
}

export const isScreen = (d: Drawable): d is IScreen => {
  const s = d as Drawable & Partial<Pick<IScreen, 'onEntering' | 'validForPush'>>;
  return typeof s.onEntering === 'function' && typeof s.validForPush === 'boolean';
};

/** Denotes a screen transition event. */
export class ScreenTransitionEvent {
  constructor(
    /** The IScreen which has been transitioned from. */
    readonly last: IScreen | null,
    /** The IScreen which has been transitioned to. */
    readonly next: IScreen | null,
  ) {}
}

/** Denotes a screen exit event. */
export class ScreenExitEvent extends ScreenTransitionEvent {
  constructor(
    last: IScreen | null,
    next: IScreen | null,
    /** The final IScreen of this exit operation. */
    readonly destination: IScreen | null,
  ) {
    super(last, next);
  }
}

export const ScreenExtensions = {
  /** Pushes an IScreen to another. */
  push(screen: IScreen, newScreen: IScreen): void {
    const stack = getStack(screen);

    if (stack === null)
      throw new Error('Cannot Push to a non-loaded IScreen directly. Consider using ScreenStack.Push instead.');

    stack.pushFrom(screen, newScreen);
  },

  /** Exits from an IScreen. */
  exit(screen: IScreen): void {
    const stack = getStack(screen);

    if (stack === null)
      screen.validForPush = false;
    else
      stack.exitScreen(screen);
  },

  /** Makes an IScreen the current screen, exiting all child IScreens along the way. */
  makeCurrent(screen: IScreen): void {
    getStack(screen)?.makeCurrent(screen);
  },

  /** Retrieves whether an IScreen is the current screen. This will return false on all IScreens while a child IScreen is loading. */
  isCurrentScreen(screen: IScreen): boolean {
    return getStack(screen)?.isCurrentScreen(screen) ?? false;
  },

  /** Retrieves the child IScreen of an IScreen, or null if it has no child. */
  getChildScreen(screen: IScreen): IScreen | null {
    return getStack(screen)?.getChildScreen(screen) ?? null;
  },

  /** Retrieves the parent IScreen of an IScreen, or null if it has no parent. */
  getParentScreen(screen: IScreen): IScreen | null {
    return getStack(screen)?.getParentScreen(screen) ?? null;
  },
};

function getStack(current: Drawable | null): ScreenStack | null {
  while (current !== null) {
    if (current instanceof ScreenStack)
      return current;

    current = current.parent;
  }

  return null;
}
