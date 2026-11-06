import { describe, expect, it } from 'vitest';
import { AudioAdjustments } from '@fw/audio/AudioComponent';
import { BeatmapDifficulty } from '@game/beatmaps/BeatmapDifficulty';
import { ModType } from '@game/rulesets/mods/ModType';
import { ModWindUp, MultiMod } from '@game/rulesets/mods/Mods';
import {
  OsuModDifficultyAdjust, OsuModDoubleTime, OsuModEasy, OsuModHardRock, OsuModHidden, OsuModNightcore, OsuModSpinIn, OsuModTraceable,
} from '@game/rulesets/osu/mods/OsuMods';
import { OsuRuleset } from '@game/rulesets/osu/OsuRuleset';
import { RulesetInfo } from '@game/rulesets/RulesetInfo';
import { ModUtils } from '@game/utils/ModUtils';

describe('osu! mods', () => {
  const ruleset = new OsuRuleset();

  it('lists the osu! ruleset mods by type, as OsuRuleset.GetModsFor', () => {
    const acronyms = (type: ModType) => ruleset.getModsFor(type).map(m => m instanceof MultiMod ? m.mods.map(x => x.acronym).join('/') : m.acronym);

    expect(acronyms(ModType.DifficultyReduction)).toEqual(['EZ', 'NF', 'HT/DC']);
    expect(acronyms(ModType.DifficultyIncrease)).toEqual(['HR', 'SD/PF', 'DT/NC', 'HD/TC', 'FL/BL', 'ST', 'AC']);
    expect(acronyms(ModType.Conversion)).toEqual(['TP', 'DA', 'CL', 'RD', 'MR', 'AL/SG']);
    expect(acronyms(ModType.Automation)).toEqual(['AT/CN', 'RX', 'AP', 'SO']);
    expect(acronyms(ModType.System)).toEqual(['TD', 'SV2']);

    const all = ruleset.createAllMods();
    expect(new Set(all.map(m => m.acronym)).size).toBe(all.length);
    expect(all.every(m => m.name !== '' && m.description !== '' && m.icon !== null)).toBe(true);
    expect(new RulesetInfo('osu').createInstance()?.createModFromAcronym('dt')).toBeInstanceOf(OsuModDoubleTime);
  });

  it('checks compatibility through classes and marker interfaces', () => {
    expect(ModUtils.checkCompatibleSet([new OsuModHardRock(), new OsuModEasy()])).not.toBeNull();
    expect(ModUtils.checkCompatibleSet([new OsuModHidden(), new OsuModTraceable()])).not.toBeNull(); // IHidesApproachCircles
    expect(ModUtils.checkCompatibleSet([new OsuModTraceable(), new OsuModSpinIn()])).not.toBeNull();
    expect(ModUtils.checkCompatibleSet([new OsuModDoubleTime(), new OsuModNightcore()])).not.toBeNull(); // ModRateAdjust
    expect(ModUtils.checkCompatibleSet([new OsuModHidden(), new OsuModHardRock(), new OsuModDoubleTime()])).toBeNull();
    expect(ModUtils.checkCompatibleSet([new OsuModHidden(), new OsuModHidden()])).not.toBeNull();
  });

  it('keeps settings through clones, equality and descriptions', () => {
    const dt = new OsuModDoubleTime();
    expect(dt.ranked).toBe(true);
    expect(dt.extendedIconInformation).toBe('');

    dt.speedChange.value = 1.2;
    dt.adjustPitch.value = true;

    expect(dt.ranked).toBe(false);
    expect(dt.extendedIconInformation).toBe('1.20x');
    expect(dt.settingDescription).toEqual([['Speed change', '1.20x'], ['Adjust pitch', 'On']]);

    const clone = dt.deepClone() as OsuModDoubleTime;
    expect(clone.speedChange.value).toBe(1.2);
    expect(clone.speedChange.default).toBe(1.5);
    expect(clone.equals(dt)).toBe(true);

    clone.speedChange.value = 1.3;
    expect(dt.speedChange.value).toBe(1.2); // unbound after the copy
    expect(clone.equals(dt)).toBe(false);

    clone.resetSettingsToDefaults();
    expect(clone.usesDefaultConfiguration).toBe(true);
    expect(ModUtils.calculateRateWithMods([clone])).toBe(1.5);
  });

  it('applies rate adjustments to a track as the mods do', () => {
    const dt = new OsuModDoubleTime();
    const track = new AudioAdjustments();
    dt.applyToTrack(track);
    expect(track.aggregateTempo.value).toBe(1.5);
    expect(track.aggregateFrequency.value).toBe(1);

    dt.adjustPitch.value = true;
    expect(track.aggregateTempo.value).toBe(1);
    expect(track.aggregateFrequency.value).toBe(1.5);

    const nc = new OsuModNightcore();
    const ncTrack = new AudioAdjustments();
    nc.applyToTrack(ncTrack);
    expect(ncTrack.aggregateFrequency.value).toBe(1.5);
    expect(ncTrack.aggregateTempo.value).toBe(1);

    const windUp = new ModWindUp();
    const windTrack = new AudioAdjustments();
    windUp.applyToTrack(windTrack);
    expect(windTrack.aggregateFrequency.value).toBe(1.5); // previews the final rate, pitch adjusted
  });

  it('applies difficulty adjustments', () => {
    const difficulty = () => Object.assign(new BeatmapDifficulty(), { circleSize: 4, approachRate: 9, overallDifficulty: 8, drainRate: 6 });

    const hr = difficulty();
    new OsuModHardRock().applyToDifficulty(hr);
    expect([hr.circleSize, hr.approachRate, hr.overallDifficulty, hr.drainRate].map(v => +v.toFixed(2))).toEqual([5.2, 10, 10, 8.4]);

    const ez = difficulty();
    new OsuModEasy().applyToDifficulty(ez);
    expect([ez.circleSize, ez.approachRate, ez.overallDifficulty, ez.drainRate]).toEqual([2, 4.5, 4, 3]);

    const da = new OsuModDifficultyAdjust();
    da.extendedLimits.value = true;
    expect(da.approachRate.currentNumber.minValue).toBe(-10); // extended limits reach every difficulty setting
    expect(da.circleSize.currentNumber.maxValue).toBe(11);
    da.approachRate.value = 10.5;
    expect(da.approachRate.value).toBe(10.5);
    expect(da.extendedIconInformation).toBe('AR10.5');

    const adjusted = difficulty();
    da.applyToDifficulty(adjusted);
    expect(adjusted.approachRate).toBe(10.5);
    expect(adjusted.circleSize).toBe(4);
  });
});
