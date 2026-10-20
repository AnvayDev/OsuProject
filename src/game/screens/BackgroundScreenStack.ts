// Ported from osu.Game/Screens/BackgroundScreenStack.cs

import { Anchor, Axes } from '@fw/layout/Enums';
import type { IScreen } from '@fw/screens/IScreen';
import { ScreenStack } from '@fw/screens/ScreenStack';
import type { BackgroundScreen } from './BackgroundScreen';

export class BackgroundScreenStack extends ScreenStack {
  constructor() {
    super(null, false);

    this.relativeSizeAxes = Axes.Both;
    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;
  }

  /**
   * Attempt to push a new background screen (a BackgroundScreen; C# hides the base Push with this signature) to this stack.
   * Returns whether the push succeeded. For example, if the existing screen was already of the correct type this will return false.
   */
  override push(screen: IScreen | null): boolean {
    if (screen === null)
      return false;

    const isFirstScreen = this.currentScreen === null;
    (screen as BackgroundScreen).animateEntry = !isFirstScreen;

    // EqualityComparer<BackgroundScreen>.Default.Equals(CurrentScreen, screen)
    const current = this.currentScreen as BackgroundScreen | null;
    if (current !== null && current.equals(screen as BackgroundScreen))
      return false;

    super.push(screen);
    return true;
  }
}
