// Ported from osu.Game/Screens/Select/NoResultsPlaceholder.cs
// The first-run setup overlay isn't ported (its link does nothing), and "searching online" opens the osu! website's beatmap listing, which is
// what OsuGame's beatmap listing overlay shows for LinkAction.SearchBeatmapSet.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { LinkFlowContainer } from '../../graphics/containers/LinkFlowContainer';
import { GhostIcon } from '../../graphics/GhostIcon';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import type { FilterCriteria } from './FilterCriteria';

/** ({0:N1}) */
const formatN1 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class NoResultsPlaceholder extends VisibilityContainer {
  requestClearFilterText: (() => void) | null = null;

  private filter: FilterCriteria | null = null;

  private textFlow!: LinkFlowContainer;

  private icon!: GhostIcon;

  private beatmaps!: BeatmapManager;

  private config!: OsuConfigManager;

  protected override get startHidden(): boolean {
    return true;
  }

  /** C#'s Filter (the private field takes the name `filter`). */
  set filterCriteria(value: FilterCriteria) {
    if (this.filter === value)
      return;

    this.filter = value;
    this.scheduler.addOnce(this.updateText);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmaps = dependencies.resolve(BeatmapManager);
    this.config = dependencies.resolve(OsuConfigManager);

    this.relativeSizeAxes = Axes.Both;

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    this.internalChildren = [
      new FillFlowContainer().with({
        direction: FillDirection.Vertical,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        width: 300,
        autoSizeAxes: Axes.Y,
        children: [
          new Container().with({
            anchor: Anchor.TopCentre,
            origin: Anchor.TopCentre,
            margin: new MarginPadding(10),
            size: new Vector2(50),
            child: this.icon = new GhostIcon().with({
              relativeSizeAxes: Axes.Both,
            }),
          }),
          new OsuSpriteText().with({
            anchor: Anchor.TopCentre,
            origin: Anchor.TopCentre,
            font: OsuFont.Style.Title,
            text: 'No matching beatmaps',
          }),
          this.textFlow = new LinkFlowContainer().with({
            alpha: 0,
            alwaysPresent: true,
            anchor: Anchor.TopCentre,
            origin: Anchor.TopCentre,
            padding: MarginPadding.of({ top: 20 }),
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
          }),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.icon.loop(t =>
      t.moveToY(-10, 2000, Easing.InOutSine)
        .then()
        .moveToY(0, 2000, Easing.InOutSine),
    );
  }

  protected override popIn(): void {
    this.fadeIn(600, Easing.OutQuint);

    this.scheduler.addOnce(this.updateText);
  }

  protected override popOut(): void {
    this.fadeOut(200, Easing.OutQuint);
  }

  // (a field so that Scheduler.AddOnce sees the same delegate each time)
  private readonly updateText = (): void => {
    // TODO: Refresh this text when new beatmaps are imported. Right now it won't get up-to-date suggestions.

    // Bounce should play every time the filter criteria is updated.
    this.scaleTo(0.9)
      .scaleTo(1, 1000, Easing.OutQuint);

    this.textFlow.fadeInFromZero(800, Easing.OutQuint);

    this.textFlow.clear();

    const filter = this.filter;

    if (this.beatmaps.queryBeatmapSet(s => !s.isProtected && !s.deletePending) === null) {
      this.addBulletPoint();
      this.textFlow.addText('Consider running the "');
      this.textFlow.addLink('First-run setup', () => {});
      this.textFlow.addText('" to download or import some beatmaps!');
    } else {
      this.textFlow.addParagraph('No beatmaps match your filter criteria!');
      this.textFlow.addParagraph('');

      if (filter?.searchText) {
        this.addBulletPoint();
        this.textFlow.addText('Try ');
        this.textFlow.addLink('clearing', () => {
          this.requestClearFilterText?.();
        });

        this.textFlow.addText(' your current search criteria.');
      }

      if (filter?.userStarDifficulty.hasFilter === true) {
        this.addBulletPoint();
        this.textFlow.addText('Try ');
        this.textFlow.addLink('removing', () => {
          this.config.setValue(OsuSetting.DisplayStarsMinimum, 0.0);
          this.config.setValue(OsuSetting.DisplayStarsMaximum, 10.1);
        });

        const lowerStar = formatN1(filter.userStarDifficulty.min ?? 0);
        const upperStar = filter.userStarDifficulty.max === null ? '∞' : formatN1(filter.userStarDifficulty.max);

        this.textFlow.addText(` the ${lowerStar} - ${upperStar} star difficulty filter.`);
      }

      // TODO: Add realm queries to hint at which ruleset results are available in (and allow clicking to switch).
      // TODO: Make this message more certain by ensuring the osu! beatmaps exist before suggesting.
      if (filter?.ruleset?.onlineID !== 0 && filter?.allowConvertedBeatmaps === false) {
        this.addBulletPoint();
        this.textFlow.addText('Try ');
        this.textFlow.addLink('enabling', () => this.config.setValue(OsuSetting.ShowConvertedBeatmaps, true));
        this.textFlow.addText(' automatic conversion!');
      }
    }

    if (filter?.searchText) {
      this.addBulletPoint();
      this.textFlow.addText('Try ');
      this.textFlow.addLink('searching online', `https://osu.ppy.sh/beatmapsets?q=${encodeURIComponent(filter.searchText)}`);
      this.textFlow.addText(` for "${filter.searchText}".`);
    }
    // TODO: add clickable link to reset criteria.
  };

  private addBulletPoint(): void {
    this.textFlow.newLine();
    this.textFlow.addIcon(FontAwesome.Solid.Circle, i => {
      i.padding = MarginPadding.of({ top: 24, right: 15 });
      i.scale = i.scale.mul(0.3);
    });
  }
}
