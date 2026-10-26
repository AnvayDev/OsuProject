// Ported from osu.Game/Graphics/Cursor/OsuContextMenuContainer.cs

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ContextMenuContainer } from '@fw/graphics/cursor/ContextMenuContainer';
import type { Menu } from '@fw/graphics/userInterface/Menu';
import { OsuContextMenu } from '../userInterface/OsuContextMenu';

export class OsuContextMenuContainer extends ContextMenuContainer {
  // (assigned by createMenu() during the base constructor, so not a class field)
  declare private osuMenu: OsuContextMenu;

  constructor() {
    super();
  }

  protected override createMenu(): Menu {
    return this.osuMenu = new OsuContextMenu(true);
  }

  closeMenu(): void {
    this.osuMenu.close();
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cache(this);
    return dependencies;
  }
}
