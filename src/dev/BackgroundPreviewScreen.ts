// Dev only (not a port): a screen that only shows a background screen, for checking the shell before the intro/menu/song select exist.

import type { BackgroundScreen } from '@game/screens/BackgroundScreen';
import { OsuScreen } from '@game/screens/OsuScreen';

export class BackgroundPreviewScreen extends OsuScreen {
  constructor(private readonly createPreviewBackground: () => BackgroundScreen) {
    super();
  }

  protected override createBackground(): BackgroundScreen {
    return this.createPreviewBackground();
  }
}
