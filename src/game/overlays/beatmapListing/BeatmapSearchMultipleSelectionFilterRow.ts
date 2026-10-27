// Ported from osu.Game/Overlays/BeatmapListing/BeatmapSearchMultipleSelectionFilterRow.cs
// As BeatmapSearchFilterRow, the values and their labels are passed in (C# enumerates T's enum values).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableList } from '@fw/bindables/BindableList';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Circle } from '@fw/graphics/shapes/Circle';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { ClickEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, withFont } from '../../graphics/OsuFont';
import { BeatmapSearchFilterRow, type FilterValues } from './BeatmapSearchFilterRow';
import { FilterTabItem } from './FilterTabItem';

// C# float.MaxValue
const float_max_value = 3.4028234663852886e38;

export class BeatmapSearchMultipleSelectionFilterRow<T> extends BeatmapSearchFilterRow<T[]> {
  /** (new Current) */
  readonly currentList = new BindableList<T>();

  /** (declared: assigned by createFilter() during the base constructor, which a field initializer would reset) */
  private declare filter: MultipleSelectionFilter<T>;

  constructor(header: string, filterValues: FilterValues<T>) {
    super(header, filterValues as unknown as FilterValues<T[]>);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.filter.current.bindTo(this.currentList);

    return r;
  }

  protected override createFilter(filterValues: FilterValues<T[]> | null): Drawable {
    return this.filter = this.createMultipleSelectionFilter(filterValues as unknown as FilterValues<T>);
  }

  protected createMultipleSelectionFilter(filterValues: FilterValues<T>): MultipleSelectionFilter<T> {
    return new MultipleSelectionFilter<T>(filterValues);
  }
}

/** (BeatmapSearchMultipleSelectionFilterRow.MultipleSelectionFilter) */
export class MultipleSelectionFilter<T> extends FillFlowContainer<MultipleSelectionFilterTabItem<T>> {
  readonly current = new BindableList<T>();

  protected readonly filterValues: FilterValues<T>;

  constructor(filterValues: FilterValues<T>) {
    super();

    this.filterValues = filterValues;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
    this.spacing = new Vector2(10, 5);
    this.addRange(this.getValues().map(v => this.createTabItem(v)));

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    for (const item of this.children)
      item.active.bindValueChanged(active => this.toggleItem(item.value, active.newValue));

    this.current.bindCollectionChanged(() => this.currentChanged(), true);
  }

  private currentChanged(): void {
    for (const c of this.children) {
      if (!c.active.disabled)
        c.active.value = this.current.contains(c.value);
    }
  }

  protected getValues(): readonly T[] {
    return this.filterValues.values;
  }

  protected createTabItem(value: T): MultipleSelectionFilterTabItem<T> {
    return new MultipleSelectionFilterTabItem<T>(value, this.filterValues.describe);
  }

  private toggleItem(value: T, active: boolean): void {
    if (active) {
      if (!this.current.contains(value))
        this.current.add(value);
    } else {
      this.current.remove(value);
    }
  }
}

/** (BeatmapSearchMultipleSelectionFilterRow.MultipleSelectionFilterTabItem) */
export class MultipleSelectionFilterTabItem<T> extends FilterTabItem<T> {
  private activeContent!: Container;
  private background!: Circle;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.autoSizeDuration = 100;
    this.autoSizeEasing = Easing.OutQuint;

    // This doesn't match any actual design, but should make it easier for the user to understand
    // that filters are applied until we settle on a final design.
    this.addInternal(this.activeContent = new Container().with({
      depth: float_max_value,
      relativeSizeAxes: Axes.Both,
      alpha: 0,
      padding: MarginPadding.of({
        left: -16,
        right: -4,
        vertical: -2,
      }),
      children: [
        this.background = new Circle().with({
          colour: Colour4.White,
          relativeSizeAxes: Axes.Both,
        }),
        new SpriteIcon().with({
          icon: FontAwesome.Solid.TimesCircle,
          size: new Vector2(10),
          colour: this.colourProvider.background4,
          position: new Vector2(3, 0.5),
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
        }),
      ],
    }));
  }

  protected override get colourActive(): Colour4 {
    return this.colourProvider.light1;
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.active.value
      ? this.background.receivePositionalInputAt(screenSpacePos)
      : super.receivePositionalInputAt(screenSpacePos);
  }

  protected override updateState(): void {
    let colour = this.active.value ? this.colourActive : this.colourNormal;

    if (!this.enabled.value)
      colour = colour.darken(1);
    else if (this.isHovered)
      colour = this.active.value ? colour.darken(0.2) : colour.lighten(0.2);

    if (this.active.value) {
      // This just allows enough spacing for adjacent tab items to show the "x".
      this.padding = MarginPadding.of({ left: 12 });

      this.activeContent.fadeIn(200, Easing.OutQuint);
      this.background.fadeColour(colour, 200, Easing.OutQuint);

      // flipping colours
      this.text.fadeColour(this.colourProvider.background4, 200, Easing.OutQuint);
      this.text.font = withFont(this.text.font, { weight: FontWeight.SemiBold });
    } else {
      this.padding = new MarginPadding();

      this.activeContent.fadeOut();
      this.background.fadeColour(colour, 200, Easing.OutQuint);
      this.text.fadeColour(colour, 200, Easing.OutQuint);
      this.text.font = withFont(this.text.font, { weight: FontWeight.Regular });
    }
  }

  protected override onClick(e: ClickEvent): boolean {
    super.onClick(e);

    // this tab item implementation is not managed by a TabControl,
    // therefore we have to manually update Active state and play select sound when this tab item is clicked.
    this.active.toggle();
    this.selectSample?.play();
    return true;
  }
}
