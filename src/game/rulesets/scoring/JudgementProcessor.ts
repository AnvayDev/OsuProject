// Ported from osu.Game/Rulesets/Scoring/JudgementProcessor.cs (ResetFromReplayFrame, which restores state from a spectated frame's
// header, is ported with spectating).

import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Signal } from '@fw/bindables/Signal';
import { Component } from '@fw/graphics/Component';
import type { IBeatmap } from '../../beatmaps/Beatmap';
import type { Judgement } from '../judgements/Judgement';
import { JudgementResult } from '../judgements/JudgementResult';
import type { HitObject } from '../objects/HitObject';
import { HitResult } from './HitResult';

export abstract class JudgementProcessor extends Component {
  /** Invoked when a new judgement has occurred. This occurs after the judgement has been processed by this JudgementProcessor. */
  readonly newJudgement = new Signal<JudgementResult>();

  /** Invoked when a judgement is reverted, usually due to rewinding gameplay. */
  readonly judgementReverted = new Signal<JudgementResult>();

  /** The maximum number of hits that can be judged. */
  protected maxHits = 0;

  /** Whether simulateAutoplay is currently running. */
  protected isSimulating = false;

  /** The total number of judged HitObjects at the current point in time. */
  judgedHits = 0;

  private lastAppliedResult: JudgementResult | null = null;

  private readonly hasCompletedBindable = new BindableBool();

  /** Whether all Judgements have been processed. */
  get hasCompleted(): Bindable<boolean> {
    return this.hasCompletedBindable;
  }

  /** Applies a IBeatmap to this JudgementProcessor. */
  applyBeatmap(beatmap: IBeatmap): void {
    this.reset(false);
    this.simulateAutoplay(beatmap);
    this.reset(true);
  }

  /** Applies the score change of a JudgementResult to this JudgementProcessor. */
  applyResult(result: JudgementResult): void {
    if (result.type === HitResult.LegacyComboIncrease)
      throw new Error('A LegacyComboIncrease hit result cannot be applied.');

    this.judgedHits++;
    this.lastAppliedResult = result;

    this.applyResultInternal(result);

    this.newJudgement.emit(result);
  }

  /** Reverts the score change of a JudgementResult that was applied to this JudgementProcessor. */
  revertResult(result: JudgementResult): void {
    this.judgedHits--;

    this.revertResultInternal(result);

    this.judgementReverted.emit(result);
  }

  /** Applies the score change of a JudgementResult to this JudgementProcessor. Any changes applied via this method can be reverted via revertResultInternal. */
  protected abstract applyResultInternal(result: JudgementResult): void;

  /** Reverts the score change of a JudgementResult that was applied to this JudgementProcessor via applyResultInternal. */
  protected abstract revertResultInternal(result: JudgementResult): void;

  /** Resets this JudgementProcessor to a default state. storeResults: whether to store the current state for future use. */
  protected reset(storeResults: boolean): void {
    if (storeResults)
      this.maxHits = this.judgedHits;

    this.judgedHits = 0;
  }

  /** Simulates an autoplay of the IBeatmap to determine scoring values. This provided temporarily. DO NOT USE. */
  protected simulateAutoplay(beatmap: IBeatmap): void {
    this.isSimulating = true;

    for (const obj of this.enumerateHitObjects(beatmap)) {
      const judgement = obj.judgement;

      const result = this.createResult(obj, judgement);

      result.type = this.getSimulatedHitResult(judgement);
      this.applyResult(result);
    }

    this.isSimulating = false;
  }

  /** Enumerates all HitObjects in the given beatmap in the order in which their JudgementResults should be simulated: nested objects before their parent. */
  protected enumerateHitObjects(beatmap: IBeatmap): Iterable<HitObject> {
    return enumerateRecursively(beatmap.hitObjects);
  }

  /** Creates the JudgementResult that represents the scoring result for a HitObject. */
  protected createResult(hitObject: HitObject, judgement: Judgement): JudgementResult {
    return new JudgementResult(hitObject, judgement);
  }

  /** Gets a simulated HitResult for a judgement. Used during simulateAutoplay to simulate a "perfect" play. */
  protected getSimulatedHitResult(judgement: Judgement): HitResult {
    return judgement.maxResult;
  }

  protected override update(): void {
    super.update();

    this.hasCompletedBindable.value =
      this.judgedHits === this.maxHits
      && (this.judgedHits === 0
        // Last applied result is guaranteed to be non-null when JudgedHits > 0.
        || this.lastAppliedResult!.timeAbsolute < this.clock!.currentTime);
  }
}

function* enumerateRecursively(hitObjects: readonly HitObject[]): Iterable<HitObject> {
  for (const hitObject of hitObjects) {
    yield* enumerateRecursively(hitObject.nestedHitObjects);

    yield hitObject;
  }
}
