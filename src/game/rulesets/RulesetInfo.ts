// Ported from osu.Game/Rulesets/RulesetInfo.cs, plus the built-in RulesetStore lookup (osu.Game/Rulesets/RulesetStore.cs) for the four official
// rulesets. Rulesets other than osu! are metadata-only in this port.
//
// C# instantiates a ruleset by reflection from InstantiationInfo. Here a ruleset's module registers how to create it (registerRuleset), so
// that this model does not import the ruleset implementation (which imports beatmaps, which import this). The game loads the ported
// rulesets' modules at startup (OsuGameBase), as RulesetStore loads their assemblies.

import type { Ruleset } from './Ruleset';

const instantiators = new Map<string, () => Ruleset>();

/** Makes RulesetInfo.createInstance work for a ruleset. Called by the ruleset's own module. */
export function registerRuleset(shortName: string, create: () => Ruleset): void {
  instantiators.set(shortName, create);
}

export class RulesetInfo {
  shortName = '';

  onlineID = -1;

  name = '';

  instantiationInfo = '';

  lastAppliedDifficultyVersion = 0;

  available = false;

  constructor(shortName = '', name = '', instantiationInfo = '', onlineID = -1) {
    this.shortName = shortName;
    this.name = name;
    this.instantiationInfo = instantiationInfo;
    this.onlineID = onlineID;
  }

  equals(other: RulesetInfo | null): boolean {
    if (this === other) return true;
    if (other === null) return false;

    return this.shortName === other.shortName;
  }

  compareTo(other: RulesetInfo | null): number {
    if (this.onlineID >= 0 && other !== null && other.onlineID >= 0)
      return Math.sign(this.onlineID - other.onlineID);

    // Official rulesets are always given precedence for the time being.
    if (this.onlineID >= 0)
      return -1;

    if (other !== null && other.onlineID >= 0)
      return 1;

    const a = this.shortName, b = other?.shortName ?? '';
    return a < b ? -1 : a > b ? 1 : 0;
  }

  toString(): string {
    return this.name;
  }

  /** (CreateInstance: only the osu! ruleset is ported; the others have no instance, so no mods.) */
  createInstance(): Ruleset | null {
    return instantiators.get(this.shortName)?.() ?? null;
  }

  clone(): RulesetInfo {
    const r = new RulesetInfo(this.shortName, this.name, this.instantiationInfo, this.onlineID);
    r.available = this.available;
    r.lastAppliedDifficultyVersion = this.lastAppliedDifficultyVersion;
    return r;
  }
}

const official = [
  new RulesetInfo('osu', 'osu!', 'osu.Game.Rulesets.Osu.OsuRuleset, osu.Game.Rulesets.Osu', 0),
  new RulesetInfo('taiko', 'osu!taiko', 'osu.Game.Rulesets.Taiko.TaikoRuleset, osu.Game.Rulesets.Taiko', 1),
  new RulesetInfo('fruits', 'osu!catch', 'osu.Game.Rulesets.Catch.CatchRuleset, osu.Game.Rulesets.Catch', 2),
  new RulesetInfo('mania', 'osu!mania', 'osu.Game.Rulesets.Mania.ManiaRuleset, osu.Game.Rulesets.Mania', 3),
];

for (const r of official) r.available = true;

export const RulesetStore = {
  /** Retrieve a ruleset using a known ID, or null if no ruleset with that ID exists. */
  getRuleset(id: number | string): RulesetInfo | null {
    return official.find(r => (typeof id === 'number' ? r.onlineID === id : r.shortName === id)) ?? null;
  },

  get availableRulesets(): readonly RulesetInfo[] {
    return official;
  },
};
