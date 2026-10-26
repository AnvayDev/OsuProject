// Ported from osu.Game/Utils/FormatUtils.cs (the members used so far).

import { mathRound } from '@fw/utils/DotNet';

export function floorToDecimalDigits(value: number, digits: number): number {
  const base10 = Math.pow(10, digits);
  return Math.floor(value * base10) / base10;
}

/** Applies rounding to the given BPM value. */
export function roundBPM(baseBpm: number, rate = 1): number {
  return Math.trunc(mathRound(baseBpm * rate));
}

/** Formats the supplied star rating in a consistent, simplified way. */
export function formatStarRating(starRating: number): string {
  // for the sake of display purposes, we don't want to show a user a "rounded up" star rating to the next whole number.
  // i.e. a beatmap which has a star rating of 6.9999* should never show as 7.00*.
  // this matters for star rating medals which use hard cutoffs at whole numbers,
  // which then confuses users when they beat a 6.9999* beatmap but don't get the 7-star medal.
  return floorToDecimalDigits(starRating, 2).toFixed(2);
}
