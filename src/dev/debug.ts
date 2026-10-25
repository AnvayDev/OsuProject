// Dev only: the window.__osu hook scripts/shot.mjs drives (see docs/ARCHITECTURE.md, Verification tools).

import type { BeatmapManager } from '@game/beatmaps/BeatmapManager';
import type { BeatmapSetInfo } from '@game/beatmaps/BeatmapSetInfo';
import { ImportTask } from '@game/database/ImportTask';
import { type ButtonSystem, ButtonSystemState } from '@game/screens/menu/ButtonSystem';
import type { OsuLogo } from '@game/screens/menu/OsuLogo';
import type { OsuGame } from '@game/OsuGame';
import { BackgroundScreenBeatmap } from '@game/screens/backgrounds/BackgroundScreenBeatmap';
import { BackgroundScreenDefault } from '@game/screens/backgrounds/BackgroundScreenDefault';
import type { OsuScreenStack } from '@game/screens/OsuScreenStack';
import { BackgroundPreviewScreen } from '../BackgroundPreviewScreen';

interface DebugHook {
  readonly game: OsuGame;
  readonly ready: Promise<void>;
  goto(state: string): Promise<void>;
  importUrl(url: string): Promise<void>;
}

declare global {
  interface Window {
    __osu?: DebugHook;
  }
}

/** The bundled theme beatmap of the triangles intro. */
const theme_set = '/assets/osu.Game.Resources/Tracks/triangles.osz';

/** The fixture set used by the dev states (it has a background image). */
const fixture_set = '/tests/fixtures/osu-tests/241526 Soleily - Renatus_virtual_quick.osz';

export function installDebugHook(game: OsuGame): void {
  // The members the hook drives are protected in OsuGame.
  const internals = game as unknown as { screenStack: OsuScreenStack; beatmapManager: BeatmapManager };

  const ready = new Promise<void>(resolve => {
    if (game.isLoaded) resolve();
    else game.onLoadComplete.add(() => resolve());
  });

  const importUrl = async (url: string) => {
    const r = await fetch(url);
    const name = decodeURIComponent(url.split('/').pop()!);
    await internals.beatmapManager.import([new ImportTask(new Uint8Array(await r.arrayBuffer()), name)]);
  };

  const push = (screen: BackgroundPreviewScreen) => {
    const stack = internals.screenStack;
    const current = stack.currentScreen;

    if (current === null)
      stack.push(screen);
    else
      (current as BackgroundPreviewScreen).push(screen);
  };

  window.__osu = {
    game,
    ready,
    importUrl,
    async goto(state: string) {
      await ready;

      switch (state) {
        case 'background-default':
          push(new BackgroundPreviewScreen(() => new BackgroundScreenDefault()));
          break;

        case 'background-beatmap': {
          if (internals.beatmapManager.queryBeatmapSet(s => s.onlineID === 241526) === null)
            await importUrl(fixture_set);

          const set = internals.beatmapManager.queryBeatmapSet(s => s.onlineID === 241526)!;
          game.beatmap.value = internals.beatmapManager.getWorkingBeatmap(set.beatmaps[0]);
          push(new BackgroundPreviewScreen(() => new BackgroundScreenBeatmap(game.beatmap.value)));
          break;
        }

        // The game boots into the main menu (main.ts); these states drive its ButtonSystem.
        case 'mainmenu':
          break;

        case 'mainmenu-toplevel':
        case 'mainmenu-play': {
          // Wait for the menu to receive the logo (ButtonSystem.setOsuLogo assigns its action), then click it like a user.
          const logo = (game as unknown as { osuLogo: OsuLogo }).osuLogo;
          while (logo.action === null)
            await new Promise(r => requestAnimationFrame(r));

          logo.triggerClick();

          if (state === 'mainmenu-play')
            (internals.screenStack.currentScreen as unknown as { buttons: ButtonSystem }).buttons.state = ButtonSystemState.Play;
          break;
        }

        // Plays the bundled "triangles" theme beatmap (what the triangles intro would leave playing).
        case 'mainmenu-music': {
          const isTheme = (s: BeatmapSetInfo) => s.beatmaps[0]?.metadata.title === 'triangles' && s.beatmaps[0]?.metadata.artist === 'cYsmix';
          if (internals.beatmapManager.queryBeatmapSet(isTheme) === null)
            await importUrl(theme_set);

          const set = internals.beatmapManager.queryBeatmapSet(isTheme)!;
          game.beatmap.value = internals.beatmapManager.getWorkingBeatmap(set.beatmaps[0]);
          game.beatmap.value.track.start();
          break;
        }

        default:
          throw new Error(`Unknown state ${state}`);
      }
    },
  };
}
