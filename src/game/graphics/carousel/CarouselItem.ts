// Ported from osu.Game/Graphics/Carousel/CarouselItem.cs (+ ICarouselFilter.cs, ICarouselPanel.cs)

import type { BindableBool } from '@fw/bindables/Bindable';
import type { Drawable } from '@fw/graphics/Drawable';

/**
 * Represents a single display item for display in a Carousel.
 * This is used to house information related to the attached model that helps with display and tracking.
 */
export class CarouselItem {
  static readonly DEFAULT_HEIGHT = 45;

  /** The model this item is representing. */
  readonly model: unknown;

  /** The current Y position in the carousel. This is managed by Carousel and should not be set manually. */
  carouselYPosition = 0;

  /**
   * The amount of input padding/lenience to be added to the area above this panel.
   * Calculated as half of the calculated spacing between this panel and the panel above it.
   */
  carouselInputLenienceAbove = 0;

  /**
   * The amount of input padding/lenience to be added to the area below this panel.
   * Calculated as half of the calculated spacing between this panel and the panel below it.
   */
  carouselInputLenienceBelow = 0;

  /** The height this item will take when displayed. Defaults to DEFAULT_HEIGHT. */
  drawHeight = CarouselItem.DEFAULT_HEIGHT;

  /** Defines the display depth relative to other CarouselItems. */
  depthLayer = 0;

  /** Whether this item is visible or hidden. */
  isVisible = true;

  /** Whether this item is expanded or not. Should only be used for headers of groups. */
  isExpanded = false;

  /** The number of nested items underneath this header. Should only be used for headers of groups. */
  nestedItemCount = 0;

  constructor(model: unknown) {
    this.model = model;
  }

  compareTo(other: CarouselItem | null): number {
    if (other === null) return 1;

    return this.carouselYPosition < other.carouselYPosition ? -1 : this.carouselYPosition > other.carouselYPosition ? 1 : 0;
  }
}

/** A token for cancelling a filter operation (CancellationToken). */
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
}

/** An interface representing a filter operation which can be run on a Carousel. */
export interface ICarouselFilter {
  /** Execute the filter operation. */
  run(items: CarouselItem[], cancellationToken: CancellationToken): Promise<CarouselItem[]>;

  /** The total number of beatmap difficulties displayed post filter. */
  readonly beatmapItemsCount: number;
}

/**
 * An interface to be attached to any Drawables which are used for display inside a Carousel.
 * Importantly, all properties in this interface are managed by Carousel and should not be written to elsewhere.
 */
export interface ICarouselPanel {
  /** Whether this item has selection. Should be read from to update the visual state. */
  readonly selected: BindableBool;

  /** Whether this item is expanded (see CarouselItem.isExpanded). Should be read from to update the visual state. */
  readonly expanded: BindableBool;

  /** Whether this item has keyboard selection. Should be read from to update the visual state. */
  readonly keyboardSelected: BindableBool;

  /** Called when the panel is activated. Should be used to update the panel's visual state. */
  activated(): void;

  /** The Y position used internally for positioning in the carousel. */
  drawYPosition: number;

  /** The carousel item this drawable is representing. Will be set before prepareForUse is called. */
  item: CarouselItem | null;
}

export const isCarouselPanel = (d: Drawable): d is Drawable & ICarouselPanel =>
  'drawYPosition' in d && 'keyboardSelected' in d;
