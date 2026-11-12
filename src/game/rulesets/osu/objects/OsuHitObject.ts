// Ported from osu.Game.Rulesets.Osu/Objects/OsuHitObject.cs

import type { Bindable } from '@fw/bindables/Bindable';
import { Vector2F } from '@fw/layout/Vector2F';
import { BeatmapDifficultyInfo, type DifficultyRange, type IBeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { ControlPointInfo } from '../../../beatmaps/controlPoints/ControlPointInfo';
import { HitObject } from '../../objects/HitObject';
import { HitObjectProperty } from '../../objects/HitObjectProperty';
import { LegacyRulesetExtensions } from '../../objects/legacy/LegacyRulesetExtensions';
import type { IHasComboInformation, IHasPosition } from '../../objects/types/Types';
import type { HitWindows } from '../../scoring/HitWindows';
import { OsuHitWindows } from '../scoring/OsuHitWindows';

const f = Math.fround;

export abstract class OsuHitObject extends HitObject implements IHasComboInformation, IHasPosition {
  /** The radius of hit objects (ie. the radius of a HitCircle). */
  static readonly OBJECT_RADIUS = 64;

  /** The width and height any element participating in display of a hitcircle (or similarly sized object) should be. */
  static readonly OBJECT_DIMENSIONS = new Vector2F(OsuHitObject.OBJECT_RADIUS * 2);

  /** Scoring distance with a speed-adjusted beat length of 1 second (ie. the speed slider balls move through their track). */
  static readonly BASE_SCORING_DISTANCE = 100;

  /** Minimum preempt time at AR=10. */
  static readonly PREEMPT_MIN = 450;

  /** Median preempt time at AR=5. */
  static readonly PREEMPT_MID = 1200;

  /** Maximum preempt time at AR=0. */
  static readonly PREEMPT_MAX = 1800;

  static readonly PREEMPT_RANGE: DifficultyRange = { min: OsuHitObject.PREEMPT_MAX, mid: OsuHitObject.PREEMPT_MID, max: OsuHitObject.PREEMPT_MIN };

  /** (IHasTimePreempt) */
  timePreempt = 600;

  timeFadeIn = 400;

  private readonly positionProperty = new HitObjectProperty<Vector2F>(Vector2F.Zero);

  get positionBindable(): Bindable<Vector2F> {
    return this.positionProperty.bindable;
  }

  get position(): Vector2F {
    return this.positionProperty.value;
  }

  set position(value: Vector2F) {
    this.positionProperty.value = value;
  }

  get x(): number {
    return this.position.x;
  }

  set x(value: number) {
    this.position = new Vector2F(value, this.position.y);
  }

  get y(): number {
    return this.position.y;
  }

  set y(value: number) {
    this.position = new Vector2F(this.position.x, value);
  }

  get stackedPosition(): Vector2F {
    return this.position.add(this.stackOffset);
  }

  get endPosition(): Vector2F {
    return this.position;
  }

  get stackedEndPosition(): Vector2F {
    return this.endPosition.add(this.stackOffset);
  }

  private readonly stackHeightProperty = new HitObjectProperty<number>(0);

  get stackHeightBindable(): Bindable<number> {
    return this.stackHeightProperty.bindable;
  }

  get stackHeight(): number {
    return this.stackHeightProperty.value;
  }

  set stackHeight(value: number) {
    this.stackHeightProperty.value = value;
  }

  get stackOffset(): Vector2F {
    // new Vector2(StackHeight * Scale * -6.4f): float arithmetic.
    return new Vector2F(f(f(this.stackHeight * this.scale) * f(-6.4)));
  }

  get radius(): number {
    return f(OsuHitObject.OBJECT_RADIUS * this.scale);
  }

  private readonly scaleProperty = new HitObjectProperty<number>(1);

  get scaleBindable(): Bindable<number> {
    return this.scaleProperty.bindable;
  }

  get scale(): number {
    return this.scaleProperty.value;
  }

  set scale(value: number) {
    this.scaleProperty.value = f(value);
  }

  newCombo = false;

  private readonly comboOffsetProperty = new HitObjectProperty<number>(0);

  get comboOffsetBindable(): Bindable<number> {
    return this.comboOffsetProperty.bindable;
  }

  get comboOffset(): number {
    return this.comboOffsetProperty.value;
  }

  set comboOffset(value: number) {
    this.comboOffsetProperty.value = value;
  }

  private readonly indexInCurrentComboProperty = new HitObjectProperty<number>(0);

  get indexInCurrentComboBindable(): Bindable<number> {
    return this.indexInCurrentComboProperty.bindable;
  }

  get indexInCurrentCombo(): number {
    return this.indexInCurrentComboProperty.value;
  }

  set indexInCurrentCombo(value: number) {
    this.indexInCurrentComboProperty.value = value;
  }

  private readonly comboIndexProperty = new HitObjectProperty<number>(0);

  get comboIndexBindable(): Bindable<number> {
    return this.comboIndexProperty.bindable;
  }

  get comboIndex(): number {
    return this.comboIndexProperty.value;
  }

  set comboIndex(value: number) {
    this.comboIndexProperty.value = value;
  }

  private readonly comboIndexWithOffsetsProperty = new HitObjectProperty<number>(0);

  get comboIndexWithOffsetsBindable(): Bindable<number> {
    return this.comboIndexWithOffsetsProperty.bindable;
  }

  get comboIndexWithOffsets(): number {
    return this.comboIndexWithOffsetsProperty.value;
  }

  set comboIndexWithOffsets(value: number) {
    this.comboIndexWithOffsetsProperty.value = value;
  }

  private readonly lastInComboProperty = new HitObjectProperty<boolean>(false);

  get lastInComboBindable(): Bindable<boolean> {
    return this.lastInComboProperty.bindable;
  }

  get lastInCombo(): boolean {
    return this.lastInComboProperty.value;
  }

  set lastInCombo(value: boolean) {
    this.lastInComboProperty.value = value;
  }

  constructor() {
    super();

    this.stackHeightBindable.bindValueChanged(height => {
      for (const nested of this.nestedHitObjects) {
        if (nested instanceof OsuHitObject)
          nested.stackHeight = height.newValue;
      }
    });
  }

  protected override applyDefaultsToSelf(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    super.applyDefaultsToSelf(controlPointInfo, difficulty);

    this.timePreempt = BeatmapDifficultyInfo.difficultyRangeInt(difficulty.approachRate, OsuHitObject.PREEMPT_RANGE);

    // Preempt time can go below 450ms. Normally, this is achieved via the DT mod which uniformly speeds up all animations game wide regardless of AR.
    // This uniform speedup is hard to match 1:1, however we can at least make AR>10 (via mods) feel good by extending the upper linear function above.
    // Note that this doesn't exactly match the AR>10 visuals as they're classically known, but it feels good.
    // This adjustment is necessary for AR>10, otherwise TimePreempt can become smaller leading to hitcircles not fully fading in.
    this.timeFadeIn = 400 * Math.min(1, this.timePreempt / OsuHitObject.PREEMPT_MIN);

    this.scale = LegacyRulesetExtensions.calculateScaleFromCircleSize(difficulty.circleSize, true);
  }

  updateComboInformation(lastObj: IHasComboInformation | null): void {
    // Note that this implementation is shared with the osu!catch ruleset's implementation.
    // If a change is made here, CatchHitObject.cs should also be updated.
    let index = lastObj?.comboIndex ?? 0;
    let indexWithOffsets = lastObj?.comboIndexWithOffsets ?? 0;
    let inCurrentCombo = lastObj !== null ? lastObj.indexInCurrentCombo + 1 : 0;

    // - For the purpose of combo colours, spinners never start a new combo even if they are flagged as doing so.
    // - At decode time, the first hitobject in the beatmap and the first hitobject after a spinner are both enforced to be a new combo,
    //   but this isn't directly enforced by the editor so the extra checks against the last hitobject are duplicated here.
    if (!this.isSpinner && (this.newCombo || lastObj === null || (lastObj instanceof OsuHitObject && lastObj.isSpinner))) {
      inCurrentCombo = 0;
      index++;
      indexWithOffsets += this.comboOffset + 1;

      if (lastObj !== null)
        lastObj.lastInCombo = true;
    }

    this.comboIndex = index;
    this.comboIndexWithOffsets = indexWithOffsets;
    this.indexInCurrentCombo = inCurrentCombo;
  }

  /** (`this is Spinner` in C#; Spinner.ts overrides it, which avoids a circular import here.) */
  protected get isSpinner(): boolean {
    return false;
  }

  protected override createHitWindows(): HitWindows | null {
    return new OsuHitWindows();
  }
}
