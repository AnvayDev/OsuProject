// The effect parameters AudioMixer.addEffect accepts (ManagedBass's IEffectParameter), mapped onto Web Audio nodes.
// BQFParameters is BASS_BFX_BQF: BASS's biquad filters are the RBJ cookbook filters, as Web Audio's BiquadFilterNode, whose Q for
// low/high-pass is in dB where BASS takes the linear Q.

export enum BQFType {
  LowPass,
  HighPass,
  BandPass,
  BandPassQ,
  Notch,
  AllPass,
  PeakingEQ,
  LowShelf,
  HighShelf,
}

export class BQFParameters {
  lFilter = BQFType.LowPass;
  fCenter = 200;
  fGain = 0;
  fBandwidth = 1;
  fQ = 0;
  fS = 0;
}

export type IEffectParameter = BQFParameters;

const biquadType = (type: BQFType): BiquadFilterType => {
  switch (type) {
    case BQFType.LowPass: return 'lowpass';
    case BQFType.HighPass: return 'highpass';
    case BQFType.BandPass:
    case BQFType.BandPassQ: return 'bandpass';
    case BQFType.Notch: return 'notch';
    case BQFType.AllPass: return 'allpass';
    case BQFType.PeakingEQ: return 'peaking';
    case BQFType.LowShelf: return 'lowshelf';
    case BQFType.HighShelf: return 'highshelf';
  }
};

export function createEffectNode(context: BaseAudioContext, effect: IEffectParameter): AudioNode {
  const node = context.createBiquadFilter();
  updateEffectNode(node, effect);
  return node;
}

export function updateEffectNode(node: AudioNode, effect: IEffectParameter): void {
  const filter = node as BiquadFilterNode;

  filter.type = biquadType(effect.lFilter);
  filter.frequency.value = effect.fCenter;
  filter.gain.value = effect.fGain;

  if (effect.lFilter === BQFType.LowPass || effect.lFilter === BQFType.HighPass)
    filter.Q.value = effect.fQ > 0 ? 20 * Math.log10(effect.fQ) : 0;
  else
    filter.Q.value = effect.fQ;
}
