// Ported from osu.Framework/Graphics/Containers/ClickableContainer.cs

import { BindableBool } from '../../bindables/Bindable';
import type { ClickEvent } from '../../input/events/UIEvents';
import { Container } from './Container';

export class ClickableContainer extends Container {
  private _action: (() => void) | null = null;

  get action(): (() => void) | null {
    return this._action;
  }

  set action(value: (() => void) | null) {
    this._action = value;
    this.enabled.value = this._action !== null;
  }

  readonly enabled = new BindableBool();

  protected override onClick(_e: ClickEvent): boolean {
    if (this.enabled.value)
      this.action?.();
    return true;
  }
}
