// Ported from osu.Game/Beatmaps/IBeatSyncProvider.cs
// C# marks the interface [Cached], so implementations are cached as IBeatSyncProvider. DI keys are classes here, so the interface is an abstract
// class: implementations extend it and are cached with `dependencies.cacheAs(IBeatSyncProvider, provider)`.

import type { IHasAmplitudes } from '@fw/audio/IHasAmplitudes';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import type { IClock } from '@fw/timing/IClock';
import type { ControlPointInfo } from './controlPoints/ControlPointInfo';

/** Provides various data sources which allow for synchronising visuals to a known beat. Primarily intended for use with BeatSyncedContainer. */
export abstract class IBeatSyncProvider implements IHasAmplitudes {
  /** Access any available control points from a beatmap providing beat sync. If null, no current provider is available. */
  abstract get controlPoints(): ControlPointInfo | null;

  /** Access a clock currently responsible for providing beat sync. */
  abstract get clock(): IClock;

  abstract get currentAmplitudes(): ChannelAmplitudes;
}
