// Ported from osu.Game/Screens/Select/SongSelect.cs
// Not ported yet: the title wedge and details area (the left wedges), which follow. Not ported at all: mods (ModSelectOverlay, ModSpeedHotkeyHandler), skinning (SkinnableContainer), the volume
// overlay (GlobalScrollAdjustsVolume), context menus / popovers (OsuContextMenuContainer, PopoverContainer pass their child through), dialogs,
// the difficulty recommender (online user statistics: the first beatmap is recommended), online lookups and gameplay.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { HoverEvent, KeyDownEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import type { InputManager } from '@fw/input/InputManager';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Logger } from '@fw/logging/Logger';
import type { ScreenExitEvent, ScreenTransitionEvent } from '@fw/screens/IScreen';
import { RunState, type ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { allowGameplayWithRuleset } from '../../beatmaps/BeatmapInfoExtensions';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import type { CarouselItem } from '../../graphics/carousel/CarouselItem';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OsuGame } from '../../OsuGame';
import { DuckParameters, MusicController, type TrackChangeDirection } from '../../overlays/MusicController';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OverlayColourScheme } from '../../overlays/OverlayColourScheme';
import type { OsuLogo } from '../menu/OsuLogo';
import { ScreenWithBeatmapBackground } from '../play/ScreenWithBeatmapBackground';
import { ScreenFooter } from '../footer/ScreenFooter';
import type { ScreenFooterButton } from '../footer/ScreenFooterButton';
import { BeatmapCarousel } from './BeatmapCarousel';
import { FooterButtonMods } from './FooterButtonMods';
import { FooterButtonOptions } from './FooterButtonOptions';
import { FooterButtonRandom } from './FooterButtonRandom';
import { FilterControl } from './FilterControl';
import type { FilterCriteria } from './FilterCriteria';
import type { GroupedBeatmap } from './GroupDefinition';
import { ISongSelect } from './ISongSelect';
import { LeftSideInteractionContainer } from './LeftSideInteractionContainer';
import { NoResultsPlaceholder } from './NoResultsPlaceholder';
import { Key } from '@fw/input/Key';
import type { DrawableTrack } from '@fw/graphics/audio/DrawableTrack';

const logo_scale = 0.4;
const fade_duration = 300;

const screen_footer_height = ScreenFooter.HEIGHT;

const float_min_value = -3.4028234663852886e38;

export abstract class SongSelect extends ScreenWithBeatmapBackground implements IKeyBindingHandler<GlobalAction>, ISongSelect {
  readonly keyBindingActionTypes = [GlobalAction];

  /**
   * A debounce that governs how long after a panel is selected before the rest of song select (and the game at large)
   * updates to show that selection.
   *
   * This is intentionally slightly higher than key repeat, but low enough to not impede user experience.
   */
  static readonly SELECTION_DEBOUNCE = 150;

  /**
   * A general "global" debounce to be applied to anything aggressive difficulty calculation at song select,
   * either after selection or after a panel comes on screen. Value should be low enough that users don't complain,
   * but otherwise as high as possible to reduce overheads.
   */
  static readonly DIFFICULTY_CALCULATION_DEBOUNCE = 150;

  static readonly CORNER_RADIUS_HIDE_OFFSET = 20;
  static readonly WEDGE_CONTENT_MARGIN = SongSelect.CORNER_RADIUS_HIDE_OFFSET + OsuGame.SCREEN_EDGE_MARGIN;
  static readonly ENTER_DURATION = 600;

  /** Whether this song select instance should take control of the global track, applying looping and preview offsets. */
  protected controlGlobalMusic = true;

  /** Whether this song select instance should allow scoping down to a specific beatmap set, exposing other difficulties that are otherwise hidden by filter criteria. */
  protected set supportScoping(value: boolean) {
    this._scopedBeatmapSet.disabled = !value;
  }

  /** Whether the osu! logo should be shown at the bottom-right of the screen. */
  protected showOsuLogo = true;

  /** Additional padding to be added to the title wedge. Generally set to show external content in this space. */
  topPadding = 0;

  // Blue is the most neutral choice, so I'm using that for now.
  // Purple makes the most sense to match the "gameplay" flow, but it's a bit too strong for the current design.
  // TODO: Colour scheme choice should probably be customisable by the user.
  private readonly colourProvider = new OverlayColourProvider(OverlayColourScheme.Blue);

  private carousel!: BeatmapCarousel;

  private _filterControl!: FilterControl;

  protected get filterControl(): FilterControl {
    return this._filterControl;
  }

  private wedgesContainer!: FillFlowContainer;
  private rightGradientBackground!: Box;
  private mainContent!: Container;

  private mainGridContainer!: GridContainer;

  private noResultsPlaceholder!: NoResultsPlaceholder;

  override get applyModTrackAdjustments(): boolean | null {
    return true;
  }

  override get showFooter(): boolean {
    return true;
  }

  private errorSample: Sample | null = null;

  private beatmaps!: BeatmapManager;

  private music!: MusicController;

  private inputManager!: InputManager;

  private configBackgroundBlur!: Bindable<boolean>;
  private showConvertedBeatmaps!: Bindable<boolean>;

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));

    // [Cached] colourProvider, and ISongSelect is a [Cached] interface.
    dependencies.cache(this.colourProvider);
    dependencies.cacheAs(ISongSelect, this as ISongSelect);

    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmaps = dependencies.resolve(BeatmapManager);
    this.music = dependencies.resolve(MusicController);

    const audio = dependencies.resolve(AudioManager);
    const config = dependencies.resolve(OsuConfigManager);

    void audio.samples.get('UI/generic-error').then(s => this.errorSample = s);

    let carousel!: BeatmapCarousel;
    let filterControl!: FilterControl;

    this.addRangeInternal([
      this.mainContent = new Container().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        relativeSizeAxes: Axes.Both,
        padding: MarginPadding.of({ bottom: screen_footer_height }),
        children: [
          new Box().with({
            relativeSizeAxes: Axes.Both,
            width: 0.6,
            colour: ColourInfo.gradientHorizontal(Colour4.Black.opacity(0.3), Colour4.Black.opacity(0)),
          }),
          this.mainGridContainer = new GridContainer().with({ // used for max width implementation
            relativeSizeAxes: Axes.Both,
            content: [
              [
                new Container().with({
                  relativeSizeAxes: Axes.Both,
                  // Ensure the left components are on top of the carousel both visually (although they should never overlay)
                  // but more importantly, for input purposes to allow the scroll-to-selection logic to override carousel's
                  // screen-wide scroll handling.
                  depth: float_min_value,
                  shear: OsuGame.SHEAR,
                  padding: MarginPadding.of({
                    top: -SongSelect.CORNER_RADIUS_HIDE_OFFSET,
                    left: -SongSelect.CORNER_RADIUS_HIDE_OFFSET,
                  }),
                  children: [
                    new Container().with({
                      // Pad enough to only reset scroll when well into the left wedge areas.
                      padding: MarginPadding.of({ right: 40 }),
                      relativeSizeAxes: Axes.Both,
                      child: new LeftSideInteractionContainer(() => this.carousel.scrollToSelection()).with({
                        relativeSizeAxes: Axes.Both,
                      }),
                    }),
                    this.wedgesContainer = new FillFlowContainer().with({
                      relativeSizeAxes: Axes.Both,
                      spacing: new Vector2(0, 4),
                      direction: FillDirection.Vertical,
                    }),
                  ],
                }),
                emptyDrawable(),
                new Container().with({
                  relativeSizeAxes: Axes.Both,
                  children: [
                    this.rightGradientBackground = new Box().with({
                      anchor: Anchor.TopRight,
                      origin: Anchor.TopRight,
                      colour: ColourInfo.gradientHorizontal(Colour4.Black.opacity(0.0), Colour4.Black.opacity(0.5)),
                      relativeSizeAxes: Axes.Both,
                    }),
                    new Container().with({
                      relativeSizeAxes: Axes.Both,
                      padding: MarginPadding.of({
                        top: FilterControl.HEIGHT_FROM_SCREEN_TOP + 5,
                        bottom: 5,
                      }),
                      children: [
                        carousel = new BeatmapCarousel().with({
                          bleedTop: FilterControl.HEIGHT_FROM_SCREEN_TOP + 5,
                          bleedBottom: screen_footer_height + 5,
                          relativeSizeAxes: Axes.Both,
                          requestPresentBeatmap: b => this.selectAndRun(b, () => this.onStart()),
                          requestSelection: b => this.queueBeatmapSelection(b),
                          requestRecommendedSelection: b => this.requestRecommendedSelection(b),
                          newItemsPresented: items => this.newItemsPresented(items),
                        }),
                        this.noResultsPlaceholder = new NoResultsPlaceholder().with({
                          requestClearFilterText: () => this.filterControl.search(''),
                        }),
                      ],
                    }),
                    filterControl = new FilterControl().with({
                      anchor: Anchor.TopRight,
                      origin: Anchor.TopRight,
                      relativeSizeAxes: Axes.X,
                    }),
                  ],
                }),
              ],
            ],
          }),
        ],
      }),
    ]);

    this.carousel = carousel;
    this._filterControl = filterControl;
    filterControl.scopedBeatmapSet.bindTarget = this._scopedBeatmapSet;

    this.configBackgroundBlur = config.getBindable<boolean>(OsuSetting.SongSelectBackgroundBlur);
    this.configBackgroundBlur.bindValueChanged(() => {
      if (!this.isCurrentScreen())
        return;

      this.updateBackgroundDim();
    });

    this.showConvertedBeatmaps = config.getBindable<boolean>(OsuSetting.ShowConvertedBeatmaps);

    return r;
  }

  private requestRecommendedSelection(groupedBeatmaps: GroupedBeatmap[]): void {
    // (DifficultyRecommender needs the online user's statistics: without it, the first beatmap is used.)
    const recommendedBeatmap = groupedBeatmaps[0].beatmap;
    this.queueBeatmapSelection(groupedBeatmaps.find(gb => gb.beatmap.equals(recommendedBeatmap))!);
  }

  /**
   * Called when a selection is made to progress away from the song select screen.
   * This is the default action which should be provided to selectAndRun.
   */
  protected abstract onStart(): void;

  override createFooterButtons(): ScreenFooterButton[] {
    // (FooterButtonMods: mods aren't ported, so there is no overlay or mod selection to give it.)
    return [
      new FooterButtonMods().with({
        hotkey: GlobalAction.ToggleModSelection,
      }),
      new FooterButtonRandom().with({
        nextRandom: () => {
          if (!this.carousel.nextRandom())
            this.errorSample?.play();
        },
        previousRandom: () => {
          if (!this.carousel.previousRandom())
            this.errorSample?.play();
        },
      }),
      new FooterButtonOptions().with({
        hotkey: GlobalAction.ToggleBeatmapOptions,
      }),
    ];
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.inputManager = this.getContainingInputManager()!;

    this.filterControl.criteriaChanged = criteria => this.criteriaChanged(criteria);
  }

  protected override update(): void {
    super.update();

    const widescreenBonusWidth = Math.max(0, Math.fround(this.drawWidth / this.drawHeight) - 2);

    this.mainGridContainer.columnDimensions = [
      new Dimension(GridSizeMode.Relative, 0.5, 0, Math.fround(700 + widescreenBonusWidth * 100)),
      new Dimension(),
      new Dimension(GridSizeMode.Relative, 0.5, 500, Math.fround(700 + widescreenBonusWidth * 300)),
    ];

    if (this.isCurrentScreen())
      this.updateDebounce();
  }

  // #region Selection debounce

  private debounceQueuedSelection: BeatmapInfo | null = null;
  private debounceElapsedTime = 0;

  private debounceQueueSelection(beatmap: BeatmapInfo): void {
    this.debounceQueuedSelection = beatmap;
    this.debounceElapsedTime = 0;
  }

  private updateDebounce(): void {
    if (this.debounceQueuedSelection === null) return;

    const clock = this.clock!;
    let elapsed = clock.elapsedFrameTime;

    // When a key is being held, assume the user is traversing the carousel using key repeat.
    // We want to change panels less often in this state (basically making debounce longer than initial key repeat, at least).
    const debounceInterval = this.inputManager.currentState.keyboard.keys.hasAnyButtonPressed ? SongSelect.SELECTION_DEBOUNCE * 2 : SongSelect.SELECTION_DEBOUNCE;

    // avoid debounce running early if there's a single long frame.
    if (clock.framesPerSecond > 0)
      elapsed = Math.min(1000 / clock.framesPerSecond, elapsed);

    this.debounceElapsedTime += elapsed;

    if (this.debounceElapsedTime >= debounceInterval)
      this.performDebounceSelection();
  }

  private performDebounceSelection(): void {
    if (this.debounceQueuedSelection === null) return;

    try {
      if (this.beatmap.value.beatmapInfo.equals(this.debounceQueuedSelection))
        return;

      const workingBeatmap = this.beatmaps.getWorkingBeatmap(this.debounceQueuedSelection);
      if (!this.checkBeatmapValidForSelection(workingBeatmap.beatmapInfo))
        return;

      this.beatmap.value = workingBeatmap;
    } finally {
      this.cancelDebounceSelection();
    }
  }

  private cancelDebounceSelection(): void {
    this.debounceQueuedSelection = null;
    this.debounceElapsedTime = 0;
  }

  // #endregion

  // #region Audio

  private lastTrack: DrawableTrack | null = null;

  /**
   * Ensures some music is playing for the current track.
   * Will resume playback from a manual user pause if the track has changed.
   */
  private ensurePlayingSelected(): void {
    if (!this.controlGlobalMusic)
      return;

    const track = this.music.currentTrack;

    const isNewTrack = this.lastTrack !== track;

    if (!track.isRunning && (!this.music.userPauseRequested || isNewTrack)) {
      Logger.log('Song select decided to ensurePlayingSelected');

      // Only restart playback if a new track.
      // This is important so that when exiting gameplay, the track is not restarted back to the preview point.
      this.music.play(isNewTrack);
    }

    this.lastTrack = track;
  }

  private isHandlingLooping = false;

  private beginLooping(): void {
    this.isHandlingLooping = true;

    this.ensureTrackLooping(this.beatmap.value);

    this.music.trackChanged.add(this.onTrackChanged);
  }

  private endLooping(): void {
    // may be called multiple times during screen exit process.
    if (!this.isHandlingLooping)
      return;

    this.music.currentTrack.looping = this.isHandlingLooping = false;

    this.music.trackChanged.remove(this.onTrackChanged);
  }

  private readonly onTrackChanged = ([beatmap]: [WorkingBeatmap, TrackChangeDirection]): void => this.ensureTrackLooping(beatmap);

  private ensureTrackLooping(beatmap: WorkingBeatmap): void {
    beatmap.prepareTrackForPreview(true);
  }

  // #endregion

  // #region Selection handling

  /**
   * Finalises selection on the given BeatmapInfo and runs the provided action if possible.
   * @param beatmap The beatmap which should be selected. If not provided, the current globally selected beatmap will be used.
   * @param startAction The action to perform if conditions are met to be able to proceed. May not be invoked if in an invalid state.
   */
  protected selectAndRun(beatmap: BeatmapInfo, startAction: () => void): void {
    if (!this.isCurrentScreen())
      return;

    if (!this.checkBeatmapValidForSelection(beatmap))
      return;

    // To ensure sanity, cancel any pending selection as we are about to force a selection.
    // Carousel selection will update to the forced selection via a call of `ensureGlobalBeatmapValid` below, or when song select becomes current again.
    this.cancelDebounceSelection();

    // Forced refetch is important here to guarantee correct invalidation across all difficulties (editor specific).
    this.beatmap.value = this.beatmaps.getWorkingBeatmap(beatmap, true);

    if (this.beatmap.isDefault)
      return;

    startAction();
  }

  /**
   * Prepares the proposed beatmap for global selection based on a carousel user-performed action.
   *
   * Calling this method will:
   * - Immediately update the selection the carousel.
   * - After SELECTION_DEBOUNCE, update the global beatmap. This in turn causes song select visuals (title, details, leaderboard) to update.
   *   This debounce is intended to avoid high overheads from churning lookups while a user is changing selection via rapid keyboard operations.
   */
  private queueBeatmapSelection(groupedBeatmap: GroupedBeatmap): void {
    if (!this.isCurrentScreen())
      return;

    this.carousel.currentGroupedBeatmap = groupedBeatmap;

    // Debounce consideration is to avoid beatmap churn on key repeat selection.
    this.debounceQueueSelection(groupedBeatmap.beatmap);
  }

  private ensureGlobalBeatmapValid(): boolean {
    if (!this.isCurrentScreen())
      return false;

    this.performDebounceSelection();

    // While filtering, let's not ever attempt to change selection.
    // This will be resolved after the filter completes, see `newItemsPresented`.
    if (this.isFiltering)
      return false;

    // Refetch to be confident that the current selection is still valid. It may have been deleted or hidden.
    const currentBeatmap = this.beatmaps.getWorkingBeatmap(this.beatmap.value.beatmapInfo, true);
    let validSelection = this.checkBeatmapValidForSelection(currentBeatmap.beatmapInfo);

    if (validSelection) {
      this.carousel.currentBeatmap = currentBeatmap.beatmapInfo;
      return true;
    }

    // If there was no beatmap selected, pick a random one.
    if (this.beatmap.isDefault) {
      validSelection = this.carousel.nextRandom();
      this.performDebounceSelection();
      return validSelection;
    }

    // If a previous non-default selection became non-valid, it was likely hidden or deleted.
    if (!validSelection) {
      // In the case a difficulty was hidden or removed, prefer selecting another difficulty from the same set.
      const activeSet = currentBeatmap.beatmapSetInfo;

      const validBeatmaps = activeSet.beatmaps.filter(b => this.checkBeatmapValidForSelection(b));

      if (validBeatmaps.length > 0) {
        const beatmap = validBeatmaps[0];
        this.carousel.currentBeatmap = beatmap;
        this.debounceQueueSelection(beatmap);
        return true;
      }
    }

    // If all else fails, use the default beatmap.
    this.beatmap.setDefault();
    this.performDebounceSelection();

    return validSelection;
  }

  private checkBeatmapValidForSelection(beatmap: BeatmapInfo): boolean {
    if (!allowGameplayWithRuleset(beatmap, this.ruleset.value, this.showConvertedBeatmaps.value))
      return false;

    if (beatmap.hidden)
      return false;

    if (beatmap.beatmapSet === null)
      return false;

    if (beatmap.beatmapSet.isProtected || beatmap.beatmapSet.deletePending)
      return false;

    return true;
  }

  // #endregion

  // #region Transitions

  override onEntering(e: ScreenTransitionEvent): void {
    super.onEntering(e);

    this.fadeIn();
    this.onArrivingAtScreen();
  }

  override onResuming(e: ScreenTransitionEvent): void {
    super.onResuming(e);

    this.fadeIn(fade_duration, Easing.OutQuint);
    this.onArrivingAtScreen();

    this.ensureGlobalBeatmapValid();

    if (this.controlGlobalMusic) {
      // restart playback on returning to song select, regardless.
      // not sure this should be a permanent thing (we may want to leave a user pause paused even on returning)
      this.music.resetTrackAdjustments();
      this.music.play(false, true);
    }
  }

  override onSuspending(e: ScreenTransitionEvent): void {
    this.carousel.visuallyFocusSelected = true;

    this.fadeOut(fade_duration, Easing.OutQuint);
    this.onLeavingScreen();

    super.onSuspending(e);
  }

  override onExiting(e: ScreenExitEvent): boolean {
    this.fadeOut(fade_duration, Easing.OutQuint);
    this.onLeavingScreen();

    return super.onExiting(e);
  }

  private onArrivingAtScreen(): void {
    this.carousel.visuallyFocusSelected = false;

    if (this.controlGlobalMusic) {
      // Avoid abruptly starting playback at preview point.
      // Importantly, this should be done before looping is setup to ensure we get the correct imminent `isPlaying` state.
      if (!this.music.isPlaying) {
        this.music.duckMomentarily(0, DuckParameters.of({
          duckDuration: 0,
          duckVolumeTo: 0,
          restoreDuration: 800,
          restoreEasing: Easing.OutQuint,
        }));
      }

      this.beginLooping();
    }

    this.beatmap.bindValueChanged(this.updateVariousState, true);
  }

  private readonly updateVariousState = (_e: ValueChangedEvent<WorkingBeatmap>): void => {
    if (!this.isCurrentScreen())
      return;

    this.ensureGlobalBeatmapValid();

    this.ensurePlayingSelected();
    this.updateBackgroundDim();
    this.updateWedgeVisibility();
  };

  private onLeavingScreen(): void {
    this.restoreBackground();

    this.beatmap.valueChanged.remove(this.updateVariousState);

    this.updateWedgeVisibility();

    this.endLooping();
  }

  protected override logoArriving(logo: OsuLogo, resuming: boolean): void {
    super.logoArriving(logo, resuming);

    if (!this.showOsuLogo)
      return;

    if (logo.alpha > 0.8 && resuming)
      this.footer?.startTrackingLogo(logo, 400, Easing.OutQuint);
    else {
      logo.hide();
      logo.scaleTo(0.2);
      this.footer?.startTrackingLogo(logo);
    }

    logo.fadeIn(240, Easing.OutQuint);
    logo.scaleTo(logo_scale, 240, Easing.OutQuint);

    logo.action = () => {
      this.ensureGlobalBeatmapValid();
      this.selectAndRun(this.beatmap.value.beatmapInfo, () => this.onStart());
      return false;
    };
  }

  protected override logoSuspending(logo: OsuLogo): void {
    super.logoSuspending(logo);

    if (!this.showOsuLogo)
      return;

    this.footer?.stopTrackingLogo();
  }

  protected override logoExiting(logo: OsuLogo): void {
    super.logoExiting(logo);

    if (!this.showOsuLogo)
      return;

    this.footer?.stopTrackingLogo();

    logo.scaleTo(0.2, 120, Easing.Out);
    logo.fadeOut(120, Easing.Out);
  }

  private updateWedgeVisibility(): void {
    // Ensure we don't show an invalid selection before the carousel has finished initially filtering.
    // This avoids a flicker of a placeholder or invalid beatmap before a proper selection.
    //
    // After the carousel finishes filtering, it will attempt a selection then call this method again.
    if (!this._carouselItemsPresented && !this.checkBeatmapValidForSelection(this.beatmap.value.beatmapInfo))
      return;

    if (this.carousel.visuallyFocusSelected)
      this.filterControl.hide();
    else
      this.filterControl.show();
  }

  private updateBackgroundDim(): void {
    this.applyToBackground(backgroundModeBeatmap => {
      backgroundModeBeatmap.beatmap = this.beatmap.value;
      backgroundModeBeatmap.ignoreUserSettings.value = true;

      backgroundModeBeatmap.dimWhenUserSettingsIgnored.value = 0.1;

      // Required to undo results screen dimming the background.
      // Probably needs more thought because this needs to be in every `applyToBackground` currently to restore sane defaults.
      backgroundModeBeatmap.fadeColour(Colour4.White, 250);

      const backgroundRevealActive = this.revealBackgroundDelegate?.state === RunState.Running || this.revealBackgroundDelegate?.state === RunState.Complete;
      backgroundModeBeatmap.blurAmount.value = this.configBackgroundBlur.value && !backgroundRevealActive ? 20 : 0;
    });
  }

  // #endregion

  // #region Filtering

  private _carouselItemsPresented = false;

  /** Whether the carousel has finished initial presentation of beatmap panels. */
  get carouselItemsPresented(): boolean {
    return this._carouselItemsPresented;
  }

  /** Whether the carousel is or will be undergoing a filter operation. */
  get isFiltering(): boolean {
    return this.carousel.isFiltering || this.filterDebounce?.state === RunState.Waiting;
  }

  private static readonly filter_delay = 250;

  private filterDebounce: ScheduledDelegate | null = null;

  private criteriaChanged(criteria: FilterCriteria): void {
    this.filterDebounce?.cancel();

    // The first filter needs to be applied immediately as this triggers the initial carousel load.
    const isFirstFilter = this.filterDebounce === null;

    // Criteria change may have included a ruleset change which made the current selection invalid.
    const isSelectionValid = this.checkBeatmapValidForSelection(this.beatmap.value.beatmapInfo);

    this.filterDebounce = this.scheduler.addDelayed(() => this.carousel.filter(criteria, !isSelectionValid), isFirstFilter || !isSelectionValid ? 0 : SongSelect.filter_delay);
  }

  private newItemsPresented(_carouselItems: readonly CarouselItem[]): void {
    if (this.carousel.criteria === null)
      return;

    this._carouselItemsPresented = true;

    this.updateNoResultsPlaceholder();

    const count = this.carousel.matchedBeatmapsCount;
    this.filterControl.statusText = `${count.toLocaleString('en-US')} ${count === 1 ? 'match' : 'matches'}`;

    // If there's already a selection update in progress, let's not interrupt it.
    // Interrupting could cause the debounce interval to be reduced.
    //
    // `ensureGlobalBeatmapValid` is run post-selection which will resolve any pending incompatibilities (see `beatmap` bindable callback).
    if (this.debounceQueuedSelection === null)
      this.ensureGlobalBeatmapValid();

    this.updateWedgeVisibility();
  }

  private updateNoResultsPlaceholder(): void {
    const count = this.carousel.matchedBeatmapsCount;

    if (count === 0) {
      if (this.noResultsPlaceholder.state.value === Visibility.Hidden) {
        // Duck audio temporarily when the no results placeholder becomes visible.
        //
        // Temporary ducking makes it easier to avoid scenarios where the ducking interacts badly
        // with other global UI components (like overlays).
        this.music.duckMomentarily(400, DuckParameters.of({
          duckVolumeTo: 1,
          duckCutoffTo: 500,
          duckDuration: 250,
          restoreDuration: 2000,
        }));
      }

      this.noResultsPlaceholder.show();
      this.noResultsPlaceholder.filterCriteria = this.carousel.criteria!;

      this.rightGradientBackground.resizeWidthTo(3, 1000, Easing.OutPow10);
    } else {
      this.noResultsPlaceholder.hide();

      this.rightGradientBackground.resizeWidthTo(1, 400, Easing.OutPow10);
    }
  }

  // #endregion

  // #region Background reveal

  private revealBackgroundDelegate: ScheduledDelegate | null = null;

  protected override onHover(_e: HoverEvent): boolean {
    return true;
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    const containingInputManager = this.getContainingInputManager();

    // I don't know why this works, but it does.
    // If the carousel panels are hovered, hovered no longer contains the screen.
    // Maybe there's a better way of doing this, but I couldn't immediately find a good setup.
    const mouseDownPriority = containingInputManager!.hoveredDrawables.includes(this);

    if (!this.carousel.absoluteScrolling && mouseDownPriority && this.revealBackgroundDelegate === null) {
      this.revealBackgroundDelegate = this.scheduler.addDelayed(() => {
        if (containingInputManager!.draggedDrawable !== null) {
          this.revealBackgroundDelegate = null;
          return;
        }

        this.mainContent.resizeWidthTo(1.2, 600, Easing.OutQuint);
        this.mainContent.scaleTo(1.2, 600, Easing.OutQuint);
        this.mainContent.fadeOut(200, Easing.OutQuint);

        this.updateBackgroundDim();

        this.footer?.hide();
      }, 200);
    }

    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.restoreBackground();
    super.onMouseUp(e);
  }

  private restoreBackground(): void {
    if (this.revealBackgroundDelegate === null)
      return;

    if (this.revealBackgroundDelegate.state === RunState.Complete) {
      this.mainContent.resizeWidthTo(1, 500, Easing.OutQuint);
      this.mainContent.scaleTo(1, 500, Easing.OutQuint);
      this.mainContent.fadeIn(500, Easing.OutQuint);

      this.footer?.show();
    }

    this.revealBackgroundDelegate.cancel();
    this.revealBackgroundDelegate = null;

    this.updateBackgroundDim();
  }

  // #endregion

  // #region Input

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (!this.isCurrentScreen()) return false;

    switch (e.action) {
      case GlobalAction.Select:
        // in most circumstances this is handled already by the carousel itself, but there are cases where it will not be.
        // one of which is filtering out all visible beatmaps and attempting to start gameplay.
        // in that case, users still expect a `Select` press to advance to gameplay anyway, using the ambient selected beatmap if there is one,
        // which matches the behaviour resulting from clicking the osu! cookie in that scenario.
        this.ensureGlobalBeatmapValid();
        this.selectAndRun(this.beatmap.value.beatmapInfo, () => this.onStart());
        return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (e.repeat) return false;

    switch (e.key) {
      case Key.Delete:
        // (Shift+Delete asks to delete the set: dialogs aren't ported.)
        break;
    }

    return super.onKeyDown(e);
  }

  // #endregion

  // #region Beatmap management

  private beforeScopedSelection: GroupedBeatmap | null = null;

  private readonly _scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);

  get scopedBeatmapSet(): Bindable<BeatmapSetInfo | null> {
    return this._scopedBeatmapSet;
  }

  scopeToBeatmapSet(beatmapSet: BeatmapSetInfo): void {
    this.beforeScopedSelection = this.carousel.currentGroupedBeatmap;

    this._scopedBeatmapSet.value = beatmapSet;
  }

  unscopeBeatmapSet(): void {
    this.unscopeBeatmapSetInternal(true);
  }

  private unscopeBeatmapSetInternal(restorePreviousSelection: boolean): void {
    if (this._scopedBeatmapSet.value === null)
      return;

    if (this.beforeScopedSelection !== null && restorePreviousSelection)
      this.queueBeatmapSelection(this.beforeScopedSelection);

    this._scopedBeatmapSet.value = null;
    this.beforeScopedSelection = null;
  }

  // #endregion
}
