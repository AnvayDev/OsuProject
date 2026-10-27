// Dev only: the window.__osu hook scripts/shot.mjs drives (see docs/ARCHITECTURE.md, Verification tools).

import type { BeatmapManager } from '@game/beatmaps/BeatmapManager';
import { ImportTask } from '@game/database/ImportTask';
import { type ButtonSystem, ButtonSystemState } from '@game/screens/menu/ButtonSystem';
import { MainMenu } from '@game/screens/menu/MainMenu';
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

/** The fixture set used by the dev states (it has a background image). */
const fixture_set = '/tests/fixtures/osu-tests/241526 Soleily - Renatus_virtual_quick.osz';

/** The sets imported for the song select states. */
const song_select_sets: [onlineID: number, url: string][] = [
  [241526, fixture_set],
  [1032103, '/tests/fixtures/1032103 LukHash - H8 U.osz'],
];

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

        // The intro plays at boot (main.ts); these states wait for it to hand over to the main menu, then drive its ButtonSystem.
        case 'mainmenu':
        case 'mainmenu-toplevel':
        case 'mainmenu-play':
        case 'beatmap-listing': {
          // Wait for the menu to receive the logo (ButtonSystem.setOsuLogo assigns its action).
          const logo = (game as unknown as { osuLogo: OsuLogo }).osuLogo;
          while (!(internals.screenStack.currentScreen instanceof MainMenu) || logo.action === null)
            await new Promise(r => requestAnimationFrame(r));

          if (state === 'mainmenu')
            break;

          logo.triggerClick();

          if (state === 'mainmenu-play')
            (internals.screenStack.currentScreen as unknown as { buttons: ButtonSystem }).buttons.state = ButtonSystemState.Play;

          // The top level "browse" button.
          if (state === 'beatmap-listing')
            (internals.screenStack.currentScreen as unknown as { buttons: ButtonSystem }).buttons.onBeatmapListing?.();
          break;
        }

        // The main menu's solo button: waits for the menu as above, with the song select sets imported.
        case 'songselect': {
          for (const [onlineID, url] of song_select_sets) {
            if (internals.beatmapManager.queryBeatmapSet(s => s.onlineID === onlineID) === null)
              await importUrl(url);
          }

          const logo = (game as unknown as { osuLogo: OsuLogo }).osuLogo;
          while (!(internals.screenStack.currentScreen instanceof MainMenu) || logo.action === null)
            await new Promise(r => requestAnimationFrame(r));

          (internals.screenStack.currentScreen as unknown as { loadSongSelect(): void }).loadSongSelect();
          break;
        }

        default:
          throw new Error(`Unknown state ${state}`);
      }
    },
  };
}
