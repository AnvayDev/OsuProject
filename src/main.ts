// Boot: the web counterpart of osu.Desktop's Program.Main (host.Run(new OsuGameDesktop())).

import { GameHost } from '@fw/platform/GameHost';
import { OsuGame } from '@game/OsuGame';
import { Loader } from '@game/screens/Loader';
import type { OsuScreen } from '@game/screens/OsuScreen';
import { AudioUnlockScreen } from './AudioUnlockScreen';

class WebOsuGame extends OsuGame {
  // The intro needs audio, so the Loader comes after the first user gesture (AudioUnlockScreen).
  protected override createLoader(): OsuScreen | null {
    return new AudioUnlockScreen(() => new Loader());
  }
}

class WebGameHost extends GameHost {
  // A browser tab can't close itself: after the "see ya" outro the page stays black, and a click starts the game again.
  protected override performExit(): void {
    super.performExit();
    window.addEventListener('pointerdown', () => location.reload(), { once: true });
  }
}

const host = new WebGameHost(document.body);
const game = new WebOsuGame();

host.run(game);

if (import.meta.env.DEV)
  void import('./dev/debug').then(m => m.installDebugHook(game));
