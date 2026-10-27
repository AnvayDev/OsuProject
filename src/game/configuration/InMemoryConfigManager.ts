// Ported from osu.Game/Configuration/InMemoryConfigManager.cs

import { ConfigManager } from '@fw/configuration/ConfigManager';

export class InMemoryConfigManager<TLookup extends string> extends ConfigManager<TLookup> {
  constructor() {
    super();

    this.initialiseDefaults();
  }

  protected override performLoad(): void {
  }

  protected override performSave(): boolean {
    return true;
  }
}
