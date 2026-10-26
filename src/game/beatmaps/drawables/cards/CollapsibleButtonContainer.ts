// Ported from osu.Game/Beatmaps/Drawables/Cards/CollapsibleButtonContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../../graphics/OsuColour';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { BeatmapDownloadTracker } from '../../../online/BeatmapDownloadTracker';
import { DownloadState } from '../../../online/DownloadState';
import { OverlayColourProvider } from '../../../overlays/OverlayColourProvider';
import { BeatmapCardConstants } from './BeatmapCardConstants';
import { BeatmapCardContentBackground } from './BeatmapCardContentBackground';
import type { BeatmapSetFavouriteState } from './BeatmapSetFavouriteState';
import type { BeatmapCardIconButton } from './buttons/BeatmapCardIconButton';
import { DownloadButton } from './buttons/DownloadButton';
import { FavouriteButton } from './buttons/FavouriteButton';
import { GoToBeatmapButton } from './buttons/GoToBeatmapButton';

export class CollapsibleButtonContainer extends Container {
  readonly showDetails = new Bindable<boolean>(false);

  readonly favouriteState: Bindable<BeatmapSetFavouriteState>;

  private readonly downloadTracker: BeatmapDownloadTracker;

  private _buttonsExpandedWidth = 0;

  get buttonsExpandedWidth(): number {
    return this._buttonsExpandedWidth;
  }

  set buttonsExpandedWidth(value: number) {
    this._buttonsExpandedWidth = value;

    if (this.isLoaded)
      this.updateState();
  }

  private _buttonsCollapsedWidth = 0;

  get buttonsCollapsedWidth(): number {
    return this._buttonsCollapsedWidth;
  }

  set buttonsCollapsedWidth(value: number) {
    this._buttonsCollapsedWidth = value;

    if (this.isLoaded)
      this.updateState();
  }

  get buttons(): Iterable<BeatmapCardIconButton> {
    return this.buttonsContainer.children;
  }

  protected override get content(): Container<Drawable> {
    return this.mainContent;
  }

  private readonly background: Container;
  private readonly buttonArea: Container;
  /** (C#'s private buttons) */
  private readonly buttonsContainer: Container<BeatmapCardIconButton>;
  private readonly mainArea: Container;
  private readonly mainContent: Container;

  private colours!: OsuColour;
  private colourProvider!: OverlayColourProvider;

  constructor(beatmapSet: APIBeatmapSet, allowNavigationToBeatmap = true, keepBackgroundLoaded = false) {
    super();

    this.favouriteState = new Bindable<BeatmapSetFavouriteState>({ favourited: false, favouriteCount: 0 });

    const downloadTracker = this.downloadTracker = new BeatmapDownloadTracker(beatmapSet);

    this.relativeSizeAxes = Axes.Y;
    this.masking = true;
    this.cornerRadius = BeatmapCardConstants.CORNER_RADIUS;

    const favouriteButton = new FavouriteButton(beatmapSet).with({
      anchor: Anchor.TopCentre,
      origin: Anchor.TopCentre,
      relativeSizeAxes: Axes.Both,
      height: 0.5,
    });
    favouriteButton.current = this.favouriteState;

    const downloadButton = new DownloadButton(beatmapSet).with({
      anchor: Anchor.BottomCentre,
      origin: Anchor.BottomCentre,
      relativeSizeAxes: Axes.Both,
      height: 0.5,
    });
    downloadButton.state.bindTarget = downloadTracker.state;

    let background!: Container;
    let buttonArea!: Container;
    let buttonsContainer!: Container<BeatmapCardIconButton>;
    let mainArea!: Container;
    let mainContent!: Container;

    const contentBackground = new BeatmapCardContentBackground(beatmapSet, keepBackgroundLoaded).with({
      relativeSizeAxes: Axes.Both,
    });
    contentBackground.dimmed.bindTarget = this.showDetails;

    this.internalChildren = [
      downloadTracker,
      background = new Container().with({
        relativeSizeAxes: Axes.Y,
        anchor: Anchor.CentreRight,
        origin: Anchor.CentreRight,
        child: new Box().with({
          relativeSizeAxes: Axes.Both,
          colour: Colour4.White,
        }),
      }),
      buttonArea = new Container().with({
        name: 'Right (button) area',
        relativeSizeAxes: Axes.Y,
        origin: Anchor.TopRight,
        anchor: Anchor.TopRight,
        child: buttonsContainer = new Container<BeatmapCardIconButton>().with({
          relativeSizeAxes: Axes.Both,
          children: [
            favouriteButton,
            downloadButton,
          ],
        }),
      }),
      mainArea = new Container().with({
        name: 'Main content',
        relativeSizeAxes: Axes.Y,
        cornerRadius: BeatmapCardConstants.CORNER_RADIUS,
        masking: true,
        children: [
          contentBackground,
          mainContent = new Container().with({
            relativeSizeAxes: Axes.Both,
            padding: MarginPadding.of({
              horizontal: 10,
              vertical: 4,
            }),
          }),
        ],
      }),
    ];

    this.background = background;
    this.buttonArea = buttonArea;
    this.buttonsContainer = buttonsContainer;
    this.mainArea = mainArea;
    this.mainContent = mainContent;

    const goToBeatmapButton = new GoToBeatmapButton(beatmapSet, allowNavigationToBeatmap).with({
      anchor: Anchor.BottomCentre,
      origin: Anchor.BottomCentre,
      relativeSizeAxes: Axes.Both,
      height: 0.5,
    });
    goToBeatmapButton.state.bindTarget = downloadTracker.state;

    buttonsContainer.add(goToBeatmapButton);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.downloadTracker.state.bindValueChanged(() => this.updateState());
    this.showDetails.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);
  }

  private updateState(): void {
    this.buttonArea.width = this._buttonsExpandedWidth;

    const buttonAreaWidth = this.showDetails.value ? this._buttonsExpandedWidth : this._buttonsCollapsedWidth;
    const mainAreaWidth = this.width - buttonAreaWidth;

    this.mainArea.resizeWidthTo(mainAreaWidth, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);

    // By limiting the width we avoid this box showing up as an outline around the drawables that are on top of it.
    this.background.resizeWidthTo(buttonAreaWidth + BeatmapCardConstants.CORNER_RADIUS, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);

    if (this._buttonsCollapsedWidth === 0)
      this.background.fadeTo(this.showDetails.value ? 1 : 0, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);

    this.background.fadeColour(this.downloadTracker.state.value === DownloadState.LocallyAvailable ? this.colours.lime0 : this.colourProvider.background3,
      BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
    this.buttonsContainer.fadeTo(this.showDetails.value ? 1 : 0, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);

    for (const button of this.buttonsContainer.children) {
      button.idleColour = this.downloadTracker.state.value !== DownloadState.LocallyAvailable ? this.colourProvider.light1 : this.colourProvider.background3;
      button.hoverColour = this.downloadTracker.state.value !== DownloadState.LocallyAvailable ? this.colourProvider.content1 : this.colourProvider.foreground1;
    }
  }
}
