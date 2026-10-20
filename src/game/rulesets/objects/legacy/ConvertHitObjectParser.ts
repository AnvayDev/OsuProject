// Ported from osu.Game/Rulesets/Objects/Legacy/ConvertHitObjectParser.cs (and HitObjectParser.cs).

import { Precision } from '@fw/layout/Primitives';
import { Vector2F } from '@fw/layout/Vector2F';
import { parseIntInvariant, tryParseInt } from '@fw/utils/DotNet';
import { HitSampleInfo, type HitSampleInfoChanges } from '../../../audio/HitSampleInfo';
import { SampleControlPoint } from '../../../beatmaps/controlPoints/SampleControlPoint';
import { LegacyBeatmapEncoder } from '../../../beatmaps/formats/LegacyBeatmapEncoder';
import { Parsing } from '../../../beatmaps/formats/Parsing';
import { LegacyHitObjectType, LegacyHitSoundType, LegacySampleBank } from '../../../beatmaps/legacy/LegacyEnums';
import type { HitObject } from '../HitObject';
import { PathControlPoint } from '../PathControlPoint';
import { SliderPath } from '../SliderPath';
import { PathType } from '../types/PathType';
import { ConvertHitCircle, type ConvertHitObject, ConvertHold, ConvertSlider, ConvertSpinner } from './ConvertHitObjects';

const FIRST_LAZER_VERSION = LegacyBeatmapEncoder.FIRST_LAZER_VERSION;

const f = Math.fround;

/** C# (int)float: truncation toward zero. */
const toInt = (v: number) => Math.trunc(v);

/** A HitObjectParser to parse legacy Beatmaps. */
export class ConvertHitObjectParser {
  private firstObject = true;
  private lastObject: ConvertHitObject | null = null;

  /** @internal */
  constructor(private readonly offset: number, private readonly formatVersion: number) {}

  parse(text: string): HitObject {
    const split = text.split(',');

    const pos = this.formatVersion >= FIRST_LAZER_VERSION
      ? new Vector2F(Parsing.parseFloat(split[0], Parsing.MAX_COORDINATE_VALUE), Parsing.parseFloat(split[1], Parsing.MAX_COORDINATE_VALUE))
      : new Vector2F(toInt(Parsing.parseFloat(split[0], Parsing.MAX_COORDINATE_VALUE)), toInt(Parsing.parseFloat(split[1], Parsing.MAX_COORDINATE_VALUE)));

    const startTime = Parsing.parseDouble(split[2]) + this.offset;

    let type = Parsing.parseInt(split[3]) as LegacyHitObjectType;

    const comboOffset = (type & LegacyHitObjectType.ComboOffset) >> 4;
    type &= ~LegacyHitObjectType.ComboOffset;

    const combo = (type & LegacyHitObjectType.NewCombo) !== 0;
    type &= ~LegacyHitObjectType.NewCombo;

    const soundType = Parsing.parseInt(split[4]) as LegacyHitSoundType;
    const bankInfo = new SampleBankInfo();

    let result: ConvertHitObject | null = null;

    if ((type & LegacyHitObjectType.Circle) !== 0) {
      result = this.createHitCircle(pos, combo, comboOffset);

      if (split.length > 5)
        this.readCustomSampleBanks(split[5], bankInfo);
    } else if ((type & LegacyHitObjectType.Slider) !== 0) {
      let length: number | null = null;

      let repeatCount = Parsing.parseInt(split[6]);

      if (repeatCount > 9000)
        throw new Error('Repeat count is way too high');

      // osu-stable treated the first span of the slider as a repeat, but no repeats are happening
      repeatCount = Math.max(0, repeatCount - 1);

      if (split.length > 7) {
        length = Math.max(0, Parsing.parseDouble(split[7], Parsing.MAX_COORDINATE_VALUE));
        if (length === 0)
          length = null;
      }

      if (split.length > 10)
        this.readCustomSampleBanks(split[10], bankInfo, true);

      // One node for each repeat + the start and end nodes
      const nodes = repeatCount + 2;

      // Populate node sample bank infos with the default hit object sample bank
      const nodeBankInfos: SampleBankInfo[] = [];
      for (let i = 0; i < nodes; i++)
        nodeBankInfos.push(bankInfo.clone());

      // Read any per-node sample banks
      if (split.length > 9 && split[9].length > 0) {
        const sets = split[9].split('|');

        for (let i = 0; i < nodes; i++) {
          if (i >= sets.length)
            break;

          const info = nodeBankInfos[i];
          this.readCustomSampleBanks(sets[i], info);
        }
      }

      // Populate node sound types with the default hit object sound type
      const nodeSoundTypes: LegacyHitSoundType[] = [];
      for (let i = 0; i < nodes; i++)
        nodeSoundTypes.push(soundType);

      // Read any per-node sound types
      if (split.length > 8 && split[8].length > 0) {
        const adds = split[8].split('|');

        for (let i = 0; i < nodes; i++) {
          if (i >= adds.length)
            break;

          nodeSoundTypes[i] = tryParseInt(adds[i]) as LegacyHitSoundType;
        }
      }

      // Generate the final per-node samples
      const nodeSamples: HitSampleInfo[][] = [];
      for (let i = 0; i < nodes; i++)
        nodeSamples.push(this.convertSoundType(nodeSoundTypes[i], nodeBankInfos[i]));

      result = this.createSlider(pos, combo, comboOffset, this.convertPathString(split[5], pos), length, repeatCount, nodeSamples);
    } else if ((type & LegacyHitObjectType.Spinner) !== 0) {
      const duration = Math.max(0, Parsing.parseDouble(split[5]) + this.offset - startTime);

      result = this.createSpinner(new Vector2F(512, 384).div(2), combo, duration);

      if (split.length > 6)
        this.readCustomSampleBanks(split[6], bankInfo);
    } else if ((type & LegacyHitObjectType.Hold) !== 0) {
      // Note: Hold is generated by BMS converts

      let endTime = Math.max(startTime, Parsing.parseDouble(split[2]));

      if (split.length > 5 && split[5]) {
        const ss = split[5].split(':');
        endTime = Math.max(startTime, Parsing.parseDouble(ss[0]));
        this.readCustomSampleBanks(ss.slice(1).join(':'), bankInfo);
      }

      result = this.createHold(pos, endTime + this.offset - startTime);
    }

    if (result === null)
      throw new Error(`Unknown hit object type: ${split[3]}`);

    result.startTime = startTime;
    result.legacyType = type;

    if (result.samples.length === 0)
      result.samples = this.convertSoundType(soundType, bankInfo);

    this.firstObject = false;

    return result;
  }

  private readCustomSampleBanks(str: string, bankInfo: SampleBankInfo, banksOnly = false): void {
    if (!str)
      return;

    const split = str.split(':');

    let bank = Parsing.parseInt(split[0]) as LegacySampleBank;
    if (LegacySampleBank[bank] === undefined)
      bank = LegacySampleBank.Normal;

    let addBank = Parsing.parseInt(split[1]) as LegacySampleBank;
    if (LegacySampleBank[addBank] === undefined)
      addBank = LegacySampleBank.Normal;

    let stringBank: string | null = LegacySampleBank[bank].toLowerCase();
    let stringAddBank: string | null = LegacySampleBank[addBank].toLowerCase();

    if (stringBank === 'none')
      stringBank = null;

    if (stringAddBank === 'none') {
      bankInfo.editorAutoBank = true;
      stringAddBank = null;
    } else
      bankInfo.editorAutoBank = false;

    bankInfo.bankForNormal = stringBank;
    bankInfo.bankForAdditions = !stringAddBank ? stringBank : stringAddBank;

    if (banksOnly) return;

    if (split.length > 2)
      bankInfo.customSampleBank = Parsing.parseInt(split[2]);

    if (split.length > 3)
      bankInfo.volume = Math.max(0, Parsing.parseInt(split[3]));

    bankInfo.filename = split.length > 4 ? split[4] : null;
  }

  private convertPathType(input: string): PathType {
    switch (input[0]) {
      default:
      case 'C':
        return PathType.CATMULL;

      case 'B': {
        if (input.length > 1) {
          const degree = Number(input.slice(1));
          if (/^[+-]?\d+$/.test(input.slice(1).trim()) && degree > 0 && degree <= 2147483647)
            return PathType.bSpline(degree);
        }

        return PathType.BEZIER;
      }

      case 'L':
        return PathType.LINEAR;

      case 'P':
        return PathType.PERFECT_CURVE;
    }
  }

  /** Converts a given point string into a set of path control points. A point string takes the form: X|1:1|2:2|2:2|3:3|Y|1:1|2:2. This has three segments: X: { (1,1), (2,2) } (implicit segment), X: { (2,2), (3,3) } (implicit segment), Y: { (3,3), (1,1), (2, 2) } (explicit segment). */
  private convertPathString(pointString: string, offset: Vector2F): PathControlPoint[] {
    // This code takes on the responsibility of handling explicit segments of the path ("X" & "Y" from above). Implicit segments are handled by calls to convertPoints().
    const pointStringSplit = pointString.split('|');

    const pointsBuffer: Vector2F[] = [];
    const segmentsBuffer: { type: PathType; startIndex: number }[] = [];

    for (const s of pointStringSplit) {
      if (isLetter(s[0])) {
        // The start of a new segment(indicated by having an alpha character at position 0).
        const pathType = this.convertPathType(s);
        segmentsBuffer.push({ type: pathType, startIndex: pointsBuffer.length });

        // First segment is prepended by an extra zero point
        if (pointsBuffer.length === 0)
          pointsBuffer.push(Vector2F.Zero);
      } else
        pointsBuffer.push(this.readPoint(s, offset));
    }

    const controlPoints: PathControlPoint[][] = [];

    for (let i = 0; i < segmentsBuffer.length; i++) {
      if (i < segmentsBuffer.length - 1) {
        const startIndex = segmentsBuffer[i].startIndex;
        const endIndex = segmentsBuffer[i + 1].startIndex;
        controlPoints.push(...this.convertPoints(segmentsBuffer[i].type, pointsBuffer.slice(startIndex, endIndex), pointsBuffer[endIndex]));
      } else {
        const startIndex = segmentsBuffer[i].startIndex;
        controlPoints.push(...this.convertPoints(segmentsBuffer[i].type, pointsBuffer.slice(startIndex), null));
      }
    }

    return controlPoints.flat();
  }

  private readPoint(value: string, startPos: Vector2F): Vector2F {
    const vertexSplit = value.split(':');

    const pos = this.formatVersion >= FIRST_LAZER_VERSION
      ? new Vector2F(Parsing.parseFloat(vertexSplit[0], Parsing.MAX_COORDINATE_VALUE), Parsing.parseFloat(vertexSplit[1], Parsing.MAX_COORDINATE_VALUE))
      : new Vector2F(toInt(Parsing.parseFloat(vertexSplit[0], Parsing.MAX_COORDINATE_VALUE)), toInt(Parsing.parseFloat(vertexSplit[1], Parsing.MAX_COORDINATE_VALUE)));

    return pos.sub(startPos);
  }

  /**
   * Converts a given point list into a set of path segments.
   * points: the point list. endPoint: any extra endpoint to consider as part of the points. This will NOT be returned.
   * Returns the set of points contained by points as one or more PathControlPoint segments.
   */
  private *convertPoints(type: PathType, points: readonly Vector2F[], endPoint: Vector2F | null): Iterable<PathControlPoint[]> {
    const vertices = points.map(p => new PathControlPoint(p));

    // Edge-case rules (to match stable).
    if (type.equals(PathType.PERFECT_CURVE)) {
      const endPointLength = endPoint === null ? 0 : 1;

      if (this.formatVersion < FIRST_LAZER_VERSION) {
        if (vertices.length + endPointLength !== 3)
          type = PathType.BEZIER;
        else if (isLinear(points[0], points[1], endPoint ?? points[2])) {
          // osu-stable special-cased colinear perfect curves to a linear path
          type = PathType.LINEAR;
        }
      } else if (vertices.length + endPointLength > 3)
        // Lazer supports perfect curves with less than 3 points and colinear points
        type = PathType.BEZIER;
    }

    // The first control point must have a definite type.
    vertices[0].type = type;

    // A path can have multiple implicit segments of the same type if there are two sequential control points with the same position.
    // To handle such cases, this code may return multiple path segments with the final control point in each segment having a non-null type.
    // For the point string X|1:1|2:2|2:2|3:3, this code returns the segments:
    // X: { (1,1), (2, 2) }
    // X: { (3, 3) }
    // Note: (2, 2) is not returned in the second segments, as it is implicit in the path.
    let startIndex = 0;
    let endIndex = 0;

    while (++endIndex < vertices.length) {
      // Keep incrementing while an implicit segment doesn't need to be started.
      if (!vertices[endIndex].position.equals(vertices[endIndex - 1].position))
        continue;

      // Legacy CATMULL sliders don't support multiple segments, so adjacent CATMULL segments should be treated as a single one.
      // Importantly, this is not applied to the first control point, which may duplicate the slider path's position
      // resulting in a duplicate (0,0) control point in the resultant list.
      if (type.equals(PathType.CATMULL) && endIndex > 1 && this.formatVersion < FIRST_LAZER_VERSION)
        continue;

      // The last control point of each segment is not allowed to start a new implicit segment.
      if (endIndex === vertices.length - 1)
        continue;

      // Force a type on the last point, and return the current control point set as a segment.
      vertices[endIndex - 1].type = type;
      yield vertices.slice(startIndex, endIndex);

      // Skip the current control point - as it's the same as the one that's just been returned.
      startIndex = endIndex + 1;
    }

    if (startIndex < endIndex)
      yield vertices.slice(startIndex, endIndex);
  }

  private createHitCircle(position: Vector2F, newCombo: boolean, comboOffset: number): ConvertHitObject {
    const h = new ConvertHitCircle();
    h.position = position;
    h.newCombo = this.firstObject || this.lastObject instanceof ConvertSpinner || newCombo;
    h.comboOffset = newCombo ? comboOffset : 0;
    return this.lastObject = h;
  }

  private createSlider(position: Vector2F, newCombo: boolean, comboOffset: number, controlPoints: PathControlPoint[], length: number | null, repeatCount: number,
                       nodeSamples: HitSampleInfo[][]): ConvertHitObject {
    const path = new SliderPath(controlPoints, length);

    // there are known instances of beatmaps (https://osu.ppy.sh/beatmapsets/594828#osu/1258033) which contain zero-length sliders with non-zero numbers of repeats.
    // this was exploiting a bug in stable in which the slider repeats would be generated as objects but never actually judged as a hit *or* miss during gameplay,
    // therefore increasing the theoretical possible max combo to be gained from a slider while in practice never giving that extra combo.
    // due to lazer ensuring that an object has its nested part fully judged, this would result in broken behaviours
    // (either the zero-length slider giving hundreds of combo for nothing if the repeats are judged as hit, or insta-failing the player due to HP if judged as miss).
    // to remedy this in a way that seems least damaging, detect this situation via a heuristic and reset the number of repeats to zero.
    // this technically *does not* match stable beatmap parsing or conversion, *does not* match in-gameplay behaviour of such broken sliders,
    // and *will* fail conversion mapping tests, but again, this is supposed to be a least-worst measure to prevent exploits.
    // it is also applied centrally to all rulesets rather than in specific ruleset converters because this failure scenario
    // translates across rulesets (osu! and catch are both affected).
    if (Precision.almostEquals(path.distance, 0, Precision.DOUBLE_EPSILON)) {
      repeatCount = 0;
      nodeSamples = [nodeSamples[0], nodeSamples[nodeSamples.length - 1]];
    }

    const s = new ConvertSlider();
    s.position = position;
    s.newCombo = this.firstObject || this.lastObject instanceof ConvertSpinner || newCombo;
    s.comboOffset = newCombo ? comboOffset : 0;
    s.path = path;
    s.nodeSamples = nodeSamples;
    s.repeatCount = repeatCount;
    return this.lastObject = s;
  }

  private createSpinner(position: Vector2F, newCombo: boolean, duration: number): ConvertHitObject {
    const s = new ConvertSpinner();
    s.position = position;
    s.duration = duration;
    s.newCombo = newCombo;
    // Spinners cannot have combo offset.
    return this.lastObject = s;
  }

  private createHold(position: Vector2F, duration: number): ConvertHitObject {
    const h = new ConvertHold();
    h.position = position;
    h.duration = duration;
    return this.lastObject = h;
  }

  private convertSoundType(type: LegacyHitSoundType, bankInfo: SampleBankInfo): HitSampleInfo[] {
    const soundTypes: HitSampleInfo[] = [];

    if (!bankInfo.filename) {
      soundTypes.push(new LegacyHitSampleInfo(HitSampleInfo.HIT_NORMAL, bankInfo.bankForNormal, bankInfo.volume, true, bankInfo.customSampleBank,
        // if the sound type doesn't have the Normal flag set, attach it anyway as a layered sample.
        // None also counts as a normal non-layered sample: https://osu.ppy.sh/help/wiki/osu!_File_Formats/Osu_(file_format)#hitsounds
        type !== LegacyHitSoundType.None && (type & LegacyHitSoundType.Normal) === 0));
    } else {
      soundTypes.push(new FileHitSampleInfo(bankInfo.filename, bankInfo.volume));
    }

    if ((type & LegacyHitSoundType.Finish) !== 0)
      soundTypes.push(new LegacyHitSampleInfo(HitSampleInfo.HIT_FINISH, bankInfo.bankForAdditions, bankInfo.volume, bankInfo.editorAutoBank, bankInfo.customSampleBank));

    if ((type & LegacyHitSoundType.Whistle) !== 0)
      soundTypes.push(new LegacyHitSampleInfo(HitSampleInfo.HIT_WHISTLE, bankInfo.bankForAdditions, bankInfo.volume, bankInfo.editorAutoBank, bankInfo.customSampleBank));

    if ((type & LegacyHitSoundType.Clap) !== 0)
      soundTypes.push(new LegacyHitSampleInfo(HitSampleInfo.HIT_CLAP, bankInfo.bankForAdditions, bankInfo.volume, bankInfo.editorAutoBank, bankInfo.customSampleBank));

    return soundTypes;
  }
}

/** char.IsLetter for the first character of a point string segment. */
function isLetter(c: string | undefined): boolean {
  return c !== undefined && /\p{L}/u.test(c);
}

function isLinear(p0: Vector2F, p1: Vector2F, p2: Vector2F): boolean {
  return Precision.almostEquals(0, f(f(f(p1.y - p0.y) * f(p2.x - p0.x)) - f(f(p1.x - p0.x) * f(p2.y - p0.y))));
}

class SampleBankInfo {
  /** An optional overriding filename which causes all bank/sample specifications to be ignored. */
  filename: string | null = null;

  /** The bank identifier to use for the base ("hitnormal") sample. Transferred to HitSampleInfo.Bank when appropriate. */
  bankForNormal: string | null = null;

  /** The bank identifier to use for additions ("hitwhistle", "hitfinish", "hitclap"). Transferred to HitSampleInfo.Bank when appropriate. */
  bankForAdditions: string | null = null;

  /** Hit sample volume (0-100). See HitSampleInfo.Volume. */
  volume = 0;

  /** The index of the custom sample bank. Is only used if 2 or above for "reasons". This will add a suffix to lookups, allowing extended bank lookups (ie. "normal-hitnormal-2"). See HitSampleInfo.Suffix. */
  customSampleBank = 0;

  /** Whether the bank for additions should be inherited from the normal sample in edit. */
  editorAutoBank = true;

  clone(): SampleBankInfo {
    return Object.assign(new SampleBankInfo(), this);
  }
}

/** C#'s LegacyHitSampleInfo.With(...) parameters: as with HitSampleInfo.with, a present key is "provided". */
export interface LegacyHitSampleInfoChanges {
  name?: string;
  bank?: string;
  volume?: number;
  editorAutoBank?: boolean;
  customSampleBank?: number;
  isLayered?: boolean;
}

export class LegacyHitSampleInfo extends HitSampleInfo {
  get customSampleBank(): number {
    if (this.suffix !== null)
      return parseIntInvariant(this.suffix);

    return this.useBeatmapSamples ? 1 : 0;
  }

  /**
   * Whether this hit sample is layered.
   * Layered hit samples are automatically added in all modes (except osu!mania), but can be disabled using the SkinConfiguration.LegacySetting.LayeredHitSounds skin config option.
   */
  readonly isLayered: boolean;

  /** Whether a bank was specified locally to the relevant hitobject. If false, a bank will be retrieved from the closest control point. */
  bankSpecified: boolean;

  constructor(name: string, bank: string | null = null, volume = 0, editorAutoBank = false, customSampleBank = 0, isLayered = false) {
    super(name, bank ?? SampleControlPoint.DEFAULT_BANK, customSampleBank >= 2 ? customSampleBank.toString() : null, volume, editorAutoBank, customSampleBank >= 1);

    this.bankSpecified = !!bank;
    this.isLayered = isLayered;
  }

  override with(changes: HitSampleInfoChanges = {}): HitSampleInfo {
    const suffix = 'suffix' in changes ? changes.suffix! : this.suffix;
    const useBeatmapSamples = 'useBeatmapSamples' in changes ? changes.useBeatmapSamples! : this.useBeatmapSamples;
    let newCustomSampleBank = 0;

    if (suffix !== null)
      newCustomSampleBank = tryParseInt(suffix);

    if (newCustomSampleBank === 0 && useBeatmapSamples)
      newCustomSampleBank = 1;

    const forwarded: LegacyHitSampleInfoChanges = { customSampleBank: newCustomSampleBank };
    if ('name' in changes) forwarded.name = changes.name;
    if ('bank' in changes) forwarded.bank = changes.bank;
    if ('volume' in changes) forwarded.volume = changes.volume;
    if ('editorAutoBank' in changes) forwarded.editorAutoBank = changes.editorAutoBank;

    return this.withLegacy(forwarded);
  }

  /** C#'s LegacyHitSampleInfo.With(newName, newBank, newVolume, newEditorAutoBank, newCustomSampleBank, newIsLayered). */
  withLegacy(changes: LegacyHitSampleInfoChanges = {}): LegacyHitSampleInfo {
    return new LegacyHitSampleInfo(
      'name' in changes ? changes.name! : this.name,
      'bank' in changes ? changes.bank! : this.bank,
      'volume' in changes ? changes.volume! : this.volume,
      'editorAutoBank' in changes ? changes.editorAutoBank! : this.editorAutoBank,
      'customSampleBank' in changes ? changes.customSampleBank! : this.customSampleBank,
      'isLayered' in changes ? changes.isLayered! : this.isLayered);
  }

  override equals(other: HitSampleInfo | null): boolean {
    // The additions to equality checks here are *required* to ensure that pooling works correctly.
    // Of note, `IsLayered` may cause the usage of `SampleVirtual` instead of an actual sample (in cases playback is not required).
    // Removing it would cause samples which may actually require playback to potentially source for a `SampleVirtual` sample pool.
    return other instanceof LegacyHitSampleInfo && super.equals(other) && this.customSampleBank === other.customSampleBank && this.isLayered === other.isLayered;
  }
}

export class FileHitSampleInfo extends LegacyHitSampleInfo {
  constructor(readonly filename: string, volume: number) {
    // Force CSS=1 to make sure that the LegacyBeatmapSkin does not fall back to the user skin.
    super(HitSampleInfo.HIT_NORMAL, SampleControlPoint.DEFAULT_BANK, volume, false, 1);
  }

  override get lookupNames(): string[] {
    // Path.ChangeExtension(Filename, null); '/' is the only directory separator on the user's (macOS) client.
    const dot = this.filename.lastIndexOf('.');
    const withoutExtension = dot > this.filename.lastIndexOf('/') ? this.filename.slice(0, dot) : this.filename;

    return [this.filename, withoutExtension, ...super.lookupNames];
  }

  override withLegacy(changes: LegacyHitSampleInfoChanges = {}): LegacyHitSampleInfo {
    return new FileHitSampleInfo(this.filename, 'volume' in changes ? changes.volume! : this.volume);
  }

  override equals(other: HitSampleInfo | null): boolean {
    return other instanceof FileHitSampleInfo && super.equals(other) && this.filename === other.filename;
  }
}
