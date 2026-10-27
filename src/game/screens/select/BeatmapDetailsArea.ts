// Ported from osu.Game/Screens/Select/BeatmapDetailsArea.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { ShearAligningWrapper } from '../../graphics/containers/ShearAligningWrapper';
import { OsuGame } from '../../OsuGame';
import { Header, HeaderSelection } from './BeatmapDetailsArea.Header';
import { BeatmapLeaderboardWedge } from './BeatmapLeaderboardWedge';
import { BeatmapMetadataWedge } from './BeatmapMetadataWedge';
import { SongSelect } from './SongSelect';

/** The left portion of the song select screen which houses the metadata or leaderboards wedge, along with controls to switch between them and adjust specifics. */
export class BeatmapDetailsArea extends VisibilityContainer {
  private header!: Header;
  private contentContainer!: Container;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const header_height = 35;

    this.internalChildren = [
      new ShearAligningWrapper(this.header = new Header().with({
        shear: OsuGame.SHEAR.neg(),
        relativeSizeAxes: Axes.X,
        height: header_height,
      })),
      new ShearAligningWrapper(this.contentContainer = new Container().with({
        shear: OsuGame.SHEAR.neg(),
        padding: MarginPadding.of({ top: header_height }),
        relativeSizeAxes: Axes.Both,
      })).with({
        depth: 1,
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.header.type.bindValueChanged(() => this.updateDisplay(), true);
  }

  protected override popIn(): void {
    this.moveToX(0, SongSelect.ENTER_DURATION, Easing.OutQuint)
      .fadeIn(SongSelect.ENTER_DURATION / 3, Easing.In);
  }

  protected override popOut(): void {
    this.moveToX(-150, SongSelect.ENTER_DURATION, Easing.OutQuint)
      .fadeOut(SongSelect.ENTER_DURATION / 3, Easing.In);
  }

  private currentContent: Drawable | null = null;

  private updateDisplay(): void {
    if (this.currentContent !== null) {
      this.currentContent.hide();
      this.currentContent.expire();
    }

    switch (this.header.type.value) {
      default:
      case HeaderSelection.Details:
        this.currentContent = new BeatmapMetadataWedge();
        break;

      case HeaderSelection.Ranking: {
        const leaderboardWedge = new BeatmapLeaderboardWedge();
        leaderboardWedge.scope.bindTarget = this.header.scope;
        leaderboardWedge.sorting.bindTarget = this.header.sorting;
        leaderboardWedge.filterBySelectedMods.bindTarget = this.header.filterBySelectedMods;
        this.currentContent = leaderboardWedge;
        break;
      }
    }

    this.contentContainer.add(this.currentContent);
    this.currentContent.show();
  }

  refresh(): void {
    if (this.currentContent instanceof BeatmapLeaderboardWedge)
      this.currentContent.refetchScores();
  }
}
