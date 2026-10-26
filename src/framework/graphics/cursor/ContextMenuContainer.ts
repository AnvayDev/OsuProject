// Ported from osu.Framework/Graphics/Cursor/ContextMenuContainer.cs

import { Container } from '../containers/Container';
import type { CompositeDrawable } from '../containers/CompositeDrawable';
import type { Drawable } from '../Drawable';
import { type Menu, MenuState } from '../userInterface/Menu';
import type { MouseDownEvent } from '../../input/events/UIEvents';
import { MouseButton } from '../../input/Key';
import { Axes } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import { CursorEffectContainer } from './CursorEffectContainer';
import { type IHasContextMenu, isHasContextMenu } from './IHasContextMenu';

/**
 * A container which manages a Menu.
 * If a right-click happens on a Drawable that implements IHasContextMenu and exists as a child of the same InputManager as this container,
 * a Menu will be displayed with bottom-right origin at the right-clicked position.
 */
export abstract class ContextMenuContainer extends CursorEffectContainer<IHasContextMenu> {
  private readonly menu: Menu;

  private menuTarget: IHasContextMenu | null = null;
  private targetRelativePosition = Vector2.Zero;

  /** Creates a new context menu. Can be overridden to supply custom subclass of Menu. */
  protected abstract createMenu(): Menu;

  // (assigned during the base constructor's onSizingChanged calls, so not a class field)
  declare private _content: Container | undefined;

  protected override get content(): Container {
    return this._content!;
  }

  protected constructor() {
    super();

    const content = new Container().with({
      relativeSizeAxes: Axes.Both,
    });
    this.addInternal(content);
    this._content = content;

    this.addInternal(this.menu = this.createMenu());
  }

  protected override isTarget(d: Drawable): d is IHasContextMenu {
    return isHasContextMenu(d);
  }

  protected override isSelfType(d: CompositeDrawable | null): boolean {
    return d instanceof ContextMenuContainer;
  }

  protected override onSizingChanged(): void {
    super.onSizingChanged();

    if (this._content !== undefined) {
      // reset to none to prevent exceptions
      this._content.relativeSizeAxes = Axes.None;
      this._content.autoSizeAxes = Axes.None;

      // in addition to using this.RelativeSizeAxes, sets RelativeSizeAxes on every axis that is neither relative size nor auto size
      this._content.relativeSizeAxes = Axes.Both & ~this.autoSizeAxes;
      this._content.autoSizeAxes = this.autoSizeAxes;
    }
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    switch (e.button) {
      case MouseButton.Right: {
        const found = this.findTargets()
          .map(t => ({ target: t, items: t.contextMenuItems }))
          .find(result => result.items !== null);

        this.menuTarget = found?.target ?? null;

        if (this.menuTarget === null || found!.items!.length === 0) {
          if (this.menu.state === MenuState.Open)
            this.menu.close();
          return false;
        }

        this.menu.items = found!.items!;

        this.targetRelativePosition = this.menuTarget.toLocalSpace(e.screenSpaceMousePosition);

        this.menu.open();
        return true;
      }

      default:
        this.cancelDisplay();
        return false;
    }
  }

  private cancelDisplay(): void {
    this.menu.close();
    this.menuTarget = null;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (this.menu.state !== MenuState.Open || this.menuTarget === null) return;

    if (this.menuTarget.findClosestParent(ContextMenuContainer) !== this || !this.menuTarget.isPresent) {
      this.cancelDisplay();
      return;
    }

    const pos = this.menuTarget.toSpaceOfOtherDrawable(this.targetRelativePosition, this);
    let x = pos.x, y = pos.y;

    const overflowX = x + this.menu.drawWidth - this.drawWidth;
    const overflowY = y + this.menu.drawHeight - this.drawHeight;

    if (overflowX > 0)
      x -= clamp(overflowX, 0, this.menu.drawWidth);
    if (overflowY > 0)
      y -= clamp(overflowY, 0, this.menu.drawHeight);

    if (x < 0)
      x += clamp(-x, 0, this.menu.drawWidth);
    if (y < 0)
      y += clamp(-y, 0, this.menu.drawHeight);

    this.menu.position = new Vector2(x, y);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
