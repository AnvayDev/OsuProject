// Ported from osu.Game/Overlays/Mods/ModState.cs

import { BindableBool } from '@fw/bindables/Bindable';
import type { Mod } from '../../rulesets/mods/Mod';

/** Wrapper class used to store the current state of a mod shown on the ModSelectOverlay. Used primarily to decouple data from drawable logic. */
export class ModState {
  /** Whether the mod is currently selected. */
  readonly active = new BindableBool();

  /** Whether the mod is currently preselected (via keyboard navigation). */
  readonly preselected = new BindableBool();

  /** Whether the mod requires further customisation. This flag is read by the ModSelectOverlay to determine if the customisation panel should be opened after a mod change and cleared after reading. */
  pendingConfiguration = false;

  /** Whether the mod is currently valid for selection. This can be false if the mod is not valid for e.g. multiplayer or free mod selection. */
  readonly validForSelection = new BindableBool(true);

  /** Whether the mod is matching the current textual filter. */
  readonly matchingTextFilter = new BindableBool(true);

  /** Whether the mod should be visible. */
  get visible(): boolean {
    return this.matchingTextFilter.value && this.validForSelection.value;
  }

  constructor(readonly mod: Mod) {}
}
