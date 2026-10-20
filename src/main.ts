// Boot: the web counterpart of osu.Desktop's Program.Main (host.Run(new OsuGameDesktop())).

import { GameHost } from '@fw/platform/GameHost';
import { OsuGame } from '@game/OsuGame';

const host = new GameHost(document.body);
const game = new OsuGame();

host.run(game);

if (import.meta.env.DEV)
  void import('./dev/debug').then(m => m.installDebugHook(game));
