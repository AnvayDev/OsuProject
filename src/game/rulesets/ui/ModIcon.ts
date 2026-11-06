// Ported from osu.Game/Rulesets/UI/ModIcon.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import type { ITooltip } from '@fw/graphics/cursor/ITooltip';
import type { Drawable } from '@fw/graphics/Drawable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { TextureStore } from '@fw/graphics/textures/TextureStore';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { valueAt } from '@fw/transforms/Interpolation';
import { ModSettingChangeTracker } from '../../configuration/ModSettingChangeTracker';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { Mod } from '../mods/Mod';
import { ModTooltip } from './ModTooltip';

/** Display the specified mod at a fixed size. (IHasCustomTooltip<Mod>) */
export class ModIcon extends Container {
  readonly selected = new BindableBool();

  private modIcon!: SpriteIcon;
  private modAcronym!: SpriteText;
  private background!: Sprite;

  static readonly MOD_ICON_SIZE = new Vector2(80);

  private _tooltipContent: Mod | null = null;

  get tooltipContent(): Mod | null {
    return this._tooltipContent;
  }

  private _mod: Mod;

  private _showExtendedInformation: boolean;

  get showExtendedInformation(): boolean {
    return this._showExtendedInformation;
  }

  set showExtendedInformation(value: boolean) {
    this._showExtendedInformation = value;
    this.updateExtendedInformation();
  }

  get mod(): Mod {
    return this._mod;
  }

  set mod(value: Mod) {
    if (this._mod === value)
      return;

    this._mod = value;

    if (this.isLoaded)
      this.updateMod(value);
  }

  private colours!: OsuColour;
  private colourProvider: OverlayColourProvider | null = null;

  private backgroundColour!: Colour4;

  private extendedBackground!: Sprite;
  private extendedText!: OsuSpriteText;
  private extendedContent!: Container;

  private adjustmentMarker!: Drawable;
  private cogBackground!: SpriteIcon;
  private cog!: SpriteIcon;

  private modSettingsChangeTracker: ModSettingChangeTracker | null = null;

  /**
   * @param showTooltip Whether a tooltip describing the mod should display on hover.
   * @param showExtendedInformation Whether to display a mod's extended information, if available.
   */
  constructor(mod: Mod, private readonly showTooltip = true, showExtendedInformation = true) {
    super();

    // May expand due to expanded content, so autosize here.
    this.autoSizeAxes = Axes.X;
    this.height = ModIcon.MOD_ICON_SIZE.y;

    this._mod = mod;
    this._showExtendedInformation = showExtendedInformation;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);
    this.colourProvider = dependencies.get(OverlayColourProvider);

    const textures = dependencies.resolve(TextureStore);
    const [extenderTexture, iconTexture] = await Promise.all([textures.get('Icons/BeatmapDetails/mod-icon-extender'), textures.get('Icons/BeatmapDetails/mod-icon')]);

    this.children = [
      this.extendedContent = new Container().with({
        name: 'extended content',
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        size: new Vector2(116, ModIcon.MOD_ICON_SIZE.y),
        x: ModIcon.MOD_ICON_SIZE.x - 22,
        children: [
          this.extendedBackground = new Sprite().with({
            relativeSizeAxes: Axes.Both,
            fillMode: FillMode.Fit,
            texture: extenderTexture,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
          }),
          this.extendedText = new OsuSpriteText().with({
            font: withFont(OsuFont.Default, { size: 34, weight: FontWeight.Bold }),
            useFullGlyphHeight: false,
            text: this._mod.extendedIconInformation,
            x: 6,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
          }),
        ],
      }),
      new Container().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        name: 'main content',
        size: ModIcon.MOD_ICON_SIZE,
        children: [
          this.background = new Sprite().with({
            relativeSizeAxes: Axes.Both,
            fillMode: FillMode.Fit,
            texture: iconTexture,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
          }),
          this.modAcronym = new OsuSpriteText().with({
            origin: Anchor.Centre,
            anchor: Anchor.Centre,
            alpha: 0,
            font: withFont(OsuFont.Numeric, { size: 22, weight: FontWeight.Black }),
            useFullGlyphHeight: false,
            text: this._mod.acronym,
          }),
          this.modIcon = new SpriteIcon().with({
            origin: Anchor.Centre,
            anchor: Anchor.Centre,
            relativeSizeAxes: Axes.Both,
            // the mod icon assets in `osu-resources` are sized such that they are flush with the hexagonal background with no shadow baked in.
            // the `Icons/BeatmapDetails/mod-icon` asset (of size 135x100) has a shadow and some extra transparent pixels baked in.
            // the hexagonal background on that asset, excluding its shadow and the transparent pixels, is 131px wide and 92px high.
            // height is divided by 135 rather than by 100, because this entire component is square-sized.
            width: Math.fround(131 / 135),
            height: Math.fround(92 / 135),
            icon: FontAwesome.Solid.Question,
          }),
          this.adjustmentMarker = new Container().with({
            size: new Vector2(20),
            origin: Anchor.Centre,
            position: new Vector2(64, 14),
            children: [
              this.cogBackground = new SpriteIcon().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                relativeSizeAxes: Axes.Both,
                icon: FontAwesome.Solid.Circle,
              }),
              this.cog = new SpriteIcon().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                icon: FontAwesome.Solid.Cog,
                relativeSizeAxes: Axes.Both,
                size: new Vector2(Math.fround(0.6)),
              }),
            ],
          }),
        ],
      }),
    ];
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.selected.bindValueChanged(() => this.updateColour());

    this.updateMod(this._mod);
  }

  private updateMod(value: Mod): void {
    this.modSettingsChangeTracker?.dispose();

    this.modSettingsChangeTracker = new ModSettingChangeTracker([value]);
    this.modSettingsChangeTracker.settingChanged = () => this.updateExtendedInformation();

    this.modAcronym.text = value.acronym;
    this.modIcon.icon = value.icon ?? FontAwesome.Solid.Question;

    this._tooltipContent = this.showTooltip ? value : null;

    if (value.icon === null) {
      this.modIcon.fadeOut();
      this.modAcronym.fadeIn();
    } else {
      this.modIcon.fadeIn();
      this.modAcronym.fadeOut();
    }

    this.backgroundColour = this.colours.forModType(value.type);
    this.updateColour();

    this.updateExtendedInformation();
  }

  private updateExtendedInformation(): void {
    // (the setter can run before load)
    if (this.extendedContent === undefined)
      return;

    const showExtended = this._showExtendedInformation && this._mod.extendedIconInformation !== '';

    this.extendedContent.alpha = showExtended ? 1 : 0;
    this.extendedText.text = this._mod.extendedIconInformation;

    if (this._mod.hasNonDefaultSettings)
      this.adjustmentMarker.show();
    else
      this.adjustmentMarker.hide();
  }

  private updateColour(): void {
    this.modAcronym.colour = this.modIcon.colour = valueAt(Math.fround(0.1), Colour4.Black, this.backgroundColour, 0, 1);

    this.cogBackground.colour = valueAt(Math.fround(0.1), Colour4.Black, this.backgroundColour, 0, 1);
    this.cog.colour = this.backgroundColour;

    this.extendedText.colour = this.background.colour = this.selected.value ? this.backgroundColour.lighten(Math.fround(0.2)) : this.backgroundColour;
    this.extendedBackground.colour = this.selected.value ? this.backgroundColour.darken(Math.fround(2.4)) : this.backgroundColour.darken(Math.fround(2.8));
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.modSettingsChangeTracker?.dispose();
  }

  getCustomTooltip(): ITooltip {
    return new ModTooltip(this.colourProvider);
  }
}
