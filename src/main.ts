// Boot: the web counterpart of osu.Desktop's Program.Main (host.Run(new OsuGameDesktop())).

import { GameHost } from '@fw/platform/GameHost';
import { OsuGame } from '@game/OsuGame';
import { MainMenu } from '@game/screens/menu/MainMenu';
import type { OsuScreen } from '@game/screens/OsuScreen';

// Temporary: until the loader and intro are ported, the game starts at the main menu (C#'s Loader → IntroScreen → MainMenu).
class WebOsuGame extends OsuGame {
  protected override createLoader(): OsuScreen | null {
    return new MainMenu();
  }
}

const host = new GameHost(document.body);
const game = new WebOsuGame();

host.run(game);

if (import.meta.env.DEV)
  void import('./dev/debug').then(m => m.installDebugHook(game));
