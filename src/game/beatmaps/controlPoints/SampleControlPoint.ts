// Ported from osu.Game/Beatmaps/ControlPoints/SampleControlPoint.cs

import { Bindable } from '@fw/bindables/Bindable';
import { BindableInt } from '@fw/bindables/BindableNumber';
import { HitSampleInfo } from '../../audio/HitSampleInfo';
import { ControlPoint } from './ControlPoint';

/** Note that going forward, this control point type should always be assigned directly to HitObjects. */
export class SampleControlPoint extends ControlPoint {
  static readonly DEFAULT_BANK = HitSampleInfo.BANK_NORMAL;

  static readonly DEFAULT: SampleControlPoint = (() => {
    const p = new SampleControlPoint();
    p.sampleBankBindable.disabled = true;
    p.sampleVolumeBindable.disabled = true;
    return p;
  })();

  /** The default sample bank at this control point. */
  readonly sampleBankBindable = new Bindable<string>(SampleControlPoint.DEFAULT_BANK).with({ default: SampleControlPoint.DEFAULT_BANK });

  /** The speed multiplier at this control point. */
  get sampleBank(): string {
    return this.sampleBankBindable.value;
  }

  set sampleBank(value: string) {
    this.sampleBankBindable.value = value;
  }

  /** The default sample volume at this control point. */
  readonly sampleVolumeBindable = new BindableInt(100).with({ minValue: 0, maxValue: 100 });

  /** The default sample volume at this control point. */
  get sampleVolume(): number {
    return this.sampleVolumeBindable.value;
  }

  set sampleVolume(value: number) {
    this.sampleVolumeBindable.value = value;
  }

  constructor() {
    super();

    this.sampleBankBindable.bindValueChanged(() => this.raiseChanged());
    this.sampleVolumeBindable.bindValueChanged(() => this.raiseChanged());
  }

  /** Create a SampleInfo based on the sample settings in this control point. */
  getSampleInfo(sampleName = HitSampleInfo.HIT_NORMAL): HitSampleInfo {
    return new HitSampleInfo(sampleName, this.sampleBank, null, this.sampleVolume);
  }

  /** Applies hit sample information from this SampleControlPoint to a HitSampleInfo. */
  applyTo(hitSampleInfo: HitSampleInfo): HitSampleInfo {
    return hitSampleInfo.with({ bank: hitSampleInfo.bank, volume: hitSampleInfo.volume > 0 ? hitSampleInfo.volume : this.sampleVolume });
  }

  override isRedundant(existing: ControlPoint | null): boolean {
    return existing instanceof SampleControlPoint
      && this.sampleBank === existing.sampleBank
      && this.sampleVolume === existing.sampleVolume;
  }

  override copyFrom(other: ControlPoint): void {
    const o = other as SampleControlPoint;
    this.sampleVolume = o.sampleVolume;
    this.sampleBank = o.sampleBank;

    super.copyFrom(other);
  }

  override equals(other: ControlPoint | null): boolean {
    return other instanceof SampleControlPoint
      && super.equals(other)
      && this.sampleBank === other.sampleBank
      && this.sampleVolume === other.sampleVolume;
  }
}
