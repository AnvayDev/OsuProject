// Ported from osu.Game/Beatmaps/ControlPoints/TimingControlPoint.cs

import { Bindable } from '@fw/bindables/Bindable';
import { BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { TimeSignature } from '../timing/TimeSignature';
import { ControlPoint } from './ControlPoint';

export class TimingControlPoint extends ControlPoint {
  /** The time signature at this control point. */
  readonly timeSignatureBindable = new Bindable<TimeSignature>(TimeSignature.SimpleQuadruple);

  /** Whether the first bar line of this control point is ignored. */
  readonly omitFirstBarLineBindable = new BindableBool();

  /** Default length of a beat in milliseconds. Used whenever there is no beatmap or track playing. */
  private static readonly default_beat_length = 60000.0 / 60.0;

  static readonly DEFAULT: TimingControlPoint = (() => {
    const p = new TimingControlPoint();
    p.beatLengthBindable.value = TimingControlPoint.default_beat_length;
    p.beatLengthBindable.disabled = true;
    p.omitFirstBarLineBindable.disabled = true;
    p.timeSignatureBindable.disabled = true;
    return p;
  })();

  get timeSignature(): TimeSignature {
    return this.timeSignatureBindable.value;
  }

  set timeSignature(value: TimeSignature) {
    this.timeSignatureBindable.value = value;
  }

  get omitFirstBarLine(): boolean {
    return this.omitFirstBarLineBindable.value;
  }

  set omitFirstBarLine(value: boolean) {
    this.omitFirstBarLineBindable.value = value;
  }

  static readonly DEFAULT_BEAT_LENGTH = 1000;

  /** The beat length at this control point. */
  readonly beatLengthBindable = new BindableDouble(TimingControlPoint.DEFAULT_BEAT_LENGTH).with({ minValue: 6, maxValue: 60000 });

  /** The beat length at this control point. */
  get beatLength(): number {
    return this.beatLengthBindable.value;
  }

  set beatLength(value: number) {
    this.beatLengthBindable.value = value;
  }

  /** The BPM at this control point. */
  get bpm(): number {
    return 60000 / this.beatLength;
  }

  constructor() {
    super();

    this.timeSignatureBindable.bindValueChanged(() => this.raiseChanged());
    this.omitFirstBarLineBindable.bindValueChanged(() => this.raiseChanged());
    this.beatLengthBindable.bindValueChanged(() => this.raiseChanged());
  }

  // Timing points are never redundant as they can change the time signature.
  override isRedundant(_existing: ControlPoint | null): boolean {
    return false;
  }

  override copyFrom(other: ControlPoint): void {
    const o = other as TimingControlPoint;
    this.timeSignature = o.timeSignature;
    this.omitFirstBarLine = o.omitFirstBarLine;
    this.beatLength = o.beatLength;

    super.copyFrom(other);
  }

  override equals(other: ControlPoint | null): boolean {
    return other instanceof TimingControlPoint
      && super.equals(other)
      && this.timeSignature.equals(other.timeSignature)
      && this.omitFirstBarLine === other.omitFirstBarLine
      && this.beatLength === other.beatLength;
  }
}
