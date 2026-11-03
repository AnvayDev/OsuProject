// Ported from osu.Game/Overlays/Mods/ModSelectColumn.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { type Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import type { TextFlowContainer } from '@fw/graphics/containers/TextFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { TrianglesV2 } from '../../graphics/backgrounds/TrianglesV2';
import { OsuScrollContainer } from '../../graphics/containers/OsuScrollContainer';
import { OsuTextFlowContainer } from '../../graphics/containers/OsuTextFlowContainer';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../OverlayColourProvider';
import { ModSearchContainer } from './ModSearchContainer';
import { ModSelectPanel } from './ModSelectPanel';

const header_height = 42;

export abstract class ModSelectColumn extends CompositeDrawable {
  readonly topLevelContent: Container;

  set headerText(value: string) {
    this.createHeaderText(value);
  }

  get accentColour(): Colour4 {
    return this.headerBackground.colour.topLeft;
  }

  set accentColour(value: Colour4) {
    this.headerBackground.colour = value;

    const [h, s, v] = new Colour4(value.r, value.g, value.b, 1).toHSV();
    const trianglesColour = Colour4.fromHSV(h, Math.fround(s + 0.2), Math.fround(v - 0.1));

    this.triangles.colour = ColourInfo.gradientVertical(trianglesColour, value);
  }

  /** Whether this column should accept user input. */
  readonly active: Bindable<boolean> = new BindableBool(true);

  set searchTerm(value: string) {
    this.itemsFlow.searchTerm = value;
  }

  protected override receivePositionalInputAtSubTree(screenSpacePos: Vector2): boolean {
    return super.receivePositionalInputAtSubTree(screenSpacePos) && this.active.value;
  }

  protected readonly controlContainer: Container;

  /** The container which contains the main items of the column, such as ModPanels. */
  protected readonly itemsFlow: ModSearchContainer;

  private readonly headerTextFlow: TextFlowContainer;
  private readonly headerBackground: Box;
  private readonly contentContainer: Container;
  private readonly contentBackground: Box;
  private readonly triangles: TrianglesV2;

  protected static readonly WIDTH = 320;

  protected constructor() {
    super();

    this.width = ModSelectColumn.WIDTH;
    this.relativeSizeAxes = Axes.Y;
    this.shear = OsuGame.SHEAR;

    let headerTextFlow!: TextFlowContainer, headerBackground!: Box, contentContainer!: Container, contentBackground!: Box, triangles!: TrianglesV2;
    let controlContainer!: Container, itemsFlow!: ModSearchContainer;

    this.internalChildren = [
      this.topLevelContent = new Container().with({
        relativeSizeAxes: Axes.Both,
        cornerRadius: ModSelectPanel.CORNER_RADIUS,
        masking: true,
        children: [
          new Container().with({
            relativeSizeAxes: Axes.X,
            height: header_height + ModSelectPanel.CORNER_RADIUS,
            children: [
              headerBackground = new Box().with({
                relativeSizeAxes: Axes.X,
                height: header_height + ModSelectPanel.CORNER_RADIUS,
              }),
              triangles = new TrianglesV2().with({
                relativeSizeAxes: Axes.X,
                height: header_height,
                shear: OsuGame.SHEAR.neg(),
                velocity: Math.fround(0.7),
                clampAxes: Axes.Y,
              }),
              headerTextFlow = new OsuTextFlowContainer(t => {
                t.font = withFont(OsuFont.TorusAlternate, { size: 17 });
                t.shadow = false;
                t.colour = Colour4.Black;
              }).with({
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                anchor: Anchor.CentreLeft,
                origin: Anchor.CentreLeft,
                shear: OsuGame.SHEAR.neg(),
                padding: MarginPadding.of({
                  horizontal: 17,
                  bottom: ModSelectPanel.CORNER_RADIUS,
                }),
              }),
            ],
          }),
          new Container().with({
            relativeSizeAxes: Axes.Both,
            padding: MarginPadding.of({ top: header_height }),
            child: contentContainer = new Container().with({
              relativeSizeAxes: Axes.Both,
              masking: true,
              cornerRadius: ModSelectPanel.CORNER_RADIUS,
              borderThickness: 3,
              children: [
                contentBackground = new Box().with({
                  relativeSizeAxes: Axes.Both,
                }),
                new GridContainer().with({
                  padding: MarginPadding.of({ top: 1, bottom: 3 }),
                  relativeSizeAxes: Axes.Both,
                  rowDimensions: [
                    new Dimension(GridSizeMode.AutoSize),
                    new Dimension(),
                  ],
                  content: [
                    [
                      controlContainer = new Container().with({
                        relativeSizeAxes: Axes.X,
                        padding: MarginPadding.of({ horizontal: 14 }),
                      }),
                    ],
                    [
                      new OsuScrollContainer(Direction.Vertical).with({
                        relativeSizeAxes: Axes.Both,
                        clampExtension: 100,
                        scrollbarOverlapsContent: false,
                        child: itemsFlow = new ModSearchContainer().with({
                          relativeSizeAxes: Axes.X,
                          autoSizeAxes: Axes.Y,
                          spacing: new Vector2(0, 7),
                          padding: new MarginPadding(7),
                        }),
                      }),
                    ],
                  ],
                }),
              ],
            }),
          }),
        ],
      }),
    ];

    this.headerTextFlow = headerTextFlow;
    this.headerBackground = headerBackground;
    this.contentContainer = contentContainer;
    this.contentBackground = contentBackground;
    this.triangles = triangles;
    this.controlContainer = controlContainer;
    this.itemsFlow = itemsFlow;
  }

  private createHeaderText(text: string): void {
    this.headerTextFlow.clear();

    const part = this.headerTextFlow.addText(text);

    const applySemiBoldToFirstWord = (d: readonly Drawable[]) => {
      const firstWord = d[0];
      if (firstWord instanceof OsuSpriteText)
        firstWord.font = withFont(firstWord.font, { weight: FontWeight.SemiBold });
    };

    part.drawablePartsRecreated.add(applySemiBoldToFirstWord);
    applySemiBoldToFirstWord(part.drawables);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.contentContainer.borderColour = ColourInfo.gradientVertical(colourProvider.background4, colourProvider.background3);
    this.contentBackground.colour = colourProvider.background4;

    return r;
  }
}
