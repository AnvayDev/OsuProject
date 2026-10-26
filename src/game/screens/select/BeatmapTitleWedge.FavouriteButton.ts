// Ported from osu.Game/Screens/Select/BeatmapTitleWedge.FavouriteButton.cs
// The online API isn't ported, so there is never an online beatmap set: the button shows the "-" count, is disabled, and the favourite
// request (with HeartIcon's favourite animation, which only plays on its success) never happens.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuClickableContainer } from '../../graphics/containers/OsuClickableContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { LoadingSpinner } from '../../graphics/userInterface/LoadingSpinner';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

const pop_out_duration = 100;
const pop_in_duration = 500;

class HeartIcon extends CompositeDrawable {
  private readonly icon: SpriteIcon;

  private colourProvider!: OverlayColourProvider;

  private colours!: OsuColour;

  constructor() {
    super();

    this.internalChildren = [
      this.icon = new SpriteIcon().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        icon: FontAwesome.Regular.Heart,
        relativeSizeAxes: Axes.Both,
      }),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    this.colours = dependencies.resolve(OsuColour);
    return r;
  }

  private active = false;

  setActive(active: boolean): void {
    if (this.active === active)
      return;

    this.active = active;

    this.finishTransforms(true);

    if (active)
      this.transitionIcon(FontAwesome.Solid.Heart, this.colours.pink1);
    else
      this.transitionIcon(FontAwesome.Regular.Heart, this.colourProvider.content2);
  }

  private transitionIcon(newIcon: IconUsage, colour: Colour4, emphasised = false): void {
    this.icon.scaleTo(emphasised ? 0.5 : 0.8, pop_out_duration, Easing.OutQuad)
      .then()
      .fadeColour(colour)
      .schedule(() => this.icon.icon = newIcon)
      .scaleTo(1, pop_in_duration, Easing.OutElasticHalf);
  }
}

export class FavouriteButton extends OsuClickableContainer {
  private isFavourite = false;

  private background!: Box;
  private valueText!: OsuSpriteText;
  private loadingSpinner!: LoadingSpinner;
  private hoverLayer!: Box;
  private icon!: HeartIcon;

  private colourProvider!: OverlayColourProvider;

  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    this.masking = true;
    this.cornerRadius = 5;
    this.shear = OsuGame.SHEAR;

    this.addRange([
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.Black.opacity(0.2),
      }),
      new FillFlowContainer().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
        margin: MarginPadding.of({ left: 10, right: 10, vertical: 5 }),
        spacing: new Vector2(4, 0),
        shear: OsuGame.SHEAR.neg(),
        children: [
          this.icon = new HeartIcon().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            size: new Vector2(OsuFont.Style.Heading2.size),
          }),
          new Container().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            autoSizeAxes: Axes.X,
            height: 20,
            children: [
              this.loadingSpinner = new LoadingSpinner().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                size: new Vector2(12),
              }),
              new GridContainer().with({
                anchor: Anchor.CentreLeft,
                origin: Anchor.CentreLeft,
                autoSizeAxes: Axes.Both,
                rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
                columnDimensions: [
                  new Dimension(GridSizeMode.AutoSize, 0, 25),
                ],
                content: [
                  [
                    this.valueText = new OsuSpriteText().with({
                      anchor: Anchor.Centre,
                      origin: Anchor.Centre,
                      font: OsuFont.Style.Heading2,
                      colour: this.colourProvider.content2,
                      margin: MarginPadding.of({ bottom: 2 }),
                      alwaysPresent: true,
                    }),
                  ],
                ],
              }),
            ],
          }),
        ],
      }),
      this.hoverLayer = new Box().with({
        relativeSizeAxes: Axes.Both,
        alpha: 0,
        colour: Colour4.White.opacity(0.1),
        blending: BlendingParameters.Additive,
      }),
    ]);

    this.loadingSpinner.state.value = Visibility.Visible;
    // (Action = toggleFavourite: it only runs with an online beatmap set, which is never present here.)
    this.action = () => {};

    return r;
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.hoverLayer.fadeIn(500, Easing.OutQuint);
    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);
    this.hoverLayer.fadeOut(500, Easing.OutQuint);
  }

  setLoading(): void {
    this.loadingSpinner.state.value = Visibility.Visible;
    this.valueText.fadeOut(120, Easing.OutQuint);

    this.updateFavouriteState();
  }

  /** SetBeatmapSet(null): the lookup completed without an online beatmap set. */
  setBeatmapSet(): void {
    this.loadingSpinner.state.value = Visibility.Hidden;
    this.valueText.fadeIn(120, Easing.OutQuint);

    this.updateFavouriteState();
  }

  private updateFavouriteState(): void {
    this.enabled.value = false;

    if (this.loadingSpinner.state.value === Visibility.Hidden)
      this.valueText.text = '-';

    this.isFavourite = false;

    this.background.fadeColour(Colour4.Black.opacity(0.2), 500, Easing.OutQuint);
    this.valueText.fadeColour(this.colourProvider.content2, 500, Easing.OutQuint);
    this.icon.setActive(this.isFavourite);
  }
}
