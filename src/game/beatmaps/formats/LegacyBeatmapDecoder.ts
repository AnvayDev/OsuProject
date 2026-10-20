// Ported from osu.Game/Beatmaps/Formats/LegacyBeatmapDecoder.cs. RulesetStore is the built-in ruleset store (C#'s RulesetStore static, set via
// Decoder.RegisterDependencies, falls back to the equivalent AssemblyRulesetStore).

import { parseDoubleInvariant, parseIntInvariant, trim } from '@fw/utils/DotNet';
import { HitSampleInfo } from '../../audio/HitSampleInfo';
import type { LineBufferedReader } from '../../io/LineBufferedReader';
import type { HitObject } from '../../rulesets/objects/HitObject';
import { getEndTime } from '../../rulesets/objects/HitObject';
import { ConvertHitObject } from '../../rulesets/objects/legacy/ConvertHitObjects';
import { ConvertHitObjectParser } from '../../rulesets/objects/legacy/ConvertHitObjectParser';
import { hasGenerateTicks, hasRepeats, hasSliderVelocity, spanCount } from '../../rulesets/objects/types/Types';
import { RulesetStore } from '../../rulesets/RulesetInfo';
import { SupportedExtensions } from '../../utils/SupportedExtensions';
import { Beatmap } from '../Beatmap';
import type { BeatmapDifficulty } from '../BeatmapDifficulty';
import { BeatmapSetInfo } from '../BeatmapSetInfo';
import type { ControlPoint } from '../controlPoints/ControlPoint';
import { DifficultyControlPoint } from '../controlPoints/DifficultyControlPoint';
import { EffectControlPoint } from '../controlPoints/EffectControlPoint';
import { SampleControlPoint } from '../controlPoints/SampleControlPoint';
import { TimingControlPoint } from '../controlPoints/TimingControlPoint';
import { CountdownType } from '../CountdownType';
import { LegacyControlPointInfo } from '../legacy/LegacyControlPointInfo';
import { LegacyEffectFlags, LegacyEventType, LegacySampleBank, parseEnum, tryParseEnum } from '../legacy/LegacyEnums';
import { BreakPeriod } from '../timing/BreakPeriod';
import { TimeSignature } from '../timing/TimeSignature';
import { Decoder } from './Decoder';
import { LegacyDecoder, LegacySampleControlPoint, Section } from './LegacyDecoder';
import { Parsing } from './Parsing';

/** BindableBeatDivisor.MINIMUM_DIVISOR / MAXIMUM_DIVISOR */
const MINIMUM_DIVISOR = 1;
const MAXIMUM_DIVISOR = 64;

export class LegacyBeatmapDecoder extends LegacyDecoder<Beatmap> {
  /** An offset which needs to be applied to old beatmaps (v4 and lower) to correct timing changes that were applied at a game client level. */
  static readonly EARLY_VERSION_TIMING_OFFSET = 24;

  /**
   * A small adjustment to the start time of sample control points to account for rounding/precision errors.
   * Compare: https://github.com/peppy/osu-stable-reference/blob/master/osu!/GameplayElements/HitObjects/HitObject.cs#L319
   */
  static readonly CONTROL_POINT_LENIENCY = 5;

  /** The maximum allowed number of keys in mania beatmaps. */
  static readonly MAX_MANIA_KEY_COUNT = 18;

  private beatmap!: Beatmap;
  private parser!: ConvertHitObjectParser;

  private defaultSampleBank = LegacySampleBank.None;
  private defaultSampleVolume = 100;

  static register(): void {
    Decoder.addDecoder(Beatmap, 'osu file format v', m => new LegacyBeatmapDecoder(Parsing.parseInt(m.split('v').at(-1)!)));
    Decoder.setFallbackDecoder(Beatmap, () => new LegacyBeatmapDecoder());
  }

  /** Whether beatmap or runtime offsets should be applied. Defaults on; only disable for testing purposes. */
  applyOffsets = true;

  private readonly offset: number;

  constructor(version = LegacyDecoder.LATEST_VERSION) {
    super(version);

    this.offset = this.formatVersion < 5 ? LegacyBeatmapDecoder.EARLY_VERSION_TIMING_OFFSET : 0;
  }

  protected override createTemplateObject(): Beatmap {
    const templateBeatmap = new Beatmap();
    templateBeatmap.controlPointInfo = new LegacyControlPointInfo();
    return templateBeatmap;
  }

  protected override parseStreamInto(stream: LineBufferedReader, isPrimaryStream: boolean, beatmap: Beatmap): void {
    this.beatmap = beatmap;
    this.beatmap.beatmapVersion = this.formatVersion;
    this.parser = new ConvertHitObjectParser(this.getOffsetTime(), this.formatVersion);

    LegacyBeatmapDecoder.applyLegacyDefaults(this.beatmap);

    super.parseStreamInto(stream, isPrimaryStream, beatmap);

    LegacyBeatmapDecoder.applyDifficultyRestrictions(beatmap.difficulty, beatmap);

    this.flushPendingPoints();

    // Objects may be out of order *only* if a user has manually edited an .osu file.
    // Unfortunately there are ranked maps in this state (example: https://osu.ppy.sh/s/594828).
    // OrderBy is used to guarantee that the parsing order of hitobjects with equal start times is maintained (stably-sorted)
    // The parsing order of hitobjects matters in mania difficulty calculation
    this.beatmap.hitObjects = [...this.beatmap.hitObjects].sort((a, b) => a.startTime - b.startTime);

    LegacyBeatmapDecoder.postProcessBreaks(this.beatmap);

    for (const hitObject of this.beatmap.hitObjects) {
      this.applyDefaults(hitObject);
      this.applySamples(hitObject);
    }
  }

  /**
   * Ensures that all BeatmapDifficulty settings are within the allowed ranges.
   * See also: https://github.com/peppy/osu-stable-reference/blob/0e425c0d525ef21353c8293c235cc0621d28338b/osu!/GameplayElements/Beatmaps/Beatmap.cs#L567-L614
   */
  private static applyDifficultyRestrictions(difficulty: BeatmapDifficulty, beatmap: Beatmap): void {
    difficulty.drainRate = clamp(difficulty.drainRate, 0, 10);

    // mania uses "circle size" for key count, thus different allowable range
    difficulty.circleSize = beatmap.beatmapInfo.ruleset.onlineID !== 3
      ? clamp(difficulty.circleSize, 0, 10)
      : clamp(difficulty.circleSize, 1, LegacyBeatmapDecoder.MAX_MANIA_KEY_COUNT);

    difficulty.overallDifficulty = clamp(difficulty.overallDifficulty, 0, 10);
    difficulty.approachRate = clamp(difficulty.approachRate, 0, 10);

    difficulty.sliderMultiplier = clamp(difficulty.sliderMultiplier, 0.4, 3.6);
    difficulty.sliderTickRate = clamp(difficulty.sliderTickRate, 0.5, 8);
  }

  /** Processes the beatmap such that a new combo is started the first hitobject following each break. */
  private static postProcessBreaks(beatmap: Beatmap): void {
    let currentBreak = 0;
    let forceNewCombo = false;

    for (const h of beatmap.hitObjects) {
      if (!(h instanceof ConvertHitObject))
        continue;

      while (currentBreak < beatmap.breaks.count && beatmap.breaks.get(currentBreak).endTime < h.startTime) {
        forceNewCombo = true;
        currentBreak++;
      }

      h.newCombo ||= forceNewCombo;
      forceNewCombo = false;
    }
  }

  private applyDefaults(hitObject: HitObject): void {
    const controlPointInfo = this.beatmap.controlPointInfo;
    const difficultyControlPoint = controlPointInfo instanceof LegacyControlPointInfo
      ? controlPointInfo.difficultyPointAt(hitObject.startTime)
      : DifficultyControlPoint.DEFAULT;

    if (hasGenerateTicks(hitObject))
      hitObject.generateTicks = difficultyControlPoint.generateTicks;

    if (hasSliderVelocity(hitObject))
      hitObject.sliderVelocityMultiplier = difficultyControlPoint.sliderVelocity;

    hitObject.applyDefaults(this.beatmap.controlPointInfo, this.beatmap.difficulty);
  }

  private applySamples(hitObject: HitObject): void {
    const controlPointInfo = this.beatmap.controlPointInfo;
    const samplePointAt = (time: number) => controlPointInfo instanceof LegacyControlPointInfo ? controlPointInfo.samplePointAt(time) : SampleControlPoint.DEFAULT;

    if (hasRepeats(hitObject)) {
      const sampleControlPoint = samplePointAt(hitObject.startTime + LegacyBeatmapDecoder.CONTROL_POINT_LENIENCY + 1);
      hitObject.samples = hitObject.samples.map(s => sampleControlPoint.applyTo(s));

      for (let i = 0; i < hitObject.nodeSamples.length; i++) {
        const time = hitObject.startTime + i * hitObject.duration / spanCount(hitObject) + LegacyBeatmapDecoder.CONTROL_POINT_LENIENCY;
        const nodeSamplePoint = samplePointAt(time);

        hitObject.nodeSamples[i] = hitObject.nodeSamples[i].map(s => nodeSamplePoint.applyTo(s));
      }
    } else {
      const sampleControlPoint = samplePointAt(getEndTime(hitObject) + LegacyBeatmapDecoder.CONTROL_POINT_LENIENCY);
      hitObject.samples = hitObject.samples.map(s => sampleControlPoint.applyTo(s));
    }
  }

  /**
   * Some `BeatmapInfo` members have default values that differ from the default values used by stable.
   * In addition, legacy beatmaps will sometimes not contain some configuration keys, in which case
   * the legacy default values should be used.
   * This method's intention is to restore those legacy defaults.
   * See also: https://osu.ppy.sh/wiki/en/Client/File_formats/Osu_%28file_format%29
   */
  static applyLegacyDefaults(beatmap: Beatmap): void {
    beatmap.widescreenStoryboard = false;
    // in a perfect world this would throw if osu! ruleset couldn't be found,
    // but unfortunately there are "legitimate" cases where it's not there (i.e. ruleset test projects),
    // so attempt to trudge on with whatever it is that's in `BeatmapInfo` if the lookup fails.
    beatmap.beatmapInfo.ruleset = RulesetStore.getRuleset(0) ?? beatmap.beatmapInfo.ruleset;
  }

  protected override parseLine(beatmap: Beatmap, section: Section, line: string, isPrimaryStream: boolean): void {
    switch (section) {
      case Section.General:
        this.handleGeneral(line);
        return;

      case Section.Editor:
        this.handleEditor(line);
        return;

      case Section.Metadata:
        this.handleMetadata(line);
        return;

      case Section.Difficulty:
        this.handleDifficulty(line);
        return;

      case Section.Events:
        this.handleEvent(line);
        return;

      case Section.TimingPoints:
        this.handleTimingPoint(line);
        return;

      case Section.HitObjects:
        this.handleHitObject(line);
        return;
    }

    super.parseLine(beatmap, section, line, isPrimaryStream);
  }

  private handleGeneral(line: string): void {
    const [key, value] = this.splitKeyVal(line);

    const metadata = this.beatmap.beatmapInfo.metadata;

    switch (key) {
      case 'AudioFilename':
        metadata.audioFile = value.replaceAll('\\', '/');
        break;

      case 'AudioLeadIn':
        this.beatmap.audioLeadIn = Parsing.parseInt(value);
        break;

      case 'PreviewTime': {
        const time = Parsing.parseInt(value);
        metadata.previewTime = time === -1 ? time : this.getOffsetTime(time);
        break;
      }

      case 'SampleSet':
        this.defaultSampleBank = parseEnum(LegacySampleBank, value);
        break;

      case 'SampleVolume':
        this.defaultSampleVolume = Parsing.parseInt(value);
        break;

      case 'StackLeniency':
        this.beatmap.stackLeniency = Parsing.parseFloat(value);
        break;

      case 'Mode': {
        const ruleset = RulesetStore.getRuleset(Parsing.parseInt(value));
        if (ruleset === null)
          throw new Error('Ruleset is not available locally.');
        this.beatmap.beatmapInfo.ruleset = ruleset;
        break;
      }

      case 'LetterboxInBreaks':
        this.beatmap.letterboxInBreaks = Parsing.parseInt(value) === 1;
        break;

      case 'SpecialStyle':
        this.beatmap.specialStyle = Parsing.parseInt(value) === 1;
        break;

      case 'WidescreenStoryboard':
        this.beatmap.widescreenStoryboard = Parsing.parseInt(value) === 1;
        break;

      case 'EpilepsyWarning':
        this.beatmap.epilepsyWarning = Parsing.parseInt(value) === 1;
        break;

      case 'SamplesMatchPlaybackRate':
        this.beatmap.samplesMatchPlaybackRate = Parsing.parseInt(value) === 1;
        break;

      case 'Countdown':
        this.beatmap.countdown = parseEnum(CountdownType, value);
        break;

      case 'CountdownOffset':
        this.beatmap.countdownOffset = Parsing.parseInt(value);
        break;
    }
  }

  private handleEditor(line: string): void {
    const [key, value] = this.splitKeyVal(line);

    switch (key) {
      case 'Bookmarks':
        this.beatmap.bookmarks = value.split(',').flatMap(v => {
          try {
            return [parseIntInvariant(v)];
          } catch {
            return [];
          }
        });
        break;

      case 'VelocityPresets':
        this.beatmap.sliderVelocityPresets = value.split(',').flatMap(v => {
          try {
            return [parseDoubleInvariant(v)];
          } catch {
            return [];
          }
        });
        break;

      case 'DistanceSpacing':
        this.beatmap.distanceSpacing = Math.max(0, Parsing.parseDouble(value));
        break;

      case 'BeatDivisor':
        this.beatmap.beatmapInfo.beatDivisor = clamp(Parsing.parseInt(value), MINIMUM_DIVISOR, MAXIMUM_DIVISOR);
        break;

      case 'GridSize':
        this.beatmap.gridSize = Parsing.parseInt(value);
        break;

      case 'TimelineZoom':
        this.beatmap.timelineZoom = Math.max(0, Parsing.parseDouble(value));
        break;
    }
  }

  private handleMetadata(line: string): void {
    const [key, value] = this.splitKeyVal(line);

    const metadata = this.beatmap.beatmapInfo.metadata;

    switch (key) {
      case 'Title':
        metadata.title = value;
        break;

      case 'TitleUnicode':
        metadata.titleUnicode = value;
        break;

      case 'Artist':
        metadata.artist = value;
        break;

      case 'ArtistUnicode':
        metadata.artistUnicode = value;
        break;

      case 'Creator':
        metadata.author.username = value;
        break;

      case 'Version':
        this.beatmap.beatmapInfo.difficultyName = value;
        break;

      case 'Source':
        metadata.source = value;
        break;

      case 'Tags':
        metadata.tags = value;
        break;

      case 'BeatmapID':
        this.beatmap.beatmapInfo.onlineID = Parsing.parseInt(value);
        break;

      case 'BeatmapSetID': {
        const beatmapSet = new BeatmapSetInfo();
        beatmapSet.onlineID = Parsing.parseInt(value);
        this.beatmap.beatmapInfo.beatmapSet = beatmapSet;
        break;
      }
    }
  }

  private handleDifficulty(line: string): void {
    const [key, value] = this.splitKeyVal(line);

    const difficulty = this.beatmap.difficulty;

    switch (key) {
      case 'HPDrainRate':
        difficulty.drainRate = Parsing.parseFloat(value);
        break;

      case 'CircleSize':
        difficulty.circleSize = Parsing.parseFloat(value);
        break;

      case 'OverallDifficulty':
        difficulty.overallDifficulty = Parsing.parseFloat(value);
        if (!this.hasApproachRate)
          difficulty.approachRate = difficulty.overallDifficulty;
        break;

      case 'ApproachRate':
        difficulty.approachRate = Parsing.parseFloat(value);
        this.hasApproachRate = true;
        break;

      case 'SliderMultiplier':
        difficulty.sliderMultiplier = Parsing.parseDouble(value);
        break;

      case 'SliderTickRate':
        difficulty.sliderTickRate = Parsing.parseDouble(value);
        break;
    }
  }

  private handleEvent(line: string): void {
    const split = line.split(',');

    const type = tryParseEnum(LegacyEventType, split[0]);

    if (type !== undefined) {
      switch (type) {
        case LegacyEventType.Sprite:
          // Generally, the background is the first thing defined in a beatmap file.
          // In some older beatmaps, it is not present and replaced by a storyboard-level background instead.
          // Allow the first sprite (by file order) to act as the background in such cases.
          if (!this.beatmap.beatmapInfo.metadata.backgroundFile)
            this.beatmap.beatmapInfo.metadata.backgroundFile = this.cleanFilename(at(split, 3));

          break;

        case LegacyEventType.Video: {
          const filename = this.cleanFilename(at(split, 2));

          // Some very old beatmaps had incorrect type specifications for their backgrounds (ie. using 1 for VIDEO
          // instead of 0 for BACKGROUND). To handle this gracefully, check the file extension against known supported
          // video extensions and handle similar to a background if it doesn't match.
          if (!SupportedExtensions.VIDEO_EXTENSIONS.includes(getExtension(filename).toLowerCase()))
            this.beatmap.beatmapInfo.metadata.backgroundFile = filename;

          break;
        }

        case LegacyEventType.Background:
          this.beatmap.beatmapInfo.metadata.backgroundFile = this.cleanFilename(at(split, 2));
          break;

        case LegacyEventType.Break: {
          const start = this.getOffsetTime(Parsing.parseDouble(at(split, 1)));
          const end = Math.max(start, this.getOffsetTime(Parsing.parseDouble(at(split, 2))));

          this.beatmap.breaks.add(new BreakPeriod(start, end));
          break;
        }
      }
    }
  }

  private handleTimingPoint(line: string): void {
    const split = line.split(',');

    const time = this.getOffsetTime(Parsing.parseDouble(trim(at(split, 0))));

    // beatLength is allowed to be NaN to handle an edge case in which some beatmaps use NaN slider velocity to disable slider tick generation (see LegacyDifficultyControlPoint).
    const beatLength = Parsing.parseDouble(trim(at(split, 1)), Parsing.MAX_PARSE_VALUE, true);

    // If beatLength is NaN, speedMultiplier should still be 1 because all comparisons against NaN are false.
    const speedMultiplier = beatLength < 0 ? 100.0 / -beatLength : 1;

    let timeSignature = TimeSignature.SimpleQuadruple;
    if (split.length >= 3)
      timeSignature = at(split[2], 0) === '0' ? TimeSignature.SimpleQuadruple : new TimeSignature(Parsing.parseInt(split[2]));

    let sampleSet = this.defaultSampleBank;
    if (split.length >= 4)
      sampleSet = Parsing.parseInt(split[3]) as LegacySampleBank;

    let customSampleBank = 0;
    if (split.length >= 5)
      customSampleBank = Parsing.parseInt(split[4]);

    let sampleVolume = this.defaultSampleVolume;
    if (split.length >= 6)
      sampleVolume = Parsing.parseInt(split[5]);

    let timingChange = true;
    if (split.length >= 7)
      timingChange = at(split[6], 0) === '1';

    let kiaiMode = false;
    let omitFirstBarSignature = false;

    if (split.length >= 8) {
      const effectFlags = Parsing.parseInt(split[7]) as LegacyEffectFlags;
      kiaiMode = (effectFlags & LegacyEffectFlags.Kiai) !== 0;
      omitFirstBarSignature = (effectFlags & LegacyEffectFlags.OmitFirstBarLine) !== 0;
    }

    // Enum.ToString() of a value without a name is its number.
    let stringSampleSet = (LegacySampleBank[sampleSet] ?? String(sampleSet)).toLowerCase();
    if (stringSampleSet === 'none')
      stringSampleSet = HitSampleInfo.BANK_NORMAL;

    if (timingChange) {
      if (Number.isNaN(beatLength))
        throw new Error('Beat length cannot be NaN in a timing control point');

      const controlPoint = this.createTimingControlPoint();

      controlPoint.beatLength = beatLength;
      controlPoint.timeSignature = timeSignature;
      controlPoint.omitFirstBarLine = omitFirstBarSignature;

      this.addControlPoint(time, controlPoint, true);
    }

    const onlineRulesetID = this.beatmap.beatmapInfo.ruleset.onlineID;

    const difficultyPoint = new DifficultyControlPoint();
    difficultyPoint.generateTicks = !Number.isNaN(beatLength);
    difficultyPoint.sliderVelocity = speedMultiplier;
    this.addControlPoint(time, difficultyPoint, timingChange);

    const effectPoint = new EffectControlPoint();
    effectPoint.kiaiMode = kiaiMode;

    // osu!taiko and osu!mania use effect points rather than difficulty points for scroll speed adjustments.
    if (onlineRulesetID === 1 || onlineRulesetID === 3)
      effectPoint.scrollSpeed = speedMultiplier;

    this.addControlPoint(time, effectPoint, timingChange);

    const samplePoint = new LegacySampleControlPoint();
    samplePoint.sampleBank = stringSampleSet;
    samplePoint.sampleVolume = sampleVolume;
    samplePoint.customSampleBank = customSampleBank;
    this.addControlPoint(time, samplePoint, timingChange);
  }

  private readonly pendingControlPoints: ControlPoint[] = [];
  private readonly pendingControlPointTypes = new Set<Function>();
  private pendingControlPointsTime = 0;
  private hasApproachRate = false;

  private addControlPoint(time: number, point: ControlPoint, timingChange: boolean): void {
    if (time !== this.pendingControlPointsTime)
      this.flushPendingPoints();

    if (timingChange)
      this.pendingControlPoints.unshift(point);
    else
      this.pendingControlPoints.push(point);

    this.pendingControlPointsTime = time;
  }

  private flushPendingPoints(): void {
    // Changes from non-timing-points are added to the end of the list (see addControlPoint()) and should override any changes from timing-points (added to the start of the list).
    for (let i = this.pendingControlPoints.length - 1; i >= 0; i--) {
      const type = this.pendingControlPoints[i].constructor;
      if (this.pendingControlPointTypes.has(type))
        continue;

      this.pendingControlPointTypes.add(type);
      this.beatmap.controlPointInfo.add(this.pendingControlPointsTime, this.pendingControlPoints[i]);
    }

    this.pendingControlPoints.length = 0;
    this.pendingControlPointTypes.clear();
  }

  private handleHitObject(line: string): void {
    const obj = this.parser.parse(line);
    obj.applyDefaults(this.beatmap.controlPointInfo, this.beatmap.difficulty);

    this.beatmap.hitObjects.push(obj);
  }

  private getOffsetTime(time?: number): number {
    return (time ?? 0) + (this.applyOffsets ? this.offset : 0);
  }

  protected createTimingControlPoint(): TimingControlPoint {
    return new TimingControlPoint();
  }
}

// C#'s static Decoder() constructor.
LegacyBeatmapDecoder.register();

/** Math.Clamp (keeps the sign of a zero value, unlike Math.min/max). */
function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** C# indexing (array[i] / string[i]): throws IndexOutOfRangeException instead of yielding undefined. */
function at<T>(items: ArrayLike<T>, index: number): T {
  if (index >= items.length)
    throw new RangeError('Index was outside the bounds of the array.');
  return items[index];
}

/** Path.GetExtension: the extension including its period, or an empty string if the last path segment has none. */
function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot <= path.lastIndexOf('/') || dot === path.length - 1)
    return '';
  return path.slice(dot);
}
