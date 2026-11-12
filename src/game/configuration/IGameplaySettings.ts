// Ported from osu.Game/Configuration/IGameplaySettings.cs
// C# marks the interface [Cached]; DI keys are classes here, so OsuGameBase caches the config manager with
// `cacheAs(IGameplaySettings, localConfig)`, and implementations carry the isGameplaySettings marker.

import type { Bindable } from '@fw/bindables/Bindable';

/**
 * A settings provider which generally sources from OsuConfigManager (global user settings)
 * but can allow overriding settings by caching more locally. For instance, in the editor compose screen.
 */
export abstract class IGameplaySettings {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isGameplaySettings?: unknown } | null)?.isGameplaySettings === true;
  }

  abstract readonly isGameplaySettings: true;

  abstract get comboColourNormalisationAmount(): Bindable<number>;

  abstract get positionalHitsoundsLevel(): Bindable<number>;
}
