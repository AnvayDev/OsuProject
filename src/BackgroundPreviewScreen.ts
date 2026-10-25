// Not a port: a temporary first screen that only shows a background screen, until the loader/intro/main menu are ported (main.ts) and for the
// dev states (src/dev/debug.ts).

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
