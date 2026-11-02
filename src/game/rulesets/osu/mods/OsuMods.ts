// Ported from osu.Game.Rulesets.Osu/Mods: every mod OsuRuleset.GetModsFor lists (OsuModEasy … OsuModTouchDevice), with InputBlockingMod
// and OsuModObjectScaleTween.
// One module, as they name each other in IncompatibleMods (see rulesets/mods/Mods.ts). Gameplay isn't ported: the classes keep the metadata,
// settings and compatibility, plus the difficulty adjustments song select shows.

import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble, BindableFloat, BindableInt, type BindableNumber } from '@fw/bindables/BindableNumber';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import type { BeatmapDifficulty } from '../../../beatmaps/BeatmapDifficulty';
import { OsuIcon } from '../../../graphics/OsuIcon';
import { DifficultyBindable } from '../../mods/DifficultyBindable';
import { Mod, type ModTypeReference, type SettingSource, settingSource } from '../../mods/Mod';
import {
  ModAccuracyChallenge, ModAutoplay, ModBarrelRoll, ModBlinds, ModCinema, ModClassic, ModDaycore, ModDifficultyAdjust,
  ModDoubleTime, ModEasyWithExtraLives, ModFlashlight, ModHalfTime, ModHardRock, ModHidden, ModMirror, ModMuted, ModNightcore, ModNoFail,
  ModNoScope, ModPerfect, ModRandom, ModRelax, ModSuddenDeath, ModSynesthesia, ModTouchDevice, ModTraceable, ModWithVisibilityAdjustment,
  formatDifficulty,
} from '../../mods/Mods';
import { ModType } from '../../mods/ModType';
import { IHidesApproachCircles } from './IHidesApproachCircles';
import { IRequiresApproachCircles } from './IRequiresApproachCircles';

// #region difficulty reduction

export class OsuModEasy extends ModEasyWithExtraLives {
  override get description(): string { return 'Larger circles, more forgiving HP drain, less accuracy required, and extra lives!'; }

  override applyToDifficulty(difficulty: BeatmapDifficulty): void {
    super.applyToDifficulty(difficulty);

    difficulty.overallDifficulty = Math.fround(difficulty.overallDifficulty * Math.fround(0.5));
  }
}

export class OsuModNoFail extends ModNoFail {}

export class OsuModHalfTime extends ModHalfTime {}

export class OsuModDaycore extends ModDaycore {}

// #endregion

// #region difficulty increase

export class OsuModHardRock extends ModHardRock {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, ModMirror];
  }

  override applyToDifficulty(difficulty: BeatmapDifficulty): void {
    super.applyToDifficulty(difficulty);

    const adjustRatio = Math.fround(1.4);
    difficulty.overallDifficulty = Math.min(Math.fround(difficulty.overallDifficulty * adjustRatio), 10);
    difficulty.circleSize = Math.min(Math.fround(difficulty.circleSize * Math.fround(1.3)), 10); // CS uses a custom 1.3 ratio.
    difficulty.approachRate = Math.min(Math.fround(difficulty.approachRate * adjustRatio), 10);
  }
}

export class OsuModSuddenDeath extends ModSuddenDeath {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModTargetPractice];
  }

  readonly failOnSliderTail = new BindableBool();

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('FailOnSliderTail', 'Also fail when missing a slider tail', this.failOnSliderTail), ...super.createSettingsSource()];
  }
}

export class OsuModPerfect extends ModPerfect {}

export class OsuModDoubleTime extends ModDoubleTime {}

export class OsuModNightcore extends ModNightcore {}

export class OsuModHidden extends ModHidden implements IHidesApproachCircles {
  readonly hidesApproachCircles = true;

  readonly onlyFadeApproachCircles = new BindableBool();

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('OnlyFadeApproachCircles', 'Only fade approach circles', this.onlyFadeApproachCircles, 'The main object body will not fade when enabled.')];
  }

  override get description(): string { return 'Play with no approach circles and fading circles/sliders.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [IRequiresApproachCircles, OsuModSpinIn, OsuModDepth, OsuModFreezeFrame];
  }
}

export class OsuModTraceable extends ModTraceable implements IRequiresApproachCircles {
  readonly requiresApproachCircles = true;

  override get name(): string { return 'Traceable'; }
  override get acronym(): string { return 'TC'; }
  override get icon(): IconUsage | null { return OsuIcon.ModTraceable; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Put your faith in the approach circles...'; }

  override get ranked(): boolean {
    return true;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [IHidesApproachCircles, OsuModDepth];
  }
}

const default_follow_delay = 120;

export class OsuModFlashlight extends ModFlashlight {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModBloom, OsuModBlinds];
  }

  readonly followDelay: BindableNumber = new BindableDouble(default_follow_delay).with({
    minValue: default_follow_delay,
    maxValue: default_follow_delay * 10,
    precision: default_follow_delay,
  });

  readonly sizeMultiplier = new BindableFloat(1).with({
    minValue: Math.fround(0.5),
    maxValue: 2,
    precision: Math.fround(0.1),
  });

  readonly comboBasedSize = new BindableBool(true);

  override get defaultFlashlightSize(): number {
    return 125;
  }

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('FollowDelay', 'Follow delay', this.followDelay, 'Milliseconds until the flashlight reaches the cursor'),
      settingSource('SizeMultiplier', 'Flashlight size', this.sizeMultiplier, 'Multiplier applied to the default flashlight size.'),
      settingSource('ComboBasedSize', 'Change size based on combo', this.comboBasedSize, 'Decrease the flashlight size as combo increases.'),
    ];
  }
}

export class OsuModBlinds extends ModBlinds {
  override get name(): string { return 'Blinds'; }
  override get description(): string { return 'Play with blinds on your screen.'; }
  override get acronym(): string { return 'BL'; }
  override get icon(): IconUsage | null { return OsuIcon.ModBlinds; }
  override get type(): ModType { return ModType.DifficultyIncrease; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModFlashlight];
  }

  override get ranked(): boolean {
    return true;
  }
}

export class OsuModStrictTracking extends Mod {
  override get name(): string { return 'Strict Tracking'; }
  override get acronym(): string { return 'ST'; }
  override get icon(): IconUsage | null { return OsuIcon.ModStrictTracking; }
  override get type(): ModType { return ModType.DifficultyIncrease; }
  override get description(): string { return 'Once you start a slider, follow precisely or get a miss.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModClassic, OsuModTargetPractice];
  }
}

export class OsuModAccuracyChallenge extends ModAccuracyChallenge {}

// #endregion

// #region conversion

export class OsuModTargetPractice extends ModWithVisibilityAdjustment {
  override get name(): string { return 'Target Practice'; }
  override get acronym(): string { return 'TP'; }
  override get type(): ModType { return ModType.Conversion; }
  override get icon(): IconUsage | null { return OsuIcon.ModTargetPractice; }
  override get description(): string { return 'Practice keeping up with the beat of the song.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [
      ...super.incompatibleMods,
      IRequiresApproachCircles,
      OsuModRandom,
      OsuModSpunOut,
      OsuModStrictTracking,
      OsuModSuddenDeath,
      OsuModDepth,
      OsuModDifficultyAdjust,
    ];
  }

  readonly seed = new Bindable<number | null>(null);

  readonly metronome = new BindableBool(true);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('Seed', 'Seed', this.seed, 'Use a custom seed instead of a random one'),
      settingSource('Metronome', 'Metronome ticks', this.metronome, 'Whether a metronome beat should play in the background'),
    ];
  }
}

export class OsuModDifficultyAdjust extends ModDifficultyAdjust {
  readonly circleSize = new DifficultyBindable().with({
    precision: Math.fround(0.1),
    minValue: 0,
    maxValue: 10,
    extendedMaxValue: 11,
    readCurrentFromDifficulty: diff => diff.circleSize,
  });

  readonly approachRate = new DifficultyBindable().with({
    precision: Math.fround(0.1),
    minValue: 0,
    maxValue: 10,
    extendedMinValue: -10,
    extendedMaxValue: 11,
    readCurrentFromDifficulty: diff => diff.approachRate,
  });

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('CircleSize', 'Circle Size', this.circleSize, 'Override a beatmap\'s set CS.', ModDifficultyAdjust.FIRST_SETTING_ORDER - 1),
      settingSource('ApproachRate', 'Approach Rate', this.approachRate, 'Override a beatmap\'s set AR.', ModDifficultyAdjust.LAST_SETTING_ORDER + 1),
      ...super.createSettingsSource(),
    ];
  }

  constructor() {
    super();

    this.bindDifficultySettingsToExtendedLimits();
  }

  override get extendedIconInformation(): string {
    if (!this.isExactlyOneSettingChanged(this.circleSize, this.approachRate, this.overallDifficulty, this.drainRate))
      return '';

    if (!this.circleSize.isDefault) return formatDifficulty('CS', this.circleSize);
    if (!this.approachRate.isDefault) return formatDifficulty('AR', this.approachRate);
    if (!this.overallDifficulty.isDefault) return formatDifficulty('OD', this.overallDifficulty);
    if (!this.drainRate.isDefault) return formatDifficulty('HP', this.drainRate);

    return '';
  }

  override get settingDescription(): [string, string][] {
    const result: [string, string][] = [];

    if (!this.circleSize.isDefault)
      result.push(['Circle size', this.circleSize.value!.toFixed(1)]);

    result.push(...super.settingDescription);

    if (!this.approachRate.isDefault)
      result.push(['Approach rate', this.approachRate.value!.toFixed(1)]);

    return result;
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModTargetPractice];
  }

  protected override applySettings(difficulty: BeatmapDifficulty): void {
    super.applySettings(difficulty);

    if (this.circleSize.value !== null) difficulty.circleSize = this.circleSize.value;
    if (this.approachRate.value !== null) difficulty.approachRate = this.approachRate.value;
  }
}

export class OsuModClassic extends ModClassic {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModStrictTracking];
  }

  readonly noSliderHeadAccuracy = new BindableBool(true);
  readonly classicNoteLock = new BindableBool(true);
  readonly alwaysPlayTailSample = new BindableBool(true);
  readonly fadeHitCircleEarly = new Bindable<boolean>(true);
  readonly classicHealth = new Bindable<boolean>(true);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('NoSliderHeadAccuracy', 'No slider head accuracy requirement', this.noSliderHeadAccuracy, 'Scores sliders proportionally to the number of ticks hit.'),
      settingSource('ClassicNoteLock', 'Apply classic note lock', this.classicNoteLock, 'Applies note lock to the full hit window.'),
      settingSource('AlwaysPlayTailSample', 'Always play a slider\'s tail sample', this.alwaysPlayTailSample, 'Always plays a slider\'s tail sample regardless of whether it was hit or not.'),
      settingSource('FadeHitCircleEarly', 'Fade out hit circles earlier', this.fadeHitCircleEarly, 'Make hit circles fade out into a miss, rather than after it.'),
      settingSource('ClassicHealth', 'Classic health', this.classicHealth, 'More closely resembles the original HP drain mechanics.'),
    ];
  }
}

export class OsuModRandom extends ModRandom {
  override get description(): string { return 'It never gets boring!'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModTargetPractice];
  }

  readonly angleSharpness = new BindableFloat(7).with({
    minValue: 1,
    maxValue: 10,
    precision: Math.fround(0.1),
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('AngleSharpness', 'Angle sharpness', this.angleSharpness, 'How sharp angles should be'), ...super.createSettingsSource()];
  }
}

export enum MirrorType {
  Horizontal = 'Horizontal',
  Vertical = 'Vertical',
  Both = 'Both',
}

export class OsuModMirror extends ModMirror {
  override get description(): string { return 'Flip objects on the chosen axes.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModHardRock];
  }

  readonly reflection = new Bindable<MirrorType>(MirrorType.Horizontal);

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('Reflection', 'Flipped axes', this.reflection)];
  }
}

export abstract class InputBlockingMod extends Mod {
  override get incompatibleMods(): ModTypeReference[] {
    return [ModAutoplay, ModRelax, OsuModCinema];
  }

  override get type(): ModType { return ModType.Conversion; }
}

export class OsuModAlternate extends InputBlockingMod {
  override get name(): string { return 'Alternate'; }
  override get acronym(): string { return 'AL'; }
  override get description(): string { return 'Don\'t use the same key twice in a row!'; }
  override get icon(): IconUsage | null { return OsuIcon.ModAlternate; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModSingleTap];
  }

  override get ranked(): boolean {
    return true;
  }
}

export class OsuModSingleTap extends InputBlockingMod {
  override get name(): string { return 'Single Tap'; }
  override get acronym(): string { return 'SG'; }
  override get icon(): IconUsage | null { return OsuIcon.ModSingleTap; }
  override get description(): string { return 'You must only use one key!'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModAlternate];
  }

  override get ranked(): boolean {
    return true;
  }
}

// #endregion

// #region automation

export class OsuModAutoplay extends ModAutoplay {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModMagnetised, OsuModRepel, OsuModAutopilot, OsuModSpunOut, OsuModAlternate, OsuModSingleTap, OsuModWiggle, OsuModDepth];
  }
}

export class OsuModCinema extends ModCinema {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModMagnetised, OsuModAutopilot, OsuModSpunOut, OsuModAlternate, OsuModSingleTap, OsuModRepel];
  }
}

export class OsuModRelax extends ModRelax {
  override get description(): string { return 'You don\'t need to click. Give your clicking/tapping fingers a break from the heat of things.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModAutopilot, OsuModMagnetised, OsuModAlternate, OsuModSingleTap];
  }
}

export class OsuModAutopilot extends Mod {
  override get name(): string { return 'Autopilot'; }
  override get acronym(): string { return 'AP'; }
  override get icon(): IconUsage | null { return OsuIcon.ModAutopilot; }
  override get type(): ModType { return ModType.Automation; }
  override get description(): string { return 'Automatic cursor movement - just follow the rhythm.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [
      OsuModSpunOut,
      ModRelax,
      ModAutoplay,
      OsuModMagnetised,
      OsuModRepel,
      ModTouchDevice,
    ];
  }
}

export class OsuModSpunOut extends Mod {
  override get name(): string { return 'Spun Out'; }
  override get acronym(): string { return 'SO'; }
  override get icon(): IconUsage | null { return OsuIcon.ModSpunOut; }
  override get type(): ModType { return ModType.Automation; }
  override get description(): string { return 'Spinners will be automatically completed.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [ModAutoplay, OsuModAutopilot, OsuModTargetPractice];
  }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }
}

// #endregion

// #region fun

export class OsuModTransform extends ModWithVisibilityAdjustment {
  override get name(): string { return 'Transform'; }
  override get acronym(): string { return 'TR'; }
  override get icon(): IconUsage | null { return OsuIcon.ModTransform; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return 'Everything rotates. EVERYTHING.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModWiggle, OsuModMagnetised, OsuModRepel, OsuModFreezeFrame, OsuModDepth];
  }
}

export class OsuModWiggle extends ModWithVisibilityAdjustment {
  override get name(): string { return 'Wiggle'; }
  override get acronym(): string { return 'WG'; }
  override get icon(): IconUsage | null { return OsuIcon.ModWiggle; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return 'They just won\'t stay still...'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModAutoplay, OsuModTransform, OsuModMagnetised, OsuModRepel, OsuModDepth];
  }

  readonly strength: BindableNumber = new BindableDouble(1).with({
    minValue: Math.fround(0.1),
    maxValue: 2,
    precision: Math.fround(0.1),
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('Strength', 'Strength', this.strength, 'Multiplier applied to the wiggling strength.')];
  }
}

export class OsuModSpinIn extends ModWithVisibilityAdjustment implements IHidesApproachCircles {
  readonly hidesApproachCircles = true;

  override get name(): string { return 'Spin In'; }
  override get acronym(): string { return 'SI'; }
  override get icon(): IconUsage | null { return OsuIcon.ModSpinIn; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return 'Circles spin in. No approach circles.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [IRequiresApproachCircles, OsuModObjectScaleTween, OsuModHidden, OsuModDepth];
  }
}

export abstract class OsuModObjectScaleTween extends ModWithVisibilityAdjustment implements IHidesApproachCircles {
  readonly hidesApproachCircles = true;

  override get type(): ModType { return ModType.Fun; }

  /** [SettingSource("Starting Size", "The initial size multiplier applied to all objects.")] */
  abstract readonly startScale: BindableNumber;

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('StartScale', 'Starting Size', this.startScale, 'The initial size multiplier applied to all objects.')];
  }

  override get incompatibleMods(): ModTypeReference[] {
    return [IRequiresApproachCircles, OsuModSpinIn, OsuModObjectScaleTween, OsuModDepth];
  }
}

export class OsuModGrow extends OsuModObjectScaleTween {
  override get name(): string { return 'Grow'; }
  override get acronym(): string { return 'GR'; }
  override get icon(): IconUsage | null { return OsuIcon.ModGrow; }
  override get description(): string { return 'Hit them at the right size!'; }

  readonly startScale: BindableNumber = new BindableFloat(Math.fround(0.5)).with({
    minValue: 0,
    maxValue: Math.fround(0.99),
    precision: Math.fround(0.01),
  });
}

export class OsuModDeflate extends OsuModObjectScaleTween {
  override get name(): string { return 'Deflate'; }
  override get acronym(): string { return 'DF'; }
  override get icon(): IconUsage | null { return OsuIcon.ModDeflate; }
  override get description(): string { return 'Hit them at the right size!'; }

  readonly startScale: BindableNumber = new BindableFloat(2).with({
    minValue: 1,
    maxValue: 25,
    precision: Math.fround(0.1),
  });
}

export class OsuModBarrelRoll extends ModBarrelRoll {
  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModBubbles];
  }
}

export enum AnimationStyle {
  Linear = 'Linear',
  Gravity = 'Gravity',
  InOut1 = 'InOut1',
  InOut2 = 'InOut2',
  Accelerate1 = 'Accelerate1',
  Accelerate2 = 'Accelerate2',
  Accelerate3 = 'Accelerate3',
  Decelerate1 = 'Decelerate1',
  Decelerate2 = 'Decelerate2',
  Decelerate3 = 'Decelerate3',
}

export class OsuModApproachDifferent extends Mod implements IRequiresApproachCircles {
  readonly requiresApproachCircles = true;

  override get name(): string { return 'Approach Different'; }
  override get acronym(): string { return 'AD'; }
  override get description(): string { return 'Never trust the approach circles...'; }
  override get icon(): IconUsage | null { return OsuIcon.ModApproachDifferent; }

  override get incompatibleMods(): ModTypeReference[] {
    return [IHidesApproachCircles, OsuModFreezeFrame];
  }

  readonly scale = new BindableFloat(4).with({
    precision: Math.fround(0.1),
    minValue: Math.fround(1.5),
    maxValue: 10,
  });

  readonly style = new Bindable<AnimationStyle>(AnimationStyle.Gravity);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('Scale', 'Initial size', this.scale, 'Change the initial size of the approach circle, relative to hit circles.', 0),
      settingSource('Style', 'Style', this.style, 'Change the animation style of the approach circles.', 1),
    ];
  }
}

export class OsuModMuted extends ModMuted {}

export class OsuModNoScope extends ModNoScope {
  override get description(): string { return 'Where\'s the cursor?'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModBloom];
  }

  readonly hiddenComboCount = new BindableInt(10).with({
    minValue: 0,
    maxValue: 50,
  });
}

export class OsuModMagnetised extends Mod {
  override get name(): string { return 'Magnetised'; }
  override get acronym(): string { return 'MG'; }
  override get icon(): IconUsage | null { return OsuIcon.ModMagnetised; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return 'No need to chase the circles – your cursor is a magnet!'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModAutopilot, OsuModWiggle, OsuModTransform, ModAutoplay, OsuModRelax, OsuModRepel, OsuModBubbles, OsuModDepth];
  }

  readonly attractionStrength = new BindableFloat(Math.fround(0.5)).with({
    precision: Math.fround(0.05),
    minValue: Math.fround(0.05),
    maxValue: 1,
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('AttractionStrength', 'Attraction strength', this.attractionStrength, 'How strong the pull is.', 0)];
  }
}

export class OsuModRepel extends Mod {
  override get name(): string { return 'Repel'; }
  override get acronym(): string { return 'RP'; }
  override get icon(): IconUsage | null { return OsuIcon.ModRepel; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return 'Hit objects run away!'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModAutopilot, OsuModWiggle, OsuModTransform, ModAutoplay, OsuModMagnetised, OsuModBubbles, OsuModDepth];
  }

  readonly repulsionStrength = new BindableFloat(Math.fround(0.5)).with({
    precision: Math.fround(0.05),
    minValue: Math.fround(0.05),
    maxValue: 1,
  });

  protected override createSettingsSource(): SettingSource[] {
    return [settingSource('RepulsionStrength', 'Repulsion strength', this.repulsionStrength, 'How strong the repulsion is.', 0)];
  }
}

export class OsuModFreezeFrame extends Mod {
  override get name(): string { return 'Freeze Frame'; }
  override get acronym(): string { return 'FR'; }
  override get icon(): IconUsage | null { return OsuIcon.ModFreezeFrame; }
  override get description(): string { return 'Burn the notes into your memory.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModApproachDifferent, OsuModTransform, OsuModDepth, OsuModHidden];
  }

  override get type(): ModType { return ModType.Fun; }
}

export class OsuModBubbles extends Mod {
  override get name(): string { return 'Bubbles'; }
  override get acronym(): string { return 'BU'; }
  override get description(): string { return 'Don\'t let their popping distract you!'; }
  override get icon(): IconUsage | null { return OsuIcon.ModBubbles; }
  override get type(): ModType { return ModType.Fun; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModBarrelRoll, OsuModMagnetised, OsuModRepel];
  }
}

export class OsuModSynesthesia extends ModSynesthesia {}

export class OsuModDepth extends ModWithVisibilityAdjustment {
  override get name(): string { return 'Depth'; }
  override get acronym(): string { return 'DP'; }
  override get icon(): IconUsage | null { return OsuIcon.ModDepth; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return '3D. Almost.'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModAutoplay, OsuModMagnetised, OsuModRepel, OsuModFreezeFrame, ModWithVisibilityAdjustment];
  }

  readonly maxDepth = new BindableFloat(100).with({
    precision: 10,
    minValue: 50,
    maxValue: 200,
  });

  readonly showApproachCircles = new BindableBool(true);

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('MaxDepth', 'Maximum depth', this.maxDepth, 'How far away objects appear.', 0),
      settingSource('ShowApproachCircles', 'Show Approach Circles', this.showApproachCircles, 'Whether approach circles should be visible.', 1),
    ];
  }
}

export class OsuModBloom extends Mod {
  override get name(): string { return 'Bloom'; }
  override get acronym(): string { return 'BM'; }
  override get icon(): IconUsage | null { return OsuIcon.ModBloom; }
  override get type(): ModType { return ModType.Fun; }
  override get description(): string { return 'The cursor blooms into.. a larger cursor!'; }

  override get incompatibleMods(): ModTypeReference[] {
    return [OsuModFlashlight, OsuModNoScope, ModTouchDevice];
  }

  readonly maxSizeComboCount = new BindableInt(50).with({
    minValue: 5,
    maxValue: 100,
  });

  readonly maxCursorSize = new BindableFloat(10).with({
    minValue: 5,
    maxValue: 15,
    precision: Math.fround(0.5),
  });

  protected override createSettingsSource(): SettingSource[] {
    return [
      settingSource('MaxSizeComboCount', 'Max size at combo', this.maxSizeComboCount, 'The combo count at which the cursor reaches its maximum size'),
      settingSource('MaxCursorSize', 'Final size multiplier', this.maxCursorSize, 'The multiplier applied to cursor size when combo reaches maximum'),
    ];
  }
}

// #endregion

// #region system

export class OsuModTouchDevice extends ModTouchDevice {
  override get incompatibleMods(): ModTypeReference[] {
    return [...super.incompatibleMods, OsuModAutopilot, OsuModBloom];
  }

  override get ranked(): boolean {
    return this.usesDefaultConfiguration;
  }
}

// #endregion

