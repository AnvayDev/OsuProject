// Ported from osu.Game/Rulesets/UI/ModSwitchSmall.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { TextureStore } from '@fw/graphics/textures/TextureStore';
import { Anchor, Axes, FillDirection, FillMode } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { valueAt } from '@fw/transforms/Interpolation';
import { OsuColour } from '../../graphics/OsuColour';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { Mod } from '../mods/Mod';
import { ModSwitchTiny } from './ModSwitchTiny';

export class ModSwitchSmall extends CompositeDrawable {
  readonly active = new BindableBool();

  static readonly DEFAULT_SIZE = 60;

  private background!: Drawable;
  private modIcon: SpriteIcon | null = null;

  private activeForegroundColour!: Colour4;
  private inactiveForegroundColour!: Colour4;

  private activeBackgroundColour!: Colour4;
  private inactiveBackgroundColour!: Colour4;

  constructor(private readonly mod: Mod) {
    super();

    this.size = new Vector2(ModSwitchSmall.DEFAULT_SIZE);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const textures = dependencies.resolve(TextureStore);
    const colours = dependencies.resolve(OsuColour);
    const colourProvider = dependencies.get(OverlayColourProvider);

    let contentFlow!: FillFlowContainer;
    let tinySwitch!: ModSwitchTiny;

    this.internalChildren = [
      this.background = new Sprite().with({
        relativeSizeAxes: Axes.Both,
        fillMode: FillMode.Fit,
        texture: await textures.get('Icons/BeatmapDetails/mod-icon'),
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
      }),
      contentFlow = new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        direction: FillDirection.Vertical,
        child: tinySwitch = new ModSwitchTiny(this.mod).with({
          anchor: Anchor.TopCentre,
          origin: Anchor.TopCentre,
          scale: new Vector2(Math.fround(0.6)),
        }),
      }),
    ];

    tinySwitch.active.bindTo(this.active);

    if (this.mod.icon !== null) {
      contentFlow.insert(-1, this.modIcon = new SpriteIcon().with({
        anchor: Anchor.TopCentre,
        origin: Anchor.TopCentre,
        size: new Vector2(37, 26),
        // arbitrary adjustment for better vertical alignment
        margin: MarginPadding.of({ top: -1 }),
        icon: this.mod.icon,
      }));

      tinySwitch.scale = new Vector2(Math.fround(0.3));
    }

    const modTypeColour = colours.forModType(this.mod.type);

    this.inactiveForegroundColour = colourProvider?.background5 ?? colours.gray3;
    this.activeForegroundColour = modTypeColour;

    this.inactiveBackgroundColour = colourProvider?.background2 ?? colours.gray5;
    this.activeBackgroundColour = valueAt(Math.fround(0.1), Colour4.Black, modTypeColour, 0, 1);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.active.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);
  }

  private updateState(): void {
    this.modIcon?.fadeColour(this.active.value ? this.activeForegroundColour : this.inactiveForegroundColour, 200, Easing.OutQuint);
    this.background.fadeColour(this.active.value ? this.activeBackgroundColour : this.inactiveBackgroundColour, 200, Easing.OutQuint);
  }
}
