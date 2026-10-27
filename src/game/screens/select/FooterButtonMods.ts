// Ported from osu.Game/Screens/Select/FooterButtonMods.cs
// Mods aren't ported, so there is no ModSelectOverlay for the button to toggle and the selection is always empty: the button stays in its
// no-mods state, where the mod display bar and unranked badge are hidden and the button keeps its base width.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { OsuColour } from '../../graphics/OsuColour';
import { ScreenFooterButton } from '../footer/ScreenFooterButton';

export class FooterButtonMods extends ScreenFooterButton {
  static readonly BAR_HEIGHT = 30;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.text = 'Mods';
    this.iconUsage = FontAwesome.Solid.ExchangeAlt;
    this.accentColour = colours.lime1;

    // (The footer sets Action to toggle the overlay; with no overlay, the button is still enabled as the C# one is.)
    this.action = () => {};

    return r;
  }
}
