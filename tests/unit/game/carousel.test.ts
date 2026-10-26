// Song select carousel: the filter pipeline (osu.Game/Screens/Select/BeatmapCarouselFilterMatching.cs, BeatmapCarouselFilterSorting.cs,
// BeatmapCarouselFilterGrouping.cs, FilterCriteria.cs, osu.Game/Utils/OrdinalSortByCaseStringComparer.cs) and the generic carousel's layout,
// display range and selection (osu.Game/Graphics/Carousel/Carousel.cs), driven through a minimal test carousel.

import { describe, expect, it } from 'vitest';
import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { BindableBool } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { PoolableDrawable } from '@fw/graphics/pooling/PoolableDrawable';
import { Axes } from '@fw/layout/Enums';
import { BeatmapInfo } from '@game/beatmaps/BeatmapInfo';
import { BeatmapMetadata } from '@game/beatmaps/BeatmapMetadata';
import { BeatmapSetInfo } from '@game/beatmaps/BeatmapSetInfo';
import { Carousel } from '@game/graphics/carousel/Carousel';
import { CarouselItem, type ICarouselPanel } from '@game/graphics/carousel/CarouselItem';
import { OsuColour } from '@game/graphics/OsuColour';
import { RulesetStore } from '@game/rulesets/RulesetInfo';
import { BeatmapCarouselFilterGrouping } from '@game/screens/select/BeatmapCarouselFilterGrouping';
import { BeatmapCarouselFilterMatching } from '@game/screens/select/BeatmapCarouselFilterMatching';
import { BeatmapCarouselFilterSorting } from '@game/screens/select/BeatmapCarouselFilterSorting';
import { GroupMode } from '@game/screens/select/filter/GroupMode';
import { SortMode } from '@game/screens/select/filter/SortMode';
import { FilterCriteria, MatchMode, OptionalTextFilter } from '@game/screens/select/FilterCriteria';
import { GroupDefinition, GroupedBeatmap, GroupedBeatmapSet } from '@game/screens/select/GroupDefinition';
import { OrdinalSortByCaseStringComparer } from '@game/utils/OrdinalSortByCaseStringComparer';
import { createHost } from '../framework/testHost';

const notCancelled = { isCancellationRequested: false };

function makeSet(title: string, artist: string, stars: number[], init: Partial<BeatmapSetInfo> = {}): BeatmapSetInfo {
  const set = Object.assign(new BeatmapSetInfo(), init);

  stars.forEach((s, i) => {
    const b = new BeatmapInfo(RulesetStore.getRuleset(0), null, BeatmapMetadata.from({ title, artist, author: { username: 'mapper' } }));
    b.difficultyName = `diff ${i}`;
    b.starRating = s;
    b.beatmapSet = set;
    set.beatmaps.push(b);
  });

  return set;
}

const criteriaWith = (o: Partial<FilterCriteria> = {}) => Object.assign(new FilterCriteria(), { ruleset: RulesetStore.getRuleset(0) }, o);

async function runPipeline(sets: BeatmapSetInfo[], criteria: FilterCriteria) {
  const grouping = new BeatmapCarouselFilterGrouping({ getCriteria: () => criteria });
  let items = sets.flatMap(s => s.beatmaps).map(b => new CarouselItem(b));

  for (const filter of [new BeatmapCarouselFilterMatching(() => criteria), new BeatmapCarouselFilterSorting(() => criteria), grouping])
    items = await filter.run(items, notCancelled);

  return { items, grouping };
}

describe('OrdinalSortByCaseStringComparer', () => {
  it('compares ignoring case first, then places lowercase before uppercase', () => {
    const sorted = ['b', 'B', 'a', 'A', '_x'].sort(OrdinalSortByCaseStringComparer.compare);
    // ('_' (0x5F) sorts after the upper-cased letters.)
    expect(sorted).toEqual(['a', 'A', 'b', 'B', '_x']);
  });
});

describe('FilterCriteria', () => {
  it('splits search text into terms, keeping quoted phrases and taking a [difficulty] tag', () => {
    const c = new FilterCriteria();
    c.searchText = 'camellia "ghost rule" [Insane';

    expect(c.searchTerms.map(t => [t.searchTerm, t.matchMode])).toEqual([
      ['ghost rule', MatchMode.IsolatedPhrase],
      ['camellia', MatchMode.Substring],
    ]);
    expect(c.difficultyName.searchTerm).toBe('Insane');
    expect(c.searchNumber).toBeNull();

    c.searchText = '123456';
    expect(c.searchNumber).toBe(123456);
  });

  it('matches text filters by substring, isolated phrase and full phrase', () => {
    expect(OptionalTextFilter.of('MEL').matches('camellia')).toBe(true);
    expect(OptionalTextFilter.of('"mel"').matches('camellia')).toBe(false);
    expect(OptionalTextFilter.of('"ghost"').matches('the ghost rule')).toBe(true);
    expect(OptionalTextFilter.of('"ghost rule"!').matches('Ghost Rule')).toBe(true);
    expect(OptionalTextFilter.of('"ghost"!').matches('ghost rule')).toBe(false);

    const exclude = Object.assign(OptionalTextFilter.of('x'), { excludeTerm: true });
    expect(exclude.matches('')).toBe(true);
    expect(exclude.matches('xyz')).toBe(false);
  });
});

describe('BeatmapCarouselFilterMatching', () => {
  it('drops hidden difficulties and requires every term to match some metadata or the difficulty name', async () => {
    const a = makeSet('Ghost Rule', 'DECO*27', [2, 4]);
    const b = makeSet('Freedom Dive', 'xi', [5]);
    a.beatmaps[1].hidden = true;

    const criteria = criteriaWith();
    criteria.searchText = 'deco ghost';
    const { items } = await runPipeline([a, b], criteria);

    expect(items.filter(i => i.model instanceof GroupedBeatmap).map(i => (i.model as GroupedBeatmap).beatmap)).toEqual([a.beatmaps[0]]);
  });

  it('only shows a non-osu! ruleset\'s own maps plus converts when allowed', () => {
    const set = makeSet('t', 'a', [1]);
    const taiko = RulesetStore.getRuleset(1);

    expect(BeatmapCarouselFilterMatching.checkCriteriaMatch(set.beatmaps[0], criteriaWith({ ruleset: taiko }))).toBe(false);
    expect(BeatmapCarouselFilterMatching.checkCriteriaMatch(set.beatmaps[0], criteriaWith({ ruleset: taiko, allowConvertedBeatmaps: true }))).toBe(true);
  });
});

describe('BeatmapCarouselFilterSorting + Grouping', () => {
  it('sorts sets by title with difficulties by stars, and shows set headers with their difficulties hidden', async () => {
    const zebra = makeSet('zebra', 'a', [3, 1]);
    const apple = makeSet('Apple', 'b', [2]);

    const { items, grouping } = await runPipeline([zebra, apple], criteriaWith({ sort: SortMode.Title, group: GroupMode.None }));

    expect(items.map(i => i.model instanceof GroupedBeatmapSet ? `set:${i.model.beatmapSet.metadata.title}` : `diff:${(i.model as GroupedBeatmap).beatmap.starRating}`))
      .toEqual(['set:Apple', 'diff:2', 'set:zebra', 'diff:1', 'diff:3']);

    expect(items.map(i => i.isVisible)).toEqual([true, false, true, false, false]);
    expect(items.map(i => i.drawHeight)).toEqual([72, 45, 72, 45, 45]);
    expect(items.map(i => i.depthLayer)).toEqual([-1, 0, -1, 0, 0]);

    expect(grouping.beatmapSetsGroupedTogether).toBe(true);
    expect(grouping.beatmapItemsCount).toBe(3);
    expect(grouping.itemMap.get(new GroupedBeatmapSet(null, zebra).key)?.index).toBe(2);
    expect(grouping.setItems.get(new GroupedBeatmapSet(null, zebra).key)?.items.size).toBe(3);
  });

  it('groups alphabetically by artist with digits first and symbols last', async () => {
    const sets = [makeSet('t1', 'xi', [1]), makeSet('t2', '3R2', [1]), makeSet('t3', '*namirin', [1]), makeSet('t4', 'Xin', [1])];

    const { items, grouping } = await runPipeline(sets, criteriaWith({ sort: SortMode.Artist, group: GroupMode.Artist }));

    const headers = items.filter(i => i.model instanceof GroupDefinition);
    expect(headers.map(i => (i.model as GroupDefinition).title)).toEqual(['0-9', 'X', 'Other']);
    expect(headers.map(i => i.nestedItemCount)).toEqual([1, 2, 1]);
    // (45 * 1.2f in float precision is 54.0000038)
    expect(headers.every(i => i.isVisible && Math.abs(i.drawHeight - 54) < 1e-5 && i.depthLayer === -2)).toBe(true);

    // inside a group, everything starts hidden until the group expands
    expect(items.filter(i => !(i.model instanceof GroupDefinition)).some(i => i.isVisible)).toBe(false);
    expect(grouping.groupItems.size).toBe(3);
  });

  it('splits difficulties out into standalone panels when sorting by difficulty', async () => {
    const a = makeSet('a', 'a', [5, 1]);
    const b = makeSet('b', 'b', [3]);

    const { items, grouping } = await runPipeline([a, b], criteriaWith({ sort: SortMode.Difficulty }));

    expect(grouping.beatmapSetsGroupedTogether).toBe(false);
    expect(items.map(i => (i.model as GroupedBeatmap).beatmap.starRating)).toEqual([1, 3, 5]);
    expect(items.every(i => i.isVisible && i.drawHeight === 72)).toBe(true);
  });
});

// A carousel of numbers with bare panels, to exercise the generic layout and selection logic.
class TestPanel extends PoolableDrawable implements ICarouselPanel {
  readonly selected = new BindableBool();
  readonly expanded = new BindableBool();
  readonly keyboardSelected = new BindableBool();
  drawYPosition = 0;
  item: CarouselItem | null = null;

  constructor() {
    super();
    this.relativeSizeAxes = Axes.X;
    this.height = CarouselItem.DEFAULT_HEIGHT;
  }

  activated(): void {}
}

class TestCarousel extends Carousel<number> {
  spacing = 5;

  constructor() {
    super();
  }

  addItems(values: number[]) {
    this.items.addRange(values);
  }

  filter() {
    return this.filterAsync();
  }

  select(value: number) {
    this.currentSelection = value;
  }

  get selectionIndex() {
    return this.currentSelectionIndex;
  }

  protected override getSpacingBetweenPanels(): number {
    return this.spacing;
  }

  protected override getDrawableForDisplay(_item: CarouselItem): Drawable {
    return new TestPanel();
  }
}

class TestRoot extends Container {
  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const deps = new DependencyContainer(parent);
    const audio = Object.create(AudioManager.prototype, { samples: { value: { get: () => Promise.resolve(null) } } }) as AudioManager;
    deps.cacheAs(AudioManager, audio);
    deps.cache(new OsuColour());
    return deps;
  }
}

async function createCarousel(count: number) {
  const { root, frame } = createHost(1000, 600);
  const container = new TestRoot().with({ relativeSizeAxes: Axes.Both });
  const carousel = new TestCarousel().with({ relativeSizeAxes: Axes.Both });

  root.add(container);
  container.add(carousel);
  frame();

  carousel.addItems(Array.from({ length: count }, (_, i) => i));

  // (as Carousel.Update, item changes only re-filter automatically after a first filter has presented items.)
  await carousel.filter();
  frame(16);

  return { carousel, frame };
}

describe('Carousel', () => {
  it('lays items out from half the visible height with the panel spacing', async () => {
    const { carousel } = await createCarousel(100);
    const items = carousel.getCarouselItems()!;

    expect(items).toHaveLength(100);
    expect(items[0].carouselYPosition).toBe(300);
    expect(items[1].carouselYPosition).toBe(300 + 45 + 5);

    // positive spacing gives each pair of panels half the gap as input lenience
    expect(items[1].carouselInputLenienceAbove).toBe(2.5);
    expect(items[0].carouselInputLenienceBelow).toBe(2.5);
  });

  it('only materialises panels in (and just around) the visible range', async () => {
    const { carousel } = await createCarousel(100);

    // (distanceOffscreenToPreload is 0 here: the panels from y=300 down to the bottom of the 600-high view are shown.)
    expect(carousel.visibleItems).toBeGreaterThan(0);
    expect(carousel.visibleItems).toBeLessThan(20);
    expect(carousel.displayableItems).toBe(100);
  });

  it('links a selection to its item and scrolls it to the centre', async () => {
    const { carousel, frame } = await createCarousel(100);

    carousel.select(50);
    frame(16);

    expect(carousel.selectionIndex).toBe(50);

    // scroll-to-selection is animated; let it settle.
    for (let i = 0; i < 200; i++)
      frame(16);

    const item = carousel.getCarouselItems()![50];
    expect(carousel['scroll'].current).toBeCloseTo(item.carouselYPosition + item.drawHeight / 2 - 300, 0);
  });
});
