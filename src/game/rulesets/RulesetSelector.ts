// Ported from osu.Game/Rulesets/RulesetSelector.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { TabControl } from '@fw/graphics/userInterface/TabControl';
import { type RulesetInfo, RulesetStore } from './RulesetInfo';

export abstract class RulesetSelector extends TabControl<RulesetInfo> {
  protected readonly rulesets = RulesetStore;

  // (CreateDropdown() => null: the framework TabControl's dropdown isn't ported)

  protected get legacyOnly(): boolean {
    return false;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    // (all four built-in rulesets are legacy rulesets, so legacyOnly filters none of them)
    for (const ruleset of this.rulesets.availableRulesets)
      this.addItem(ruleset);

    return r;
  }
}
