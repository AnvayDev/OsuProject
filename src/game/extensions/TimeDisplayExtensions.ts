// Ported from osu.Game/Extensions/TimeDisplayExtensions.cs (ToFormattedDuration).

const pad2 = (n: number) => `${n}`.padStart(2, '0');

/** Get a formatted duration (dd:hh:mm:ss with days/hours omitted if zero). (TimeSpan.FromMilliseconds, then its custom format strings.) */
export function toFormattedDuration(milliseconds: number): string {
  const totalSeconds = Math.trunc(milliseconds / 1000);
  const days = Math.trunc(totalSeconds / 86400);
  const hours = Math.trunc(totalSeconds / 3600) % 24;
  const minutes = Math.trunc(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;

  if (milliseconds >= 86400000)
    return `${pad2(days)}:${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

  if (milliseconds >= 3600000)
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

  return `${pad2(minutes)}:${pad2(seconds)}`;
}
