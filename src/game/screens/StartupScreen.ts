// Ported from osu.Game/Screens/StartupScreen.cs

import { OverlayActivation } from '../overlays/OverlayActivation';
import { OsuScreen } from './OsuScreen';

/** A screen which is shown once as part of the startup procedure. */
export abstract class StartupScreen extends OsuScreen {
  override get allowUserExit(): boolean {
    return false;
  }

  override get hideOverlaysOnEnter(): boolean {
    return true;
  }

  override get cursorVisible(): boolean {
    return false;
  }

  protected override get initialOverlayActivationMode(): OverlayActivation {
    return OverlayActivation.Disabled;
  }
}
