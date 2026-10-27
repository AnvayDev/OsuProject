// Ported from osu.Game/Beatmaps/BeatmapImporter.cs (ImportAsUpdate, score re-attachment and the stable directory import are not ported).

import { computeMD5Hash, computeSHA2Hash } from '@fw/extensions/ExtensionMethods';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import type { ImportParameters } from '../database/ImportParameters';
import type { RealmAccess, RealmWrite } from '../database/RealmAccess';
import { RealmArchiveModelImporter } from '../database/RealmArchiveModelImporter';
import type { ArchiveReader } from '../io/archives/ArchiveReader';
import { LineBufferedReader } from '../io/LineBufferedReader';
import { hasDuration } from '../rulesets/objects/types/Types';
import { RulesetStore } from '../rulesets/RulesetInfo';
import { Beatmap } from './Beatmap';
import { BeatmapDifficulty } from './BeatmapDifficulty';
import { BeatmapInfo } from './BeatmapInfo';
import { BeatmapMetadata } from './BeatmapMetadata';
import { BeatmapSetInfo } from './BeatmapSetInfo';
import { Decoder } from './formats/Decoder';
import './formats/LegacyBeatmapDecoder';
import { MetadataLookupScope } from './MetadataLookupScope';

/** C#'s ProcessBeatmapDelegate (asynchronous here: decoding reads from IndexedDB). */
export type ProcessBeatmapDelegate = (beatmapSet: BeatmapSetInfo, lookupScope: MetadataLookupScope) => Promise<void>;

/** Handles the storage and retrieval of Beatmaps/WorkingBeatmaps. */
export class BeatmapImporter extends RealmArchiveModelImporter {
  override get handledExtensions(): readonly string[] {
    return ['.osz', '.olz'];
  }

  protected override get hashableFileTypes(): readonly string[] {
    return ['.osu'];
  }

  processBeatmap: ProcessBeatmapDelegate | null = null;

  constructor(realm: RealmAccess) {
    super(realm);
  }

  protected override async populate(beatmapSet: BeatmapSetInfo, archive: ArchiveReader | null): Promise<void> {
    if (archive !== null)
      beatmapSet.beatmaps.push(...await this.createBeatmapDifficulties(beatmapSet));

    beatmapSet.dateAdded = getDateAdded();

    for (const b of beatmapSet.beatmaps)
      b.beatmapSet = beatmapSet;

    this.validateOnlineIds(beatmapSet);

    const hadOnlineIDs = beatmapSet.beatmaps.some(b => b.onlineID > 0);

    // TODO: this may no longer be valid as we aren't doing an online population at this point.
    // ensure at least one beatmap was able to retrieve or keep an online ID, else drop the set ID.
    if (hadOnlineIDs && !beatmapSet.beatmaps.some(b => b.onlineID > 0)) {
      if (beatmapSet.onlineID > 0) {
        beatmapSet.onlineID = -1;
        RealmArchiveModelImporter.logForModel(beatmapSet, 'Disassociating beatmap set ID due to loss of all beatmap IDs');
      }
    }
  }

  protected override preImport(beatmapSet: BeatmapSetInfo, realm: RealmWrite): void {
    // We are about to import a new beatmap. Before doing so, ensure that no other set shares the online IDs used by the new one.
    // Note that this means if the previous beatmap is restored by the user, it will no longer be linked to its online IDs.
    // If this is ever an issue, we can consider marking as pending delete but not resetting the IDs (but care will be required for
    // beatmaps, which don't have their own `DeletePending` state).

    if (beatmapSet.onlineID > 0) {
      const onlineId = beatmapSet.onlineID;

      // OnlineID should really be unique, but to avoid catastrophic failure let's iterate just to be sure.
      for (const set of realm.all().filter(b => b.onlineID === onlineId)) {
        const existingSetWithSameOnlineID = realm.edit(set);

        existingSetWithSameOnlineID.deletePending = true;
        existingSetWithSameOnlineID.onlineID = -1;

        for (const b of existingSetWithSameOnlineID.beatmaps)
          b.resetOnlineInfo();

        RealmArchiveModelImporter.logForModel(beatmapSet, `Found existing beatmap set with same OnlineID (${beatmapSet.onlineID}). It will be disassociated and marked for deletion.`);
      }
    }
  }

  protected override async postImport(model: BeatmapSetInfo, parameters: ImportParameters): Promise<void> {
    await super.postImport(model, parameters);

    await this.processBeatmap?.(model, parameters.batch ? MetadataLookupScope.LocalCacheFirst : MetadataLookupScope.OnlineFirst);
  }

  private validateOnlineIds(beatmapSet: BeatmapSetInfo): void {
    const beatmapIds = beatmapSet.beatmaps.filter(b => b.onlineID > 0).map(b => b.onlineID);

    // ensure all IDs are unique
    if (new Set(beatmapIds).size !== beatmapIds.length) {
      RealmArchiveModelImporter.logForModel(beatmapSet, 'Found non-unique IDs, resetting...');
      resetIds();
      return;
    }

    // find any existing beatmaps in the database that have matching online ids
    const allBeatmaps = this.realm.allBeatmapSets().flatMap(s => s.beatmaps);
    const existingBeatmaps = beatmapIds.flatMap(id => allBeatmaps.filter(b => b.onlineID === id));

    if (existingBeatmaps.length > 0) {
      // reset the import ids (to force a re-fetch) *unless* they match the candidate CheckForExisting set.
      // we can ignore the case where the new ids are contained by the CheckForExisting set as it will either be used (import skipped) or deleted.

      const existing = this.checkForExisting(beatmapSet, this.realm.allBeatmapSets());

      if (existing === null || existingBeatmaps.some(b => !existing.beatmaps.some(e => e.equals(b)))) {
        RealmArchiveModelImporter.logForModel(beatmapSet, 'Found existing import with online IDs already, resetting...');
        resetIds();
      }
    }

    function resetIds() {
      beatmapSet.beatmaps.forEach(b => b.resetOnlineInfo());
    }
  }

  protected override canReuseExisting(existing: BeatmapSetInfo, imported: BeatmapSetInfo): boolean {
    if (!super.canReuseExisting(existing, imported))
      return false;

    const existingIds = existing.beatmaps.map(b => b.onlineID).sort((a, b) => a - b);
    const importIds = imported.beatmaps.map(b => b.onlineID).sort((a, b) => a - b);

    // force re-import if we are not in a sane state.
    return existing.onlineID === imported.onlineID && existingIds.length === importIds.length && existingIds.every((id, i) => id === importIds[i]);
  }

  protected override undeleteForReuse(existing: BeatmapSetInfo): void {
    if (!existing.deletePending)
      return;

    super.undeleteForReuse(existing);
    existing.dateAdded = new Date();
  }

  override get humanisedModelName(): string {
    return 'beatmap';
  }

  protected override createModel(reader: ArchiveReader, _parameters: ImportParameters): BeatmapSetInfo | null {
    // let's make sure there are actually .osu files to import.
    const mapName = reader.filenames.find(f => f.toLowerCase().endsWith('.osu'));

    if (!mapName) {
      Logger.log(`No beatmap files found in the beatmap archive (${reader.name}).`, LoggingTarget.Database);
      return null;
    }

    const stream = new LineBufferedReader(reader.getStream(mapName)!);

    if (stream.peekLine() === null) {
      Logger.log(`No content found in first .osu file of beatmap archive (${reader.name} / ${mapName})`, LoggingTarget.Database);
      return null;
    }

    const beatmap = Decoder.getDecoder(Beatmap, stream).decode(stream);

    const set = new BeatmapSetInfo();
    set.onlineID = beatmap.beatmapInfo.beatmapSet?.onlineID ?? -1;
    return set;
  }

  private async createBeatmapDifficulties(beatmapSet: BeatmapSetInfo): Promise<BeatmapInfo[]> {
    const beatmaps: BeatmapInfo[] = [];

    // stable appears to ignore `.osu` files which are not placed at the top level of the beatmap archive.
    // the logic that achieves this is very difficult to make sense of, but appears to be located somewhere around
    // https://github.com/peppy/osu-stable-reference/blob/67795dba3c308e7d0493b296149dcb073ca47ecb/osu!/GameplayElements/Beatmaps/BeatmapManager.cs#L207-L208
    // only testing the `/` path separator character is sufficient as `RealmNamedFileUsage`s are normalised to use the front slash unix path separator convention
    for (const file of beatmapSet.files.filter(f => !f.filename.includes('/') && f.filename.toLowerCase().endsWith('.osu'))) {
      const memoryStream = (await this.files.getBytes(file.file.hash))!;

      const lineReader = new LineBufferedReader(memoryStream);

      if (lineReader.peekLine() === null) {
        RealmArchiveModelImporter.logForModel(beatmapSet, `No content found in beatmap file ${file.filename}.`);
        continue;
      }

      const decoded = Decoder.getDecoder(Beatmap, lineReader).decode(lineReader);

      const hash = await computeSHA2Hash(memoryStream);

      if (beatmaps.some(b => b.hash === hash)) {
        RealmArchiveModelImporter.logForModel(beatmapSet, `Skipping import of ${file.filename} due to duplicate file content.`);
        continue;
      }

      const decodedInfo = decoded.beatmapInfo;
      const decodedDifficulty = decodedInfo.difficulty;

      const ruleset = RulesetStore.getRuleset(decodedInfo.ruleset.onlineID);

      if (ruleset?.available !== true) {
        RealmArchiveModelImporter.logForModel(beatmapSet, `Skipping import of ${file.filename} due to missing local ruleset ${decodedInfo.ruleset.onlineID}.`);
        continue;
      }

      const difficulty = new BeatmapDifficulty();
      difficulty.drainRate = decodedDifficulty.drainRate;
      difficulty.circleSize = decodedDifficulty.circleSize;
      difficulty.overallDifficulty = decodedDifficulty.overallDifficulty;
      difficulty.approachRate = decodedDifficulty.approachRate;
      difficulty.sliderMultiplier = decodedDifficulty.sliderMultiplier;
      difficulty.sliderTickRate = decodedDifficulty.sliderTickRate;

      const metadata = BeatmapMetadata.from({
        title: decoded.metadata.title,
        titleUnicode: decoded.metadata.titleUnicode,
        artist: decoded.metadata.artist,
        artistUnicode: decoded.metadata.artistUnicode,
        author: {
          onlineID: decoded.metadata.author.onlineID,
          username: decoded.metadata.author.username,
        },
        source: decoded.metadata.source,
        tags: decoded.metadata.tags,
        previewTime: decoded.metadata.previewTime,
        audioFile: decoded.metadata.audioFile,
        backgroundFile: decoded.metadata.backgroundFile,
      });

      const beatmap = new BeatmapInfo(ruleset, difficulty, metadata);
      beatmap.hash = hash;
      beatmap.difficultyName = decodedInfo.difficultyName;
      beatmap.onlineID = decodedInfo.onlineID;
      beatmap.beatDivisor = decodedInfo.beatDivisor;
      beatmap.md5Hash = computeMD5Hash(memoryStream);
      beatmap.endTimeObjectCount = decoded.hitObjects.filter(h => hasDuration(h)).length;
      beatmap.totalObjectCount = decoded.hitObjects.length;

      beatmaps.push(beatmap);
    }

    if (beatmaps.length === 0)
      throw new Error('No valid beatmap files found in the beatmap archive.');

    return beatmaps;
  }
}

/** getDateAdded: now (the stable directory import's oldest .osu write time doesn't apply). */
function getDateAdded(): Date {
  return new Date();
}
