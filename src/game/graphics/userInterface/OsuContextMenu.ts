// Ported from osu.Game/Graphics/UserInterface/OsuContextMenu.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import type { Menu } from '@fw/graphics/userInterface/Menu';
import { Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { OsuColour } from '../OsuColour';
import { DrawableOsuMenuItem } from './DrawableOsuMenuItem';
import { OsuMenu } from './OsuMenu';
import { OsuMenuSamples } from './OsuMenuSamples';

export class OsuContextMenu extends OsuMenu {
  private contextMenuSamples!: OsuMenuSamples;

  constructor(playSamples: boolean) {
    super(Direction.Vertical, false, playSamples);

    this.maskingContainer.cornerRadius = 5;
    this.maskingContainer.edgeEffect = new EdgeEffectParameters({
      type: EdgeEffectType.Shadow,
      colour: Colour4.Black.opacity(Math.fround(0.1)),
      radius: 4,
    });

    this.itemsContainer.padding = MarginPadding.of({ vertical: DrawableOsuMenuItem.MARGIN_VERTICAL });

    this.maxHeight = 250;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.contextMenuSamples = dependencies.resolve(OsuMenuSamples);
    this.backgroundColour = dependencies.resolve(OsuColour).contextMenuGray;
    return r;
  }

  protected override animateOpen(): void {
    if (this.playSamples && !this.wasOpened)
      this.contextMenuSamples.playClickSample();

    super.animateOpen();
  }

  protected override createSubMenu(): Menu {
    return new OsuContextMenu(false); // sub menu samples are handled by OsuMenu.OnSubmenuOpen.
  }
}
