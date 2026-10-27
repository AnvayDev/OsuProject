// Ported from osu.Game/Beatmaps/BeatSyncProviderExtensions.cs

import type { IBeatSyncProvider } from './IBeatSyncProvider';

export const BeatSyncProviderExtensions = {
  /** Whether the beat sync provider is currently in a kiai section. Should make everything more epic. */
  checkIsKiaiTime(provider: IBeatSyncProvider): boolean {
    return provider.controlPoints?.effectPointAt(provider.clock.currentTime).kiaiMode === true;
  },
};
