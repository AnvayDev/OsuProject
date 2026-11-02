// Ported from osu.Game/Rulesets/Mods: ModRateAdjust, ModHalfTime, ModDaycore, ModDoubleTime, ModNightcore, ModEasy, ModEasyWithExtraLives,
// ModNoFail, ModFailCondition, ModSuddenDeath, ModPerfect, ModAccuracyChallenge, ModHardRock, ModWithVisibilityAdjustment, ModHidden,
// ModTraceable, ModFlashlight, ModBlinds, ModDifficultyAdjust, ModClassic, ModRandom, ModMirror, ModAutoplay, ModCinema, ModRelax,
// ModTimeRamp, ModWindUp, ModWindDown, ModAdaptiveSpeed, ModMuted, ModNoScope, ModBarrelRoll, ModSynesthesia, ModTouchDevice, ModScoreV2
// and MultiMod.
// One module: the mods name each other in IncompatibleMods (lazily, through getters), which across files would be import cycles through
// base classes. The generic ruleset-specific variants (ModNightcore<T>, ModCinema<T>, ModMuted<T>, ModBarrelRoll<T>) are merged into their
// bases, as their type parameter only serves gameplay. Gameplay isn't ported: only the track, rate and difficulty adjustments remain.

import { AdjustableProperty, type IAdjustableAudioComponent } from '@fw/audio/AudioComponent';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble, BindableFloat, BindableInt, type BindableNumber } from '@fw/bindables/BindableNumber';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import type { BeatmapDifficulty } from '../../beatmaps/BeatmapDifficulty';
import { toStandardFormattedString } from '../../extensions/NumberFormattingExtensions';
import { OsuIcon } from '../../graphics/OsuIcon';
import { DifficultyBindable } from './DifficultyBindable';
import { ICreateReplayData } from './ICreateReplayData';
import { Mod, type ModTypeReference, type SettingSource, settingSource } from './Mod';
import { ModType } from './ModType';
import { RateAdjustModHelper } from './RateAdjustModHelper';

/** (C#'s `{value:N2}`) */
const n2 = (value: number) => value.toFixed(2);

// #region rate adjustment

export abstract class ModRateAdjust extends Mod {
  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  override get validForMultiplayerAsFreeMod(): boolean {
    return false;
  }

  abstract readonly speedChange: BindableNumber;

  abstract applyToTrack(track: IAdjustableAudioComponent): void;

  applyToSample(sample: IAdjustableAudioComponent): void {
    sample.addAdjustment(AdjustableProperty.Frequency, this.speedChange);
  }

  applyToRate(_time: number, rate = 1): number {
    return rate * this.speedChange.value;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModTimeRamp, ModAdaptiveSpeed, ModRateAdjust];
  }

  override get settingDescription(): [string, string][] {
    return this.speedChange.isDefault ? [] : [['Speed change', `${n2(this.speedChange.value)}x`]];
  }

  override get extendedIconInformation(): string {
    return this.speedChange.isDefault ? '' : `${n2(this.speedChange.value)}x`;
  }
}

export abstract class ModHalfTime extends ModRateAdjust {
  override get name(): string { return 'Half Time'; }
  override get acronym(): string { return 'HT'; }
  override get icon(): IconUsage | null { return OsuIcon.ModHalfTime; }
  override get type(): ModType { return ModType.DifficultyReduction; }
  override get description(): string { return 'Less zoom...'; }

  override get ranked(): boolean {
    return this.speedChange.isDefault;
  }

  readonly speedChange: BindableNumber = new BindableDouble(0.75).with({
    minValue: 0.5,
    maxValue: 0.99,
    precision: 0.01,
  });

  readonly adjustPitch = new BindableBool();

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('SpeedChange', 'Speed decrease', this.speedChange, 'The actual decrease to apply'),
      settingSource('AdjustPitch', 'Adjust pitch', this.adjustPitch, 'Should pitch be adjusted with speed'),
    ];
  }

  override get settingDescription(): [string, string][] {
    const result = super.settingDescription;

    if (!this.adjustPitch.isDefault)
      result.push(['Adjust pitch', this.adjustPitch.value ? 'On' : 'Off']);

    return result;
  }

  private readonly rateAdjustHelper: RateAdjustModHelper;

  constructor() {
    super();

    this.rateAdjustHelper = new RateAdjustModHelper(this.speedChange);
    this.rateAdjustHelper.handleAudioAdjustments(this.adjustPitch);
  }

  override applyToTrack(track: IAdjustableAudioComponent): void {
    this.rateAdjustHelper.applyToTrack(track);
  }
}

export abstract class ModDaycore extends ModRateAdjust {
  override get name(): string { return 'Daycore'; }
  override get acronym(): string { return 'DC'; }
  override get icon(): IconUsage | null { return OsuIcon.ModDaycore; }
  override get type(): ModType { return ModType.DifficultyReduction; }
  override get description(): string { return 'Whoaaaaa...'; }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }

  readonly speedChange: BindableNumber = new BindableDouble(0.75).with({
    minValue: 0.5,
    maxValue: 0.99,
    precision: 0.01,
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('SpeedChange', 'Speed decrease', this.speedChange, 'The actual decrease to apply')];
  }

  private readonly tempoAdjust = new BindableDouble(1);
  private readonly freqAdjust = new BindableDouble(1);

  constructor() {
    super();

    // intentionally not using `RateAdjustModHelper`
    // as the expected result of operation is not the same (daycore should preserve constant pitch).
    this.speedChange.bindValueChanged(val => {
      this.freqAdjust.value = this.speedChange.default;
      this.tempoAdjust.value = val.newValue / this.speedChange.default;
    }, true);
  }

  override applyToTrack(track: IAdjustableAudioComponent): void {
    track.addAdjustment(AdjustableProperty.Frequency, this.freqAdjust);
    track.addAdjustment(AdjustableProperty.Tempo, this.tempoAdjust);
  }
}

export abstract class ModDoubleTime extends ModRateAdjust {
  override get name(): string { return 'Double Time'; }
  override get acronym(): string { return 'DT'; }
  override get icon(): IconUsage | null { return OsuIcon.ModDoubleTime; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Zoooooooooom...'; }

  override get ranked(): boolean {
    return this.speedChange.isDefault;
  }

  readonly speedChange: BindableNumber = new BindableDouble(1.5).with({
    minValue: 1.01,
    maxValue: 2,
    precision: 0.01,
  });

  readonly adjustPitch = new BindableBool();

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('SpeedChange', 'Speed increase', this.speedChange, 'The actual increase to apply'),
      settingSource('AdjustPitch', 'Adjust pitch', this.adjustPitch, 'Should pitch be adjusted with speed'),
    ];
  }

  override get settingDescription(): [string, string][] {
    const result = super.settingDescription;

    if (!this.adjustPitch.isDefault)
      result.push(['Adjust pitch', this.adjustPitch.value ? 'On' : 'Off']);

    return result;
  }

  private readonly rateAdjustHelper: RateAdjustModHelper;

  constructor() {
    super();

    this.rateAdjustHelper = new RateAdjustModHelper(this.speedChange);
    this.rateAdjustHelper.handleAudioAdjustments(this.adjustPitch);
  }

  override applyToTrack(track: IAdjustableAudioComponent): void {
    this.rateAdjustHelper.applyToTrack(track);
  }
}

export abstract class ModNightcore extends ModRateAdjust {
  override get name(): string { return 'Nightcore'; }
  override get acronym(): string { return 'NC'; }
  override get icon(): IconUsage | null { return OsuIcon.ModNightcore; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Uguuuuuuuu...'; }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }

  readonly speedChange: BindableNumber = new BindableDouble(1.5).with({
    minValue: 1.01,
    maxValue: 2,
    precision: 0.01,
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('SpeedChange', 'Speed increase', this.speedChange, 'The actual increase to apply')];
  }

  private readonly tempoAdjust = new BindableDouble(1);
  private readonly freqAdjust = new BindableDouble(1);

  constructor() {
    super();

    // intentionally not using `RateAdjustModHelper`
    // as the expected result of operation is not the same (nightcore should preserve constant pitch).
    this.speedChange.bindValueChanged(val => {
      this.freqAdjust.value = this.speedChange.default;
      this.tempoAdjust.value = val.newValue / this.speedChange.default;
    }, true);
  }

  override applyToTrack(track: IAdjustableAudioComponent): void {
    track.addAdjustment(AdjustableProperty.Frequency, this.freqAdjust);
    track.addAdjustment(AdjustableProperty.Tempo, this.tempoAdjust);
  }
}

// #endregion

// #region difficulty reduction / increase

export abstract class ModEasy extends Mod {
  override get name(): string { return 'Easy'; }
  override get acronym(): string { return 'EZ'; }
  override get icon(): IconUsage | null { return OsuIcon.ModEasy; }
  override get type(): ModType { return ModType.DifficultyReduction; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModHardRock, ModDifficultyAdjust];
  }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  protected static readonly ADJUST_RATIO = Math.fround(0.5);

  applyToDifficulty(difficulty: BeatmapDifficulty): void {
    difficulty.circleSize = Math.fround(difficulty.circleSize * ModEasy.ADJUST_RATIO);
    difficulty.approachRate = Math.fround(difficulty.approachRate * ModEasy.ADJUST_RATIO);
    difficulty.drainRate = Math.fround(difficulty.drainRate * ModEasy.ADJUST_RATIO);
  }
}

export abstract class ModEasyWithExtraLives extends ModEasy {
  readonly retries: Bindable<number> = new BindableInt(2).with({
    minValue: 0,
    maxValue: 10,
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('Retries', 'Extra Lives', this.retries, 'Number of extra lives')];
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModAccuracyChallenge];
  }
}

export abstract class ModNoFail extends Mod {
  override get name(): string { return 'No Fail'; }
  override get acronym(): string { return 'NF'; }
  override get icon(): IconUsage | null { return OsuIcon.ModNoFail; }
  override get type(): ModType { return ModType.DifficultyReduction; }
  override get description(): string { return 'You can\'t fail, no matter what.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModFailCondition, ModCinema];
  }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }
}

export abstract class ModFailCondition extends Mod {
  override get incompatibleMods(): ModTypeReference[] {
    return [ModNoFail, ModCinema];
  }

  readonly restart = new BindableBool();

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('Restart', 'Restart on fail', this.restart, 'Automatically restarts when failed.')];
  }
}

export abstract class ModSuddenDeath extends ModFailCondition {
  override get name(): string { return 'Sudden Death'; }
  override get acronym(): string { return 'SD'; }
  override get icon(): IconUsage | null { return OsuIcon.ModSuddenDeath; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Miss and fail.'; }

  override get ranked(): boolean {
    return true;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModPerfect];
  }
}

export abstract class ModPerfect extends ModFailCondition {
  override get name(): string { return 'Perfect'; }
  override get acronym(): string { return 'PF'; }
  override get icon(): IconUsage | null { return OsuIcon.ModPerfect; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'SS or quit.'; }

  override get ranked(): boolean {
    return true;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModSuddenDeath, ModAccuracyChallenge];
  }

  constructor() {
    super();

    this.restart.value = this.restart.default = true;
  }
}

export enum AccuracyMode {
  MaximumAchievable = 'MaximumAchievable',
  Standard = 'Standard',
}

export class ModAccuracyChallenge extends ModFailCondition {
  override get name(): string { return 'Accuracy Challenge'; }
  override get acronym(): string { return 'AC'; }
  override get description(): string { return 'Fail if your accuracy drops too low!'; }
  override get icon(): IconUsage | null { return OsuIcon.ModAccuracyChallenge; }
  override get type(): ModType { return ModType.DifficultyIncrease; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModEasyWithExtraLives, ModPerfect];
  }

  override get requiresConfiguration(): boolean {
    return false;
  }

  override get ranked(): boolean {
    return true;
  }

  readonly minimumAccuracy: BindableNumber = new BindableDouble().with({
    minValue: 0.60,
    maxValue: 0.999,
    precision: 0.001,
    default: 0.9,
    value: 0.9,
  });

  readonly accuracyJudgeMode = new Bindable<AccuracyMode>(AccuracyMode.MaximumAchievable);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('MinimumAccuracy', 'Minimum accuracy', this.minimumAccuracy, 'Trigger a failure if your accuracy goes below this value.'),
      settingSource('AccuracyJudgeMode', 'Accuracy mode', this.accuracyJudgeMode, 'The mode of accuracy that will trigger failure.'),
      ...super.createSettingsSource(),
    ];
  }
}

export abstract class ModHardRock extends Mod {
  override get name(): string { return 'Hard Rock'; }
  override get acronym(): string { return 'HR'; }
  override get icon(): IconUsage | null { return OsuIcon.ModHardRock; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Everything just got a bit harder...'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModEasy, ModDifficultyAdjust];
  }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  protected static readonly ADJUST_RATIO = Math.fround(1.4);

  applyToDifficulty(difficulty: BeatmapDifficulty): void {
    difficulty.drainRate = Math.min(Math.fround(difficulty.drainRate * ModHardRock.ADJUST_RATIO), 10);
  }
}

export abstract class ModWithVisibilityAdjustment extends Mod {}

export abstract class ModHidden extends ModWithVisibilityAdjustment {
  override get name(): string { return 'Hidden'; }
  override get acronym(): string { return 'HD'; }
  override get icon(): IconUsage | null { return OsuIcon.ModHidden; }
  override get type(): ModType { return ModType.DifficultyIncrease; }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }
}

export abstract class ModTraceable extends ModWithVisibilityAdjustment {}

export abstract class ModFlashlight extends Mod {
  override get name(): string { return 'Flashlight'; }
  override get acronym(): string { return 'FL'; }
  override get icon(): IconUsage | null { return OsuIcon.ModFlashlight; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Restricted view area.'; }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }

  /** [SettingSource("Flashlight size", "Multiplier applied to the default flashlight size.")] */
  abstract readonly sizeMultiplier: BindableFloat;

  /** [SettingSource("Change size based on combo", "Decrease the flashlight size as combo increases.")] */
  abstract readonly comboBasedSize: BindableBool;

  /** The default size of the flashlight in ruleset-appropriate dimensions. */
  abstract get defaultFlashlightSize(): number;
}

export abstract class ModBlinds extends Mod {}

// #endregion

// #region conversion

export abstract class ModDifficultyAdjust extends Mod {
  override get name(): string { return 'Difficulty Adjust'; }
  override get description(): string { return 'Override a beatmap\'s difficulty settings.'; }
  override get acronym(): string { return 'DA'; }
  override get type(): ModType { return ModType.Conversion; }
  override get icon(): IconUsage | null { return OsuIcon.ModDifficultyAdjust; }

  override get requiresConfiguration(): boolean {
    return true;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModEasy, ModHardRock];
  }

  protected static readonly FIRST_SETTING_ORDER = 1;
  protected static readonly LAST_SETTING_ORDER = 2;

  readonly drainRate = new DifficultyBindable().with({
    precision: Math.fround(0.1),
    minValue: 0,
    maxValue: 10,
    extendedMaxValue: 11,
    readCurrentFromDifficulty: diff => diff.drainRate,
  });

  readonly overallDifficulty = new DifficultyBindable().with({
    precision: Math.fround(0.1),
    minValue: 0,
    maxValue: 10,
    extendedMaxValue: 11,
    readCurrentFromDifficulty: diff => diff.overallDifficulty,
  });

  readonly extendedLimits = new BindableBool();

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('DrainRate', 'HP Drain', this.drainRate, 'Override a beatmap\'s set HP.', ModDifficultyAdjust.FIRST_SETTING_ORDER),
      settingSource('OverallDifficulty', 'Accuracy', this.overallDifficulty, 'Override a beatmap\'s set OD.', ModDifficultyAdjust.LAST_SETTING_ORDER),
      settingSource('ExtendedLimits', 'Extended Limits', this.extendedLimits, 'Adjust difficulty beyond sane limits.'),
    ];
  }

  /**
   * (C#'s constructor body: binds every DifficultyBindable setting to extendedLimits. C# runs derived field initializers before base constructors;
   * here the derived settings exist only once the derived constructor runs, so concrete subclasses call this from theirs.)
   */
  protected bindDifficultySettingsToExtendedLimits(): void {
    for (const s of this.getOrderedSettingsSourceProperties()) {
      if (s.bindable instanceof DifficultyBindable)
        s.bindable.extendedLimits.bindTo(this.extendedLimits);
    }
  }

  override get extendedIconInformation(): string {
    if (!this.isExactlyOneSettingChanged(this.overallDifficulty, this.drainRate))
      return '';

    if (!this.overallDifficulty.isDefault) return formatDifficulty('OD', this.overallDifficulty);
    if (!this.drainRate.isDefault) return formatDifficulty('HP', this.drainRate);

    return '';
  }

  protected isExactlyOneSettingChanged(...difficultySettings: DifficultyBindable[]): boolean {
    let changedSetting: DifficultyBindable | null = null;

    for (const setting of difficultySettings) {
      if (setting.isDefault)
        continue;

      if (changedSetting !== null)
        return false;

      changedSetting = setting;
    }

    return true;
  }

  override get settingDescription(): [string, string][] {
    const result: [string, string][] = [];

    if (!this.drainRate.isDefault)
      result.push(['HP drain', this.drainRate.value!.toFixed(1)]);

    if (!this.overallDifficulty.isDefault)
      result.push(['Accuracy', this.overallDifficulty.value!.toFixed(1)]);

    return result;
  }

  applyToDifficulty(difficulty: BeatmapDifficulty): void {
    this.applySettings(difficulty);
  }

  /** Apply all custom settings to the provided beatmap. */
  protected applySettings(difficulty: BeatmapDifficulty): void {
    if (this.drainRate.value !== null) difficulty.drainRate = this.drainRate.value;
    if (this.overallDifficulty.value !== null) difficulty.overallDifficulty = this.overallDifficulty.value;
  }
}

/** (ModDifficultyAdjust's local format(): acronym and value with one decimal at most) */
export function formatDifficulty(acronym: string, bindable: DifficultyBindable): string {
  return `${acronym}${toStandardFormattedString(bindable.value!, 1)}`;
}

export abstract class ModClassic extends Mod {
  override get name(): string { return 'Classic'; }
  override get acronym(): string { return 'CL'; }
  override get icon(): IconUsage | null { return OsuIcon.ModClassic; }
  override get description(): string { return 'Feeling nostalgic?'; }
  override get type(): ModType { return ModType.Conversion; }

  override get ranked(): boolean {
    return false;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return false;
  }
}

export abstract class ModRandom extends Mod {
  override get name(): string { return 'Random'; }
  override get acronym(): string { return 'RD'; }
  override get type(): ModType { return ModType.Conversion; }
  override get icon(): IconUsage | null { return OsuIcon.ModRandom; }

  readonly seed = new Bindable<number | null>(null);

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('Seed', 'Seed', this.seed, 'Use a custom seed instead of a random one')];
  }
}

export abstract class ModMirror extends Mod {
  override get name(): string { return 'Mirror'; }
  override get acronym(): string { return 'MR'; }
  override get icon(): IconUsage | null { return OsuIcon.ModMirror; }
  override get type(): ModType { return ModType.Conversion; }
}

// #endregion

// #region automation

export abstract class ModAutoplay extends Mod implements ICreateReplayData {
  readonly isCreateReplayData = true;

  override get name(): string { return 'Autoplay'; }
  override get acronym(): string { return 'AT'; }
  override get icon(): IconUsage | null { return OsuIcon.ModAutoplay; }
  override get type(): ModType { return ModType.Automation; }
  override get description(): string { return 'Watch a perfect automated play through the song.'; }

  override get userPlayable(): boolean {
    return false;
  }

  override get validForMultiplayer(): boolean {
    return false;
  }

  override get validForMultiplayerAsFreeMod(): boolean {
    return false;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModCinema, ModRelax, ModAdaptiveSpeed, ModTouchDevice];
  }
}

export abstract class ModCinema extends ModAutoplay {
  override get name(): string { return 'Cinema'; }
  override get acronym(): string { return 'CN'; }
  override get icon(): IconUsage | null { return OsuIcon.ModCinema; }
  override get description(): string { return 'Watch the video without visual distractions.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModAutoplay, ModNoFail, ModFailCondition];
  }
}

export abstract class ModRelax extends Mod {
  override get name(): string { return 'Relax'; }
  override get acronym(): string { return 'RX'; }
  override get icon(): IconUsage | null { return OsuIcon.ModRelax; }
  override get type(): ModType { return ModType.Automation; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModAutoplay];
  }
}

// #endregion

// #region fun

export abstract class ModTimeRamp extends Mod {
  /** The point in the beatmap at which the final ramping rate should be reached. */
  static readonly FINAL_RATE_PROGRESS = Math.fround(0.75);

  /** [SettingSource("Initial rate", "The starting speed of the track")] */
  abstract readonly initialRate: BindableNumber;

  /** [SettingSource("Final rate", "The final speed to ramp to")] */
  abstract readonly finalRate: BindableNumber;

  /** [SettingSource("Adjust pitch", "Should pitch be adjusted with speed")] */
  abstract readonly adjustPitch: BindableBool;

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  override get validForMultiplayerAsFreeMod(): boolean {
    return false;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModRateAdjust, ModAdaptiveSpeed];
  }

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('InitialRate', 'Initial rate', this.initialRate, 'The starting speed of the track'),
      settingSource('FinalRate', 'Final rate', this.finalRate, 'The final speed to ramp to'),
      settingSource('AdjustPitch', 'Adjust pitch', this.adjustPitch, 'Should pitch be adjusted with speed'),
    ];
  }

  override get settingDescription(): [string, string][] {
    const result: [string, string][] = [];

    if (!this.initialRate.isDefault || !this.finalRate.isDefault)
      result.push(['Speed change', `${n2(this.initialRate.value)}x to ${n2(this.finalRate.value)}x`]);

    if (!this.adjustPitch.isDefault)
      result.push(['Adjust pitch', this.adjustPitch.value ? 'On' : 'Off']);

    return result;
  }

  private beginRampTime = 0;
  private finalRateTime = 0;

  /** The adjustment applied on top of any existing rate adjustments (C#'s SpeedChange). */
  readonly speedChange = new BindableDouble(1).with({
    precision: 0.01,
  });

  private rateAdjustHelper!: RateAdjustModHelper;

  /**
   * (C#'s constructor body. It reads the abstract settings, which C# initialises before the base constructor runs; here they exist only once
   * the derived constructor runs, so concrete subclasses call this from theirs.)
   */
  protected initialiseRamp(): void {
    this.rateAdjustHelper = new RateAdjustModHelper(this.speedChange);
    this.rateAdjustHelper.handleAudioAdjustments(this.adjustPitch);

    // for preview purpose at song select. eventually we'll want to be able to update every frame.
    this.finalRate.bindValueChanged(() => this.applyRateAdjustment(Number.POSITIVE_INFINITY), true);
  }

  applyToTrack(track: IAdjustableAudioComponent): void {
    this.rateAdjustHelper.applyToTrack(track);
    this.finalRate.triggerChange();
  }

  applyToSample(sample: IAdjustableAudioComponent): void {
    sample.addAdjustment(AdjustableProperty.Frequency, this.speedChange);
  }

  applyToRate(time: number, rate = 1): number {
    const amount = (time - this.beginRampTime) / Math.max(1, this.finalRateTime - this.beginRampTime);
    const ramp = this.initialRate.value + (this.finalRate.value - this.initialRate.value) * Math.min(Math.max(amount, 0), 1);

    // round the end result to match the bindable SpeedChange's precision, in case this is called externally.
    return rate * roundHalfEven(ramp, 2);
  }

  private applyRateAdjustment(time: number): void {
    this.speedChange.value = this.applyToRate(time);
  }
}

/** (Math.Round(value, digits): midpoints round to even) */
function roundHalfEven(value: number, digits: number): number {
  const scale = 10 ** digits;
  const scaled = value * scale;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;

  if (Math.abs(diff - 0.5) < 1e-9)
    return (floor % 2 === 0 ? floor : floor + 1) / scale;

  return Math.round(scaled) / scale;
}

export class ModWindUp extends ModTimeRamp {
  override get name(): string { return 'Wind Up'; }
  override get acronym(): string { return 'WU'; }
  override get description(): string { return 'Can you keep up?'; }
  override get icon(): IconUsage | null { return OsuIcon.ModWindUp; }

  readonly initialRate: BindableNumber = new BindableDouble(1).with({
    minValue: 0.5,
    maxValue: 1.99,
    precision: 0.01,
  });

  readonly finalRate: BindableNumber = new BindableDouble(1.5).with({
    minValue: 0.51,
    maxValue: 2,
    precision: 0.01,
  });

  readonly adjustPitch = new BindableBool(true);

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModWindDown];
  }

  constructor() {
    super();

    this.initialiseRamp();

    this.initialRate.bindValueChanged(val => {
      if (val.newValue >= this.finalRate.value)
        this.finalRate.value = val.newValue + this.finalRate.precision;
    });

    this.finalRate.bindValueChanged(val => {
      if (val.newValue <= this.initialRate.value)
        this.initialRate.value = val.newValue - this.initialRate.precision;
    });
  }
}

export class ModWindDown extends ModTimeRamp {
  override get name(): string { return 'Wind Down'; }
  override get acronym(): string { return 'WD'; }
  override get description(): string { return 'Sloooow doooown...'; }
  override get icon(): IconUsage | null { return OsuIcon.ModWindDown; }

  readonly initialRate: BindableNumber = new BindableDouble(1).with({
    minValue: 0.51,
    maxValue: 2,
    precision: 0.01,
  });

  readonly finalRate: BindableNumber = new BindableDouble(0.75).with({
    minValue: 0.5,
    maxValue: 1.99,
    precision: 0.01,
  });

  readonly adjustPitch = new BindableBool(true);

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModWindUp];
  }

  constructor() {
    super();

    this.initialiseRamp();

    this.initialRate.bindValueChanged(val => {
      if (val.newValue <= this.finalRate.value)
        this.finalRate.value = val.newValue - this.finalRate.precision;
    });

    this.finalRate.bindValueChanged(val => {
      if (val.newValue >= this.initialRate.value)
        this.initialRate.value = val.newValue + this.initialRate.precision;
    });
  }
}

const min_allowable_rate = 0.4;
const max_allowable_rate = 2.5;

export class ModAdaptiveSpeed extends Mod {
  override get name(): string { return 'Adaptive Speed'; }
  override get acronym(): string { return 'AS'; }
  override get description(): string { return 'Let track speed adapt to you.'; }
  override get icon(): IconUsage | null { return OsuIcon.ModAdaptiveSpeed; }
  override get type(): ModType { return ModType.Fun; }

  override get validForMultiplayer(): boolean {
    return false;
  }

  override get validForMultiplayerAsFreeMod(): boolean {
    return false;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModRateAdjust, ModTimeRamp, ModAutoplay];
  }

  readonly initialRate: BindableNumber = new BindableDouble(1).with({
    minValue: 0.5,
    maxValue: 2,
    precision: 0.01,
  });

  readonly adjustPitch = new BindableBool(true);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('InitialRate', 'Initial rate', this.initialRate, 'The starting speed of the track'),
      settingSource('AdjustPitch', 'Adjust pitch', this.adjustPitch, 'Should pitch be adjusted with speed'),
    ];
  }

  /** The instantaneous rate of the track. Every frame this interpolates towards the target rate. */
  readonly speedChange = new BindableDouble(1).with({
    minValue: min_allowable_rate,
    maxValue: max_allowable_rate,
  });

  private readonly rateAdjustHelper: RateAdjustModHelper;

  constructor() {
    super();

    this.rateAdjustHelper = new RateAdjustModHelper(this.speedChange);
    this.rateAdjustHelper.handleAudioAdjustments(this.adjustPitch);

    this.initialRate.bindValueChanged(val => {
      this.speedChange.value = val.newValue;
    });
  }

  applyToTrack(track: IAdjustableAudioComponent): void {
    this.initialRate.triggerChange();
    this.rateAdjustHelper.applyToTrack(track);
  }

  applyToSample(sample: IAdjustableAudioComponent): void {
    sample.addAdjustment(AdjustableProperty.Frequency, this.speedChange);
  }

  applyToRate(_time: number, rate = 1): number {
    return rate * this.initialRate.value;
  }
}

export abstract class ModMuted extends Mod {
  override get name(): string { return 'Muted'; }
  override get acronym(): string { return 'MU'; }
  override get icon(): IconUsage | null { return OsuIcon.ModMuted; }
  override get description(): string { return 'Can you still feel the rhythm without music?'; }
  override get type(): ModType { return ModType.Fun; }

  override get ranked(): boolean {
    return true;
  }

  override get validForFreestyleAsRequiredMod(): boolean {
    return true;
  }

  // (ModMuted<TObject>)

  private readonly mainVolumeAdjust = new BindableDouble(0.5);

  readonly inverseMuting = new BindableBool();

  readonly enableMetronome = new BindableBool(true);

  readonly muteComboCount = new BindableInt(100).with({
    minValue: 0,
    maxValue: 500,
  });

  readonly affectsHitSounds = new BindableBool(true);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('InverseMuting', 'Start muted', this.inverseMuting, 'Increase volume as combo builds.'),
      settingSource('EnableMetronome', 'Enable metronome', this.enableMetronome, 'Add a metronome beat to help you keep track of the rhythm.'),
      settingSource('MuteComboCount', 'Final volume at combo', this.muteComboCount, 'The combo count at which point the track reaches its final volume.'),
      settingSource('AffectsHitSounds', 'Mute hit sounds', this.affectsHitSounds, 'Hit sounds are also muted alongside the track.'),
    ];
  }

  applyToTrack(track: IAdjustableAudioComponent): void {
    track.addAdjustment(AdjustableProperty.Volume, this.mainVolumeAdjust);
  }
}

export abstract class ModNoScope extends Mod {
  override get name(): string { return 'No Scope'; }
  override get acronym(): string { return 'NS'; }
  override get type(): ModType { return ModType.Fun; }
  override get icon(): IconUsage | null { return OsuIcon.ModNoScope; }

  override get ranked(): boolean {
    return true;
  }

  /** [SettingSource("Hidden at combo", "The combo count at which the cursor becomes completely hidden")] */
  abstract readonly hiddenComboCount: BindableInt;

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('HiddenComboCount', 'Hidden at combo', this.hiddenComboCount, 'The combo count at which the cursor becomes completely hidden')];
  }
}

export enum RotationDirection {
  Clockwise = 'Clockwise',
  Counterclockwise = 'Counterclockwise',
}

export abstract class ModBarrelRoll extends Mod {
  readonly spinSpeed: BindableNumber = new BindableDouble(0.5).with({
    minValue: 0.02,
    maxValue: 12,
    precision: 0.01,
  });

  readonly direction = new Bindable<RotationDirection>(RotationDirection.Clockwise);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('SpinSpeed', 'Roll speed', this.spinSpeed, 'Rotations per minute'),
      settingSource('Direction', 'Direction', this.direction, 'The direction of rotation'),
    ];
  }

  override get name(): string { return 'Barrel Roll'; }
  override get acronym(): string { return 'BR'; }
  override get icon(): IconUsage | null { return OsuIcon.ModBarrelRoll; }
  override get description(): string { return 'The whole playfield is on a wheel!'; }
}

export class ModSynesthesia extends Mod {
  override get name(): string { return 'Synesthesia'; }
  override get acronym(): string { return 'SY'; }
  override get description(): string { return 'Colours hit objects based on the rhythm.'; }
  override get icon(): IconUsage | null { return OsuIcon.ModSynesthesia; }
  override get type(): ModType { return ModType.Fun; }
}

// #endregion

// #region system

export class ModTouchDevice extends Mod {
  override get name(): string { return 'Touch Device'; }
  override get acronym(): string { return 'TD'; }
  override get icon(): IconUsage | null { return OsuIcon.ModTouchDevice; }
  override get description(): string { return 'Automatically applied to plays on devices with a touchscreen.'; }
  override get type(): ModType { return ModType.System; }

  override get validForMultiplayer(): boolean {
    return false;
  }

  override get validForMultiplayerAsFreeMod(): boolean {
    return false;
  }

  override get alwaysValidForSubmission(): boolean {
    return true;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [ICreateReplayData];
  }
}

export class ModScoreV2 extends Mod {
  override get name(): string { return 'Score V2'; }
  override get acronym(): string { return 'SV2'; }
  override get icon(): IconUsage | null { return OsuIcon.ModScoreV2; }
  override get type(): ModType { return ModType.System; }
  override get description(): string { return 'Score set on earlier osu! versions with the V2 scoring algorithm active.'; }

  override get userPlayable(): boolean {
    return false;
  }

  override get validForMultiplayer(): boolean {
    return false;
  }

  override get validForMultiplayerAsFreeMod(): boolean {
    return false;
  }
}

// #endregion

export class MultiMod extends Mod {
  override get name(): string { return ''; }
  override get acronym(): string { return ''; }
  override get description(): string { return ''; }

  readonly mods: Mod[];

  constructor(...mods: Mod[]) {
    super();

    this.mods = mods;
  }

  override deepClone(): Mod {
    return new MultiMod(...this.mods.map(m => m.deepClone()));
  }

  override get incompatibleMods(): ModTypeReference[] {
    return this.mods.flatMap(m => m.incompatibleMods);
  }
}
