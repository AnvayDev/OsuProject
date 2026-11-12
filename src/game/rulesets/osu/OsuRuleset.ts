// Ported subset of osu.Game.Rulesets.Osu/OsuRuleset.cs: the mods, and beatmap conversion and processing.

import type { IBeatmap } from '../../beatmaps/Beatmap';
import type { IBeatmapConverter } from '../../beatmaps/BeatmapConverter';
import type { IBeatmapProcessor } from '../../beatmaps/BeatmapProcessor';
import type { Mod } from '../mods/Mod';
import { ModAdaptiveSpeed, ModScoreV2, ModWindDown, ModWindUp, MultiMod } from '../mods/Mods';
import { ModType } from '../mods/ModType';
import { Ruleset } from '../Ruleset';
import { registerRuleset } from '../RulesetInfo';
import { OsuBeatmapConverter } from './beatmaps/OsuBeatmapConverter';
import { OsuBeatmapProcessor } from './beatmaps/OsuBeatmapProcessor';
import type { HealthProcessor } from '../scoring/HealthProcessor';
import type { ScoreMultiplierCalculator, ScoreMultiplierContext } from '../scoring/ScoreMultiplierCalculator';
import type { ScoreProcessor } from '../scoring/ScoreProcessor';
import { OsuHealthProcessor } from './scoring/OsuHealthProcessor';
import { OsuScoreMultiplierCalculatorV1 } from './scoring/OsuScoreMultiplierCalculatorV1';
import { OsuScoreMultiplierCalculatorV2 } from './scoring/OsuScoreMultiplierCalculatorV2';
import { OsuScoreProcessor } from './scoring/OsuScoreProcessor';
import {
  OsuModAccuracyChallenge, OsuModAlternate, OsuModApproachDifferent, OsuModAutopilot, OsuModAutoplay, OsuModBarrelRoll, OsuModBlinds,
  OsuModBloom, OsuModBubbles, OsuModCinema, OsuModClassic, OsuModDaycore, OsuModDeflate, OsuModDepth, OsuModDifficultyAdjust,
  OsuModDoubleTime, OsuModEasy, OsuModFlashlight, OsuModFreezeFrame, OsuModGrow, OsuModHalfTime, OsuModHardRock, OsuModHidden,
  OsuModMagnetised, OsuModMirror, OsuModMuted, OsuModNightcore, OsuModNoFail, OsuModNoScope, OsuModPerfect, OsuModRandom, OsuModRelax,
  OsuModRepel, OsuModSingleTap, OsuModSpinIn, OsuModSpunOut, OsuModStrictTracking, OsuModSuddenDeath, OsuModSynesthesia,
  OsuModTargetPractice, OsuModTouchDevice, OsuModTraceable, OsuModTransform, OsuModWiggle,
} from './mods/OsuMods';

export class OsuRuleset extends Ruleset {
  static readonly SHORT_NAME = 'osu';

  override get shortName(): string {
    return OsuRuleset.SHORT_NAME;
  }

  override createBeatmapConverter(beatmap: IBeatmap): IBeatmapConverter {
    return new OsuBeatmapConverter(beatmap);
  }

  override createBeatmapProcessor(beatmap: IBeatmap): IBeatmapProcessor {
    return new OsuBeatmapProcessor(beatmap);
  }

  override createScoreProcessor(): ScoreProcessor {
    return new OsuScoreProcessor();
  }

  override createHealthProcessor(drainStartTime: number): HealthProcessor {
    return new OsuHealthProcessor(drainStartTime);
  }

  override createScoreMultiplierCalculator(context: ScoreMultiplierContext): ScoreMultiplierCalculator {
    if (context.score !== null && context.score.totalScoreVersion < 30000017)
      return new OsuScoreMultiplierCalculatorV1(context);

    return new OsuScoreMultiplierCalculatorV2(context);
  }

  override getModsFor(type: ModType): Mod[] {
    switch (type) {
      case ModType.DifficultyReduction:
        return [
          new OsuModEasy(),
          new OsuModNoFail(),
          new MultiMod(new OsuModHalfTime(), new OsuModDaycore()),
        ];

      case ModType.DifficultyIncrease:
        return [
          new OsuModHardRock(),
          new MultiMod(new OsuModSuddenDeath(), new OsuModPerfect()),
          new MultiMod(new OsuModDoubleTime(), new OsuModNightcore()),
          new MultiMod(new OsuModHidden(), new OsuModTraceable()),
          new MultiMod(new OsuModFlashlight(), new OsuModBlinds()),
          new OsuModStrictTracking(),
          new OsuModAccuracyChallenge(),
        ];

      case ModType.Conversion:
        return [
          new OsuModTargetPractice(),
          new OsuModDifficultyAdjust(),
          new OsuModClassic(),
          new OsuModRandom(),
          new OsuModMirror(),
          new MultiMod(new OsuModAlternate(), new OsuModSingleTap()),
        ];

      case ModType.Automation:
        return [
          new MultiMod(new OsuModAutoplay(), new OsuModCinema()),
          new OsuModRelax(),
          new OsuModAutopilot(),
          new OsuModSpunOut(),
        ];

      case ModType.Fun:
        return [
          new OsuModTransform(),
          new OsuModWiggle(),
          new OsuModSpinIn(),
          new MultiMod(new OsuModGrow(), new OsuModDeflate()),
          new MultiMod(new ModWindUp(), new ModWindDown()),
          new OsuModBarrelRoll(),
          new OsuModApproachDifferent(),
          new OsuModMuted(),
          new OsuModNoScope(),
          new MultiMod(new OsuModMagnetised(), new OsuModRepel()),
          new ModAdaptiveSpeed(),
          new OsuModFreezeFrame(),
          new OsuModBubbles(),
          new OsuModSynesthesia(),
          new OsuModDepth(),
          new OsuModBloom(),
        ];

      case ModType.System:
        return [
          new OsuModTouchDevice(),
          new ModScoreV2(),
        ];

      default:
        return [];
    }
  }
}

registerRuleset(OsuRuleset.SHORT_NAME, () => new OsuRuleset());
