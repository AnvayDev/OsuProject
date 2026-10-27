// Ported from osu.Game/Screens/Menu/MenuLogoVisualisation.cs
// There is no API user, so the user is never a supporter and the colour is always white (the skin's MenuGlow only applies to supporters).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { LogoVisualisation } from './LogoVisualisation';

export class MenuLogoVisualisation extends LogoVisualisation {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    // skin.BindValueChanged(_ => UpdateColour(), true)
    this.updateColour();

    return r;
  }

  protected updateColour(): void {
    this.colour = Colour4.White;
  }
}
