// Ported from osu.Game/Skinning/SkinnableDrawable.cs

import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import type { ISkinComponentLookup, ISkinSource } from './ISkin';
import { SkinReloadableDrawable } from './SkinReloadableDrawable';

export enum ConfineMode {
  /** Don't apply any scaling. This allows the user element to be of any size, exceeding specified bounds. */
  NoScaling,
  ScaleToFit,
}

/** A drawable which can be skinned via an ISkinSource. */
export class SkinnableDrawable extends SkinReloadableDrawable {
  /** The displayed component. */
  drawable!: Drawable;

  /** Whether the drawable component should be centered in available space. Defaults to true. */
  centreComponent = true;

  /** Whether the current skin provided no component, so the default implementation is displayed. */
  private isDefault = false;

  private scalingValid = false;

  /**
   * Create a new skinnable drawable.
   * @param componentLookup The lookup criteria for the component.
   * @param createDefaultImplementation A function to create the default skin implementation of this element.
   * @param confineMode How (if at all) the Drawable should be resize to fit within our own bounds.
   */
  constructor(
    protected readonly componentLookup: ISkinComponentLookup,
    private readonly createDefaultImplementation: ((lookup: ISkinComponentLookup) => Drawable) | null = null,
    private readonly confineMode = ConfineMode.NoScaling,
  ) {
    super();

    this.relativeSizeAxes = Axes.Both;
  }

  /** Seeks to the 0-th frame if the content of this SkinnableDrawable is an IFramedAnimation. */
  resetAnimation(): void {
    (this.drawable as Partial<{ gotoFrame(frame: number): void }>).gotoFrame?.(0);
  }

  protected createDefault(lookup: ISkinComponentLookup): Drawable {
    return this.createDefaultImplementation?.(lookup) ?? emptyDrawable();
  }

  /** Whether to apply size restrictions (specified via confineMode) to the default implementation. */
  protected get applySizeRestrictionsToDefault(): boolean {
    return false;
  }

  protected override skinChanged(skin: ISkinSource): void {
    const retrieved = skin.getDrawableComponent(this.componentLookup);

    if (retrieved === null) {
      this.drawable = this.createDefault(this.componentLookup);
      this.isDefault = true;
    } else {
      this.drawable = retrieved;
      this.isDefault = false;
    }

    this.scalingValid = false;

    if (this.centreComponent) {
      this.drawable.origin = Anchor.Centre;
      this.drawable.anchor = Anchor.Centre;
    }

    this.internalChild = this.drawable;
  }

  protected override update(): void {
    super.update();

    if (!this.scalingValid) {
      this.scalingValid = true;

      if (this.isDefault && !this.applySizeRestrictionsToDefault) return;

      switch (this.confineMode) {
        case ConfineMode.ScaleToFit:
          this.drawable.relativeSizeAxes = Axes.Both;
          this.drawable.size = Vector2.One;
          this.drawable.scale = Vector2.One;
          this.drawable.fillMode = FillMode.Fit;
          break;
      }
    }
  }
}
