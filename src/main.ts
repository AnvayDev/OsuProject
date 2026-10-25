// Boot: the web counterpart of osu.Desktop's Program.Main (host.Run(new OsuGameDesktop())).

import { GameHost } from '@fw/platform/GameHost';
import { OsuGame } from '@game/OsuGame';
import { BackgroundScreenDefault } from '@game/screens/backgrounds/BackgroundScreenDefault';
import type { OsuScreen } from '@game/screens/OsuScreen';
import { BackgroundPreviewScreen } from './BackgroundPreviewScreen';

// Temporary: until the loader, intro and main menu are ported, the first screen only shows the main menu background.
class WebOsuGame extends OsuGame {
  protected override createLoader(): OsuScreen | null {
    return new BackgroundPreviewScreen(() => new BackgroundScreenDefault());
  }
}

const host = new GameHost(document.body);
const game = new WebOsuGame();

host.run(game);

if (import.meta.env.DEV)
  void import('./dev/debug').then(m => m.installDebugHook(game));
