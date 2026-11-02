// Ported from osu.Game/Collections/DrawableCollectionList.cs

import { Bindable } from '@fw/bindables/Bindable';
import type { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { RearrangeableListItem } from '@fw/graphics/containers/RearrangeableListItem';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import { SearchContainer } from '@fw/graphics/containers/SearchContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuRearrangeableListContainer } from '../graphics/containers/OsuRearrangeableListContainer';
import type { OsuRearrangeableListItem } from '../graphics/containers/OsuRearrangeableListItem';
import { OsuScrollContainer } from '../graphics/containers/OsuScrollContainer';
import type { ChangeSet } from '../database/RealmAccess';
import { RealmAccess } from '../database/RealmAccess';
import type { Live } from '../database/Live';
import { type BeatmapCollection, compareCollectionNames } from './BeatmapCollection';
import { DrawableCollectionListItem } from './DrawableCollectionListItem';

/** Visualises a list of BeatmapCollections. */
export class DrawableCollectionList extends OsuRearrangeableListContainer<Live<BeatmapCollection>> {
  protected override createScrollContainer(): ScrollContainer<Drawable> {
    return this.scroll = new Scroll();
  }

  private realm!: RealmAccess;

  // (declare: assigned by the create methods during the base constructor, which a field initializer would then reset.)
  declare private scroll: Scroll;

  private realmSubscription: { dispose(): void } | null = null;

  declare private flow: Flow;

  get searchTerm(): string | null {
    return this.flow.searchTerm;
  }

  set searchTerm(value: string | null) {
    this.flow.searchTerm = value;
  }

  constructor() {
    super();

    // (C#'s `DragActive = { BindTarget = DragActive }` in CreateListFillFlowContainer: this list's DragActive isn't initialised yet when the
    // base constructor creates the flow here.)
    this.flow.dragActive.bindTo(this.dragActive);
  }

  protected override createListFillFlowContainer(): FillFlowContainer<RearrangeableListItem<Live<BeatmapCollection>>> {
    return this.flow = new Flow();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.realm = dependencies.resolve(RealmAccess);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.realmSubscription = this.realm.registerForCollectionNotifications(all => [...all].sort((a, b) => compareCollectionNames(a.name, b.name)),
      (collections, changes) => this.collectionsChanged(collections, changes));
  }

  /** When non-null, signifies that a new collection was created and should be presented to the user. */
  private lastCreated: string | null = null;

  protected override onItemsChanged(): void {
    super.onItemsChanged();

    if (this.lastCreated !== null) {
      const createdItem = this.flow.children.find(item => item.model.value.id === this.lastCreated);

      if (createdItem !== undefined)
        this.scheduleAfterChildren(() => this.scroll.scrollIntoView(createdItem));

      this.lastCreated = null;
    }
  }

  private collectionsChanged(collections: readonly BeatmapCollection[], changes: ChangeSet | null): void {
    if (changes === null) {
      this.items.addRange(collections.map(c => this.realm.toLive(c)));
      return;
    }

    for (const i of [...changes.deletedIndices].sort((a, b) => b - a))
      this.items.removeAt(i);

    for (const i of changes.insertedIndices)
      this.items.insert(i, this.realm.toLive(collections[i]));

    if (changes.insertedIndices.length === 1)
      this.lastCreated = collections[changes.insertedIndices[0]].id;

    for (const i of changes.newModifiedIndices) {
      const updatedItem = collections[i];

      this.items.removeAt(i);
      this.items.insert(i, this.realm.toLive(updatedItem));
    }
  }

  protected override createOsuDrawable(item: Live<BeatmapCollection>): OsuRearrangeableListItem<Live<BeatmapCollection>> {
    return new DrawableCollectionListItem(item, true);
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.realmSubscription?.dispose();
  }
}

/**
 * The scroll container for this DrawableCollectionList.
 * Contains the main flow of DrawableCollectionListItem and attaches a placeholder item to the end of the list.
 */
class Scroll extends OsuScrollContainer {
  protected override get content(): Container<Drawable> {
    return this.flowContent ?? super.content;
  }

  declare private flowContent: FillFlowContainer;

  constructor() {
    super();

    this.scrollbarOverlapsContent = false;

    super.content.add(this.flowContent = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      layoutDuration: 200,
      layoutEasing: Easing.OutQuint,
    }));
  }
}

/** The flow of DrawableCollectionListItem. Disables layout easing unless a drag is in progress. */
class Flow extends SearchContainer<RearrangeableListItem<Live<BeatmapCollection>>> {
  readonly dragActive = new Bindable<boolean>(false);

  constructor() {
    super();

    this.spacing = new Vector2(0, 5);
    this.layoutEasing = Easing.OutQuint;

    this.padding = MarginPadding.of({ right: 5 });
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.dragActive.bindValueChanged(active => this.layoutDuration = active.newValue ? 200 : 0);
  }
}
