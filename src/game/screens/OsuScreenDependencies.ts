// Ported from osu.Game/Screens/OsuScreenDependencies.cs (Mods are not ported: there is no gameplay).
// The global bindables are cached by generic type in C#; here they are cached as Bindable/LeasedBindable under the type argument's name.

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, LeasedBindable } from '@fw/bindables/Bindable';
import type { WorkingBeatmap } from '../beatmaps/WorkingBeatmap';
import type { RulesetInfo } from '../rulesets/RulesetInfo';

export class OsuScreenDependencies extends DependencyContainer {
  readonly beatmap: Bindable<WorkingBeatmap>;

  readonly ruleset: Bindable<RulesetInfo>;

  constructor(requireLease: boolean, parent: IReadOnlyDependencyContainer) {
    super(parent);

    if (requireLease) {
      let beatmap: Bindable<WorkingBeatmap> | undefined = parent.get(LeasedBindable<WorkingBeatmap>, 'WorkingBeatmap')?.getBoundCopy();

      if (beatmap === undefined) {
        beatmap = parent.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').beginLease(false);
        this.cacheAs(LeasedBindable<WorkingBeatmap>, beatmap as LeasedBindable<WorkingBeatmap>, 'WorkingBeatmap');
        this.cacheAs(Bindable<WorkingBeatmap>, beatmap, 'WorkingBeatmap');
      }

      this.beatmap = beatmap;

      let ruleset: Bindable<RulesetInfo> | undefined = parent.get(LeasedBindable<RulesetInfo>, 'RulesetInfo')?.getBoundCopy();

      if (ruleset === undefined) {
        ruleset = parent.resolve(Bindable<RulesetInfo>, 'RulesetInfo').beginLease(true);
        this.cacheAs(LeasedBindable<RulesetInfo>, ruleset as LeasedBindable<RulesetInfo>, 'RulesetInfo');
        this.cacheAs(Bindable<RulesetInfo>, ruleset, 'RulesetInfo');
      }

      this.ruleset = ruleset;
    } else {
      this.beatmap = (parent.get(LeasedBindable<WorkingBeatmap>, 'WorkingBeatmap') ?? parent.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap')).getBoundCopy();
      this.ruleset = (parent.get(LeasedBindable<RulesetInfo>, 'RulesetInfo') ?? parent.resolve(Bindable<RulesetInfo>, 'RulesetInfo')).getBoundCopy();
    }
  }
}
