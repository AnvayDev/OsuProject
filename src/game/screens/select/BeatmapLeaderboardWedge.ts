// Ported from osu.Game/Screens/Select/BeatmapLeaderboardWedge.cs
// Offline there are no scores: no score store (realm) and no API. LeaderboardManager.FetchWithCriteria is reduced to what it yields here —
// local scope: an empty score list (as the realm subscription delivers on its first callback); online scopes: NotLoggedIn. So score drawables
// (BeatmapLeaderboardScore), the personal best display, the per-score fade handling and context menus aren't ported; the scroll container
// stays for its input handling.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { MouseDownEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuScrollContainer } from '../../graphics/containers/OsuScrollContainer';
import { LoadingLayer } from '../../graphics/userInterface/LoadingLayer';
import { OsuGame } from '../../OsuGame';
import { LeaderboardSortMode } from '../../online/leaderboards/LeaderboardSortMode';
import { LeaderboardState } from '../../online/leaderboards/LeaderboardState';
import { ClickablePlaceholder, LoginPlaceholder, MessagePlaceholder, type Placeholder } from '../../online/placeholders/Placeholder';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { BeatmapLeaderboardScope } from '../play/leaderboards/BeatmapLeaderboardScope';

/** (BeatmapLeaderboardScore.HEIGHT) */
const score_height = 50;

/** (LeaderboardScores: the result of a fetch.) */
interface LeaderboardScores {
  readonly failState: LeaderboardState | null;
}

export class BeatmapLeaderboardWedge extends VisibilityContainer {
  static readonly SPACING_BETWEEN_SCORES = 4;

  readonly scope = new Bindable<BeatmapLeaderboardScope>(BeatmapLeaderboardScope.Local);

  readonly sorting = new Bindable<LeaderboardSortMode>(LeaderboardSortMode.Score);

  readonly filterBySelectedMods = new BindableBool();

  private beatmap!: Bindable<WorkingBeatmap>;

  private ruleset!: Bindable<RulesetInfo>;

  private placeholderContainer!: Container<Placeholder>;
  private placeholder: Placeholder | null = null;

  private scoresScroll!: OsuScrollContainer;
  private loading!: LoadingLayer;

  private readonly fetchedScores = new Bindable<LeaderboardScores | null>(null);

  /** (LeaderboardManager.CurrentCriteria.Beatmap) */
  private currentCriteriaBeatmap: BeatmapInfo | null = null;

  // Blocking mouse down is required to avoid song select's background reveal logic happening while hovering scores.
  // Our horizontal alignment doesn't really align with the rest of the sheared components (protrudes a touch to the right) which makes
  // it complicated to handle this at a higher level.
  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.scoresScroll.receivePositionalInputAt(screenSpacePos);
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return true;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();

    this.relativeSizeAxes = Axes.Both;

    this.child = new Container().with({
      relativeSizeAxes: Axes.Both,
      children: [
        this.scoresScroll = new OsuScrollContainer().with({
          relativeSizeAxes: Axes.Both,
          scrollbarVisible: false,
          shear: OsuGame.SHEAR,
          child: new Container().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            padding: MarginPadding.of({
              top: 5,
              // Left padding offsets the shear to create a visually appealing list display.
              left: 80,
              // Bottom padding ensures the last entry's full width is displayed
              // (ie it is fully on screen after shear is considered).
              bottom: score_height * 3,
            }),
          }),
        }),
        this.placeholderContainer = new Container<Placeholder>().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
        }),
        this.loading = new LoadingLayer(),
      ],
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.scope.bindValueChanged(() => this.refetchScores());
    this.sorting.bindValueChanged(() => this.refetchScores());
    this.filterBySelectedMods.bindValueChanged(() => this.refetchScores());
    this.beatmap.bindValueChanged(() => this.refetchScores());
    this.ruleset.bindValueChanged(() => this.refetchScores());

    this.refetchScores();
  }

  protected override popIn(): void {
    this.fadeIn(300, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.fadeOut(300, Easing.OutQuint);
  }

  private initialFetchComplete = false;

  private refetchOperation: ScheduledDelegate | null = null;

  refetchScores = (): void => {
    this.setScores();

    if (this.beatmap.isDefault) {
      this.setState(LeaderboardState.NoneSelected);
      return;
    }

    this.setState(LeaderboardState.Retrieving);

    const fetchScope = this.scope.value;

    this.refetchOperation?.cancel();
    this.refetchOperation = this.scheduler.addDelayed(() => {
      // (LeaderboardManager.FetchWithCriteria, offline: see the header.)
      this.currentCriteriaBeatmap = this.beatmap.value.beatmapInfo;
      this.fetchedScores.value = { failState: fetchScope === BeatmapLeaderboardScope.Local ? null : LeaderboardState.NotLoggedIn };

      if (!this.initialFetchComplete) {
        // Schedule is important here to avoid handling changes after this drawable is disposed.
        this.fetchedScores.bindValueChanged(() => this.schedule(() => this.updateScores()), true);
        this.initialFetchComplete = true;
      }
    }, this.initialFetchComplete && fetchScope !== BeatmapLeaderboardScope.Local ? 300 : 0);
  };

  private updateScores(): void {
    const scores = this.fetchedScores.value;

    if (scores == null) return;

    // because leaderboard refetches are debounced, it is technically possible for the global leaderboard manager
    // to contain scores for a different beatmap than the ones the wedge is currently on.
    // in this case, ignore the incoming scores to avoid briefly flashing the wrong leaderboard.
    if (this.currentCriteriaBeatmap?.equals(this.beatmap.value.beatmapInfo) !== true)
      return;

    if (scores.failState !== null)
      this.setState(scores.failState);
    else
      this.setScores();
  }

  /** (SetScores with no scores, the only list offline.) */
  protected setScores(): void {
    this.setState(LeaderboardState.Success);
    this.setState(LeaderboardState.NoScores);
  }

  private displayedState = LeaderboardState.Success;

  private loadingShowDelegate: ScheduledDelegate | null = null;

  protected setState(state: LeaderboardState): void {
    if (state === this.displayedState)
      return;

    this.loading.hide();

    if (state === LeaderboardState.Retrieving) {
      // Slight delay so this doesn't display for a few silly frames for local score retrievals.
      this.loadingShowDelegate ??= this.scheduler.addDelayed(() => this.loading.show(), 250);
    } else {
      this.loadingShowDelegate?.cancel();
      this.loadingShowDelegate = null;
    }

    this.displayedState = state;

    this.placeholder?.fadeOut(150, Easing.OutQuint).expire();
    this.placeholder = this.getPlaceholderFor(state);

    if (this.placeholder === null)
      return;

    this.placeholderContainer.child = this.placeholder;

    this.placeholder.scaleTo(0.8).then().scaleTo(1, 900, Easing.OutQuint);
    this.placeholder.fadeInFromZero(300, Easing.OutQuint);
  }

  private getPlaceholderFor(state: LeaderboardState): Placeholder | null {
    switch (state) {
      case LeaderboardState.NetworkFailure: {
        const placeholder = new ClickablePlaceholder("Couldn't fetch scores!", FontAwesome.Solid.Sync);
        placeholder.action = this.refetchScores;
        return placeholder;
      }

      case LeaderboardState.NoneSelected:
        return new MessagePlaceholder('Please select a beatmap!');

      case LeaderboardState.RulesetUnavailable:
        return new MessagePlaceholder('Leaderboards are not available for this ruleset!');

      case LeaderboardState.BeatmapUnavailable:
        return new MessagePlaceholder('Leaderboards are not available for this beatmap!');

      case LeaderboardState.NoScores:
        return new MessagePlaceholder('No records yet!');

      case LeaderboardState.NotLoggedIn:
        return new LoginPlaceholder('Please sign in to view online leaderboards!');

      case LeaderboardState.NotSupporter:
        return new MessagePlaceholder('Please invest in an osu!supporter tag to view this leaderboard!');

      case LeaderboardState.NoTeam:
        return new MessagePlaceholder('You are not on a team. Maybe you should join one!');

      case LeaderboardState.Retrieving:
        return null;

      case LeaderboardState.Success:
        return null;
    }
  }
}
