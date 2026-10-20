// Browser check for the audio port: track streaming/time/amplitudes and sample playback through Web Audio.
import { Game, ASSET_ROOT } from '@fw/Game';
import { GameHost } from '@fw/platform/GameHost';
import { NamespacedResourceStore, UrlResourceStore } from '@fw/io/ResourceStore';
import type { Track } from '@fw/audio/track/Track';
import type { Sample } from '@fw/audio/sample/Sample';

class AudioGame extends Game {
  track: Track | null = null;
  sample: Sample | null = null;

  protected override loadComplete(): void {
    super.loadComplete();

    void (async () => {
      this.resources.addStore(await UrlResourceStore.fromManifest(`${ASSET_ROOT}/osu.Game.Resources`));
      this.track = await this.audio.getTrackStore(new NamespacedResourceStore(this.resources, 'Samples')).get('Intro/Welcome/welcome_piano');
      this.sample = await this.audio.samples.get('UI/button-select');
      (window as any).__osu.resolve(true);
    })();
  }
}

const host = new GameHost();
const game = new AudioGame();
let resolve!: (v: boolean) => void;
(window as any).__osu = { ready: new Promise<boolean>(r => (resolve = r)), resolve: (v: boolean) => resolve(v), goto: () => {} };
host.run(game);
(window as any).__audioScene = { host, game };
