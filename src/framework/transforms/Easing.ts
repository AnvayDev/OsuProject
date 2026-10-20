// Ported from osu.Framework/Graphics/Easing.cs and osu.Framework/Graphics/Transforms/DefaultEasingFunction.cs

export enum Easing {
  None,
  Out,
  In,
  InQuad,
  OutQuad,
  InOutQuad,
  InCubic,
  OutCubic,
  InOutCubic,
  InQuart,
  OutQuart,
  InOutQuart,
  InQuint,
  OutQuint,
  InOutQuint,
  InSine,
  OutSine,
  InOutSine,
  InExpo,
  OutExpo,
  InOutExpo,
  InCirc,
  OutCirc,
  InOutCirc,
  InElastic,
  OutElastic,
  OutElasticHalf,
  OutElasticQuarter,
  InOutElastic,
  InBack,
  OutBack,
  InOutBack,
  InBounce,
  OutBounce,
  InOutBounce,
  OutPow10,
}

export interface IEasingFunction {
  applyEasing(time: number): number;
}

const elastic_const = (2 * Math.PI) / 0.3;
const elastic_const2 = 0.3 / 4;

const back_const = 1.70158;
const back_const2 = back_const * 1.525;

const bounce_const = 1 / 2.75;

// constants used to fix expo and elastic curves to start/end at 0/1
const expo_offset = Math.pow(2, -10);
const elastic_offset_full = Math.pow(2, -11);
const elastic_offset_half = Math.pow(2, -10) * Math.sin((0.5 - elastic_const2) * elastic_const);
const elastic_offset_quarter = Math.pow(2, -10) * Math.sin((0.25 - elastic_const2) * elastic_const);
const in_out_elastic_offset = Math.pow(2, -10) * Math.sin(((1 - elastic_const2 * 1.5) * elastic_const) / 1.5);

export function applyEasing(easing: Easing, time: number): number {
  switch (easing) {
    default:
      return time;

    case Easing.In:
    case Easing.InQuad:
      return time * time;

    case Easing.Out:
    case Easing.OutQuad:
      return time * (2 - time);

    case Easing.InOutQuad:
      if (time < 0.5) return time * time * 2;

      return --time * time * -2 + 1;

    case Easing.InCubic:
      return time * time * time;

    case Easing.OutCubic:
      return --time * time * time + 1;

    case Easing.InOutCubic:
      if (time < 0.5) return time * time * time * 4;

      return --time * time * time * 4 + 1;

    case Easing.InQuart:
      return time * time * time * time;

    case Easing.OutQuart:
      return 1 - --time * time * time * time;

    case Easing.InOutQuart:
      if (time < 0.5) return time * time * time * time * 8;

      return --time * time * time * time * -8 + 1;

    case Easing.InQuint:
      return time * time * time * time * time;

    case Easing.OutQuint:
      return --time * time * time * time * time + 1;

    case Easing.InOutQuint:
      if (time < 0.5) return time * time * time * time * time * 16;

      return --time * time * time * time * time * 16 + 1;

    case Easing.InSine:
      return 1 - Math.cos(time * Math.PI * 0.5);

    case Easing.OutSine:
      return Math.sin(time * Math.PI * 0.5);

    case Easing.InOutSine:
      return 0.5 - 0.5 * Math.cos(Math.PI * time);

    case Easing.InExpo:
      return Math.pow(2, 10 * (time - 1)) + expo_offset * (time - 1);

    case Easing.OutExpo:
      return -Math.pow(2, -10 * time) + 1 + expo_offset * time;

    case Easing.InOutExpo:
      if (time < 0.5) return 0.5 * (Math.pow(2, 20 * time - 10) + expo_offset * (2 * time - 1));

      return 1 - 0.5 * (Math.pow(2, -20 * time + 10) + expo_offset * (-2 * time + 1));

    case Easing.InCirc:
      return 1 - Math.sqrt(1 - time * time);

    case Easing.OutCirc:
      return Math.sqrt(1 - --time * time);

    case Easing.InOutCirc:
      if ((time *= 2) < 1) return 0.5 - 0.5 * Math.sqrt(1 - time * time);

      return 0.5 * Math.sqrt(1 - (time -= 2) * time) + 0.5;

    case Easing.InElastic:
      return -Math.pow(2, -10 + 10 * time) * Math.sin((1 - elastic_const2 - time) * elastic_const) + elastic_offset_full * (1 - time);

    case Easing.OutElastic:
      return Math.pow(2, -10 * time) * Math.sin((time - elastic_const2) * elastic_const) + 1 - elastic_offset_full * time;

    case Easing.OutElasticHalf:
      return Math.pow(2, -10 * time) * Math.sin((0.5 * time - elastic_const2) * elastic_const) + 1 - elastic_offset_half * time;

    case Easing.OutElasticQuarter:
      return Math.pow(2, -10 * time) * Math.sin((0.25 * time - elastic_const2) * elastic_const) + 1 - elastic_offset_quarter * time;

    case Easing.InOutElastic:
      if ((time *= 2) < 1) {
        return -0.5 * (Math.pow(2, -10 + 10 * time) * Math.sin(((1 - elastic_const2 * 1.5 - time) * elastic_const) / 1.5)
          - in_out_elastic_offset * (1 - time));
      }

      return 0.5 * (Math.pow(2, -10 * --time) * Math.sin(((time - elastic_const2 * 1.5) * elastic_const) / 1.5)
        - in_out_elastic_offset * time) + 1;

    case Easing.InBack:
      return time * time * ((back_const + 1) * time - back_const);

    case Easing.OutBack:
      return --time * time * ((back_const + 1) * time + back_const) + 1;

    case Easing.InOutBack:
      if ((time *= 2) < 1) return 0.5 * time * time * ((back_const2 + 1) * time - back_const2);

      return 0.5 * ((time -= 2) * time * ((back_const2 + 1) * time + back_const2) + 2);

    case Easing.InBounce:
      time = 1 - time;
      if (time < bounce_const)
        return 1 - 7.5625 * time * time;
      if (time < 2 * bounce_const)
        return 1 - (7.5625 * (time -= 1.5 * bounce_const) * time + 0.75);
      if (time < 2.5 * bounce_const)
        return 1 - (7.5625 * (time -= 2.25 * bounce_const) * time + 0.9375);

      return 1 - (7.5625 * (time -= 2.625 * bounce_const) * time + 0.984375);

    case Easing.OutBounce:
      if (time < bounce_const)
        return 7.5625 * time * time;
      if (time < 2 * bounce_const)
        return 7.5625 * (time -= 1.5 * bounce_const) * time + 0.75;
      if (time < 2.5 * bounce_const)
        return 7.5625 * (time -= 2.25 * bounce_const) * time + 0.9375;

      return 7.5625 * (time -= 2.625 * bounce_const) * time + 0.984375;

    case Easing.InOutBounce:
      if (time < 0.5) return 0.5 - 0.5 * applyEasing(Easing.OutBounce, 1 - time * 2);

      return applyEasing(Easing.OutBounce, (time - 0.5) * 2) * 0.5 + 0.5;

    case Easing.OutPow10:
      return --time * Math.pow(time, 10) + 1;
  }
}

export class DefaultEasingFunction implements IEasingFunction {
  constructor(private readonly easing: Easing) {}

  applyEasing(time: number): number {
    return applyEasing(this.easing, time);
  }
}
