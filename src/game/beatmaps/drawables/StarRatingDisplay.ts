// Ported from osu.Game/Beatmaps/Drawables/StarRatingDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { type Bindable, BindableWithCurrent } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import type { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuFont, FontWeight, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { formatStarRating } from '../../utils/FormatUtils';
import type { StarDifficulty } from '../StarDifficulty';

export enum StarRatingDisplaySize {
  Small,
  Range,
  Regular,
}

/** A pill that displays the star rating of a beatmap. */
export class StarRatingDisplay extends CompositeDrawable {
  private readonly animated: boolean;
  private readonly background: Box;
  private readonly starIcon: SpriteIcon;
  private readonly starsText: OsuSpriteText;

  private readonly _current = new BindableWithCurrent<StarDifficulty>({ stars: 0, maxCombo: 0 });

  get current(): Bindable<StarDifficulty> {
    return this._current.current;
  }

  set current(value: Bindable<StarDifficulty>) {
    this._current.current = value;
  }

  /** The difficulty colour currently displayed. Can be used to have other components match the spectrum animation. */
  get displayedDifficultyColour(): Colour4 {
    return this.background.colour.averageColour;
  }

  /** The difficulty text colour currently displayed. Can be used to have other components match the spectrum animation. */
  get displayedDifficultyTextColour(): Colour4 {
    return this.starsText.colour.averageColour;
  }

  private readonly _displayedStars = new BindableDouble();

  /**
   * The currently displayed stars of this display wrapped in a bindable.
   * This bindable gets transformed on change rather than instantaneous, if animation is enabled.
   */
  get displayedStars(): Bindable<number> {
    return this._displayedStars;
  }

  private colours!: OsuColour;

  /**
   * Creates a new StarRatingDisplay using an already computed StarDifficulty.
   * @param starDifficulty The already computed StarDifficulty to display.
   * @param size The size of the star rating display.
   * @param animated Whether the star rating display will perform transforms on change rather than updating instantaneously.
   */
  constructor(starDifficulty: StarDifficulty, size = StarRatingDisplaySize.Regular, animated = false) {
    super();

    this.animated = animated;

    this.current.value = starDifficulty;

    this.autoSizeAxes = Axes.Both;

    let margin = new MarginPadding();

    switch (size) {
      case StarRatingDisplaySize.Small:
        margin = MarginPadding.of({ horizontal: 7 });
        break;

      case StarRatingDisplaySize.Range:
        margin = MarginPadding.of({ horizontal: 8 });
        break;

      case StarRatingDisplaySize.Regular:
        margin = MarginPadding.of({ horizontal: 8, vertical: 2 });
        break;
    }

    let background!: Box;
    let starIcon!: SpriteIcon;
    let starsText!: OsuSpriteText;

    this.internalChild = new CircularContainer().with({
      masking: true,
      autoSizeAxes: Axes.Both,
      children: [
        background = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
        new GridContainer().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          autoSizeAxes: Axes.Both,
          margin,
          columnDimensions: [
            new Dimension(GridSizeMode.AutoSize),
            new Dimension(GridSizeMode.Absolute, 3),
            new Dimension(GridSizeMode.AutoSize, 0, 25),
          ],
          rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
          content: [
            [
              starIcon = new SpriteIcon().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                icon: FontAwesome.Solid.Star,
                size: new Vector2(8),
              }),
              emptyDrawable(),
              starsText = new OsuSpriteText().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                margin: MarginPadding.of({ bottom: 1.5 }),
                spacing: new Vector2(-1.4),
                font: withFont(OsuFont.Torus, { size: 14.4, weight: FontWeight.Bold, fixedWidth: true }),
                shadow: false,
              }),
            ],
          ],
        }),
      ],
    });

    this.background = background;
    this.starIcon = starIcon;
    this.starsText = starsText;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colours = dependencies.resolve(OsuColour);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.current.bindValueChanged(c => {
      if (this.animated)
        // Animation roughly matches `StarCounter`'s implementation.
        this.transformBindableTo(this._displayedStars, c.newValue.stars, Math.min(1000, 100 + 80 * Math.abs(c.newValue.stars - c.oldValue.stars)), Easing.OutQuint);
      else
        this._displayedStars.value = c.newValue.stars;
    });

    this._displayedStars.value = this.current.value.stars;

    this._displayedStars.bindValueChanged(s => {
      this.starsText.text = s.newValue < 0 ? '-' : formatStarRating(s.newValue);

      this.background.colour = this.colours.forStarDifficulty(s.newValue);

      this.starIcon.colour = this.colours.forStarDifficultyText(s.newValue);
      this.starsText.colour = this.colours.forStarDifficultyText(s.newValue);
    }, true);
  }
}
