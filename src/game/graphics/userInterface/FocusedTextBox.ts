// Ported from osu.Game/Graphics/UserInterface/FocusedTextBox.cs
// C# overloads OnPressed for PlatformAction and GlobalAction; here onPressed dispatches on the action type to onPlatformActionPressed (the
// TextBox handler) and onGlobalActionPressed.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import type { KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { FocusEvent, KeyDownEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { PlatformAction } from '@fw/input/PlatformAction';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { FeedbackSampleType, OsuTextBox } from './OsuTextBox';

/** A textbox which holds focus eagerly. */
export class FocusedTextBox extends OsuTextBox {
  override readonly keyBindingActionTypes: readonly object[] = [PlatformAction, GlobalAction];

  private focus = false;

  // (GameHost.OnScreenKeyboardOverlapsGameWindow is false on desktop hosts, which the web build follows.)
  private get allowImmediateFocus(): boolean {
    return true;
  }

  /** Whether the content of the text box should be cleared on the first "back" key press. */
  protected get clearTextOnBackKey(): boolean {
    return true;
  }

  takeFocus(): void {
    if (!this.allowImmediateFocus)
      return;

    this.scheduler.add(() => this.getContainingFocusManager()!.changeFocus(this));
  }

  override killFocus(): void {
    super.killFocus();
  }

  get holdFocus(): boolean {
    return this.allowImmediateFocus && this.focus;
  }

  set holdFocus(value: boolean) {
    this.focus = value;
    if (!this.focus && this.hasFocus)
      super.killFocus();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);

    this.backgroundUnfocused = colourProvider?.background5 ?? Colour4.fromBytes(10, 10, 10, 255);
    this.backgroundFocused = colourProvider?.background5 ?? Colour4.fromBytes(10, 10, 10, 255);

    return r;
  }

  // We may not be focused yet, but we need to handle keyboard input to be able to request focus
  override get handleNonPositionalInput(): boolean {
    return this.holdFocus || super.handleNonPositionalInput;
  }

  protected override onFocus(e: FocusEvent): void {
    super.onFocus(e);
    this.borderThickness = 0;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (!this.hasFocus) return false;

    if (e.key === Key.Escape)
      return false; // disable the framework-level handling of escape key for conformity (we use GlobalAction.Back).

    return super.onKeyDown(e);
  }

  override onPressed(e: KeyBindingPressEvent<PlatformAction | GlobalAction>): boolean {
    if (e.actionType === GlobalAction)
      return this.onGlobalActionPressed(e as KeyBindingPressEvent<GlobalAction>);

    return this.onPlatformActionPressed(e as KeyBindingPressEvent<PlatformAction>);
  }

  override onReleased(e: KeyBindingReleaseEvent<PlatformAction | GlobalAction>): void {
    if (e.actionType === GlobalAction)
      return;

    super.onReleased(e as KeyBindingReleaseEvent<PlatformAction>);
  }

  /** (OnPressed(KeyBindingPressEvent<PlatformAction>), TextBox's handler) */
  protected onPlatformActionPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    return super.onPressed(e);
  }

  /** (OnPressed(KeyBindingPressEvent<GlobalAction>)) */
  protected onGlobalActionPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat)
      return false;

    if (!this.hasFocus) return false;

    if (this.clearTextOnBackKey && e.action === GlobalAction.Back) {
      if (this.text.length > 0) {
        this.text = '';
        this.playFeedbackSample(FeedbackSampleType.TextRemove);
        return true;
      }
    }

    return false;
  }

  override get requestsFocus(): boolean {
    return this.holdFocus;
  }
}
