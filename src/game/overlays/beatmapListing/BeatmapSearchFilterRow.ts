// Ported from osu.Game/Overlays/BeatmapListing/BeatmapSearchFilterRow.cs
// C# enumerates T's enum values (EnumExtensions.GetValuesInOrder) and reads their [LocalisableDescription]; here the values and their labels
// are passed in, and CreateFilter receives them.

import { BindableWithCurrent, type Bindable } from '@fw/bindables/Bindable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { TabControl, TabFillFlowContainer } from '@fw/graphics/userInterface/TabControl';
import type { TabItem } from '@fw/graphics/userInterface/TabItem';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuTextFlowContainer } from '../../graphics/containers/OsuTextFlowContainer';
import { OsuFont } from '../../graphics/OsuFont';
import { FilterTabItem } from './FilterTabItem';

/** The values a filter row offers, and their labels. */
export interface FilterValues<T> {
  readonly values: readonly T[];
  readonly describe: (value: T) => string;
}

export class BeatmapSearchFilterRow<T> extends CompositeDrawable {
  private readonly _current = new BindableWithCurrent<T>(undefined as T);

  get current(): Bindable<T> {
    return this._current.current;
  }

  set current(value: Bindable<T>) {
    this._current.current = value;
  }

  constructor(header: string, filterValues: FilterValues<T> | null = null) {
    super();

    let filter!: Drawable;

    this.autoSizeAxes = Axes.Y;
    this.relativeSizeAxes = Axes.X;

    this.addInternal(new GridContainer().with({
      autoSizeAxes: Axes.Y,
      relativeSizeAxes: Axes.X,
      columnDimensions: [
        new Dimension(GridSizeMode.Absolute, 100),
        new Dimension(),
      ],
      rowDimensions: [
        new Dimension(GridSizeMode.AutoSize),
      ],
      content: [
        [
          new OsuTextFlowContainer(t => t.font = OsuFont.getFont({ size: 13 })).with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            text: header,
          }),
          filter = this.createFilter(filterValues),
        ],
      ],
    }));

    // (IHasCurrentValue<T>)
    if (filter instanceof TabControl)
      this.current = (filter as TabControl<T>).current;
  }

  protected createFilter(filterValues: FilterValues<T> | null): Drawable {
    return new BeatmapSearchFilter<T>(filterValues);
  }
}

/** (BeatmapSearchFilterRow.BeatmapSearchFilter) */
export class BeatmapSearchFilter<T> extends TabControl<T> {
  private readonly describe: ((value: T) => string) | null;

  constructor(filterValues: FilterValues<T> | null = null) {
    super();

    this.describe = filterValues?.describe ?? null;

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.tabContainer.spacing = new Vector2(10, 0);

    for (const val of filterValues?.values ?? [])
      this.addItem(val);
  }

  protected override createTabItem(value: T): TabItem<T> {
    return new FilterTabItem<T>(value, this.describe);
  }

  protected override createTabFlow(): TabFillFlowContainer<T> {
    return new TabFillFlowContainer<T>().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      allowMultiline: true,
    });
  }
}
