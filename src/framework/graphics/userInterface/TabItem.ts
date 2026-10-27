// Ported from osu.Framework/Graphics/UserInterface/TabItem.cs

import { BindableBool } from '../../bindables/Bindable';
import type { ClickEvent } from '../../input/events/UIEvents';
import { ClickableContainer } from '../containers/ClickableContainer';

export abstract class TabItem<T> extends ClickableContainer {
  /** (internal) */
  activationRequested: ((tab: TabItem<T>) => void) | null = null;
  /** (internal) */
  pinnedChanged: ((tab: TabItem<T>) => void) | null = null;

  readonly active = new BindableBool();

  override get isPresent(): boolean {
    return super.isPresent || this.y === 0;
  }

  get isRemovable(): boolean {
    return true;
  }

  get isSwitchable(): boolean {
    return true;
  }

  readonly value: T;

  protected constructor(value: T) {
    super();

    this.value = value;

    this.active.valueChanged.add(active => {
      if (active.newValue)
        this.onActivated();
      else
        this.onDeactivated();
    });
  }

  private _pinned = false;

  get pinned(): boolean {
    return this._pinned;
  }

  set pinned(value: boolean) {
    if (this._pinned === value) return;

    this._pinned = value;
    this.pinnedChanged?.(this);
  }

  protected abstract onActivated(): void;

  protected abstract onDeactivated(): void;

  /** Invoked when this tab is activated by the user (protected internal). */
  onActivatedByUser(): void {
  }

  protected override onClick(e: ClickEvent): boolean {
    super.onClick(e);
    this.activationRequested?.(this);
    return true;
  }

  override toString(): string {
    return `${super.toString()} value: ${String(this.value)}`;
  }
}
