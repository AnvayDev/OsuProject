// Ported from osu.Game/Screens/Play/GameplayState.cs (Score, Storyboard and the local user's playing state are added with the Player).

import { Bindable } from '@fw/bindables/Bindable';
import type { ISampleInfo } from '../../audio/SampleInfo';
import type { IBeatmap } from '../../beatmaps/Beatmap';
import type { JudgementResult } from '../../rulesets/judgements/JudgementResult';
import type { Mod } from '../../rulesets/mods/Mod';
import type { Ruleset } from '../../rulesets/Ruleset';
import type { HealthProcessor } from '../../rulesets/scoring/HealthProcessor';
import type { ScoreProcessor } from '../../rulesets/scoring/ScoreProcessor';

/** The state of an active gameplay session, generally constructed and exposed by Player. */
export class GameplayState {
  /** The final post-convert post-mod-application beatmap. */
  readonly beatmap: IBeatmap;

  /** The ruleset used in gameplay. */
  readonly ruleset: Ruleset;

  /** The mods applied to the gameplay. */
  readonly mods: readonly Mod[];

  readonly scoreProcessor: ScoreProcessor;

  readonly healthProcessor: HealthProcessor;

  /** Whether gameplay completed without the user failing. */
  hasPassed = false;

  /** Whether the user failed during gameplay. This is only set when the gameplay session has completed due to the fail. */
  hasFailed = false;

  /** Whether the user quit gameplay without having either passed or failed. */
  hasQuit = false;

  /** Whether gameplay has completed (passed, failed or quit). */
  get hasCompleted(): boolean {
    return this.hasPassed || this.hasFailed || this.hasQuit;
  }

  /** A bindable tracking the last judgement result applied to any hit object. */
  readonly lastJudgementResult = new Bindable<JudgementResult | null>(null);

  /** A bindable tracking the last played samples (the samples of the last hit object that was hit). */
  readonly lastPlayedSamples = new Bindable<readonly ISampleInfo[] | null>(null);

  constructor(beatmap: IBeatmap, ruleset: Ruleset, mods: readonly Mod[] | null = null, scoreProcessor: ScoreProcessor | null = null, healthProcessor: HealthProcessor | null = null) {
    this.beatmap = beatmap;
    this.ruleset = ruleset;
    this.mods = mods ?? [];
    this.scoreProcessor = scoreProcessor ?? ruleset.createScoreProcessor();
    this.healthProcessor = healthProcessor ?? ruleset.createHealthProcessor(beatmap.hitObjects[0].startTime);
  }

  /** Applies the score change of a JudgementResult to this GameplayState. */
  applyResult(result: JudgementResult): void {
    this.lastJudgementResult.value = result;
  }

  /** Applies the samples that were played by the last hit object. */
  applySamples(samples: readonly ISampleInfo[]): void {
    this.lastPlayedSamples.value = samples;
  }
}
