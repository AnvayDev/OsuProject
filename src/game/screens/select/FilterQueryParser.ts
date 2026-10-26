// Ported from osu.Game/Screens/Select/FilterQueryParser.cs and Filter/Operator.cs
// Ruleset-specific keywords (IRulesetFilterCriteria.TryParseCustomKeywordCriteria) aren't ported (no ruleset instances).
// .NET's Unicode-aware \w and \b are spelled out with Unicode classes. float criteria (AR, HP, CS, OD) are computed in single precision
// (Math.fround) as C# does; DateTimeOffset values are Dates, with MinValue / MaxValue as the .NET bounds.

import { BeatmapOnlineStatus } from '../../beatmaps/BeatmapOnlineStatus';
import { type FilterCriteria, type OptionalRange, type OptionalSet, OptionalTextFilter } from './FilterCriteria';

export enum Operator {
  Less,
  LessOrEqual,
  Equal,
  NotEqual,
  GreaterOrEqual,
  Greater,
}

/** (DateTimeOffset.MinValue / MaxValue) */
const date_min_value = -62135596800000;
const date_max_value = 253402300799999;

const word = String.raw`[\p{L}\p{Mn}\p{Nd}\p{Pc}]`;

const query_syntax_regex = new RegExp(
  String.raw`(?<!${word})(?<key>${word}+)(?<op>(!?(:|=)|(>|<)(:|=)?))(?<value>(".*?"[!]?)|(\S*))`,
  'giu');

export function applyQueries(criteria: FilterCriteria, query: string): void {
  try {
    for (const match of query.matchAll(query_syntax_regex)) {
      const key = match.groups!.key.toLowerCase();
      const op = parseOperator(match.groups!.op);
      const value = match.groups!.value;

      if (tryParseKeywordCriteria(criteria, key, value, op))
        query = query.replaceAll(match[0], '');
    }
  } catch (e) {
    console.warn(`Failed to parse query (${(e as Error).message})`);
  }

  criteria.searchText = query;
}

function tryParseKeywordCriteria(criteria: FilterCriteria, key: string, value: string, op: Operator): boolean {
  switch (key) {
    case 'star':
    case 'stars':
    case 'sr':
      return tryUpdateCriteriaRangeDouble(criteria.starDifficulty, op, value, 0);

    case 'ar':
      return tryUpdateCriteriaRangeFloat(criteria.approachRate, op, value);

    case 'dr':
    case 'hp':
      return tryUpdateCriteriaRangeFloat(criteria.drainRate, op, value);

    case 'cs':
      return tryUpdateCriteriaRangeFloat(criteria.circleSize, op, value);

    case 'od':
      return tryUpdateCriteriaRangeFloat(criteria.overallDifficulty, op, value);

    case 'bpm':
      return tryUpdateCriteriaRangeDouble(criteria.bpm, op, value, 0.5);

    case 'length':
      return tryUpdateLengthRange(criteria, op, value);

    case 'lastplayed':
      return tryUpdateDateAgoRange(criteria.lastPlayed, op, value);

    case 'ranked':
      return tryUpdateRankedDateRange(criteria.dateRanked, op, value);

    case 'created':
    case 'submitted':
      return tryUpdateRankedDateRange(criteria.dateSubmitted, op, value);

    case 'played': {
      let played = tryParseBool(value);
      if (played === null)
        return false;

      // Unplayed beatmaps are filtered on DateTimeOffset.MinValue.
      if (op === Operator.NotEqual)
        played = !played;

      if (played) {
        criteria.lastPlayed.min = new Date(date_min_value);
        criteria.lastPlayed.max = new Date(date_max_value);
        criteria.lastPlayed.isLowerInclusive = false;
      } else {
        criteria.lastPlayed.min = new Date(date_min_value);
        criteria.lastPlayed.max = new Date(date_min_value);
        criteria.lastPlayed.isLowerInclusive = true;
        criteria.lastPlayed.isUpperInclusive = true;
      }

      return true;
    }

    case 'divisor': {
      const parsed = tryParseInt(value);
      return parsed !== null && tryUpdateCriteriaRangeExact(criteria.beatDivisor, op, parsed);
    }

    case 'status':
      return tryUpdateCriteriaSet(criteria.onlineStatus, op, value, BeatmapOnlineStatus);

    case 'creator':
    case 'author':
    case 'mapper':
      return tryUpdateCriteriaText(criteria.creator, op, value);

    case 'artist':
      return tryUpdateCriteriaText(criteria.artist, op, value);

    case 'title':
      return tryUpdateCriteriaText(criteria.title, op, value);

    case 'diff':
      return tryUpdateCriteriaText(criteria.difficultyName, op, value);

    case 'source':
      return tryUpdateCriteriaText(criteria.source, op, value);

    case 'tag': {
      const tagFilter = new OptionalTextFilter();
      tryUpdateCriteriaText(tagFilter, op, value);
      criteria.userTags.push(tagFilter);
      return true;
    }

    default:
      return false;
  }
}

function parseOperator(value: string): Operator {
  switch (value) {
    case '=':
    case ':':
      return Operator.Equal;

    case '!=':
    case '!:':
      return Operator.NotEqual;

    case '<':
      return Operator.Less;

    case '<=':
    case '<:':
      return Operator.LessOrEqual;

    case '>':
      return Operator.Greater;

    case '>=':
    case '>:':
      return Operator.GreaterOrEqual;

    default:
      throw new Error(`Unsupported operator ${value}`);
  }
}

function getLengthScale(value: string): number {
  return value.endsWith('ms') ? 1
    : value.endsWith('s') ? 1000
    : value.endsWith('m') ? 60000
    : value.endsWith('h') ? 3600000 : 1000;
}

/** (double.TryParse with NumberStyles.AllowDecimalPoint and the invariant culture: digits with an optional decimal point, nothing else.) */
function tryParseDoubleWithPoint(value: string): number | null {
  return /^(\d+\.?\d*|\.\d+)$/.test(value) ? Number(value) : null;
}

/** (int.TryParse with NumberStyles.None) */
function tryParseInt(value: string): number | null {
  if (!/^\d+$/.test(value))
    return null;

  const result = Number(value);
  return result <= 2147483647 ? result : null;
}

function tryParseBool(value: string): boolean | null {
  switch (value) {
    case '1':
    case 'yes':
      return true;

    case '0':
    case 'no':
      return false;

    default: {
      // (bool.TryParse: "true" / "false", case-insensitive, surrounding whitespace allowed)
      const v = value.trim().toLowerCase();
      return v === 'true' ? true : v === 'false' ? false : null;
    }
  }
}

/** (Enum.GetValues / GetNames order: by the value's unsigned binary representation) */
function enumEntries(enumObject: Record<string, string | number>): [string, number][] {
  return Object.entries(enumObject)
    .filter((e): e is [string, number] => typeof e[1] === 'number')
    .sort((a, b) => (a[1] >>> 0) - (b[1] >>> 0));
}

/** (Enum.TryParse(value, ignoreCase: true), which also accepts a number) */
function enumTryParse(value: string, enumObject: Record<string, string | number>): number | null {
  const v = value.trim();

  if (/^[+-]?\d+$/.test(v))
    return Number(v);

  return enumEntries(enumObject).find(([name]) => name.toLowerCase() === v.toLowerCase())?.[1] ?? null;
}

function tryParseEnum(value: string, enumObject: Record<string, string | number>): number | null {
  // First try an exact match.
  const exact = enumTryParse(value, enumObject);
  if (exact !== null)
    return exact;

  // Then try a prefix match.
  const prefixMatch = enumEntries(enumObject).find(([name]) => name.toLowerCase().startsWith(value.toLowerCase()));

  if (prefixMatch === undefined)
    return null;

  return prefixMatch[1];
}

function tryMatchRegex(value: string, regex: RegExp): Record<string, string | undefined> | null {
  const matches = regex.exec(value);
  return matches?.groups ?? null;
}

export function tryUpdateCriteriaText(textFilter: OptionalTextFilter, op: Operator, value: string): boolean {
  switch (op) {
    case Operator.NotEqual:
      textFilter.excludeTerm = true;
      textFilter.searchTerm = value;
      return true;

    case Operator.Equal:
      textFilter.searchTerm = value;
      return true;

    default:
      return false;
  }
}

/** (TryUpdateCriteriaRange(ref OptionalRange<float>, ...), in single precision) */
function tryUpdateCriteriaRangeFloat(range: OptionalRange<number>, op: Operator, val: string, tolerance = 0.05): boolean {
  const parsed = tryParseDoubleWithPoint(val);
  if (parsed === null)
    return false;

  const value = Math.fround(parsed);
  const t = Math.fround(tolerance);

  range.invertRange = false;

  switch (op) {
    default:
      return false;

    case Operator.NotEqual:
    case Operator.Equal:
      range.invertRange = op === Operator.NotEqual;
      range.min = Math.fround(value - t);
      range.max = Math.fround(value + t);
      if (t === 0)
        range.isLowerInclusive = range.isUpperInclusive = true;
      break;

    case Operator.Greater:
      range.min = Math.fround(value + t);
      break;

    case Operator.GreaterOrEqual:
      range.min = Math.fround(value - t);
      break;

    case Operator.Less:
      range.max = Math.fround(value - t);
      break;

    case Operator.LessOrEqual:
      range.max = Math.fround(value + t);
      break;
  }

  return true;
}

/** (TryUpdateCriteriaRange(ref OptionalRange<double>, ...)) */
function tryUpdateCriteriaRangeDouble(range: OptionalRange<number>, op: Operator, val: string, tolerance = 0.05): boolean {
  const value = tryParseDoubleWithPoint(val);
  return value !== null && updateCriteriaRangeDouble(range, op, value, tolerance);
}

function updateCriteriaRangeDouble(range: OptionalRange<number>, op: Operator, value: number, tolerance = 0.05): boolean {
  range.invertRange = false;

  switch (op) {
    default:
      return false;

    case Operator.NotEqual:
    case Operator.Equal:
      range.invertRange = op === Operator.NotEqual;
      range.min = value - tolerance;
      range.max = value + tolerance;
      if (tolerance === 0)
        range.isLowerInclusive = range.isUpperInclusive = true;
      break;

    case Operator.Greater:
      range.min = value + tolerance;
      break;

    case Operator.GreaterOrEqual:
      range.min = value - tolerance;
      if (tolerance === 0)
        range.isLowerInclusive = true;
      break;

    case Operator.Less:
      range.max = value - tolerance;
      break;

    case Operator.LessOrEqual:
      range.max = value + tolerance;
      if (tolerance === 0)
        range.isUpperInclusive = true;
      break;
  }

  return true;
}

export function tryUpdateCriteriaSet<T extends number>(range: OptionalSet<T>, op: Operator, filterValue: string, enumObject: Record<string, string | number>): boolean {
  const matchingValues = new Set<T>();
  const allDefinedValues = enumEntries(enumObject).map(e => e[1] as T);

  if (filterValue.includes(',')) {
    const splitValues = filterValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const parsedValues = new Set<T>();

    for (const splitValue of splitValues) {
      const parsedValue = tryParseEnum(splitValue, enumObject);
      if (parsedValue === null)
        return false;

      parsedValues.add(parsedValue as T);
    }

    if (op === Operator.Equal) {
      for (const v of parsedValues) matchingValues.add(v);
    } else if (op === Operator.NotEqual) {
      for (const v of allDefinedValues) {
        if (!parsedValues.has(v)) matchingValues.add(v);
      }
    } else
      return false;
  } else {
    const pivotValue = tryParseEnum(filterValue, enumObject);
    if (pivotValue === null)
      return false;

    for (const val of allDefinedValues) {
      const compareResult = Math.sign(val - pivotValue);

      switch (op) {
        case Operator.Less:
          if (compareResult < 0) matchingValues.add(val);
          break;

        case Operator.LessOrEqual:
          if (compareResult <= 0) matchingValues.add(val);
          break;

        case Operator.Equal:
          if (compareResult === 0) matchingValues.add(val);
          break;

        case Operator.GreaterOrEqual:
          if (compareResult >= 0) matchingValues.add(val);
          break;

        case Operator.Greater:
          if (compareResult > 0) matchingValues.add(val);
          break;

        case Operator.NotEqual:
          if (compareResult !== 0) matchingValues.add(val);
          break;

        default:
          return false;
      }
    }
  }

  // (HashSet.IntersectWith)
  for (const v of [...range.values]) {
    if (!matchingValues.has(v)) range.values.delete(v);
  }

  return true;
}

/** (the generic tryUpdateCriteriaRange<T>, for exact values: ints and dates) */
function tryUpdateCriteriaRangeExact<T extends number | Date>(range: OptionalRange<T>, op: Operator, value: T): boolean {
  switch (op) {
    default:
      return false;

    case Operator.NotEqual:
    case Operator.Equal:
      if (op === Operator.NotEqual)
        range.invertRange = true;
      range.isLowerInclusive = range.isUpperInclusive = true;
      range.min = value;
      range.max = value;
      break;

    case Operator.Greater:
      range.isLowerInclusive = false;
      range.min = value;
      break;

    case Operator.GreaterOrEqual:
      range.isLowerInclusive = true;
      range.min = value;
      break;

    case Operator.Less:
      range.isUpperInclusive = false;
      range.max = value;
      break;

    case Operator.LessOrEqual:
      range.isUpperInclusive = true;
      range.max = value;
      break;
  }

  return true;
}

function tryUpdateLengthRange(criteria: FilterCriteria, op: Operator, val: string): boolean {
  const parts: string[] = [];

  const match = tryMatchRegex(val, /^((?<hours>\d+):)?(?<minutes>\d+):(?<seconds>\d+)$/)
    ?? tryMatchRegex(val, /^((?<hours>\d+(\.\d+)?)h)?((?<minutes>\d+(\.\d+)?)m)?((?<seconds>\d+(\.\d+)?)s)?$/)
    ?? tryMatchRegex(val, /^(?<seconds>\d+(\.\d+)?)$/);

  if (match === null)
    return false;

  if (match.seconds !== undefined)
    parts.push(match.seconds + 's');
  if (match.minutes !== undefined)
    parts.push(match.minutes + 'm');
  if (match.hours !== undefined)
    parts.push(match.hours + 'h');

  let totalLength = 0;
  let minScale = 3600000;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partNoUnit = part.replace(/[msh]+$/, '');
    const length = tryParseDoubleWithPoint(partNoUnit);
    if (length === null)
      return false;

    if (i !== parts.length - 1 && length >= 60)
      return false;
    if (i !== 0 && partNoUnit.includes('.'))
      return false;

    const scale = getLengthScale(part);
    totalLength += length * scale;
    minScale = Math.min(minScale, scale);
  }

  return updateCriteriaRangeDouble(criteria.length, op, totalLength, minScale / 2.0);
}

/** (DateTimeOffset.AddMonths: the day is clamped to the target month's length) */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

function isOutOfRange(date: Date): boolean {
  return Number.isNaN(date.getTime()) || date.getTime() < date_min_value || date.getTime() > date_max_value;
}

function tryUpdateDateAgoRange(dateRange: OptionalRange<Date>, op: Operator, val: string): boolean {
  switch (op) {
    case Operator.NotEqual:
    case Operator.Equal:
      // an equality or inequality filter is difficult to define for support here.
      // if "3 months 2 days ago" means a single concrete time instant, such a filter is basically useless.
      // if it means a range of 24 hours, then that is annoying to write and also comes with its own implications
      // (does it mean "time instant 3 months 2 days ago, within 12 hours of tolerance either direction"?
      // does it mean "the full calendar day, from midnight to midnight, 3 months 2 days ago"?)
      // as such, for simplicity, just refuse to support this.
      // same applies to inequality, but instead 24 hours would be need to be left out
      return false;

    // for the remaining operators, since the value provided to this function is an "ago" type value
    // (as in, referring to some amount of time back),
    // we'll want to flip the operator, such that `>5d` means "more than five days ago", as in "*before* five days ago",
    // as intended by the user.
    case Operator.Less:
      op = Operator.Greater;
      break;

    case Operator.LessOrEqual:
      op = Operator.GreaterOrEqual;
      break;

    case Operator.Greater:
      op = Operator.Less;
      break;

    case Operator.GreaterOrEqual:
      op = Operator.LessOrEqual;
      break;
  }

  const match = tryMatchRegex(val, /^((?<years>\d+)y)?((?<months>\d+)M)?((?<days>\d+(\.\d+)?)d)?((?<hours>\d+(\.\d+)?)h)?((?<minutes>\d+(\.\d+)?)m)?((?<seconds>\d+(\.\d+)?)s)?$/)
    ?? tryMatchRegex(val, /^(?<days>\d+(\.\d+)?)$/);

  if (match === null)
    return false;

  let dateTimeOffset: Date | null = null;
  const now = new Date();

  for (const key of ['seconds', 'minutes', 'hours', 'days', 'months', 'years']) {
    const group = match[key];
    if (group === undefined)
      continue;

    const length = tryParseDoubleWithPoint(group);
    if (length === null)
      return false;

    const base: Date = dateTimeOffset ?? now;

    switch (key) {
      case 'seconds':
        dateTimeOffset = new Date(base.getTime() - length * 1000);
        break;

      case 'minutes':
        dateTimeOffset = new Date(base.getTime() - length * 60_000);
        break;

      case 'hours':
        dateTimeOffset = new Date(base.getTime() - length * 3_600_000);
        break;

      case 'days':
        dateTimeOffset = new Date(base.getTime() - length * 86_400_000);
        break;

      case 'months':
        dateTimeOffset = addMonths(base, -Math.trunc(length));
        break;

      case 'years':
        dateTimeOffset = addMonths(base, -Math.trunc(length) * 12);
        break;
    }

    // (ArgumentOutOfRangeException)
    if (isOutOfRange(dateTimeOffset!)) {
      dateTimeOffset = new Date(date_min_value + 1);
      break;
    }
  }

  if (dateTimeOffset === null)
    return false;

  return tryUpdateCriteriaRangeExact(dateRange, op, dateTimeOffset);
}

/** (new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.Zero), null where C# throws ArgumentOutOfRangeException) */
function dateTimeOffsetFromDateOnly(year: number, month: number, day: number): Date | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
    return null;

  const d = new Date(Date.UTC(2000, month - 1, day));
  d.setUTCFullYear(year);
  return d;
}

/** (DateTimeOffset.AddYears / AddMonths / AddDays on a UTC date, null when out of range) */
function addUtc(date: Date | null, years: number, months: number, days: number): Date | null {
  if (date === null)
    return null;

  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + years * 12 + months);
  d.setUTCDate(d.getUTCDate() + days);
  return isOutOfRange(d) ? null : d;
}

function tryUpdateRankedDateRange(dateRange: OptionalRange<Date>, op: Operator, val: string): boolean {
  const match = tryMatchRegex(val, /^(?<year>\d+)([-/.](?<month>\d+)([-/.](?<day>\d+))?)?$/);

  if (match === null)
    return false;

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  for (const key of ['year', 'month', 'day']) {
    const group = match[key];
    if (group === undefined)
      continue;

    const value = tryParseDoubleWithPoint(group);
    if (value === null)
      return false;

    switch (key) {
      case 'year':
        year = Math.trunc(value);
        break;

      case 'month':
        month = Math.trunc(value);
        break;

      case 'day':
        day = Math.trunc(value);
        break;
    }
  }

  if (year === null)
    return false;

  // (each null below is C#'s ArgumentOutOfRangeException, caught to return false)
  const update = (o: Operator, date: Date | null) => date !== null && tryUpdateCriteriaRangeExact(dateRange, o, date);

  dateRange.invertRange = false;

  switch (op) {
    case Operator.Less:
      month ??= 1;
      day ??= 1;

      return update(op, dateTimeOffsetFromDateOnly(year, month, day));

    case Operator.LessOrEqual:
      if (month === null)
        return update(Operator.Less, addUtc(dateTimeOffsetFromDateOnly(year, 1, 1), 1, 0, 0));

      if (day === null)
        return update(Operator.Less, addUtc(dateTimeOffsetFromDateOnly(year, month, 1), 0, 1, 0));

      return update(Operator.Less, addUtc(dateTimeOffsetFromDateOnly(year, month, day), 0, 0, 1));

    case Operator.GreaterOrEqual:
      month ??= 1;
      day ??= 1;

      return update(op, dateTimeOffsetFromDateOnly(year, month, day));

    case Operator.Greater:
      if (month === null)
        return update(Operator.GreaterOrEqual, addUtc(dateTimeOffsetFromDateOnly(year, 1, 1), 1, 0, 0));

      if (day === null)
        return update(Operator.GreaterOrEqual, addUtc(dateTimeOffsetFromDateOnly(year, month, 1), 0, 1, 0));

      return update(Operator.GreaterOrEqual, addUtc(dateTimeOffsetFromDateOnly(year, month, day), 0, 0, 1));

    case Operator.NotEqual:
    case Operator.Equal: {
      if (op === Operator.NotEqual)
        dateRange.invertRange = true;

      let min: Date | null;
      let max: Date | null;

      if (month === null) {
        min = dateTimeOffsetFromDateOnly(year, 1, 1);
        max = addUtc(min, 1, 0, 0);
      } else if (day === null) {
        min = dateTimeOffsetFromDateOnly(year, month, 1);
        max = addUtc(min, 0, 1, 0);
      } else {
        min = dateTimeOffsetFromDateOnly(year, month, day);
        max = addUtc(min, 0, 0, 1);
      }

      if (min === null || max === null)
        return false;

      return update(Operator.GreaterOrEqual, min) && update(Operator.Less, max);
    }

    default:
      return false;
  }
}

