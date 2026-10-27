// Ported from osu.Game/Graphics/UserInterface/Hotkey.cs (the GlobalAction form, the only one used so far).
// Web: there is no RealmKeyBindingStore yet: a global action's key combinations are GlobalActionContainer's default bindings (they can't be
// changed), read as RealmKeyBindingStore.GetReadableKeyCombinationsFor does.

import type { ReadableKeyCombinationProvider } from '@fw/input/ReadableKeyCombinationProvider';
import type { GlobalAction } from '../../input/bindings/GlobalAction';
import { GlobalActionContainer } from '../../input/bindings/GlobalActionContainer';

export class Hotkey {
  constructor(readonly globalAction: GlobalAction) {}

  resolveKeyCombination(keyCombinationProvider: ReadableKeyCombinationProvider): string[] {
    const result: string[] = [];

    for (const binding of new GlobalActionContainer(null).defaultKeyBindings) {
      if (binding.action !== this.globalAction)
        continue;

      const str = keyCombinationProvider.getReadableString(binding.keyCombination);

      // even if found, the readable string may be empty for an unbound action.
      if (str.length > 0)
        result.push(str);
    }

    return result;
  }

  equals(other: Hotkey): boolean {
    return this.globalAction === other.globalAction;
  }
}
