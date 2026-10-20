// Ported from osu.Framework/Screens/ScreenStack.cs (logging omitted).

import { Signal } from '../bindables/Signal';
import { CompositeDrawable } from '../graphics/containers/CompositeDrawable';
import type { Drawable } from '../graphics/Drawable';
import { Axes, LoadState } from '../layout/Enums';
import { type IScreen, isScreen, ScreenExitEvent, ScreenExtensions, ScreenTransitionEvent } from './IScreen';

const MAX_VALUE = Number.MAX_VALUE;

/** A component which provides functionality for displaying and handling transitions between multiple IScreens. */
export class ScreenStack extends CompositeDrawable {
  /** Invoked when push is called on an IScreen: [lastScreen, newScreen]. */
  readonly screenPushed = new Signal<[IScreen | null, IScreen]>();

  /** Invoked when exit is called on an IScreen: [lastScreen, newScreen]. */
  readonly screenExited = new Signal<[IScreen, IScreen | null]>();

  /** The currently-active IScreen. */
  get currentScreen(): IScreen | null {
    return this.stack.length === 0 ? null : this.stack[this.stack.length - 1];
  }

  /** Stack<IScreen>: the top (current) screen is the last element. */
  private readonly stack: IScreen[] = [];

  /** Screens which are exited and require manual cleanup. */
  private readonly exited: Drawable[] = [];

  private readonly suspendImmediately: boolean;

  /**
   * Creates a new ScreenStack, and immediately pushes baseScreen if given.
   * suspendImmediately: whether IScreen.onSuspending should be called immediately, or wait for the next screen to be loaded first.
   */
  constructor(baseScreen: IScreen | null = null, suspendImmediately = true) {
    super();

    this.relativeSizeAxes = Axes.Both;

    this.suspendImmediately = suspendImmediately;
    this.screenExited.add(([prev]) => this.onExited(prev));

    if (baseScreen !== null)
      this.push(baseScreen);
  }

  /** Pushes an IScreen to this ScreenStack. An IScreen cannot be pushed multiple times. */
  push(screen: IScreen): void {
    this.pushFrom(this.currentScreen, screen);
  }

  /** Exits the current IScreen. */
  exit(): void {
    this.exitScreen(this.currentScreen!);
  }

  /** @internal C# `Push(IScreen source, IScreen newScreen)` */
  pushFrom(source: IScreen | null, newScreen: IScreen): void {
    if (this.stack.includes(newScreen))
      throw new Error('Cannot push a screen in an entered state.');

    if (source === null && this.stack.length > 0)
      throw new Error('A source must be provided when pushing to a non-empty ScreenStack');

    if (newScreen.removeWhenNotAlive)
      throw new Error(`The pushed (${newScreen.constructor.name}) has RemoveWhenNotAlive = true and will be removed when a child screen is pushed. Screens must set RemoveWhenNotAlive to false.`);

    // Suspend the current screen, if there is one
    if (source !== null && source !== this.currentScreen) throw new Error('Cannot perform Push on a non-current screen.');

    if (newScreen.isLoaded)
      throw new Error('A screen should not be loaded before being pushed.');

    if (this.suspendImmediately)
      this.suspend(source, newScreen);

    this.stack.push(newScreen);
    this.screenPushed.emit([source, newScreen]);

    // this needs to be queued here before the load is begun so it preceed any potential OnSuspending event (also attached to OnLoadComplete).
    newScreen.onLoadComplete.add(() => newScreen.onEntering(new ScreenTransitionEvent(source, newScreen)));

    if (source === null) {
      // this is the first screen to be loaded.
      if (this.loadState >= LoadState.Ready)
        this.loadScreen(this, newScreen, () => this.finishPush(null, newScreen));
      else
        this.schedule(() => this.finishPush(null, newScreen));
    } else
      this.loadScreen(source as unknown as CompositeDrawable, newScreen, () => this.finishPush(source, newScreen));
  }

  /** Complete push of a loaded screen. */
  private finishPush(parent: IScreen | null, child: IScreen): void {
    if (!child.validForPush) {
      if (child === this.currentScreen)
        this.exitFrom(null, false, this.suspendImmediately);

      return;
    }

    if (!this.suspendImmediately)
      this.suspend(parent, child);

    this.addInternal(child);
  }

  /** Complete suspend of a screen in the stack. */
  private suspend(from: IScreen | null, to: IScreen): void {
    if (from === null)
      return;

    const performSuspend = () => {
      from.onSuspending(new ScreenTransitionEvent(from, to));
      from.expire();
    };

    if (from.isLoaded)
      performSuspend();
    else {
      // Screens only receive OnEntering() upon load completion, so OnSuspending() should be delayed until after that
      from.onLoadComplete.add(() => performSuspend());
    }
  }

  /** Loads an IScreen through a CompositeDrawable, invoking continuation after it has finished loading. */
  protected loadScreen(loader: CompositeDrawable, toLoad: Drawable, continuation: (() => void) | null): void {
    // If the previous screen has already been exited, do not attempt to load the new one.
    if (isScreen(loader) && !loader.validForPush)
      return;

    if (toLoad.loadState >= LoadState.Ready)
      continuation?.();
    else {
      if (loader.loadState >= LoadState.Ready)
        void loader.loadComponentAsync(toLoad, () => continuation?.(), this.scheduler);
      else
        this.schedule(() => this.loadScreen(loader, toLoad, continuation));
    }
  }

  /** @internal C# `Exit(IScreen source)` */
  exitScreen(source: IScreen): void {
    if (!this.stack.includes(source))
      throw new Error('Cannot perform Exit on a non-current screen.');

    if (this.currentScreen !== source)
      throw new Error('Cannot perform Exit when a child is already present. Use MakeCurrent instead.');

    this.exitFrom(null);
  }

  /** @internal */
  makeCurrent(target: IScreen): void {
    if (this.currentScreen === target)
      return;

    if (!this.stack.includes(target))
      throw new Error('Cannot perform MakeCurrent on a screen not in a ScreenStack.');

    // while a parent still exists and exiting is not blocked, continue to iterate upwards.
    let exitCandidate: IScreen | null = null;

    while (this.currentScreen !== null) {
      // the exit source is always the candidate from the previous loop, or null if this is the current screen.
      const exitSource: IScreen | null = exitCandidate;
      exitCandidate = this.currentScreen;

      const exitBlocked = this.exitFrom(exitSource, true, false, target);

      if (exitBlocked) {
        // exit was blocked and no screen change has happened in this loop.
        // no resume event should be fired.
        if (exitSource === null)
          return;

        // exit was blocked, but a nested exit operation may have succeeded (ie. a screen calling this.Exit() after blocking).
        // in such a case, the MakeCurrent / resumeFrom flow would have already been performed.
        // to avoid a duplicate resumeFrom event, only fire from here if it can be assured that the current screen is still the one which blocked the exit above.
        if (this.currentScreen === exitCandidate)
          this.resumeFrom(exitSource);

        return;
      }

      if (this.currentScreen === target) {
        // an exit was successful; resume from the "proposed" target (which was exited above).
        this.resumeFrom(exitCandidate);
        return;
      }
    }
  }

  /** @internal */
  isCurrentScreen(source: IScreen): boolean {
    return source === this.currentScreen;
  }

  /** @internal The screen below source (C# Stack enumeration runs top to bottom: stack.GetNext). */
  getParentScreen(source: IScreen): IScreen | null {
    const i = this.stack.indexOf(source);
    return i > 0 ? this.stack[i - 1] : null;
  }

  /** @internal The screen above source (stack.GetPrevious). */
  getChildScreen(source: IScreen): IScreen | null {
    const i = this.stack.indexOf(source);
    return i >= 0 && i < this.stack.length - 1 ? this.stack[i + 1] : null;
  }

  /**
   * Exits the current IScreen. Returns whether the exit was blocked.
   * source: the IScreen which last exited. destination: the final IScreen of an exit operation.
   */
  private exitFrom(source: IScreen | null, shouldFireExitEvent = true, shouldFireResumeEvent = true, destination: IScreen | null = null): boolean {
    if (this.stack.length === 0)
      return false;

    // The current screen is at the top of the stack, it will be the one that is exited
    const toExit = this.stack.pop()!;

    // The next current screen will be resumed
    if (shouldFireExitEvent && toExit.isLoaded) {
      const next = this.currentScreen;

      // Add the screen back on the stack to allow pushing screens in OnExiting.
      this.stack.push(toExit);

      // if a screen is !ValidForResume, it should not be allowed to block unless it is the current screen (source == null)
      // OnExiting should still be called regardless.
      const blockRequested = toExit.onExiting(new ScreenExitEvent(toExit, next, destination ?? next));

      if ((source === null || toExit.validForResume) && blockRequested)
        return true;

      if (toExit !== this.stack.pop())
        throw new Error('Cannot push to ScreenStack during exit without blocking the exit.');
    }

    // we will probably want to change this logic when we support returning to a screen after exiting.
    toExit.validForResume = false;
    toExit.validForPush = false;

    if (source === null) {
      // This is the first screen that exited
      toExit.expire();
    }

    this.exited.push(toExit);

    this.screenExited.emit([toExit, this.currentScreen]);

    // Resume the next current screen from the exited one
    if (shouldFireResumeEvent)
      this.resumeFrom(toExit);

    return false;
  }

  /**
   * Unbind and return leases for all Bindables managed by the exiting screen.
   * While all bindables will eventually be cleaned up by disposal logic, this is too late as leases could potentially be in a leased state
   * during exiting transitions. This method should be called after exiting is confirmed to ensure a correct leased state before onResuming.
   */
  private onExited(prev: IScreen): void {
    if (prev instanceof CompositeDrawable)
      prev.unbindAllBindablesSubTree();
  }

  /** Resumes the current IScreen from the one which exited. */
  private resumeFrom(source: IScreen): void {
    const current = this.currentScreen;
    if (current === null)
      return;

    if (current.validForResume) {
      current.onResuming(new ScreenTransitionEvent(source, current));

      // Screens are expired when they are suspended - lifetime needs to be reset when resumed
      current.lifetimeEnd = MAX_VALUE;
    } else
      this.exitFrom(source);
  }

  protected override shouldBeConsideredForInput(child: Drawable): boolean {
    return super.shouldBeConsideredForInput(child) && (!isScreen(child) || ScreenExtensions.isCurrentScreen(child));
  }

  protected override updateChildrenLife(): boolean {
    if (!super.updateChildrenLife()) return false;

    // In order to provide custom suspend/resume logic, screens always have RemoveWhenNotAlive set to false.
    // We need to manually handle removal here (in the opposite order to how the screens were pushed to ensure bindable sanity).
    if (this.exited.length > 0 && !this.exited[0].isAlive) {
      for (const s of this.exited) {
        this.removeInternal(s, false);
        this.disposeChildAsync(s);
      }

      this.exited.length = 0;
    }

    return true;
  }

  override unbindAllBindablesSubTree(): void {
    // Suspended screens that are not part of our children won't receive unbind invocations until their disposal, which happens too late.
    // To get around this, we unbind them ourselves in the correct order (reverse-push)
    // Exited screens don't need to be unbound here due to being unbound when exiting

    for (const s of [...this.stack].reverse())
      s.unbindAllBindablesSubTree();

    super.unbindAllBindablesSubTree();
  }

  override dispose(): void {
    // Correct disposal order must be enforced manually before the base disposal.

    for (const s of this.exited)
      s.dispose();
    this.exited.length = 0;

    for (const s of [...this.stack].reverse())
      s.dispose();
    this.stack.length = 0;

    super.dispose();
  }
}
