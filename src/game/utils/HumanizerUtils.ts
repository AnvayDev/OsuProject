// Ported from osu.Game/Utils/HumanizerUtils.cs (Humanize(DateTimeOffset)), with Humanizer's DateTimeHumanizeAlgorithms.DefaultHumanize and its
// English (DefaultFormatter) resources inlined, since Humanizer is a .NET library.

const ms_per_second = 1000;
const ms_per_minute = 60 * ms_per_second;
const ms_per_hour = 60 * ms_per_minute;
const ms_per_day = 24 * ms_per_hour;

type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

const single_past: Record<TimeUnit, string> = {
  second: 'one second ago', minute: 'a minute ago', hour: 'an hour ago', day: 'yesterday', month: 'one month ago', year: 'one year ago',
};

const single_future: Record<TimeUnit, string> = {
  second: 'one second from now', minute: 'a minute from now', hour: 'an hour from now', day: 'tomorrow', month: 'one month from now',
  year: 'one year from now',
};

/** (DefaultFormatter.DateHumanize) */
function dateHumanize(unit: TimeUnit, future: boolean, count: number): string {
  if (count === 0)
    return 'now';

  if (count === 1)
    return (future ? single_future : single_past)[unit];

  return `${count} ${unit}s ${future ? 'from now' : 'ago'}`;
}

/** (DateTime.Date in UTC, as days since the epoch) */
const utcDays = (d: Date) => Math.floor(d.getTime() / ms_per_day);

/** (comparisonBase.Date.AddMonths(months) == input.Date, in UTC) */
function isMonthsApart(comparisonBase: Date, input: Date, months: number): boolean {
  const shifted = new Date(Date.UTC(comparisonBase.getUTCFullYear(), comparisonBase.getUTCMonth() + months, 1));
  const daysInMonth = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(comparisonBase.getUTCDate(), daysInMonth));

  return utcDays(shifted) === utcDays(input);
}

/** Turns the provided date into a human readable sentence, relative to now. */
export function humanize(input: Date, comparisonBase: Date = new Date()): string {
  const future = input > comparisonBase;
  const ts = Math.abs(comparisonBase.getTime() - input.getTime());

  const totalSeconds = ts / ms_per_second;
  const totalMinutes = ts / ms_per_minute;
  const totalHours = ts / ms_per_hour;
  const totalDays = ts / ms_per_day;

  if (ts < 500)
    return dateHumanize('second', future, 0);

  if (totalSeconds < 60)
    return dateHumanize('second', future, Math.floor(totalSeconds) % 60);

  if (totalSeconds < 120)
    return dateHumanize('minute', future, 1);

  if (totalMinutes < 60)
    return dateHumanize('minute', future, Math.floor(totalMinutes) % 60);

  if (totalMinutes < 90)
    return dateHumanize('hour', future, 1);

  if (totalHours < 24)
    return dateHumanize('hour', future, Math.floor(totalHours) % 24);

  if (totalHours < 48)
    return dateHumanize('day', future, Math.abs(utcDays(input) - utcDays(comparisonBase)));

  if (totalDays < 28)
    return dateHumanize('day', future, Math.floor(totalDays));

  if (totalDays >= 28 && totalDays < 30) {
    if (isMonthsApart(comparisonBase, input, future ? 1 : -1))
      return dateHumanize('month', future, 1);

    return dateHumanize('day', future, Math.floor(totalDays));
  }

  if (totalDays < 345)
    return dateHumanize('month', future, Math.floor(totalDays / 29.5));

  let years = Math.floor(totalDays / 365);
  if (years === 0)
    years = 1;

  return dateHumanize('year', future, years);
}
