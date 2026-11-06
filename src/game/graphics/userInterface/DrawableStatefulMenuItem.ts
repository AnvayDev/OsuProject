// Ported from osu.Game/Graphics/UserInterface/DrawableStatefulMenuItem.cs

import type { Bindable, ValueChangedEvent } from '@fw/bindables/Bindable';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { DrawableOsuMenuItem, TextContainer } from './DrawableOsuMenuItem';
import type { StatefulMenuItem } from './StatefulMenuItem';

export class DrawableStatefulMenuItem extends DrawableOsuMenuItem {
  protected get statefulItem(): StatefulMenuItem {
    return this.item as StatefulMenuItem;
  }

  override get closeMenuOnClick(): boolean {
    return false;
  }

  constructor(item: StatefulMenuItem) {
    super(item);
  }

  protected override createTextContainer(): TextContainer {
    return new ToggleTextContainer(this.statefulItem);
  }
}

/** (DrawableStatefulMenuItem.ToggleTextContainer) */
class ToggleTextContainer extends TextContainer {
  private readonly state: Bindable<unknown>;
  private readonly stateIcon: SpriteIcon;

  constructor(private readonly menuItem: StatefulMenuItem) {
    super();

    this.state = menuItem.state.getBoundCopy();

    this.checkboxContainer.add(this.stateIcon = new SpriteIcon().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      size: new Vector2(10),
      alwaysPresent: true,
    }));
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.state.bindValueChanged(this.updateState, true);
  }

  private readonly updateState = (state: ValueChangedEvent<unknown>): void => {
    const icon = this.menuItem.getIconForState(state.newValue);

    if (icon === null)
      this.stateIcon.alpha = 0;
    else {
      this.stateIcon.alpha = 1;
      this.stateIcon.icon = icon;
    }
  };
}
