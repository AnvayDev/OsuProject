// Ported from osu.Game/Screens/Select/CollectionDropdown.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { BindableList } from '@fw/bindables/BindableList';
import type { DrawableDropdownMenuItem, DropdownMenu } from '@fw/graphics/userInterface/Dropdown';
import { DropdownMenuItem, type MenuItem } from '@fw/graphics/userInterface/MenuItem';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { type BeatmapCollection, compareCollectionNames, removeFrom } from '../../collections/BeatmapCollection';
import { AllBeatmapsCollectionFilterMenuItem, CollectionFilterMenuItem, ManageCollectionsFilterMenuItem } from '../../collections/CollectionFilterMenuItem';
import { ManageCollectionsDialog } from '../../collections/ManageCollectionsDialog';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import type { Live } from '../../database/Live';
import { type ChangeSet, RealmAccess } from '../../database/RealmAccess';
import { OsuScrollContainer } from '../../graphics/containers/OsuScrollContainer';
import { IconButton } from '../../graphics/userInterface/IconButton';
import { ShearedDropdown, ShearedDropdownMenu, ShearedMenuItem } from '../../graphics/userInterfaceV2/ShearedDropdown';
import { OsuGame } from '../../OsuGame';

/** A dropdown to select the collection to be used to filter results. */
export class CollectionDropdown extends ShearedDropdown<CollectionFilterMenuItem> { // TODO: partial class under FilterControl?
  /** Whether to show the "manage collections..." menu item in the dropdown. */
  protected get showManageCollectionsItem(): boolean {
    return true;
  }

  private readonly filters = new BindableList<CollectionFilterMenuItem>();
  private readonly configCollectionFilter = new Bindable<string>('');

  private manageCollectionsDialog: ManageCollectionsDialog | null = null;

  private realm!: RealmAccess;

  private realmSubscription: { dispose(): void } | null = null;

  private readonly allBeatmapsItem: CollectionFilterMenuItem = new AllBeatmapsCollectionFilterMenuItem();

  constructor() {
    super('Collection');

    this.itemSource = this.filters;

    this.current.value = this.allBeatmapsItem;
    this.alwaysShowSearchBar = true;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.manageCollectionsDialog = dependencies.get(ManageCollectionsDialog);
    this.realm = dependencies.resolve(RealmAccess);
    dependencies.resolve(OsuConfigManager).bindWith(OsuSetting.SongSelectCollectionFilter, this.configCollectionFilter);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.realmSubscription = this.realm.registerForCollectionNotifications(all => [...all].sort((a, b) => compareCollectionNames(a.name, b.name)),
      (collections, changes) => this.collectionsChanged(collections, changes));

    this.current.bindValueChanged(this.selectionChanged);
  }

  private collectionsChanged(collections: readonly BeatmapCollection[], changes: ChangeSet | null): void {
    if (changes === null) {
      this.filters.clear();
      this.filters.add(this.allBeatmapsItem);
      this.filters.addRange(collections.map(c => new CollectionFilterMenuItem(this.realm.toLive(c))));
      if (this.showManageCollectionsItem)
        this.filters.add(new ManageCollectionsFilterMenuItem());

      this.current.value = this.filters.toArray().find(item => item.collection?.performRead(c => c.id) === this.configCollectionFilter.value) ?? this.allBeatmapsItem;
    } else {
      for (const i of [...changes.deletedIndices].sort((a, b) => b - a))
        this.filters.removeAt(i + 1);

      for (const i of changes.insertedIndices)
        this.filters.insert(i + 1, new CollectionFilterMenuItem(this.realm.toLive(collections[i])));

      const selectedItem = this.selectedItem?.value;

      for (const i of changes.newModifiedIndices) {
        const updatedItem = collections[i];

        // This is responsible for updating the state of the +/- button and the collection's name.
        // TODO: we can probably make the menu items update with changes to avoid this.
        this.filters.removeAt(i + 1);
        this.filters.insert(i + 1, new CollectionFilterMenuItem(this.realm.toLive(updatedItem)));

        if (updatedItem.id === selectedItem?.collection?.id) {
          // This current update and schedule is required to work around dropdown headers not updating text even when the selected item
          // changes. It's not great but honestly the whole dropdown menu structure isn't great. This needs to be fixed, but I'll issue
          // a warning that it's going to be a frustrating journey.
          this.current.value = this.allBeatmapsItem;
          this.schedule(() => {
            // current may have changed before the scheduled call is run.
            if (this.current.value !== this.allBeatmapsItem)
              return;

            this.current.value = this.filters.toArray().find(f => f.collection?.id === selectedItem.collection?.id) ?? this.filters.get(0);
          });

          break;
        }
      }
    }
  }

  private readonly selectionChanged = (filter: ValueChangedEvent<CollectionFilterMenuItem>): void => {
    // May be null during .Clear().
    if (filter.newValue == null)
      return;

    if (filter.newValue instanceof ManageCollectionsFilterMenuItem) {
      // Never select the manage collection filter - rollback to the previous filter.
      // This is done after the above since it is important that bindable is unbound from OldValue, which is lost after forcing it back to the old value.
      this.current.value = filter.oldValue;
      this.manageCollectionsDialog?.show();
    } else if (filter.newValue.collection !== null)
      this.configCollectionFilter.value = filter.newValue.collection.performRead(c => c.id);
    else if (filter.newValue instanceof AllBeatmapsCollectionFilterMenuItem)
      this.configCollectionFilter.value = '';
  };

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.realmSubscription?.dispose();
  }

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

  protected override createDrawableDropdownMenuItem(item: MenuItem): DrawableDropdownMenuItem<CollectionFilterMenuItem> {
    return new DrawableCollectionMenuItem(item).with({
      backgroundColourHover: this.hoverColour,
      backgroundColourSelected: this.selectionColour,
    });
  }
}

/** (CollectionDropdown.DrawableCollectionMenuItem) */
export class DrawableCollectionMenuItem extends ShearedMenuItem<CollectionFilterMenuItem> {
  private addOrRemoveButton!: IconButton;

  private beatmapInCollection = false;

  private readonly collection: Live<BeatmapCollection> | null;

  private beatmap!: Bindable<WorkingBeatmap>;

  constructor(item: MenuItem) {
    super(item);

    this.collection = (item as DropdownMenuItem<CollectionFilterMenuItem>).value.collection;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();

    this.addInternal(this.addOrRemoveButton = new NoFocusChangeIconButton().with({
      anchor: Anchor.CentreRight,
      origin: Anchor.CentreRight,
      shear: OsuGame.SHEAR.neg(),
      x: -OsuScrollContainer.SCROLL_BAR_WIDTH,
      scale: new Vector2(Math.fround(0.65)),
      action: () => this.addOrRemove(),
    }));

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    const collection = this.collection;

    if (collection !== null) {
      this.beatmap.bindValueChanged(() => {
        this.beatmapInCollection = collection.performRead(c => c.beatmapMD5Hashes.includes(this.beatmap.value.beatmapInfo.md5Hash));

        this.addOrRemoveButton.enabled.value = !this.beatmap.isDefault;
        this.addOrRemoveButton.icon = this.beatmapInCollection ? FontAwesome.Solid.MinusSquare : FontAwesome.Solid.PlusSquare;
        this.addOrRemoveButton.tooltipText = this.beatmapInCollection ? 'Remove selected beatmap' : 'Add selected beatmap';

        this.updateButtonVisibility();
      }, true);
    }

    this.updateButtonVisibility();
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateButtonVisibility();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateButtonVisibility();
    super.onHoverLost(e);
  }

  protected override onSelectChange(): void {
    super.onSelectChange();
    this.updateButtonVisibility();
  }

  private updateButtonVisibility(): void {
    if (this.collection === null)
      this.addOrRemoveButton.alpha = 0;
    else
      this.addOrRemoveButton.alpha = this.isHovered || this.isPreSelected || this.beatmapInCollection ? 1 : 0;
  }

  private addOrRemove(): void {
    const md5Hash = this.beatmap.value.beatmapInfo.md5Hash;

    void this.collection!.performWrite(c => {
      if (!removeFrom(c.beatmapMD5Hashes, md5Hash))
        c.beatmapMD5Hashes.push(md5Hash);
    });
  }
}

/** (DrawableCollectionMenuItem.NoFocusChangeIconButton) */
class NoFocusChangeIconButton extends IconButton {
  override get changeFocusOnClick(): boolean {
    return false;
  }
}
