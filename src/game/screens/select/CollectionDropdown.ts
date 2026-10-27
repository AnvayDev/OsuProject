// Ported from osu.Game/Screens/Select/CollectionDropdown.cs
// Collections aren't ported (no realm collections, no ManageCollectionsDialog): the list is the realm subscription's first result with no
// collections, so DrawableCollectionMenuItem's add / remove button (only shown for a collection) never appears and isn't ported.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { BindableList } from '@fw/bindables/BindableList';
import type { DropdownMenu } from '@fw/graphics/userInterface/Dropdown';
import { AllBeatmapsCollectionFilterMenuItem, type CollectionFilterMenuItem, ManageCollectionsFilterMenuItem } from '../../collections/CollectionFilterMenuItem';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ShearedDropdown, ShearedDropdownMenu } from '../../graphics/userInterfaceV2/ShearedDropdown';

/** A dropdown to select the collection to be used to filter results. */
export class CollectionDropdown extends ShearedDropdown<CollectionFilterMenuItem> {
  /** Whether to show the "manage collections..." menu item in the dropdown. */
  protected get showManageCollectionsItem(): boolean {
    return true;
  }

  private readonly filters = new BindableList<CollectionFilterMenuItem>();
  private readonly configCollectionFilter = new Bindable<string>('');

  private readonly allBeatmapsItem: CollectionFilterMenuItem = new AllBeatmapsCollectionFilterMenuItem();

  constructor() {
    super('Collection');

    this.itemSource = this.filters;

    this.current.value = this.allBeatmapsItem;
    this.alwaysShowSearchBar = true;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    dependencies.resolve(OsuConfigManager).bindWith(OsuSetting.SongSelectCollectionFilter, this.configCollectionFilter);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // (realm.RegisterForNotifications: its first callback, with no collections.)
    this.schedule(() => this.collectionsChanged());

    this.current.bindValueChanged(this.selectionChanged);
  }

  private collectionsChanged(): void {
    this.filters.clear();
    this.filters.add(this.allBeatmapsItem);
    if (this.showManageCollectionsItem)
      this.filters.add(new ManageCollectionsFilterMenuItem());

    this.current.value = this.allBeatmapsItem;
  }

  private readonly selectionChanged = (filter: ValueChangedEvent<CollectionFilterMenuItem>): void => {
    // May be null during .Clear().
    if (filter.newValue == null)
      return;

    if (filter.newValue instanceof ManageCollectionsFilterMenuItem) {
      // Never select the manage collection filter - rollback to the previous filter.
      // This is done after the above since it is important that bindable is unbound from OldValue, which is lost after forcing it back to the old value.
      this.current.value = filter.oldValue;
      // (manageCollectionsDialog?.Show(): not ported.)
    } else if (filter.newValue instanceof AllBeatmapsCollectionFilterMenuItem)
      this.configCollectionFilter.value = '';
  };

  protected override generateItemText(item: CollectionFilterMenuItem): string {
    return item.collectionName;
  }

  protected override createMenu(): DropdownMenu<CollectionFilterMenuItem> {
    return this.createCollectionMenu();
  }

  protected createCollectionMenu(): ShearedCollectionDropdownMenu {
    return new ShearedCollectionDropdownMenu();
  }
}

/** (CollectionDropdown.ShearedCollectionDropdownMenu) */
export class ShearedCollectionDropdownMenu extends ShearedDropdownMenu<CollectionFilterMenuItem> {
  constructor() {
    super();

    this.maxHeight = 200;
  }
}
