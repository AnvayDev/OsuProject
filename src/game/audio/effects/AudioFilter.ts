// Ported from osu.Game/Audio/Effects/AudioFilter.cs (+ ITransformableFilter.cs: cutoffTo)

import { BQFParameters, BQFType } from '@fw/audio/mixing/Effects';
import type { AudioMixer } from '@fw/audio/mixing/AudioMixer';
import { Component } from '@fw/graphics/Component';
import { mathRound } from '@fw/utils/DotNet';
import type { TransformSequence } from '@fw/transforms/TransformSequence';
import { Easing } from '@fw/transforms/Easing';

export class AudioFilter extends Component {
  /** The maximum cutoff frequency that can be used with a low-pass filter. This is equal to nyquist - 1hz. */
  static readonly MAX_LOWPASS_CUTOFF = 22049; // nyquist - 1hz

  private _isAttached = false;

  /** Whether this filter is currently attached to the audio track and thus applying an adjustment. */
  get isAttached(): boolean {
    return this._isAttached;
  }

  private readonly mixer: AudioMixer;
  private readonly filter: BQFParameters;
  private readonly type: BQFType;

  private _cutoff: number;

  /** The cutoff frequency of this filter. */
  get cutoff(): number {
    return this._cutoff;
  }

  set cutoff(value: number) {
    // (an int: Interpolation.ValueAt rounds the transformed value)
    value = mathRound(value);

    if (value === this._cutoff)
      return;

    this._cutoff = value;
    this.updateFilter();
  }

  /**
   * A Component that implements a BASS FX BiQuad Filter Effect.
   * @param mixer The mixer this effect should be applied to.
   * @param type The type of filter (e.g. LowPass, HighPass, etc)
   */
  constructor(mixer: AudioMixer, type = BQFType.LowPass) {
    super();

    this.mixer = mixer;
    this.type = type;

    this.filter = Object.assign(new BQFParameters(), {
      lFilter: type,
      fBandwidth: 0,
      // This allows fCenter to go up to 22049hz (nyquist - 1hz) without overflowing and causing weird filter behaviour (see: https://www.un4seen.com/forum/?topic=19542.0)
      fQ: Math.fround(0.7),
    });

    this._cutoff = AudioFilter.getInitialCutoff(type);

    this.updateFilter();
  }

  private static getInitialCutoff(type: BQFType): number {
    switch (type) {
      case BQFType.HighPass:
        return 1;

      case BQFType.LowPass:
        return AudioFilter.MAX_LOWPASS_CUTOFF;

      default:
        return 500; // A default that should ensure audio remains audible for other filters.
    }
  }

  private updateFilter(): void {
    switch (this.type) {
      case BQFType.LowPass:
        // Workaround for weird behaviour when rapidly setting fCenter of a low-pass filter to nyquist - 1hz.
        if (this.cutoff >= AudioFilter.MAX_LOWPASS_CUTOFF) {
          this.ensureDetached();
          return;
        }

        break;

      // Workaround for weird behaviour when rapidly setting fCenter of a high-pass filter to 1hz.
      case BQFType.HighPass:
        if (this.cutoff <= 1) {
          this.ensureDetached();
          return;
        }

        break;
    }

    this.ensureAttached();

    this.filter.fCenter = this.cutoff;
    this.mixer.updateEffect(this.filter);
  }

  private ensureAttached(): void {
    if (this._isAttached)
      return;

    this.mixer.addEffect(this.filter);
    this._isAttached = true;
  }

  private ensureDetached(): void {
    if (!this._isAttached)
      return;

    this.mixer.removeEffect(this.filter);
    this._isAttached = false;
  }

  /** Smoothly adjusts filter cutoff over time. */
  cutoffTo(newCutoff: number, duration = 0, easing = Easing.None): TransformSequence<this> {
    return this.transformTo('cutoff', newCutoff, duration, easing);
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.ensureDetached();
  }
}
