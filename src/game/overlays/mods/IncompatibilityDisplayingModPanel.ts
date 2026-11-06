// Ported from osu.Game/Overlays/Mods/IncompatibilityDisplayingModPanel.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import type { ITooltip } from '@fw/graphics/cursor/ITooltip';
import { Easing } from '@fw/transforms/Easing';
import type { Mod } from '../../rulesets/mods/Mod';
import { ModUtils } from '../../utils/ModUtils';
import { OverlayColourProvider } from '../OverlayColourProvider';
import { IncompatibilityDisplayingTooltip } from './IncompatibilityDisplayingTooltip';
import { ModPanel } from './ModPanel';
import { ModSelectPanel } from './ModSelectPanel';

/** (IHasCustomTooltip<Mod>) */
export class IncompatibilityDisplayingModPanel extends ModPanel {
  private readonly incompatible = new BindableBool();

  private overlayColourProvider!: OverlayColourProvider;

  private selectedMods!: Bindable<readonly Mod[]>;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.overlayColourProvider = dependencies.resolve(OverlayColourProvider);
    this.selectedMods = dependencies.resolve(Bindable<readonly Mod[]>, 'SelectedMods').getBoundCopy();
    return r;
  }

  protected override loadComplete(): void {
    this.selectedMods.bindValueChanged(() => this.updateIncompatibility(), true);
    this.incompatible.bindValueChanged(() => this.scheduler.addOnce(this.updateStateCallback));

    // base call will run `UpdateState()` first time and finish transforms.
    super.loadComplete();
  }

  private readonly updateStateCallback = (): void => this.updateState();

  private updateIncompatibility(): void {
    this.incompatible.value = this.selectedMods.value.length > 0
      && this.selectedMods.value.every(selected => selected.constructor !== this.mod.constructor)
      && ModUtils.checkCompatibleSet([...this.selectedMods.value, this.mod]) !== null;
  }

  protected override get backgroundColour(): Colour4 {
    return this.incompatible.value ? this.colourProvider.background6 : super.backgroundColour;
  }

  protected override get foregroundColour(): Colour4 {
    return this.incompatible.value ? this.colourProvider.background5 : super.foregroundColour;
  }

  protected override updateState(): void {
    super.updateState();
    this.switchContainer.fadeColour(this.incompatible.value ? Colour4.Gray : Colour4.White, ModSelectPanel.TRANSITION_DURATION, Easing.OutQuint);
  }

  // #region IHasCustomTooltip

  getCustomTooltip(): ITooltip {
    return new IncompatibilityDisplayingTooltip(this.overlayColourProvider);
  }

  get tooltipContent(): Mod {
    return this.mod;
  }

  // #endregion
}
