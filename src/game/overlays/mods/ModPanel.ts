// Ported from osu.Game/Overlays/Mods/ModPanel.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { BindableBool } from '@fw/bindables/Bindable';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuGame } from '../../OsuGame';
import type { Mod } from '../../rulesets/mods/Mod';
import { ModSwitchSmall } from '../../rulesets/ui/ModSwitchSmall';
import { ModSelectPanel } from './ModSelectPanel';
import { ModState } from './ModState';

export class ModPanel extends ModSelectPanel {
  get mod(): Mod {
    return this.modState.mod;
  }

  override get active(): BindableBool {
    return this.modState.active;
  }

  protected override get idleSwitchWidth(): number {
    return 54;
  }

  protected override get expandedSwitchWidth(): number {
    return 70;
  }

  private readonly modState: ModState;

  /** (C#'s overloads: a ModState, or a Mod wrapped in a new one) */
  constructor(modStateOrMod: ModState | Mod) {
    super();

    this.modState = modStateOrMod instanceof ModState ? modStateOrMod : new ModState(modStateOrMod);

    this.title = this.mod.name;
    this.description = this.mod.description;

    const modSwitch = new ModSwitchSmall(this.mod).with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      shear: OsuGame.SHEAR.neg(),
      scale: new Vector2(ModSelectPanel.HEIGHT / ModSwitchSmall.DEFAULT_SIZE),
    });
    modSwitch.active.bindTo(this.active);

    this.switchContainer.child = modSwitch;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.accentColour = dependencies.resolve(OsuColour).forModType(this.mod.type);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.modState.validForSelection.bindValueChanged(() => this.updateFilterState());
    this.modState.matchingTextFilter.bindValueChanged(() => this.updateFilterState(), true);
    this.modState.preselected.bindValueChanged(b => {
      if (b.newValue) {
        this.content.edgeEffect = new EdgeEffectParameters({
          type: EdgeEffectType.Glow,
          colour: this.accentColour,
          hollow: true,
          radius: 2,
        });
      } else
        this.content.edgeEffect = new EdgeEffectParameters();
    }, true);
  }

  protected override select(): void {
    this.modState.pendingConfiguration = this.mod.requiresConfiguration;
    this.active.value = true;
  }

  protected override deselect(): void {
    this.modState.pendingConfiguration = false;
    this.active.value = false;
  }

  // #region Filtering support

  get visible(): boolean {
    return this.modState.visible;
  }

  override get filterTerms(): Iterable<string> {
    return [
      this.mod.name,
      this.mod.name.replaceAll(' ', ''),
      this.mod.acronym,
    ];
  }

  override get matchingFilter(): boolean {
    return this.modState.matchingTextFilter.value;
  }

  override set matchingFilter(value: boolean) {
    this.modState.matchingTextFilter.value = value;
  }

  private updateFilterState(): void {
    this.fadeTo(this.visible ? 1 : 0);
  }

  // #endregion
}
