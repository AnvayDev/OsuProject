// Ported from osu.Game/Collections/ManageCollectionsDialog.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuFocusedOverlayContainer } from '../graphics/containers/OsuFocusedOverlayContainer';
import { OsuColour } from '../graphics/OsuColour';
import { OsuFont } from '../graphics/OsuFont';
import { OsuSpriteText } from '../graphics/sprites/OsuSpriteText';
import { BasicSearchTextBox } from '../graphics/userInterface/BasicSearchTextBox';
import { IconButton } from '../graphics/userInterface/IconButton';
import { DuckParameters, MusicController } from '../overlays/MusicController';
import { Live } from '../database/Live';
import { RealmAccess } from '../database/RealmAccess';
import { BeatmapCollection } from './BeatmapCollection';
import { DrawableCollectionList } from './DrawableCollectionList';
import { DrawableCollectionListItem } from './DrawableCollectionListItem';

const enter_duration = 500;
const exit_duration = 200;

export class ManageCollectionsDialog extends OsuFocusedOverlayContainer {
  protected override get popInSampleName(): string | null {
    return 'UI/overlay-big-pop-in';
  }

  protected override get popOutSampleName(): string | null {
    return 'UI/overlay-big-pop-out';
  }

  private duckOperation: { dispose(): void } | null = null;

  private searchTextBox!: BasicSearchTextBox;
  private list!: DrawableCollectionList;

  private musicController: MusicController | null = null;

  constructor() {
    super();

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    this.relativeSizeAxes = Axes.Both;
    this.size = new Vector2(Math.fround(0.5), Math.fround(0.8));

    this.masking = true;
    this.cornerRadius = 10;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.musicController = dependencies.get(MusicController);

    const colours = dependencies.resolve(OsuColour);

    this.children = [
      new Box().with({
        colour: colours.greySeaFoamDark,
        relativeSizeAxes: Axes.Both,
      }),
      new Container().with({
        relativeSizeAxes: Axes.Both,
        child: new GridContainer().with({
          relativeSizeAxes: Axes.Both,
          rowDimensions: [
            new Dimension(GridSizeMode.AutoSize),
          ],
          content: [
            [
              new Container().with({
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                children: [
                  new OsuSpriteText().with({
                    anchor: Anchor.Centre,
                    origin: Anchor.Centre,
                    text: 'Manage Collections',
                    font: OsuFont.getFont({ size: 30 }),
                    padding: MarginPadding.of({ vertical: 10 }),
                  }),
                  new IconButton().with({
                    anchor: Anchor.CentreRight,
                    origin: Anchor.CentreRight,
                    icon: FontAwesome.Solid.Times,
                    colour: colours.greySeaFoamDarker,
                    scale: new Vector2(Math.fround(0.8)),
                    x: -10,
                    action: () => this.state.value = Visibility.Hidden,
                  }),
                ],
              }),
            ],
            [
              new Container().with({
                relativeSizeAxes: Axes.Both,
                masking: true,
                children: [
                  new Box().with({
                    relativeSizeAxes: Axes.Both,
                    colour: colours.greySeaFoamDarker,
                  }),
                  new Container().with({
                    relativeSizeAxes: Axes.Both,
                    padding: new MarginPadding(10),
                    children: [
                      this.list = new DrawableCollectionList().with({
                        padding: MarginPadding.of({ vertical: 50 }),
                        relativeSizeAxes: Axes.Both,
                      }),
                      this.searchTextBox = new BasicSearchTextBox().with({
                        relativeSizeAxes: Axes.X,
                        height: 40,
                        releaseFocusOnCommit: false,
                        holdFocus: true,
                        placeholderText: 'type to search',
                      }),
                      new Container().with({
                        relativeSizeAxes: Axes.X,
                        autoSizeAxes: Axes.Y,
                        anchor: Anchor.BottomLeft,
                        origin: Anchor.BottomLeft,
                        children: [
                          new NewCollectionEntryItem(),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          ],
        }),
      }),
    ];
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.searchTextBox.current.bindValueChanged(() => {
      this.list.searchTerm = this.searchTextBox.current.value;
    });
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.duckOperation?.dispose();
  }

  protected override popIn(): void {
    this.duckOperation = this.musicController?.duck(Object.assign(new DuckParameters(), {
      duckVolumeTo: 1,
      duckDuration: 100,
      restoreDuration: 100,
    })) ?? null;

    this.fadeIn(enter_duration, Easing.OutQuint);
    this.scaleTo(Math.fround(0.9)).then().scaleTo(1, enter_duration, Easing.OutQuint);
  }

  protected override popOut(): void {
    super.popOut();

    this.duckOperation?.dispose();

    this.fadeOut(exit_duration, Easing.OutQuint);
    this.scaleTo(Math.fround(0.9), exit_duration);

    // Ensure that textboxes commit
    this.getContainingFocusManager()?.triggerFocusContention(this);
  }
}

/** (ManageCollectionsDialog.NewCollectionEntryItem) */
class NewCollectionEntryItem extends DrawableCollectionListItem {
  private realm!: RealmAccess;

  constructor() {
    super(Live.unmanaged(new BeatmapCollection()), false);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.realm = dependencies.resolve(RealmAccess);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.textBox.onCommit.add(() => {
      if (!this.textBox.text)
        return;

      const name = this.textBox.text;
      void this.realm.writeCollections(r => r.add(new BeatmapCollection(name)));
      this.textBox.text = '';
    });
  }
}
