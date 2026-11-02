// Ported from osu.Game/Rulesets/Mods/Mod.cs, IMod.cs and the parts of osu.Game/Configuration/SettingSourceAttribute.cs that mods use.
// C# finds a mod's settings by reflection ([SettingSource] properties); here each mod lists them in createSettingsSource(), in C#'s
// reflection order (the most derived class's properties first). Gameplay isn't ported, so mods carry no gameplay behaviour: only what song
// select uses (metadata, settings, compatibility, and the track / difficulty / rate adjustments).

import type { Bindable } from '@fw/bindables/Bindable';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { ModType } from './ModType';

/** A [SettingSource] property of a mod: its attribute values and its bindable. */
export interface SettingSource {
  /** The C# property name (SettingsMap keys are its snake_case form). */
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly orderPosition: number | null;
  readonly bindable: Bindable<unknown>;
}

/** (SettingSourceAttribute) */
export function settingSource(name: string, label: string, bindable: Bindable<any>, description = '', orderPosition: number | null = null): SettingSource {
  return { name, label, description, orderPosition, bindable };
}

/** (SettingSourceAttribute.CompareTo: unordered settings come last) */
function compareSettingSources(a: SettingSource, b: SettingSource): number {
  if (a.orderPosition === b.orderPosition) return 0;
  if (a.orderPosition === null) return 1;
  if (b.orderPosition === null) return -1;
  return a.orderPosition - b.orderPosition;
}

/** A type a mod can be incompatible with: a mod class, or an interface (a marker class matched by its Symbol.hasInstance). */
export type ModTypeReference = abstract new (...args: never[]) => unknown;

function toSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();
}

/** The base class for gameplay modifiers. */
export abstract class Mod {
  abstract get name(): string;

  abstract get acronym(): string;

  get extendedIconInformation(): string {
    return '';
  }

  get icon(): IconUsage | null {
    return null;
  }

  get type(): ModType {
    return ModType.Fun;
  }

  abstract get description(): string;

  /**
   * The description of editable settings of a mod.
   * Parentheses are added to the tooltip, surrounding the value of this property. If this property is empty, the tooltip will not have parentheses.
   */
  get settingDescription(): [string, string][] {
    const result: [string, string][] = [];

    for (const s of this.getOrderedSettingsSourceProperties()) {
      if (s.bindable.isDefault)
        continue;

      result.push([s.label, this.getSettingTooltipText(s.bindable)]);
    }

    return result;
  }

  /** Gets the tooltip text for a specific mod setting. Can be overridden to provide custom formatting for specific settings. */
  protected getSettingTooltipText(bindable: Bindable<unknown>): string {
    if (typeof bindable.value === 'boolean')
      return bindable.value ? 'On' : 'Off';

    return bindable.toString();
  }

  /** Returns true if this mod is implemented (and playable). (C#: `this is IApplicableMod`; every mod listed by the osu! ruleset is.) */
  get hasImplementation(): boolean {
    return true;
  }

  get userPlayable(): boolean {
    return true;
  }

  get validForMultiplayer(): boolean {
    return true;
  }

  get validForFreestyleAsRequiredMod(): boolean {
    return false;
  }

  get validForMultiplayerAsFreeMod(): boolean {
    return true;
  }

  get alwaysValidForSubmission(): boolean {
    return false;
  }

  /** Whether this mod requires configuration to apply changes to the game. */
  get requiresConfiguration(): boolean {
    return false;
  }

  get ranked(): boolean {
    return false;
  }

  /** The mods this mod cannot be enabled with. */
  get incompatibleMods(): ModTypeReference[] {
    return [];
  }

  /** The [SettingSource] properties of this mod, in C#'s reflection order. */
  protected createSettingsSource(): SettingSource[] {
    return [];
  }

  private settingsSourceBacking: readonly SettingSource[] | null = null;

  /** (GetSettingsSourceProperties) */
  getSettingsSourceProperties(): readonly SettingSource[] {
    return this.settingsSourceBacking ??= this.createSettingsSource();
  }

  /** (GetOrderedSettingsSourceProperties: a stable sort by order position) */
  getOrderedSettingsSourceProperties(): SettingSource[] {
    return [...this.getSettingsSourceProperties()].sort(compareSettingSources);
  }

  private settingsMapBacking: ReadonlyMap<string, Bindable<unknown>> | null = null;

  /** (internal) Provides mapping of names to bindables of all settings within this mod. */
  get settingsMap(): ReadonlyMap<string, Bindable<unknown>> {
    return this.settingsMapBacking ??= new Map(this.getSettingsSourceProperties().map(s => [toSnakeCase(s.name), s.bindable]));
  }

  /** (internal) All settings within this mod, in ascending key order as per settingsMap. */
  get settingsBindables(): Bindable<unknown>[] {
    return [...this.settingsMap.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, b]) => b);
  }

  /** Whether all settings in this mod are set to their default state. */
  get usesDefaultConfiguration(): boolean {
    return this.settingsBindables.every(s => s.isDefault);
  }

  /** (IMod.HasNonDefaultSettings) */
  get hasNonDefaultSettings(): boolean {
    return this.getSettingsSourceProperties().some(s => !s.bindable.isDefault);
  }

  /** (IMod.CreateInstance) */
  createInstance(): Mod {
    return new (this.constructor as new () => Mod)();
  }

  /** Creates a copy of this Mod initialised to a default state. */
  deepClone(): Mod {
    const result = this.createInstance();
    result.copyFrom(this);
    return result;
  }

  /** Copies mod setting values from source into this instance, overwriting all existing settings. */
  copyFrom(source: Mod): void {
    if (source.constructor !== this.constructor)
      throw new Error(`Expected mod of type ${this.constructor.name}, got ${source.constructor.name}.`);

    const targets = this.getSettingsSourceProperties();
    const sources = source.getSettingsSourceProperties();

    for (let i = 0; i < targets.length; i++)
      this.copyAdjustedSetting(targets[i].bindable, sources[i].bindable);
  }

  /**
   * This method copies the values of all settings from source that share the same names with this mod instance.
   * The most frequent use of this is when switching rulesets, in order to preserve values of common settings during the switch.
   */
  copyCommonSettingsFrom(source: Mod): void {
    if (source.usesDefaultConfiguration)
      return;

    for (const [name, targetSetting] of this.settingsMap) {
      const sourceSetting = source.settingsMap.get(name);

      if (sourceSetting === undefined || sourceSetting.isDefault)
        continue;

      // (C# checks that the bindable types are assignable either way)
      if (!(targetSetting instanceof sourceSetting.constructor) && !(sourceSetting instanceof targetSetting.constructor))
        continue;

      targetSetting.value = sourceSetting.value;
    }
  }

  /** When creating copies or clones of a Mod, this method will be called to copy explicitly adjusted user settings from source. */
  protected copyAdjustedSetting(target: Bindable<unknown>, source: Bindable<unknown>): void {
    // copy including transfer of default values.
    target.bindTo(source);
    target.unbindFrom(source);
  }

  /** (IEquatable<Mod>: same type and setting values) */
  equals(other: Mod | null): boolean {
    if (other == null) return false;
    if (this === other) return true;

    if (this.constructor !== other.constructor)
      return false;

    const a = this.settingsBindables;
    const b = other.settingsBindables;
    return a.length === b.length && a.every((s, i) => s.value === b[i].value);
  }

  /** Reset all custom settings for this mod back to their defaults. */
  resetSettingsToDefaults(): void {
    this.copyFrom(this.createInstance());
  }
}
