// Ported subset of osu.Game.Rulesets.Osu/OsuRuleset.cs: the mods (no gameplay is ported).

import type { Mod } from '../mods/Mod';
import { ModAdaptiveSpeed, ModScoreV2, ModWindDown, ModWindUp, MultiMod } from '../mods/Mods';
import { ModType } from '../mods/ModType';
import { Ruleset } from '../Ruleset';
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
