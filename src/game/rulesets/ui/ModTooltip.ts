// Ported from osu.Game/Rulesets/UI/ModTooltip.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { TextFlowContainer } from '@fw/graphics/containers/TextFlowContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import type { ITooltip } from '@fw/graphics/cursor/ITooltip';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OverlayColourScheme } from '../../overlays/OverlayColourScheme';
import type { Mod } from '../mods/Mod';

export class ModTooltip extends VisibilityContainer implements ITooltip {
  private readonly colourProvider: OverlayColourProvider;

  private nameText!: OsuSpriteText;
  private settingsLabelsFlow!: TextFlowContainer;
  private settingsValuesFlow!: TextFlowContainer;

  constructor(colourProvider: OverlayColourProvider | null = null) {
    super();

    this.colourProvider = colourProvider ?? new OverlayColourProvider(OverlayColourScheme.Aquamarine);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.autoSizeAxes = Axes.Both;
    this.cornerRadius = 7;
    this.masking = true;

    this.edgeEffect = new EdgeEffectParameters({
      type: EdgeEffectType.Shadow,
      colour: Colour4.Black.opacity(Math.fround(0.2)),
      radius: 10,
    });

    this.internalChildren = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: this.colourProvider.background6,
      }),
      new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
        padding: new MarginPadding(10),
        spacing: new Vector2(20, 0),
        children: [
          new FillFlowContainer().with({
            anchor: Anchor.BottomLeft,
            origin: Anchor.BottomLeft,
            autoSizeAxes: Axes.Both,
            direction: FillDirection.Vertical,
            spacing: new Vector2(0, 5),
            children: [
              this.nameText = new OsuSpriteText().with({
                font: withFont(OsuFont.Torus, { size: 16, weight: FontWeight.SemiBold }),
                colour: this.colourProvider.content1,
                useFullGlyphHeight: false,
              }),
              this.settingsLabelsFlow = new TextFlowContainer(t => {
                t.font = withFont(OsuFont.Torus, { size: 12, weight: FontWeight.SemiBold });
              }).with({
                autoSizeAxes: Axes.Both,
                colour: this.colourProvider.content2,
              }),
            ],
          }),
          this.settingsValuesFlow = new TextFlowContainer(t => {
            t.font = withFont(OsuFont.Torus, { size: 12, weight: FontWeight.SemiBold });
          }).with({
            anchor: Anchor.BottomLeft,
            origin: Anchor.BottomLeft,
            autoSizeAxes: Axes.Both,
            colour: this.colourProvider.content1,
            textAnchor: Anchor.TopRight,
          }),
        ],
      }),
    ];

    return r;
  }

  private displayedSettings: [string, string][] | null = null;

  setContent(content: unknown): void {
    const mod = content as Mod;

    this.nameText.text = mod.name;

    const settings = mod.settingDescription;

    if (this.displayedSettings === null || !sequenceEqual(this.displayedSettings, settings)) {
      this.displayedSettings = settings;

      this.settingsLabelsFlow.clear();
      this.settingsValuesFlow.clear();

      if (this.displayedSettings.length > 0) {
        this.settingsLabelsFlow.show();
        this.settingsValuesFlow.show();

        for (const [setting, value] of this.displayedSettings) {
          this.settingsLabelsFlow.addText(setting);
          this.settingsLabelsFlow.newLine();

          this.settingsValuesFlow.addText(value);
          this.settingsValuesFlow.newLine();
        }
      } else {
        this.settingsLabelsFlow.hide();
        this.settingsValuesFlow.hide();
      }
    }
  }

  protected override popIn(): void {
    this.fadeIn(300, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.fadeOut(300, Easing.OutQuint);
  }

  move(pos: Vector2): void {
    this.position = pos;
  }
}

function sequenceEqual(a: readonly [string, string][], b: readonly [string, string][]): boolean {
  return a.length === b.length && a.every(([s, v], i) => s === b[i][0] && v === b[i][1]);
}
