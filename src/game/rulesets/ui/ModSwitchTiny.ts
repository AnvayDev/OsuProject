// Ported from osu.Game/Rulesets/UI/ModSwitchTiny.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';

import { valueAt } from '@fw/transforms/Interpolation';
import { ModSettingChangeTracker } from '../../configuration/ModSettingChangeTracker';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { Mod } from '../mods/Mod';

export class ModSwitchTiny extends CompositeDrawable {
  readonly active = new BindableBool();

  static readonly DEFAULT_HEIGHT = 30;
  static readonly WIDTH = 73;

  private readonly background: Box;
  private readonly acronymText: OsuSpriteText;

  private activeForegroundColour!: Colour4;
  private inactiveForegroundColour!: Colour4;

  private activeBackgroundColour!: Colour4;
  private inactiveBackgroundColour!: Colour4;

  private readonly extendedContent: CircularContainer;
  private readonly extendedBackground: Box;
  private readonly extendedText: OsuSpriteText;
  private modSettingsChangeTracker: ModSettingChangeTracker | null = null;

  constructor(protected readonly mod: Mod, private readonly showExtendedInformation = false) {
    super();

    this.autoSizeAxes = Axes.X;
    this.height = ModSwitchTiny.DEFAULT_HEIGHT;

    this.internalChildren = [
      this.extendedContent = new CircularContainer().with({
        name: 'extended content',
        width: 100 + ModSwitchTiny.DEFAULT_HEIGHT / 2,
        relativeSizeAxes: Axes.Y,
        masking: true,
        x: ModSwitchTiny.WIDTH,
        margin: MarginPadding.of({ left: -ModSwitchTiny.DEFAULT_HEIGHT }),
        children: [
          this.extendedBackground = new Box().with({
            relativeSizeAxes: Axes.Both,
          }),
          this.extendedText = new OsuSpriteText().with({
            margin: MarginPadding.of({ left: 3 * ModSwitchTiny.DEFAULT_HEIGHT / 4 }),
            font: withFont(OsuFont.Default, { size: 30, weight: FontWeight.Bold }),
            useFullGlyphHeight: false,
            text: mod.extendedIconInformation,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
          }),
        ],
      }),
      new CircularContainer().with({
        width: ModSwitchTiny.WIDTH,
        relativeSizeAxes: Axes.Y,
        masking: true,
        children: [
          this.background = new Box().with({
            relativeSizeAxes: Axes.Both,
          }),
          this.acronymText = new OsuSpriteText().with({
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            shadow: false,
            font: withFont(OsuFont.Numeric, { size: 24, weight: FontWeight.Black }),
            text: mod.acronym,
            margin: MarginPadding.of({
              top: 4,
            }),
          }),
        ],
      }),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    const colourProvider = dependencies.get(OverlayColourProvider);

    const modTypeColour = colours.forModType(this.mod.type);

    this.inactiveBackgroundColour = colourProvider?.background5 ?? colours.gray3;
    this.activeBackgroundColour = modTypeColour;

    this.inactiveForegroundColour = colourProvider?.background2 ?? colours.gray5;
    this.activeForegroundColour = valueAt(Math.fround(0.1), Colour4.Black, modTypeColour, 0, 1);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.active.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);

    this.modSettingsChangeTracker = new ModSettingChangeTracker([this.mod]);
    this.modSettingsChangeTracker.settingChanged = () => this.updateExtendedInformation();

    this.updateExtendedInformation();
  }

  private updateExtendedInformation(): void {
    const showExtended = this.showExtendedInformation && this.mod.extendedIconInformation !== '';

    this.extendedContent.alpha = showExtended ? 1 : 0;
    this.extendedText.text = this.mod.extendedIconInformation;
  }

  private updateState(): void {
    this.acronymText.fadeColour(this.active.value ? this.activeForegroundColour : this.inactiveForegroundColour, 200, Easing.OutQuint);
    this.background.fadeColour(this.active.value ? this.activeBackgroundColour : this.inactiveBackgroundColour, 200, Easing.OutQuint);

    this.extendedText.colour = this.active.value ? this.activeBackgroundColour.lighten(Math.fround(0.2)) : this.inactiveBackgroundColour;
    this.extendedBackground.colour = this.active.value ? this.activeBackgroundColour.darken(Math.fround(2.4)) : this.inactiveBackgroundColour.darken(Math.fround(2.8));
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.modSettingsChangeTracker?.dispose();
  }
}
