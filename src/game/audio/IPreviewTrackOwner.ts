// Ported from osu.Game/Audio/IPreviewTrackOwner.cs
// C# marks the interface [Cached], so an implementing drawable is cached as IPreviewTrackOwner for its children; DI keys are classes here,
// so implementations cache themselves with `dependencies.cacheAs(IPreviewTrackOwner, this)` and are recognised by their isPreviewTrackOwner
// marker.

/** Interface for objects that can own PreviewTracks. */
export abstract class IPreviewTrackOwner {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isPreviewTrackOwner?: unknown } | null)?.isPreviewTrackOwner === true;
  }

  abstract readonly isPreviewTrackOwner: true;
}
