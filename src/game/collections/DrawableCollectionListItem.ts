// Ported from osu.Game/Collections/DrawableCollectionListItem.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import type { IFilterable } from '@fw/graphics/containers/SearchContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { TextBox } from '@fw/graphics/userInterface/TextBox';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuClickableContainer } from '../graphics/containers/OsuClickableContainer';
import { OsuRearrangeableListItem } from '../graphics/containers/OsuRearrangeableListItem';
import { OsuColour } from '../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../graphics/OsuFont';
import { OsuSpriteText } from '../graphics/sprites/OsuSpriteText';
import { OsuTextBox } from '../graphics/userInterface/OsuTextBox';
import { IDialogOverlay } from '../overlays/IDialogOverlay';
import type { Live } from '../database/Live';
import { RealmAccess } from '../database/RealmAccess';
import type { BeatmapCollection } from './BeatmapCollection';
import { DeleteCollectionDialog } from './DeleteCollectionDialog';

const item_height = 45;
const button_width = Math.fround(item_height * Math.fround(0.75));

// C# float.MinValue
const float_min_value = -3.4028234663852886e38;

/** Visualises a BeatmapCollection inside a DrawableCollectionList. */
export class DrawableCollectionListItem extends OsuRearrangeableListItem<Live<BeatmapCollection>> implements IFilterable {
  protected get textBox(): TextBox {
    return this.itemContent.textBox;
  }

  /** (C#'s content) */
  private itemContent!: ItemContent;

  /** @param isCreated Whether item currently exists inside realm. */
  constructor(item: Live<BeatmapCollection>, _isCreated: boolean) {
    super(item);

    // For now we don't support rearranging and always use alphabetical sort.
    // Change this to:
    //
    // ShowDragHandle.Value = item.IsManaged;
    //
    // if we want to support user sorting (but changes will need to be made to realm to persist).
    this.showDragHandle.value = false;

    this.masking = true;

    // This doesn't match the latest design spec (should be 5) but is an in-between that feels right to the eye
    // until we move everything over to Form controls.
    this.cornerRadius = 10;
    this.cornerExponent = Math.fround(2.5);
  }

  protected override createContent(): Drawable {
    return this.itemContent = new ItemContent(this.model);
  }

  // #region IFilterable

  readonly isFilterable = true;

  get filterTerms(): Iterable<string> {
    return this.model.isValid ? [this.model.value.name] : [];
  }

  private _matchingFilter = true;

  get matchingFilter(): boolean {
    return this._matchingFilter;
  }

  set matchingFilter(value: boolean) {
    this._matchingFilter = value;

    if (this._matchingFilter)
      this.fadeIn(200);
    else
      this.hide();
  }

  filteringActive = false;

  // #endregion
}

/** The main content of the DrawableCollectionListItem. (DrawableCollectionListItem.ItemContent) */
class ItemContent extends CompositeDrawable {
  textBox!: ItemTextBox;

  constructor(private readonly collection: Live<BeatmapCollection>) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.height = item_height;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.internalChildren = [
      this.collection.isManaged
        ? new DeleteButton(this.collection).with({
          anchor: Anchor.CentreRight,
          origin: Anchor.CentreRight,
          isTextBoxHovered: v => this.textBox.receivePositionalInputAt(v),
        })
        : emptyDrawable(),
      new Container().with({
        relativeSizeAxes: Axes.Both,
        padding: MarginPadding.of({ right: this.collection.isManaged ? button_width : 0 }),
        children: [
          this.textBox = new ItemTextBox(this.collection).with({
            relativeSizeAxes: Axes.X,
            height: item_height,
            commitOnFocusLost: true,
          }),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // Bind late, as the collection name may change externally while still loading.
    this.textBox.current.value = this.collection.isValid ? this.collection.value.name : '';
    this.textBox.onCommit.add(this.onCommit);
  }

  private readonly onCommit = (): void => {
    if (this.collection.isManaged && this.collection.value.name !== this.textBox.current.value) {
      const name = this.textBox.current.value;
      void this.collection.performWrite(c => c.name = name);
    }
  };
}

const count_text_size = 12;

/** (DrawableCollectionListItem.ItemTextBox) */
class ItemTextBox extends OsuTextBox {
  protected override get leftRightPadding(): number {
    return item_height / 2;
  }

  private countText!: OsuSpriteText;

  constructor(private readonly collection: Live<BeatmapCollection>) {
    super();

    this.cornerRadius = 10;
    this.cornerExponent = Math.fround(2.5);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.backgroundUnfocused = colours.greySeaFoamDarker.darken(Math.fround(0.5));
    this.backgroundFocused = colours.greySeaFoam;

    if (this.collection.isManaged) {
      this.textContainer.height = Math.fround(this.textContainer.height * Math.fround((this.height - count_text_size) / this.height));
      this.textContainer.margin = MarginPadding.of({ bottom: count_text_size });

      this.textContainer.add(this.countText = new OsuSpriteText().with({
        anchor: Anchor.BottomLeft,
        origin: Anchor.TopLeft,
        depth: float_min_value,
        font: withFont(OsuFont.Default, { size: count_text_size, weight: FontWeight.SemiBold }),
        margin: MarginPadding.of({ top: 2, left: 2 }),
        colour: colours.yellow,
      }));

      // interestingly, it is not required to subscribe to change notifications on this collection at all for this to work correctly.
      // the reasoning for this is that `DrawableCollectionList` already takes out a subscription on the set of all `BeatmapCollection`s -
      // but that subscription does not only cover *changes to the set of collections* (i.e. addition/removal/rearrangement of collections),
      // but also covers *changes to the properties of collections*, which `BeatmapMD5Hashes` is one.
      // when a collection item changes due to `BeatmapMD5Hashes` changing, the list item is deleted and re-inserted, thus guaranteeing this to work correctly.
      const count = this.collection.performRead(c => c.beatmapMD5Hashes.length);
      // (CommonStrings.ItemsCount: "{0} item|{0} items")
      this.countText.text = `${count} ${count === 1 ? 'item' : 'items'}`;
    } else
      this.placeholderText = 'Create a new collection';

    return r;
  }
}

/** (DrawableCollectionListItem.DeleteButton) */
export class DeleteButton extends OsuClickableContainer {
  isTextBoxHovered!: (screenSpacePos: Vector2) => boolean;

  private dialogOverlay: IDialogOverlay | null = null;

  private realm!: RealmAccess;

  private fadeContainer!: Drawable;
  private background!: Drawable;

  constructor(private readonly collection: Live<BeatmapCollection>) {
    super();

    this.relativeSizeAxes = Axes.Y;

    this.width = button_width + item_height / 2; // add corner radius to cover with fill
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.dialogOverlay = dependencies.get(IDialogOverlay);
    this.realm = dependencies.resolve(RealmAccess);

    const colours = dependencies.resolve(OsuColour);

    this.child = this.fadeContainer = new Container().with({
      relativeSizeAxes: Axes.Both,
      alpha: Math.fround(0.1),
      children: [
        this.background = new Box().with({
          relativeSizeAxes: Axes.Both,
          colour: colours.red,
        }),
        new SpriteIcon().with({
          anchor: Anchor.CentreRight,
          origin: Anchor.Centre,
          x: Math.fround(-button_width * Math.fround(0.6)),
          size: new Vector2(10),
          icon: FontAwesome.Solid.Trash,
        }),
      ],
    });

    this.action = () => {
      if (this.collection.performRead(c => c.beatmapMD5Hashes.length) === 0)
        this.deleteCollection();
      else
        this.dialogOverlay?.push(new DeleteCollectionDialog(this.collection, () => this.deleteCollection()));
    };

    return r;
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return super.receivePositionalInputAt(screenSpacePos) && !this.isTextBoxHovered(screenSpacePos);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.fadeContainer.fadeTo(1, 100, Easing.Out);
    return false;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.fadeContainer.fadeTo(Math.fround(0.1), 100);
  }

  protected override onClick(e: ClickEvent): boolean {
    this.background.flashColour(Colour4.White, 150);

    return super.onClick(e);
  }

  /** (collection.PerformWrite(c => c.Realm!.Remove(c))) */
  private deleteCollection(): void {
    void this.realm.writeCollections(w => {
      const c = w.find(this.collection.id);
      if (c !== null)
        w.remove(c);
    });
  }
}
