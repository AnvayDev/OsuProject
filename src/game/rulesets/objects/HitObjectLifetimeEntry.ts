// Ported from osu.Game/Rulesets/Objects/HitObjectLifetimeEntry.cs and SyntheticHitObjectEntry.cs

import { BindableDouble } from '@fw/bindables/BindableNumber';
import { LifetimeEntry } from '@fw/graphics/performance/LifetimeEntry';
import type { JudgementResult } from '../judgements/JudgementResult';
import type { HitObject } from './HitObject';

/** A LifetimeEntry that stores the lifetime for a HitObject. */
export class HitObjectLifetimeEntry extends LifetimeEntry {
  /** The list of HitObjectLifetimeEntry for the HitObject's nested objects (if any). */
  nestedEntries: HitObjectLifetimeEntry[] = [];

  /** @internal The result that HitObject was judged with. This is set by the accompanying DrawableHitObject, and reused when required for rewinding. */
  result: JudgementResult | null = null;

  /** Whether HitObject has been judged. Note: This does NOT include nested hitobjects. */
  get judged(): boolean {
    return this.result?.hasResult ?? false;
  }

  /** Whether HitObject and all of its nested objects have been judged. */
  get allJudged(): boolean {
    if (!this.judged)
      return false;

    for (const entry of this.nestedEntries) {
      if (!entry.allJudged)
        return false;
    }

    return true;
  }

  private readonly startTimeBindable = new BindableDouble();

  /** @internal Invoked to revert the result of the hit object (when rewinding past its judgement). */
  revertResult: (() => void) | null = null;

  // The lifetime, as set by the hitobject.
  private realLifetimeStart = -Number.MAX_VALUE;
  private realLifetimeEnd = Number.MAX_VALUE;

  /** Creates a new HitObjectLifetimeEntry for the HitObject to store the lifetime of. */
  constructor(readonly hitObject: HitObject) {
    super();

    this.startTimeBindable.bindTo(hitObject.startTimeBindable);
    this.startTimeBindable.bindValueChanged(() => this.setInitialLifetime(), true);

    // Subscribe to this event before the DrawableHitObject so that the local callback is invoked before the entry is re-applied as a result of DefaultsApplied.
    // This way, the DrawableHitObject can use OnApply() to overwrite the LifetimeStart that was set inside setInitialLifetime().
    hitObject.defaultsApplied.add(() => this.setInitialLifetime());
  }

  // This method is called even if `start == LifetimeStart` when `KeepAlive` is true (necessary to update `realLifetimeStart`).
  protected override setLifetimeStart(start: number): void {
    this.realLifetimeStart = start;
    if (!this.keepAliveBacking)
      super.setLifetimeStart(start);
  }

  protected override setLifetimeEnd(end: number): void {
    this.realLifetimeEnd = end;
    if (!this.keepAliveBacking)
      super.setLifetimeEnd(end);
  }

  private keepAliveBacking = false;

  /** @internal Whether the HitObject should be kept always alive. */
  set keepAlive(value: boolean) {
    if (this.keepAliveBacking === value)
      return;

    this.keepAliveBacking = value;
    if (this.keepAliveBacking)
      this.setLifetime(-Number.MAX_VALUE, Number.MAX_VALUE);
    else
      this.setLifetime(this.realLifetimeStart, this.realLifetimeEnd);
  }

  /**
   * A safe offset prior to the start time of HitObject at which it may begin displaying contents.
   * By default, HitObjects are assumed to display their contents within 10 seconds prior to their start time.
   * This is only used as an optimisation to delay the initial application of the HitObject to a DrawableHitObject.
   * A more accurate LifetimeEntry.LifetimeStart should be set on the hit object application, for further optimisation.
   */
  protected get initialLifetimeOffset(): number {
    return 10000;
  }

  /** @internal Set LifetimeEntry.LifetimeStart using initialLifetimeOffset. */
  setInitialLifetime(): void {
    this.lifetimeStart = this.hitObject.startTime - this.initialLifetimeOffset;
  }

  /** @internal */
  onRevertResult(): void {
    this.revertResult?.();
  }
}

/** Created for a DrawableHitObject when only HitObject is given to make sure a DrawableHitObject is always associated with a HitObjectLifetimeEntry. */
export class SyntheticHitObjectEntry extends HitObjectLifetimeEntry {
}
