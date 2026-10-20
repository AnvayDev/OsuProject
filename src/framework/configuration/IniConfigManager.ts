// Ported from osu.Framework/Configuration/IniConfigManager.cs
// The web Storage is window.localStorage: the ini text lives under the item named after Filename (C# writes it as a file in the game's storage).
// Lookups are string enums, so C#'s Enum.TryParse(key) becomes a membership test of the enum's values.

import { Logger, LoggingTarget, LogLevel } from '../logging/Logger';
import { ConfigManager } from './ConfigManager';

export class IniConfigManager<TLookup extends string> extends ConfigManager<TLookup> {
  /** The backing file used to store the config. Null means no persistent storage. */
  protected get filename(): string | null {
    return 'game.ini';
  }

  constructor(private readonly storage: Storage, private readonly lookups: Readonly<Record<string, TLookup>>,
              defaultOverrides: ReadonlyMap<TLookup, unknown> | null = null) {
    super(defaultOverrides);

    this.initialiseDefaults();
    this.load();
  }

  protected override performLoad(): void {
    if (!this.filename) return;

    const text = this.storage.getItem(this.filename);

    if (text === null)
      return;

    const lookups = new Set<string>(Object.values(this.lookups));

    for (const line of text.split(/\r?\n/)) {
      const equalsIndex = line.indexOf('=');

      if (line.length === 0 || line[0] === '#' || equalsIndex < 0) continue;

      const key = line.slice(0, equalsIndex).trim();
      const val = line.slice(equalsIndex + 1).trim();

      if (!lookups.has(key))
        continue;

      const lookup = key as TLookup;
      const b = this.configStore.get(lookup);

      if (b !== undefined) {
        try {
          b.parse(val);
        } catch (e) {
          Logger.log(`Unable to parse config key ${lookup}: ${e}`, LoggingTarget.Runtime, LogLevel.Important);
        }
      } else if (this.addMissingEntries)
        this.setDefault(lookup, val);
    }
  }

  protected override performSave(): boolean {
    if (!this.filename) return false;

    try {
      const lines = [...this.configStore].map(([key, value]) => `${key} = ${value.toString().replace(/[\n\r]/g, '')}`);
      this.storage.setItem(this.filename, lines.map(l => `${l}\n`).join(''));
    } catch {
      return false;
    }

    return true;
  }
}
