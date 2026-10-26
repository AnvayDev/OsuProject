// Ported from osu.Game/Graphics/UserInterface/ShearedSearchTextBox.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { FallingDownContainer } from '@fw/graphics/userInterface/BasicTextBox';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { FontWeight, OsuFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { SearchTextBox } from './SearchTextBox';

const corner_radius = 7;

export class ShearedSearchTextBox extends CompositeDrawable {
  private readonly background: Box;
  protected readonly textBox: InnerSearchTextBox;

  get current(): Bindable<string> {
    return this.textBox.current;
  }

  set current(value: Bindable<string>) {
    this.textBox.current = value;
  }

  get holdFocus(): boolean {
    return this.textBox.holdFocus;
  }

  set holdFocus(value: boolean) {
    this.textBox.holdFocus = value;
  }

  get placeholderText(): string {
    return this.textBox.placeholderText;
  }

  set placeholderText(value: string) {
    this.textBox.placeholderText = value;
  }

  /** (new HasFocus) */
  get textBoxHasFocus(): boolean {
    return this.textBox.hasFocus;
  }

  takeFocus(): void {
    this.textBox.takeFocus();
  }

  killFocus(): void {
    this.textBox.killFocus();
  }

  selectAll(): boolean {
    return this.textBox.selectAll();
  }

  constructor() {
    super();

    this.height = 42;
    this.shear = OsuGame.SHEAR;
    this.masking = true;
    this.cornerRadius = corner_radius;

    let background!: Box;
    let textBox!: InnerSearchTextBox;

    this.internalChildren = [
      background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      new GridContainer().with({
        relativeSizeAxes: Axes.Both,
        content: [
          [
            textBox = this.createInnerTextBox(),
            new SpriteIcon().with({
              icon: FontAwesome.Solid.Search,
              origin: Anchor.Centre,
              anchor: Anchor.Centre,
              size: new Vector2(16),
              shear: this.shear.neg(),
            }),
          ],
        ],
        columnDimensions: [
          new Dimension(),
          new Dimension(GridSizeMode.Absolute, 50),
        ],
      }),
    ];

    this.background = background;
    this.textBox = textBox;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.background.colour = dependencies.resolve(OverlayColourProvider).background3;
    return r;
  }

  override get handleNonPositionalInput(): boolean {
    return this.textBox.handleNonPositionalInput;
  }

  protected createInnerTextBox(): InnerSearchTextBox {
    return new InnerSearchTextBox();
  }
}

/** (ShearedSearchTextBox.InnerSearchTextBox) */
export class InnerSearchTextBox extends SearchTextBox {
  constructor() {
    super();

    this.anchor = Anchor.CentreLeft;
    this.origin = Anchor.CentreLeft;
    this.relativeSizeAxes = Axes.Both;
    this.size = Vector2.One;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.backgroundFocused = colourProvider.background4;
    this.backgroundUnfocused = colourProvider.background4;

    this.placeholder.font = OsuFont.getFont({ size: this.fontSize, weight: FontWeight.SemiBold });
    this.placeholderText = 'search...';

    this.cornerRadius = corner_radius;
    this.textContainer.shear = OsuGame.SHEAR.neg();

    return r;
  }

  protected override createPlaceholder(): SpriteText {
    return new SearchPlaceholder();
  }

  protected override getDrawableCharacter(c: string): Drawable {
    return new FallingDownContainer().with({
      autoSizeAxes: Axes.Both,
      child: new OsuSpriteText().with({ text: c, font: OsuFont.getFont({ size: 20, weight: FontWeight.SemiBold }) }),
    });
  }
}

/** (InnerSearchTextBox.SearchPlaceholder) */
class SearchPlaceholder extends SpriteText {
  override show(): void {
    this
      .moveToY(0, 250, Easing.OutQuint)
      .fadeIn(250, Easing.OutQuint);
  }

  override hide(): void {
    this
      .moveToY(3, 250, Easing.OutQuint)
      .fadeOut(250, Easing.OutQuint);
  }
}
