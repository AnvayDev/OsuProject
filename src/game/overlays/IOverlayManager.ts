// Ported from osu.Game/Overlays/IOverlayManager.cs
// C# marks the interface [Cached]; DI keys are classes here, so OsuGame is cached with `dependencies.cacheAs(IOverlayManager, this)`, and
// implementations are recognised by their isOverlayManager marker.
// Not ported yet: RegisterBlockingOverlay (its users, song select's own overlays, aren't ported).

import type { Bindable } from '@fw/bindables/Bindable';
import type { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import type { OverlayActivation } from './OverlayActivation';

export abstract class IOverlayManager {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isOverlayManager?: unknown } | null)?.isOverlayManager === true;
  }

  abstract readonly isOverlayManager: true;

  /** Whether overlays should be able to be opened game-wide. Value is sourced from the current active screen. */
  abstract get overlayActivationMode(): Bindable<OverlayActivation>;

  /** Should be called when overlay has been shown and should begin blocking background input. */
  abstract showBlockingOverlay(overlay: OverlayContainer): void;

  /** Should be called when a blocking overlay has been hidden and should stop blocking background input. */
  abstract hideBlockingOverlay(overlay: OverlayContainer): void;
}
