// Ported from osu.Game/Configuration/ModSettingChangeTracker.cs
// C# listens through the mods' settings controls (CreateSettingsControls); here it listens to bound copies of the setting bindables, which
// is where those controls' changes come from.

import type { Bindable } from '@fw/bindables/Bindable';
import type { Mod } from '../rulesets/mods/Mod';

/** A helper class for tracking changes to the settings of a set of Mods. Ensure to dispose when usage is finished. */
export class ModSettingChangeTracker {
  /** Notifies a subscriber when the setting of any tracked Mod has changed. */
  settingChanged: ((mod: Mod) => void) | null = null;

  private readonly settings: Bindable<unknown>[] = [];

  constructor(mods: Iterable<Mod>) {
    for (const mod of mods) {
      for (const source of mod.getSettingsSourceProperties()) {
        const setting = source.bindable.getBoundCopy();
        setting.bindValueChanged(() => this.settingChanged?.(mod));
        this.settings.push(setting);
      }
    }
  }

  dispose(): void {
    this.settingChanged = null;

    for (const r of this.settings)
      r.unbindAll();

    this.settings.length = 0;
  }
}
