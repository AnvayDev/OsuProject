// Ported from osu.Game/Beatmaps/Formats/LegacyDecoder.cs

import { Colour4 } from '@fw/graphics/Colour4';
import { Logger } from '@fw/logging/Logger';
import { isNullOrWhiteSpace, parseIntInvariant, trim, trimEnd, trimStart, tryParseInt } from '@fw/utils/DotNet';
import type { HitSampleInfo } from '../../audio/HitSampleInfo';
import type { LineBufferedReader } from '../../io/LineBufferedReader';
import { LegacyHitSampleInfo } from '../../rulesets/objects/legacy/ConvertHitObjectParser';
import type { ControlPoint } from '../controlPoints/ControlPoint';
import { SampleControlPoint } from '../controlPoints/SampleControlPoint';
import { tryParseEnum } from '../legacy/LegacyEnums';
import { DecoderOf } from './Decoder';
import { hasComboColours } from './IHasComboColours';
import { hasCustomColours } from './IHasCustomColours';

export enum Section {
  General,
  Editor,
  Metadata,
  Difficulty,
  Events,
  TimingPoints,
  Colours,
  HitObjects,
  Variables,
  Fonts,
  CatchTheBeat,
  Mania,
}

export abstract class LegacyDecoder<T extends object> extends DecoderOf<T> {
  // If this is updated, a new release of `osu-server-beatmap-submission` is required with updated packages.
  static readonly LATEST_VERSION = 14;

  static readonly MAX_COMBO_COLOUR_COUNT = 8;

  /**
   * The .osu format (beatmap) version.
   * osu!stable's versions end at LATEST_VERSION. osu!lazer's versions starts at LegacyBeatmapEncoder.FIRST_LAZER_VERSION.
   */
  protected readonly formatVersion: number;

  protected constructor(version: number) {
    super();
    this.formatVersion = version;
  }

  protected override parseStreamInto(stream: LineBufferedReader, isPrimaryStream: boolean, output: T): void {
    let section = Section.General;

    let line: string | null;
    let lineNumber = 0;

    while ((line = stream.readLine()) !== null) {
      lineNumber++;

      if (this.shouldSkipLine(line))
        continue;

      if (section !== Section.Metadata) {
        // comments should not be stripped from metadata lines, as the song metadata may contain "//" as valid data.
        line = this.stripComments(line);
      }

      line = trimEnd(line);

      if (line.startsWith('[') && line.endsWith(']')) {
        // Enum.TryParse leaves `section` as default(Section) when it fails.
        const parsed = tryParseEnum(Section, line.slice(1, -1));
        section = parsed ?? Section.General;

        if (parsed === undefined)
          Logger.log(`Unknown section "${line}" in "${output}"`);

        this.onBeginNewSection(section);
        continue;
      }

      try {
        this.parseLine(output, section, line, isPrimaryStream);
      } catch (e) {
        const line_length_limit = 50;
        Logger.log(`Failed to process line ${lineNumber} "${line.length <= line_length_limit ? line : `${line.slice(0, line_length_limit)}…`}" into "${output}": ${(e as Error).message}`);
      }
    }
  }

  protected shouldSkipLine(line: string): boolean {
    return isNullOrWhiteSpace(line) || trimStart(line).startsWith('//');
  }

  /** Invoked when a new Section has been entered. */
  protected onBeginNewSection(_section: Section): void {
  }

  protected parseLine(output: T, section: Section, line: string, _isPrimaryStream: boolean): void {
    switch (section) {
      case Section.Colours:
        this.handleColours(output, line, false);
        return;
    }
  }

  protected stripComments(line: string): string {
    const index = line.indexOf('//');
    if (index > 0)
      return line.substring(0, index);

    return line;
  }

  private convertSettingStringToColor4(split: string[], allowAlpha: boolean, pair: [string, string]): Colour4 {
    if (split.length !== 3 && split.length !== 4)
      throw new Error(`Color specified in incorrect format (should be R,G,B or R,G,B,A): ${pair[1]}`);

    let colour: Colour4;

    try {
      const alpha = allowAlpha && split.length === 4 ? parseByte(split[3]) : 255;
      colour = Colour4.fromBytes(parseByte(split[0]), parseByte(split[1]), parseByte(split[2]), alpha);
    } catch {
      throw new Error('Color must be specified with 8-bit integer components');
    }

    return colour;
  }

  protected handleColours(output: object, line: string, allowAlpha: boolean): void {
    const pair = this.splitKeyVal(line);

    const split = pair[1].split(',');
    const colour = this.convertSettingStringToColor4(split, allowAlpha, pair);

    const comboIndex = tryParseInt(pair[0].slice(5));
    const isCombo = pair[0].startsWith('Combo')
      && comboIndex >= 1 && comboIndex <= LegacyDecoder.MAX_COMBO_COLOUR_COUNT;

    if (isCombo) {
      if (!hasComboColours(output)) return;

      output.customComboColours.push(colour);
    } else {
      if (!hasCustomColours(output)) return;

      output.customColours.set(pair[0], colour);
    }
  }

  /** C#'s KeyValuePair<string, string> becomes [key, value]. */
  protected splitKeyVal(line: string, separator = ':', shouldTrim = true): [string, string] {
    const index = line.indexOf(separator);
    const split = index < 0 ? [line] : [line.slice(0, index), line.slice(index + 1)];
    const t = (s: string) => shouldTrim ? trim(s) : s;

    return [t(split[0]), split.length > 1 ? t(split[1]) : ''];
  }

  protected cleanFilename(path: string): string {
    // User error which is supported by stable (https://github.com/ppy/osu/issues/21204)
    return trimChar(path.replaceAll('\\\\', '\\'), '"')
      // ToStandardisedPath
      .replaceAll('\\', '/');
  }
}

/** byte.Parse(s, CultureInfo.InvariantCulture). */
function parseByte(s: string): number {
  const value = parseIntInvariant(s);
  if (value < 0 || value > 255)
    throw new RangeError('Value was either too large or too small for an unsigned byte.');
  return value;
}

/** string.Trim(char). */
function trimChar(s: string, c: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === c) start++;
  while (end > start && s[end - 1] === c) end--;
  return s.slice(start, end);
}

/** LegacyDecoder<T>.LegacySampleControlPoint */
export class LegacySampleControlPoint extends SampleControlPoint {
  customSampleBank = 0;

  override applyTo(hitSampleInfo: HitSampleInfo): HitSampleInfo {
    if (hitSampleInfo instanceof LegacyHitSampleInfo) {
      const legacy = hitSampleInfo;

      return legacy.withLegacy({
        customSampleBank: legacy.customSampleBank > 0 ? legacy.customSampleBank : this.customSampleBank,
        volume: hitSampleInfo.volume > 0 ? hitSampleInfo.volume : this.sampleVolume,
        bank: legacy.bankSpecified ? legacy.bank : this.sampleBank,
      });
    }

    return super.applyTo(hitSampleInfo);
  }

  override isRedundant(existing: ControlPoint | null): boolean {
    return super.isRedundant(existing)
      && existing instanceof LegacySampleControlPoint
      && this.customSampleBank === existing.customSampleBank;
  }

  override copyFrom(other: ControlPoint): void {
    super.copyFrom(other);

    this.customSampleBank = (other as LegacySampleControlPoint).customSampleBank;
  }

  override equals(other: ControlPoint | null): boolean {
    return other instanceof LegacySampleControlPoint
      && super.equals(other)
      && this.customSampleBank === other.customSampleBank;
  }
}
