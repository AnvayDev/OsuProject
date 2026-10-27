// Ported from osu.Game/Screens/Select/BeatmapCarousel.cs (the model records are in GroupDefinition.ts).
// Offline port: there are no collections, local scores or favourites, so their fetches return nothing (see BeatmapCarouselFilterGrouping.ts),
// and there is no PanelGroupRankDisplay pool. [Cached] caches this as BeatmapCarousel and as the generic Carousel (which panels resolve).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable } from '@fw/bindables/Bindable';
import { type BindableList, NotifyCollectionChangedAction, type NotifyCollectionChangedEvent } from '@fw/bindables/BindableList';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { DrawablePool } from '@fw/graphics/pooling/DrawablePool';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { dampContinuously } from '@fw/transforms/Interpolation';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { RandomSelectAlgorithm } from '../../configuration/RandomSelectAlgorithm';
import { BeatmapStore } from '../../database/BeatmapStore';
import { Carousel, type Selection } from '../../graphics/carousel/Carousel';
import type { CarouselItem, ICarouselPanel } from '../../graphics/carousel/CarouselItem';
import { OsuColour } from '../../graphics/OsuColour';
import { LoadingLayer } from '../../graphics/userInterface/LoadingLayer';
import { OsuGameBase } from '../../OsuGameBase';
import { BeatmapCarouselFilterGrouping } from './BeatmapCarouselFilterGrouping';
import { BeatmapCarouselFilterMatching } from './BeatmapCarouselFilterMatching';
import { BeatmapCarouselFilterSorting } from './BeatmapCarouselFilterSorting';
import type { FilterCriteria } from './FilterCriteria';
import { GroupDefinition, GroupedBeatmap, GroupedBeatmapSet, RankedStatusGroupDefinition, StarDifficultyGroupDefinition } from './GroupDefinition';
import { PanelBeatmap } from './PanelBeatmap';
import { PanelBeatmapSet } from './PanelBeatmapSet';
import { PanelBeatmapStandalone } from './PanelBeatmapStandalone';
import { PanelGroup } from './PanelGroup';
import { PanelGroupRankedStatus } from './PanelGroupRankedStatus';
import { PanelGroupStarDifficulty } from './PanelGroupStarDifficulty';

export class BeatmapCarousel extends Carousel<BeatmapInfo> {
  requestPresentBeatmap: ((beatmap: BeatmapInfo) => void) | null = null;

  /** From the provided beatmaps, select the most appropriate one for the user's skill. */
  requestRecommendedSelection: (beatmaps: GroupedBeatmap[]) => void = () => {};

  /** Selection requested for the provided beatmap. */
  requestSelection: (beatmap: GroupedBeatmap) => void = () => {};

  static readonly SPACING = 3;

  private detachedBeatmaps!: BindableList<BeatmapSetInfo>;

  private readonly loading: LoadingLayer;

  private readonly grouping: BeatmapCarouselFilterGrouping;

  /** Total number of beatmap difficulties displayed with the filter. */
  get matchedBeatmapsCount(): number {
    return this.filters[this.filters.length - 1].beatmapItemsCount;
  }

  protected override getSpacingBetweenPanels(top: CarouselItem, bottom: CarouselItem): number {
    // Group panels do not overlap with any other panel but should overlap with themselves.
    if ((top.model instanceof GroupDefinition) !== (bottom.model instanceof GroupDefinition))
      return BeatmapCarousel.SPACING * 2;

    if (this.grouping.beatmapSetsGroupedTogether) {
      // Give some space around the expanded beatmap set, at the top..
      if (bottom.model instanceof GroupedBeatmapSet && bottom.isExpanded)
        return BeatmapCarousel.SPACING * 2;

      // ..and the bottom.
      if (top.model instanceof GroupedBeatmap && bottom.model instanceof GroupedBeatmapSet)
        return BeatmapCarousel.SPACING * 2;

      // Beatmap difficulty panels do not overlap with themselves or any other panel.
      if (top.model instanceof GroupedBeatmap || bottom.model instanceof GroupedBeatmap)
        return BeatmapCarousel.SPACING;
    } else {
      if (this.currentSelection !== null && (top === this.currentSelectionItem || bottom === this.currentSelectionItem))
        return BeatmapCarousel.SPACING * 2;
    }

    return -BeatmapCarousel.SPACING;
  }

  constructor() {
    super();

    this.debounceDelay = 100;
    this.distanceOffscreenToPreload = 100;

    // Account for the osu! logo being in the way.
    this.scroll.scrollbarPaddingBottom = 70;

    this.filters = [
      new BeatmapCarouselFilterMatching(() => this.criteria!),
      new BeatmapCarouselFilterSorting(() => this.criteria!),
      this.grouping = new BeatmapCarouselFilterGrouping({
        getCriteria: () => this.criteria!,
        getCollections: () => this.getAllCollections(),
        getFavouriteBeatmapSets: () => this.getFavouriteBeatmapSets(),
      }),
    ];

    this.addInternal(this.loading = new LoadingLayer());
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cacheAs(BeatmapCarousel, this);
    dependencies.cacheAs(Carousel, this as unknown as Carousel<unknown>);
    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.setupPools();
    this.detachedBeatmaps = dependencies.resolve(BeatmapStore).getBeatmapSets();
    this.loadBeatmapSamples(dependencies.resolve(AudioManager));

    dependencies.resolve(OsuConfigManager).bindWith(OsuSetting.RandomSelectAlgorithm, this.randomAlgorithm);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.detachedBeatmaps.bindCollectionChanged((_, changed) => this.beatmapSetsChanged(changed), true);
  }

  // #region Beatmap source hookup

  private beatmapSetsChanged(changed: NotifyCollectionChangedEvent<BeatmapSetInfo>): void {
    this.schedule(() => {
      // This callback is scheduled to ensure there's no added overhead during gameplay.
      // If this ever becomes an issue, it's important to note that the actual carousel filtering is already
      // implemented in a way it will only run when at song select.
      //
      // The overhead we are avoiding here is that of this method directly – things like Items.IndexOf calls
      // that can be slow for very large beatmap libraries. There are definitely ways to optimise this further.
      const newItems = changed.newItems;
      const oldItems = changed.oldItems;

      switch (changed.action) {
        case NotifyCollectionChangedAction.Add:
          if (newItems!.length === 0)
            return;

          this.items.addRange(newItems!.flatMap(s => s.beatmaps));
          break;

        case NotifyCollectionChangedAction.Remove: {
          let selectedSetDeleted = false;

          for (const set of oldItems!) {
            for (const beatmap of set.beatmaps) {
              this.items.removeAll(i => beatmap.equals(i));
              selectedSetDeleted ||= this.checkModelEquality(this.currentGroupedBeatmap?.beatmap ?? null, beatmap);
            }
          }

          // After removing all items in this batch, we want to make an immediate reselection
          // based on adjacency to the previous selection if it was deleted.
          //
          // This needs to be done immediately to avoid song select making a random selection.
          // This needs to be done in this class because we need to know final display order.
          // This needs to be done with attention to detail of which beatmaps have not been deleted.
          const currentSelectionIndex = this.currentSelectionIndex;

          if (selectedSetDeleted && currentSelectionIndex !== null) {
            const items = this.getCarouselItems()!;
            if (items.length === 0)
              break;

            const attemptSelection = (item: CarouselItem): boolean => {
              if (this.checkValidForSetSelection(item)) {
                if (item.model instanceof GroupedBeatmap) {
                  // check the new selection wasn't deleted above
                  if (!this.items.contains(item.model.beatmap))
                    return false;

                  this.requestSelection(item.model);
                  return true;
                }

                if (item.model instanceof GroupedBeatmapSet) {
                  const groupedSet = item.model;
                  if (oldItems!.some(s => s.equals(groupedSet.beatmapSet)))
                    return false;

                  this.selectRecommendedDifficultyForBeatmapSet(groupedSet);
                  return true;
                }
              }

              return false;
            };

            let success = false;

            // Try selecting forwards first
            for (let i = currentSelectionIndex + 1; i < items.length; i++) {
              if (attemptSelection(items[i])) {
                success = true;
                break;
              }
            }

            if (success)
              break;

            // Then try backwards (we might be at the end of available items).
            for (let i = Math.min(items.length - 1, currentSelectionIndex); i >= 0; i--) {
              if (attemptSelection(items[i]))
                break;
            }
          }

          break;
        }

        case NotifyCollectionChangedAction.Move:
          // We can ignore move operations as we are applying our own sort in all cases.
          break;

        case NotifyCollectionChangedAction.Replace: {
          const oldSetBeatmaps = oldItems![0].beatmaps;
          const newSetBeatmaps = [...newItems![0].beatmaps];

          // Handling replace operations is a touch manual, as we need to locally diff the beatmaps of each version of the beatmap set.
          // Matching is done based on online IDs, then difficulty names as these are the most stable thing between updates (which are usually triggered
          // by users editing the beatmap or by difficulty/metadata recomputation).
          //
          // In the case of difficulty reprocessing, this will trigger multiple times per beatmap as it's always triggering a set update.
          // We may want to look to improve this in the future either here or at the source (only trigger an update after all difficulties
          // have been processed) if it becomes an issue for animation or performance reasons.
          for (const beatmap of oldSetBeatmaps) {
            const previousIndex = this.items.indexOf(beatmap);

            // (C#'s ReplaceRange / RemoveAt throw for an index of -1; a JS splice at -1 would replace the last item instead, silently
            // dropping an unrelated beatmap from the carousel. A beatmap which isn't tracked has nothing to replace.)
            if (previousIndex < 0)
              continue;

            // we're intentionally being lenient with there being two difficulties with equal online ID or difficulty name.
            // this can be the case when the user modifies the beatmap using the editor's "external edit" feature.
            let matchingNewBeatmap =
              newSetBeatmaps.find(b => b.onlineID > 0 && b.onlineID === beatmap.onlineID) ??
              newSetBeatmaps.find(b => b.difficultyName === beatmap.difficultyName && b.ruleset.equals(beatmap.ruleset)) ??
              null;

            if (matchingNewBeatmap !== null) {
              // TODO: should this exist in song select instead of here?
              // we need to ensure the global beatmap is also updated alongside changes.
              if (this.currentBeatmap !== null && beatmap.equals(this.currentBeatmap)) {
                // (C# re-reads the matching beatmap from realm in case it changed since this event fired; committed sets never change here.)
                const refreshedNewBeatmap = matchingNewBeatmap;

                // we don't know in which group the matching new beatmap is, but that's fine - we can keep the previous one for now.
                // we are about to modify `Items`, which - if required - will trigger a re-filter,
                // which will pick a correct group - if one is present - via `handleFilterCompleted()`.
                this.requestSelection(new GroupedBeatmap(this.currentGroupedBeatmap?.group ?? null, refreshedNewBeatmap));
                matchingNewBeatmap = refreshedNewBeatmap;
              }

              this.items.replaceRange(previousIndex, 1, [matchingNewBeatmap]);
              newSetBeatmaps.splice(newSetBeatmaps.indexOf(matchingNewBeatmap), 1);
            } else {
              this.items.removeAt(previousIndex);
            }
          }

          // Add any items which weren't found in the previous pass (difficulty names didn't match).
          for (const beatmap of newSetBeatmaps)
            this.items.add(beatmap);

          break;
        }

        case NotifyCollectionChangedAction.Reset:
          this.items.clear();
          break;
      }
    });
  }

  // #endregion

  // #region Selection handling

  private _expandedGroup: GroupDefinition | null = null;

  protected get expandedGroup(): GroupDefinition | null {
    return this._expandedGroup;
  }

  private _expandedBeatmapSet: GroupedBeatmapSet | null = null;

  protected get expandedBeatmapSet(): GroupedBeatmapSet | null {
    return this._expandedBeatmapSet;
  }

  protected override shouldActivateOnKeyboardSelection(item: CarouselItem): boolean {
    return this.grouping.beatmapSetsGroupedTogether && item.model instanceof GroupedBeatmap;
  }

  /**
   * The currently selected GroupedBeatmap.
   * The selection is never reset due to not existing. It can be set to anything.
   * If no matching carousel item exists, there will be no visually selected item while waiting for potential new item which matches.
   */
  get currentGroupedBeatmap(): GroupedBeatmap | null {
    return this.currentSelection instanceof GroupedBeatmap ? this.currentSelection : null;
  }

  set currentGroupedBeatmap(value: GroupedBeatmap | null) {
    this.currentSelection = value;
  }

  /**
   * The currently selected BeatmapInfo.
   * This is a property mostly dedicated to external consumers who only care about showing some particular copy of a beatmap
   * (there could be multiple panels for one beatmap due to grouping).
   * Through this property, the carousel basically figures out what group to use internally.
   */
  get currentBeatmap(): BeatmapInfo | null {
    return this.currentGroupedBeatmap?.beatmap ?? null;
  }

  set currentBeatmap(value: BeatmapInfo | null) {
    if (value === null) {
      this.currentGroupedBeatmap = null;
      return;
    }

    if (this.currentGroupedBeatmap !== null && value.equals(this.currentGroupedBeatmap.beatmap))
      return;

    // it is not universally guaranteed that the carousel items will be materialised at the time this is set.
    // therefore, in cases where it is known that they will not be, default to a null group.
    // even if grouping is active, this will be rectified to a correct group on the next invocation of `handleFilterCompleted()`.
    this.currentGroupedBeatmap = this.isLoaded && !this.isFiltering
      ? (this.getCarouselItems()?.map(item => item.model).find((m): m is GroupedBeatmap => m instanceof GroupedBeatmap && m.beatmap.equals(value)) ?? null)
      : new GroupedBeatmap(null, value);
  }

  protected override handleItemActivated(item: CarouselItem): void {
    try {
      const model = item.model;

      if (model instanceof GroupDefinition) {
        // Special case – collapsing an open group.
        if (sameGroup(this._expandedGroup, model)) {
          this.setExpansionStateOfGroup(this._expandedGroup!, false);
          this._expandedGroup = null;
          return;
        }

        this.setExpandedGroup(model);

        // If the active selection is within this group, it should get keyboard focus immediately.
        if (this.currentSelectionItem?.isVisible === true && this.currentSelection instanceof GroupedBeatmap)
          this.requestSelection(this.currentSelection);

        return;
      }

      if (model instanceof GroupedBeatmapSet) {
        this.selectRecommendedDifficultyForBeatmapSet(model);
        return;
      }

      if (model instanceof GroupedBeatmap) {
        if (this.currentSelection !== null && this.checkModelEquality(this.currentSelection, model)) {
          this.requestPresentBeatmap?.(model.beatmap);
          return;
        }

        this.requestSelection(model);
        return;
      }
    } finally {
      this.playActivationSound(item);
    }
  }

  protected override handleItemSelected(model: unknown): void {
    super.handleItemSelected(model);

    if (model instanceof GroupedBeatmapSet || model instanceof GroupDefinition)
      throw new Error('Groups should never become selected');

    if (model instanceof GroupedBeatmap) {
      this.setExpandedGroup(model.group);

      this.setExpandedSet(new GroupedBeatmapSet(model.group, model.beatmap.beatmapSet!));
    }
  }

  protected override handleItemsChanged(args: NotifyCollectionChangedEvent<BeatmapInfo>): boolean {
    switch (args.action) {
      case NotifyCollectionChangedAction.Add:
      case NotifyCollectionChangedAction.Remove:
      case NotifyCollectionChangedAction.Move:
      case NotifyCollectionChangedAction.Reset:
        return true;

      case NotifyCollectionChangedAction.Replace: {
        const oldBeatmaps = args.oldItems!;
        const newBeatmaps = args.newItems!;

        for (let i = 0; i < oldBeatmaps.length; i++) {
          const oldBeatmap = oldBeatmaps[i];
          const newBeatmap = newBeatmaps[i];

          // Ignore changes which don't concern us.
          //
          // Here are some examples of things that can go wrong:
          // - Background difficulty calculation runs and causes a realm update.
          //   We use `BeatmapDifficultyCache` and don't want to know about these.
          // - Background user tag population runs and causes a realm update.
          //   We don't display user tags so want to ignore this.
          const equalForDisplayPurposes =
            // covers import-as-update flows, such as updating the beatmap with the latest online versions, or external editing inside editor
            oldBeatmap.id === newBeatmap.id &&
            // covers metadata changes
            oldBeatmap.hash === newBeatmap.hash &&
            // sanity check
            oldBeatmap.onlineID === newBeatmap.onlineID &&
            // displayed on panel
            oldBeatmap.status === newBeatmap.status &&
            // displayed on panel
            oldBeatmap.difficultyName === newBeatmap.difficultyName &&
            // hidden changed, needs re-filter
            oldBeatmap.hidden === newBeatmap.hidden &&
            // might be used for grouping, returning from gameplay
            oldBeatmap.lastPlayed?.getTime() === newBeatmap.lastPlayed?.getTime();

          if (equalForDisplayPurposes)
            return false;
        }

        return true;
      }
    }
  }

  protected override findCarouselItemsForSelection(keyboardSelection: Selection, selection: Selection, _items: readonly CarouselItem[]): { keyboardSelection: Selection; selection: Selection } {
    const keyboardSelectionItem = keyboardSelection.model !== null ? this.grouping.itemMap.get(modelKey(keyboardSelection.model)) : undefined;
    if (keyboardSelectionItem !== undefined)
      keyboardSelection = keyboardSelection.withItem(keyboardSelectionItem.item, keyboardSelectionItem.index);

    const selectionItem = selection.model !== null ? this.grouping.itemMap.get(modelKey(selection.model)) : undefined;
    if (selectionItem !== undefined)
      selection = selection.withItem(selectionItem.item, selectionItem.index);

    return { keyboardSelection, selection };
  }

  protected override handleFilterCompleted(): void {
    super.handleFilterCompleted();

    this.attemptSelectSingleFilteredResult();

    const selection = this.currentSelection;

    if (selection instanceof GroupedBeatmap) {
      // Check whether the selection-group mapping is still valid post-filter.
      if (!this.grouping.itemMap.has(selection.key)) {
        // If the group no longer exists (or the item no longer exists in the previous group), grab an arbitrary other instance of the beatmap under the first group encountered.
        const newSelection = this.getCarouselItems()
          ?.map(i => i.model)
          .find((m): m is GroupedBeatmap => m instanceof GroupedBeatmap && this.checkModelEquality(m.beatmap, selection.beatmap));

        // Only change the selection if we actually got a positive hit.
        // This is necessary so that selection isn't lost if the panel reappears later due to e.g. unapplying some filter criteria that made it disappear in the first place.
        if (newSelection !== undefined)
          this.currentSelection = newSelection;
      }
    }

    // Transfer the previous flag states across to the new models.
    if (this._expandedBeatmapSet !== null) this.setExpandedSet(this._expandedBeatmapSet);
    if (this._expandedGroup !== null) this.setExpandedGroup(this._expandedGroup);

    for (const panel of this.scroll.panels.children) {
      if (panel instanceof PanelBeatmapSet && panel.item !== null)
        this.updateVisibleBeatmaps(panel.item.model as GroupedBeatmapSet, panel);
    }
  }

  private selectRecommendedDifficultyForBeatmapSet(set: GroupedBeatmapSet): void {
    // Selecting a set isn't valid – let's re-select the first visible difficulty.
    const items = this.grouping.setItems.get(set.key)?.items;

    if (items !== undefined) {
      const beatmaps = [...items].map(i => i.model).filter((m): m is GroupedBeatmap => m instanceof GroupedBeatmap);
      this.requestRecommendedSelection(beatmaps);
    }
  }

  /** If we don't have a selection and there's a single beatmap set returned, select it for the user. */
  private attemptSelectSingleFilteredResult(): void {
    const items = this.getCarouselItems();

    if (items === null || items.length === 0) return;

    let beatmapSetInfo: BeatmapSetInfo | null = null;

    for (const item of items) {
      if (item.model instanceof GroupedBeatmap) {
        const beatmapInfo = item.model.beatmap;

        if (beatmapSetInfo === null) {
          beatmapSetInfo = beatmapInfo.beatmapSet!;
          continue;
        }

        // Found a beatmap with a different beatmap set, abort.
        if (!beatmapSetInfo.equals(beatmapInfo.beatmapSet))
          return;
      }
    }

    const beatmaps = items.map(i => i.model).filter((m): m is GroupedBeatmap => m instanceof GroupedBeatmap);

    // do not request recommended selection if the user already had selected a difficulty within the single filtered beatmap set,
    // as it could change the difficulty that will be selected
    const current = this.currentGroupedBeatmap;
    const preexistingSelection = beatmaps.find(b => b.equals(current));

    if (preexistingSelection !== undefined) {
      // the selection might not have an item associated with it, if it was fully filtered away previously
      // in this case, request to reselect it
      if (this.currentSelectionItem === null)
        this.requestSelection(preexistingSelection);

      return;
    }

    this.requestRecommendedSelection(beatmaps);
  }

  protected override checkValidForGroupSelection(item: CarouselItem): boolean {
    return item.model instanceof GroupDefinition;
  }

  protected override checkValidForSetSelection(item: CarouselItem): boolean {
    if (item.model instanceof GroupedBeatmapSet)
      return true;

    if (item.model instanceof GroupedBeatmap)
      return !this.grouping.beatmapSetsGroupedTogether;

    if (item.model instanceof GroupDefinition)
      return false;

    throw new Error(`Unsupported model type ${item.model}`);
  }

  private setExpandedGroup(group: GroupDefinition | null): void {
    if (this._expandedGroup !== null)
      this.setExpansionStateOfGroup(this._expandedGroup, false);

    this._expandedGroup = group;

    if (this._expandedGroup !== null)
      this.setExpansionStateOfGroup(this._expandedGroup, true);
  }

  private setExpansionStateOfGroup(group: GroupDefinition, expanded: boolean): void {
    const items = this.grouping.groupItems.get(group.key);

    if (items !== undefined) {
      if (expanded) {
        for (const i of items) {
          if (i.model instanceof GroupDefinition)
            i.isExpanded = true;
          else if (i.model instanceof GroupedBeatmapSet) {
            // Case where there are set headers, header should be visible
            // and items should use the set's expanded state.
            i.isVisible = true;
            this.setExpansionStateOfSetItems(i.model, i.isExpanded);
          } else {
            // Case where there are no set headers, all items should be visible.
            if (!this.grouping.beatmapSetsGroupedTogether)
              i.isVisible = true;
          }
        }
      } else {
        for (const i of items) {
          if (i.model instanceof GroupDefinition)
            i.isExpanded = false;
          else
            i.isVisible = false;
        }
      }
    }
  }

  private setExpandedSet(set: GroupedBeatmapSet): void {
    const lastExpandedSet = this._expandedBeatmapSet;

    // It's important that we update the stored ExpandedBeatmapSet even when
    // sets are not grouped together.
    //
    // This is stored when selection is changed and used later to ensure correct
    // visual states are achieved (see call of this method in `handleFilterCompleted`
    // for an important case).
    this._expandedBeatmapSet = set;

    if (!this.grouping.beatmapSetsGroupedTogether)
      return;

    this.setExpansionStateOfSetItems(lastExpandedSet, false);
    this.setExpansionStateOfSetItems(this._expandedBeatmapSet, true);
  }

  private setExpansionStateOfSetItems(set: GroupedBeatmapSet | null, expanded: boolean): void {
    if (set === null)
      return;

    const canMakeVisible = this.grouping.groupItems.size === 0 || sameGroup(this._expandedGroup, set.group);

    const items = this.grouping.setItems.get(set.key)?.items;

    if (items !== undefined) {
      for (const i of items) {
        if (i.model instanceof GroupedBeatmapSet)
          i.isExpanded = expanded;
        else
          i.isVisible = canMakeVisible && expanded;
      }
    }
  }

  protected override getScrollTarget(): number | null {
    let target = super.getScrollTarget();

    // if the base implementation returned null, it means that the keyboard selection has been filtered out and is no longer visible
    // attempt a fallback to other possibly expanded panels (set first, then group)
    if (target === null) {
      let targetItem: CarouselItem | null = null;

      if (this._expandedBeatmapSet !== null)
        targetItem = this.grouping.itemMap.get(this._expandedBeatmapSet.key)?.item ?? null;

      if (targetItem === null && this._expandedGroup !== null)
        targetItem = this.grouping.itemMap.get(this._expandedGroup.key)?.item ?? null;

      target = targetItem?.carouselYPosition ?? null;
    }

    return target;
  }

  // #endregion

  // #region Audio

  private sampleChangeDifficulty: Sample | null = null;
  private sampleChangeSet: Sample | null = null;
  private sampleToggleGroup: Sample | null = null;

  // (C#'s audioFeedbackLastPlaybackTime; TS private names may not repeat the base Carousel's.)
  private activationFeedbackLastPlaybackTime = 0;

  // (C#'s loadSamples; renamed as the base Carousel's private loadSamples may not be repeated.)
  private loadBeatmapSamples(audio: AudioManager): void {
    void audio.samples.get('SongSelect/select-difficulty').then(s => this.sampleChangeDifficulty = s);
    void audio.samples.get('SongSelect/select-expand').then(s => this.sampleChangeSet = s);
    void audio.samples.get('SongSelect/select-group').then(s => this.sampleToggleGroup = s);

    void audio.samples.get('SongSelect/random-spin').then(s => this.spinSample = s);
    void audio.samples.get('SongSelect/select-random').then(s => this.randomSelectSample = s);
  }

  private playActivationSound(item: CarouselItem): void {
    if (this.time.current - this.activationFeedbackLastPlaybackTime >= OsuGameBase.SAMPLE_DEBOUNCE_TIME) {
      if (item.model instanceof GroupDefinition) {
        this.sampleToggleGroup?.play();
        return;
      }

      if (item.model instanceof GroupedBeatmapSet) {
        this.sampleChangeSet?.play();
        return;
      }

      if (item.model instanceof GroupedBeatmap) {
        this.sampleChangeDifficulty?.play();
        return;
      }

      this.activationFeedbackLastPlaybackTime = this.time.current;
    }
  }

  // #endregion

  // #region Animation

  /** Moves non-selected beatmaps to the right, hiding off-screen. */
  visuallyFocusSelected = false;

  private selectionFocusOffset = 0;

  protected override update(): void {
    super.update();

    this.selectionFocusOffset = Math.fround(dampContinuously(this.selectionFocusOffset, this.visuallyFocusSelected ? 300 : 0, 100, this.time.elapsed));
  }

  protected override getPanelXOffset(panel: Drawable): number {
    return Math.fround(super.getPanelXOffset(panel) + ((panel as Drawable & ICarouselPanel).selected.value ? 0 : this.selectionFocusOffset));
  }

  // #endregion

  // #region Filtering

  private _criteria: FilterCriteria | null = null;

  get criteria(): FilterCriteria | null {
    return this._criteria;
  }

  private loadingDebounce: ScheduledDelegate | null = null;

  filter(criteria: FilterCriteria, showLoadingImmediately = false): void {
    const resetDisplay = this.grouping.beatmapSetsGroupedTogether !== BeatmapCarouselFilterGrouping.shouldGroupBeatmapsTogether(criteria);

    this._criteria = criteria;

    this.loadingDebounce ??= this.scheduler.addDelayed(() => {
      if (this.loading.state.value === Visibility.Visible)
        return;

      this.scroll.fadeColour(OsuColour.gray(0.5), 1000, Easing.OutQuint);
      this.loading.show();
    }, showLoadingImmediately ? 0 : 250);

    void this.filterAsync(resetDisplay).finally(() => this.schedule(() => {
      this.loadingDebounce?.cancel();
      this.loadingDebounce = null;

      this.scroll.fadeColour(OsuColour.gray(1), 500, Easing.OutQuint);
      this.loading.hide();
    }));
  }

  protected override filterAsync(clearExistingPanels = false): Promise<CarouselItem[]> {
    if (this._criteria === null)
      return Promise.resolve([]);

    return super.filterAsync(clearExistingPanels);
  }

  // #endregion

  // #region Fetches for grouping support

  /** Collections aren't ported. */
  protected getAllCollections(): { name: string; beatmapMD5Hashes: string[] }[] {
    return [];
  }

  /** The online API isn't ported, so there is no local user with favourites. */
  protected getFavouriteBeatmapSets(): Set<number> {
    return new Set();
  }

  // #endregion

  // #region Drawable pooling

  private readonly beatmapPanelPool = new DrawablePool(PanelBeatmap, 100);
  private readonly standalonePanelPool = new DrawablePool(PanelBeatmapStandalone, 100);
  private readonly setPanelPool = new DrawablePool(PanelBeatmapSet, 100);
  private readonly groupPanelPool = new DrawablePool(PanelGroup, 100);
  private readonly starsGroupPanelPool = new DrawablePool(PanelGroupStarDifficulty, 11);
  private readonly statusGroupPanelPool = new DrawablePool(PanelGroupRankedStatus, 8);

  private setupPools(): void {
    this.addInternal(this.statusGroupPanelPool);
    this.addInternal(this.starsGroupPanelPool);
    this.addInternal(this.groupPanelPool);
    this.addInternal(this.beatmapPanelPool);
    this.addInternal(this.standalonePanelPool);
    this.addInternal(this.setPanelPool);
  }

  protected override checkModelEquality(x: unknown, y: unknown): boolean {
    // In the confines of the carousel logic, we assume that CurrentSelection (and all items) are using non-stale
    // BeatmapInfo reference, and that we can match based on beatmap / beatmapset (GU)IDs.
    //
    // If there's a case where updates don't come in as expected, diagnosis should start from BeatmapStore, ensuring
    // it is doing a Replace operation on the list. If it is, then check the local handling in beatmapSetsChanged
    // before changing matching requirements here.

    if (x instanceof GroupedBeatmapSet && y instanceof GroupedBeatmapSet)
      return x.equals(y);

    if (x instanceof GroupedBeatmap && y instanceof GroupedBeatmap)
      return x.equals(y);

    // `BeatmapInfo` is no longer used directly in carousel items, but in rare circumstances still is used for model equality comparisons
    // (see `beatmapSetsChanged()` deletion handling logic, which aims to find a beatmap close to the just-deleted one, disregarding grouping concerns)
    if (isBeatmapInfo(x) && isBeatmapInfo(y))
      return x.equals(y);

    // (the GroupDefinition subtypes' keys carry their type, so one branch covers them all)
    if (x instanceof GroupDefinition && y instanceof GroupDefinition)
      return x.equals(y);

    return super.checkModelEquality(x, y);
  }

  protected override getDrawableForDisplay(item: CarouselItem): Drawable {
    const model = item.model;

    if (model instanceof RankedStatusGroupDefinition)
      return this.statusGroupPanelPool.get();

    if (model instanceof StarDifficultyGroupDefinition)
      return this.starsGroupPanelPool.get();

    if (model instanceof GroupDefinition)
      return this.groupPanelPool.get();

    if (model instanceof GroupedBeatmap) {
      if (!this.grouping.beatmapSetsGroupedTogether)
        return this.standalonePanelPool.get();

      return this.beatmapPanelPool.get();
    }

    if (model instanceof GroupedBeatmapSet) {
      const setPanel = this.setPanelPool.get();
      this.updateVisibleBeatmaps(model, setPanel);
      return setPanel;
    }

    throw new Error('Unsupported carousel item model');
  }

  private updateVisibleBeatmaps(groupedBeatmapSet: GroupedBeatmapSet, setPanel: PanelBeatmapSet): void {
    let visibleBeatmaps = new Set<BeatmapInfo>();
    const visibleItems = this.grouping.setItems.get(groupedBeatmapSet.key)?.items;
    if (visibleItems !== undefined)
      visibleBeatmaps = new Set([...visibleItems].filter(i => i.model instanceof GroupedBeatmap).map(i => (i.model as GroupedBeatmap).beatmap));

    setPanel.visibleBeatmaps.value = visibleBeatmaps;
  }

  // #endregion

  // #region Random selection handling

  private readonly randomAlgorithm = new Bindable<RandomSelectAlgorithm>(RandomSelectAlgorithm.RandomPermutation);
  // (HashSet<BeatmapInfo> compares by ID: keyed by beatmap ID)
  private readonly previouslyVisitedRandomBeatmaps = new Map<string, BeatmapInfo>();
  private readonly randomHistory: GroupedBeatmap[] = [];

  private spinSample: Sample | null = null;
  private randomSelectSample: Sample | null = null;

  nextRandom(): boolean {
    const carouselItems = this.getCarouselItems();

    if (carouselItems === null || carouselItems.length === 0)
      return false;

    const selectionBefore = this.currentSelectionItem;
    const beatmapBefore = selectionBefore?.model instanceof GroupedBeatmap ? selectionBefore.model : null;

    let success: boolean;

    if (beatmapBefore !== null) {
      // keep track of visited beatmaps and sets for rewind
      this.randomHistory.push(beatmapBefore);
      // keep track of visited beatmaps for "RandomPermutation" random tracking.
      // note that this is reset when we run out of beatmaps, while `randomHistory` is not.
      this.previouslyVisitedRandomBeatmaps.set(beatmapBefore.beatmap.id, beatmapBefore.beatmap);
    }

    if (this.grouping.beatmapSetsGroupedTogether)
      success = this.nextRandomSet();
    else
      success = this.nextRandomBeatmap();

    if (!success) {
      if (beatmapBefore !== null)
        this.randomHistory.pop();
      return false;
    }

    // CurrentSelectionItem won't be valid until UpdateAfterChildren.
    // We probably want to fix this at some point since a few places are working-around this quirk.
    this.scheduleAfterChildren(() => {
      if (selectionBefore !== null && this.currentSelectionItem !== null)
        this.playSpinSample(this.visiblePanelCountBetweenItems(selectionBefore, this.currentSelectionItem));
    });

    return true;
  }

  private nextRandomBeatmap(): boolean {
    const groupItems = this._expandedGroup !== null ? this.grouping.groupItems.get(this._expandedGroup.key) : undefined;

    const visibleBeatmaps = (groupItems !== undefined
      // In the case of grouping, users expect random to only operate on the expanded group.
      // This is going to incur some overhead as we don't have a group-beatmapset mapping currently.
      //
      // If this becomes an issue, we could either store a mapping, or run the random algorithm many times
      // using the `SetItems` method until we get a group HIT.
      ? [...groupItems]
      : [...this.getCarouselItems()!])
      .map(i => i.model).filter((m): m is GroupedBeatmap => m instanceof GroupedBeatmap);

    let beatmap: GroupedBeatmap;

    switch (this.randomAlgorithm.value) {
      case RandomSelectAlgorithm.RandomPermutation: {
        let notYetVisitedBeatmaps = exceptBy(visibleBeatmaps, this.previouslyVisitedRandomBeatmaps, gb => gb.beatmap.id);

        if (notYetVisitedBeatmaps.length === 0) {
          for (const b of visibleBeatmaps)
            this.previouslyVisitedRandomBeatmaps.delete(b.beatmap.id);
          notYetVisitedBeatmaps = visibleBeatmaps;
          const current = this.currentSelection;
          if (current instanceof GroupedBeatmap)
            notYetVisitedBeatmaps = notYetVisitedBeatmaps.filter(b => !b.equals(current));
        }

        if (notYetVisitedBeatmaps.length === 0)
          return false;

        beatmap = notYetVisitedBeatmaps[Math.floor(Math.random() * notYetVisitedBeatmaps.length)];
        break;
      }

      case RandomSelectAlgorithm.Random:
        beatmap = visibleBeatmaps[Math.floor(Math.random() * visibleBeatmaps.length)];
        break;
    }

    this.requestSelection(beatmap);
    return true;
  }

  private nextRandomSet(): boolean {
    const groupItems = this._expandedGroup !== null ? this.grouping.groupItems.get(this._expandedGroup.key) : undefined;

    const visibleGroupedSets = groupItems !== undefined
      // In the case of grouping, users expect random to only operate on the expanded group.
      // This is going to incur some overhead as we don't have a group-beatmapset mapping currently.
      //
      // If this becomes an issue, we could either store a mapping, or run the random algorithm many times
      // using the `SetItems` method until we get a group HIT.
      ? [...groupItems].map(i => i.model).filter((m): m is GroupedBeatmapSet => m instanceof GroupedBeatmapSet)
      // This is the fastest way to retrieve sets for randomisation.
      : [...this.grouping.setItems.values()].map(v => v.set);

    let set: GroupedBeatmapSet;

    switch (this.randomAlgorithm.value) {
      case RandomSelectAlgorithm.RandomPermutation: {
        const visitedSets = new Map([...this.previouslyVisitedRandomBeatmaps.values()].map(b => [b.beatmapSet!.id, b.beatmapSet!]));
        let notYetVisitedSets = exceptBy(visibleGroupedSets, visitedSets, groupedSet => groupedSet.beatmapSet.id);

        if (notYetVisitedSets.length === 0) {
          for (const setUnderGrouping of visibleGroupedSets) {
            for (const b of setUnderGrouping.beatmapSet.beatmaps)
              this.previouslyVisitedRandomBeatmaps.delete(b.id);
          }

          notYetVisitedSets = visibleGroupedSets;
          const current = this.currentSelection;
          if (current instanceof GroupedBeatmap)
            notYetVisitedSets = exceptBy(notYetVisitedSets, new Map([[current.beatmap.beatmapSet!.id, current.beatmap.beatmapSet!]]), groupedSet => groupedSet.beatmapSet.id);
        }

        if (notYetVisitedSets.length === 0)
          return false;

        set = notYetVisitedSets[Math.floor(Math.random() * notYetVisitedSets.length)];
        break;
      }

      case RandomSelectAlgorithm.Random:
        set = visibleGroupedSets[Math.floor(Math.random() * visibleGroupedSets.length)];
        break;
    }

    this.selectRecommendedDifficultyForBeatmapSet(set);
    return true;
  }

  previousRandom(): boolean {
    const carouselItems = this.getCarouselItems();

    if (carouselItems === null || carouselItems.length === 0)
      return false;

    while (this.randomHistory.length > 0) {
      const previousBeatmap = this.randomHistory.pop()!;

      // when going back through rewind history, we may no longer be in the same grouping mode.
      // the user wants to go back to the beatmap first and foremost, so the most important thing is to find a panel that corresponds to the beatmap.
      // going back to the same group is a nice-to-have, but a secondary concern.
      const candidates = carouselItems.filter(i => i.model instanceof GroupedBeatmap && i.model.beatmap.equals(previousBeatmap.beatmap));
      // (MaxBy(group == previous group): the first item in the same group, else the first item)
      const previousBeatmapItem = candidates.find(i => sameGroup((i.model as GroupedBeatmap).group, previousBeatmap.group)) ?? candidates[0] ?? null;

      if (previousBeatmapItem === null)
        return false;

      const current = this.currentSelection;

      if (current instanceof GroupedBeatmap) {
        if (this.randomAlgorithm.value === RandomSelectAlgorithm.RandomPermutation)
          this.previouslyVisitedRandomBeatmaps.delete(current.beatmap.id);

        if (this.currentSelectionItem === null)
          this.playSpinSample(0);
        else
          this.playSpinSample(this.visiblePanelCountBetweenItems(previousBeatmapItem, this.currentSelectionItem));
      }

      this.requestSelection(previousBeatmapItem.model as GroupedBeatmap);
      return true;
    }

    return false;
  }

  private visiblePanelCountBetweenItems(item1: CarouselItem, item2: CarouselItem): number {
    return Math.ceil(Math.abs(item1.carouselYPosition - item2.carouselYPosition) / PanelBeatmapSet.HEIGHT);
  }

  private playSpinSample(distance: number): void {
    const chan = this.spinSample?.getChannel();

    if (chan !== undefined) {
      chan.frequency.value = 1 + Math.min(Math.max(distance / 200, 0), 1);
      chan.play();
    }

    this.randomSelectSample?.play();
  }

  // #endregion
}

function isBeatmapInfo(x: unknown): x is BeatmapInfo {
  return typeof x === 'object' && x !== null && 'difficultyName' in x && 'beatmapSet' in x;
}

/** GroupDefinition? equality (record ==). */
function sameGroup(a: GroupDefinition | null, b: GroupDefinition | null): boolean {
  return a === null ? b === null : a.equals(b);
}

/** Enumerable.ExceptBy: the distinct elements whose key isn't in the given keys. */
function exceptBy<T, K>(items: readonly T[], keys: ReadonlyMap<K, unknown>, keySelector: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];

  for (const item of items) {
    const key = keySelector(item);

    if (keys.has(key) || seen.has(key))
      continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

/** The key a model is stored under in the grouping filter's maps. */
function modelKey(model: unknown): string {
  return (model as GroupDefinition | GroupedBeatmapSet | GroupedBeatmap).key;
}
