// Ported from osu.Game/Screens/Select/BeatmapDetailsArea.Header.cs
// Not ported yet: the sort and scope dropdowns (ShearedDropdown), which arrive with the framework Dropdown. Until then their Current bindables
// exist without a drawable and are read and written as C# does.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ShearedToggleButton } from '../../graphics/userInterface/ShearedToggleButton';
import { LeaderboardSortMode } from '../../online/leaderboards/LeaderboardSortMode';
import { BeatmapLeaderboardScope } from '../play/leaderboards/BeatmapLeaderboardScope';
import { WedgeSelector } from './BeatmapDetailsArea.WedgeSelector';
import { BeatmapDetailTab } from './BeatmapDetailTab';
import { SongSelect } from './SongSelect';

export enum HeaderSelection {
  Details,
  Ranking,
}

const describeSelection = (selection: HeaderSelection): string => selection === HeaderSelection.Details ? 'Details' : 'Ranking';

/** (BeatmapDetailsArea.Header) */
export class Header extends CompositeDrawable {
  private tabControl!: WedgeSelector<HeaderSelection>;
  private leaderboardControls!: FillFlowContainer;

  /** (scopeDropdown.Current) */
  private readonly scopeCurrent = new Bindable<BeatmapLeaderboardScope>(BeatmapLeaderboardScope.Local);
  /** (sortDropdown.Current) */
  private readonly sortCurrent = new Bindable<LeaderboardSortMode>(LeaderboardSortMode.Score);
  private selectedModsToggle!: ShearedToggleButton;

  get type(): Bindable<HeaderSelection> {
    return this.tabControl.current;
  }

  get scope(): Bindable<BeatmapLeaderboardScope> {
    return this.scopeCurrent;
  }

  private readonly configDetailTab = new Bindable<BeatmapDetailTab>(BeatmapDetailTab.Details);

  get sorting(): Bindable<LeaderboardSortMode> {
    return this.sortCurrent;
  }

  private readonly configLeaderboardSortMode = new Bindable<LeaderboardSortMode>(LeaderboardSortMode.Score);

  get filterBySelectedMods(): Bindable<boolean> {
    return this.selectedModsToggle.active;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const config = dependencies.resolve(OsuConfigManager);

    this.internalChildren = [
      new Container().with({
        relativeSizeAxes: Axes.Both,
        padding: MarginPadding.of({ left: SongSelect.WEDGE_CONTENT_MARGIN, right: 5 }),
        children: [
          this.tabControl = new WedgeSelector<HeaderSelection>(20, [HeaderSelection.Details, HeaderSelection.Ranking], describeSelection).with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            width: 200,
            height: 22,
            margin: MarginPadding.of({ top: 2 }),
            isSwitchable: true,
          }),
          this.leaderboardControls = new FillFlowContainer().with({
            anchor: Anchor.CentreRight,
            origin: Anchor.CentreRight,
            relativeSizeAxes: Axes.X,
            height: 30,
            spacing: new Vector2(5, 0),
            direction: FillDirection.Horizontal,
            padding: MarginPadding.of({ left: 258 }),
            children: [
              this.selectedModsToggle = new ShearedToggleButton().with({
                anchor: Anchor.CentreRight,
                origin: Anchor.CentreRight,
                autoSizeAxes: Axes.X,
                text: 'Selected Mods',
                height: 30,
                // Eyeballed to make spacing match. Because shear is silly and implemented in different ways between dropdown and button.
                margin: MarginPadding.of({ left: -9.2 }),
              }),
            ],
          }),
        ],
      }),
    ];

    this.scopeCurrent.value = BeatmapLeaderboardScope.Global;

    config.bindWith(OsuSetting.BeatmapDetailTab, this.configDetailTab);
    config.bindWith(OsuSetting.BeatmapLeaderboardSortMode, this.configLeaderboardSortMode);
    config.bindWith(OsuSetting.BeatmapDetailModsFilter, this.selectedModsToggle.active);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.scopeCurrent.value = Header.tryMapDetailTabToLeaderboardScope(this.configDetailTab.value) ?? this.scopeCurrent.value;
    this.scopeCurrent.bindValueChanged(() => this.updateConfigDetailTab());

    this.tabControl.current.value = this.configDetailTab.value === BeatmapDetailTab.Details ? HeaderSelection.Details : HeaderSelection.Ranking;
    this.tabControl.current.bindValueChanged(v => {
      this.leaderboardControls.fadeTo(v.newValue === HeaderSelection.Ranking ? 1 : 0, 300, Easing.OutQuint);
      this.updateConfigDetailTab();
    }, true);

    this.scopeCurrent.bindValueChanged(scope => {
      this.sortCurrent.disabled = false;

      if (scope.newValue === BeatmapLeaderboardScope.Local) {
        this.sortCurrent.bindTo(this.configLeaderboardSortMode);
      } else {
        // future implementation when we have web-side support.
        this.sortCurrent.unbindFrom(this.configLeaderboardSortMode);
        this.sortCurrent.value = LeaderboardSortMode.Score;
        this.sortCurrent.disabled = true;
      }
    }, true);
  }

  // #region Reading / writing state from / to configuration

  private updateConfigDetailTab(): void {
    switch (this.tabControl.current.value) {
      case HeaderSelection.Details:
        this.configDetailTab.value = BeatmapDetailTab.Details;
        return;

      case HeaderSelection.Ranking:
        this.configDetailTab.value = Header.mapLeaderboardScopeToDetailTab(this.scopeCurrent.value);
        return;
    }
  }

  private static tryMapDetailTabToLeaderboardScope(tab: BeatmapDetailTab): BeatmapLeaderboardScope | null {
    switch (tab) {
      case BeatmapDetailTab.Local:
        return BeatmapLeaderboardScope.Local;

      case BeatmapDetailTab.Country:
        return BeatmapLeaderboardScope.Country;

      case BeatmapDetailTab.Global:
        return BeatmapLeaderboardScope.Global;

      case BeatmapDetailTab.Friends:
        return BeatmapLeaderboardScope.Friend;

      case BeatmapDetailTab.Team:
        return BeatmapLeaderboardScope.Team;

      default:
        return null;
    }
  }

  private static mapLeaderboardScopeToDetailTab(scope: BeatmapLeaderboardScope): BeatmapDetailTab {
    switch (scope) {
      case BeatmapLeaderboardScope.Local:
        return BeatmapDetailTab.Local;

      case BeatmapLeaderboardScope.Country:
        return BeatmapDetailTab.Country;

      case BeatmapLeaderboardScope.Global:
        return BeatmapDetailTab.Global;

      case BeatmapLeaderboardScope.Friend:
        return BeatmapDetailTab.Friends;

      case BeatmapLeaderboardScope.Team:
        return BeatmapDetailTab.Team;
    }
  }

  // #endregion
}
