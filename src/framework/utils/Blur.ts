// Ported from osu.Framework/Utils/Blur.cs

/** Evaluates a 1-D gaussian distribution with 0 mean and sigma standard deviation at position x. */
export function evalGaussian(x: number, sigma: number): number {
  const inv_sqrt_2_pi = 0.39894;
  return inv_sqrt_2_pi * Math.exp(-0.5 * x * x / (sigma * sigma)) / sigma;
}

/**
 * Finds the gaussian blur kernel size where the magnitude of the gaussian distribution within the kernel
 * is greater than or equal to cutoffThreshold times the maximum of the distribution.
 */
export function kernelSize(sigma: number, cutoffThreshold = Math.fround(0.1)): number {
  if (sigma === 0)
    return 0;

  const max_radius = 200;

  const center = evalGaussian(0, sigma);
  const threshold = cutoffThreshold * center;

  for (let i = 0; i < max_radius; ++i) {
    if (evalGaussian(i, sigma) < threshold)
      return Math.max(i - 1, 0);
  }

  return max_radius;
}

/**
 * DOM: the standard deviation (in texels) of the discrete kernel sh_Blur.fs actually applies for a given radius and sigma.
 * The shader takes the centre texel plus linearly-filtered taps at ±(i - 0.5) for i = 2, 4, … (each tap averages texels i - 1 and i),
 * weighted by 2·gauss(i - 0.5) and normalised; it always takes at least one pair of taps and stops once i ≥ radius.
 * CSS blur() is a true gaussian, so it is given this second-moment-equivalent sigma.
 */
export function effectiveKernelSigma(radius: number, sigma: number): number {
  let total = evalGaussian(0, sigma);
  let moment = 0;

  for (let i = 2; i <= 200; i += 2) {
    const factor = evalGaussian(i - 0.5, sigma) * 2;
    total += 2 * factor;
    // each side: half of the tap on texel i - 1, half on texel i
    moment += factor * ((i - 1) * (i - 1) + i * i);

    if (i >= radius)
      break;
  }

  return Math.sqrt(moment / total);
}
