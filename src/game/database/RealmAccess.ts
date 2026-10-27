// Ported subset of osu.Game/Database/RealmAccess.cs (opening the database, startup cleanup, writes and change notifications) for the models
// this port stores. IndexedDB replaces realm:
// - database 'osu': 'beatmapSets' (key = set ID; each record embeds its beatmaps and file usages) and 'files' (see RealmFileStore);
// - osu! queries realm synchronously (Find, All, QueryBeatmapSet), so every set is mirrored in memory, in insertion order (realm's unsorted
//   order, which MusicController and the intro rely on; IndexedDB itself returns records by key);
// - a write works on copies of the sets it touches and swaps them in once IndexedDB has committed, so a failed write changes nothing (realm's
//   rollback) and readers keep the objects they had, as with realm's detached copies. A committed object is never mutated afterwards.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import { BeatmapDifficulty } from '../beatmaps/BeatmapDifficulty';
import { BeatmapInfo } from '../beatmaps/BeatmapInfo';
import { BeatmapMetadata } from '../beatmaps/BeatmapMetadata';
import { BeatmapSetInfo } from '../beatmaps/BeatmapSetInfo';
import { RealmFile, RealmNamedFileUsage } from '../models/RealmFile';
import { RulesetInfo, RulesetStore } from '../rulesets/RulesetInfo';
import { RealmFileStore } from './RealmFileStore';

const schema_version = 1;

interface BeatmapRecord {
  id: string;
  difficultyName: string;
  ruleset: string;
  difficulty: Pick<BeatmapDifficulty, 'drainRate' | 'circleSize' | 'overallDifficulty' | 'approachRate' | 'sliderMultiplier' | 'sliderTickRate'>;
  metadata: Omit<BeatmapMetadata, 'author' | 'deepClone' | 'toString'> & { author: { onlineID: number; username: string; countryString: string } };
  userSettings: { offset: number };
  status: number;
  onlineID: number;
  length: number;
  bpm: number;
  hash: string;
  starRating: number;
  md5Hash: string;
  onlineMD5Hash: string;
  lastLocalUpdate: Date | null;
  lastOnlineUpdate: Date | null;
  hidden: boolean;
  endTimeObjectCount: number;
  totalObjectCount: number;
  lastPlayed: Date | null;
  beatDivisor: number;
  editorTimestamp: number | null;
}

interface BeatmapSetRecord {
  id: string;
  /** Insertion order. */
  seq: number;
  onlineID: number;
  dateAdded: Date;
  dateSubmitted: Date | null;
  dateRanked: Date | null;
  status: number;
  deletePending: boolean;
  hash: string;
  isProtected: boolean;
  files: { filename: string; hash: string }[];
  beatmaps: BeatmapRecord[];
}

interface OsuDatabase extends DBSchema {
  files: { key: string; value: ArrayBuffer };
  beatmapSets: { key: string; value: BeatmapSetRecord };
}

/** Realm's ChangeSet: deleted indices refer to the previous results, inserted and modified ones to the new results. */
export interface ChangeSet {
  readonly deletedIndices: readonly number[];
  readonly insertedIndices: readonly number[];
  readonly newModifiedIndices: readonly number[];
}

type Query = (all: readonly BeatmapSetInfo[]) => BeatmapSetInfo[];
type NotificationCallback = (sender: readonly BeatmapSetInfo[], changes: ChangeSet | null) => void;

/** The realm passed to a write: reads see the write's own changes; edit() returns the copy to mutate. */
export class RealmWrite {
  /** @internal */
  readonly edited = new Map<string, BeatmapSetInfo>();
  /** @internal */
  readonly added: BeatmapSetInfo[] = [];
  /** @internal */
  readonly removed = new Set<string>();

  /** @internal */
  constructor(private readonly committed: readonly BeatmapSetInfo[]) {}

  /** realm.All<BeatmapSetInfo>(), in insertion order. Objects not yet edited are the committed (read-only) instances. */
  all(): BeatmapSetInfo[] {
    return [...this.committed, ...this.added]
      .filter(s => !this.removed.has(s.id))
      .map(s => this.edited.get(s.id) ?? s);
  }

  find(id: string): BeatmapSetInfo | null {
    return this.all().find(s => s.id === id) ?? null;
  }

  /**
   * The writable copy of a stored set (the same copy for the rest of this write). Like a realm write, it works on the latest stored version
   * (looked up by ID), whichever instance is passed.
   */
  edit(set: BeatmapSetInfo): BeatmapSetInfo {
    const added = this.added.find(s => s.id === set.id);
    if (added !== undefined)
      return added;

    let copy = this.edited.get(set.id);

    if (copy === undefined) {
      const latest = this.committed.find(s => s.id === set.id);

      if (latest === undefined)
        throw new Error(`${set} is not stored.`);

      this.edited.set(set.id, copy = detach(latest));
    }

    return copy;
  }

  add(set: BeatmapSetInfo): void {
    this.added.push(set);
  }

  remove(set: BeatmapSetInfo): void {
    this.removed.add(set.id);
  }
}

export class RealmAccess {
  readonly files: RealmFileStore;

  private beatmapSets: BeatmapSetInfo[] = [];
  private readonly sequence = new Map<string, number>();
  private nextSequence = 0;

  private writeQueue: Promise<unknown> = Promise.resolve();
  private readonly subscriptions = new Set<{ query: Query; callback: NotificationCallback; results: BeatmapSetInfo[] }>();

  private constructor(/** @internal */ readonly db: IDBPDatabase<OsuDatabase>) {
    this.files = new RealmFileStore(this);
  }

  /** Opens (creating if needed) the database, purges pending deletions and loads every set into memory. */
  static async open(databaseName = 'osu'): Promise<RealmAccess> {
    const db = await openDB<OsuDatabase>(databaseName, schema_version, {
      upgrade(database) {
        database.createObjectStore('files');
        database.createObjectStore('beatmapSets', { keyPath: 'id' });
      },
    });

    const realm = new RealmAccess(db);
    await realm.cleanupPendingDeletions();
    return realm;
  }

  private async cleanupPendingDeletions(): Promise<void> {
    try {
      const tx = this.db.transaction('beatmapSets', 'readwrite');
      const records = await tx.store.getAll();

      for (const record of records) {
        if (record.deletePending)
          await tx.store.delete(record.id);
      }

      await tx.done;

      this.load(records.filter(r => !r.deletePending));

      await this.removeIncompleteSets();

      // clean up files after dropping any pending deletions.
      // in the future we may want to only do this when the game is idle, rather than on every startup.
      await this.files.cleanup();
    } catch (e) {
      Logger.error(e, 'Failed to clean up unused files. This is not critical but please report if it happens regularly.');

      if (this.beatmapSets.length === 0)
        this.load(await this.db.getAll('beatmapSets'));
    }
  }

  /**
   * Web addition: deletes sets that can't work, because a stored file is gone or a difficulty's audio file is missing from the set (a damaged
   * download, or a set whose audio was removed, imported before the importer rejected those). Protected sets are left alone.
   */
  private async removeIncompleteSets(): Promise<void> {
    const storedFiles = new Set(await this.db.getAllKeys('files'));

    const incomplete = this.beatmapSets.filter(set => !set.isProtected && (
      set.files.some(f => !storedFiles.has(f.file.hash))
      || set.beatmaps.some(b => {
        const audioFile = b.metadata.audioFile;
        return !!audioFile && audioFile.toLowerCase() !== 'virtual' && set.getFile(audioFile) === null;
      })));

    if (incomplete.length === 0)
      return;

    const tx = this.db.transaction('beatmapSets', 'readwrite');
    await Promise.all([...incomplete.map(set => tx.store.delete(set.id)), tx.done]);

    for (const set of incomplete) {
      Logger.log(`Removed incomplete beatmap set ${set} (missing files).`, LoggingTarget.Database);
      this.sequence.delete(set.id);
    }

    this.beatmapSets = this.beatmapSets.filter(s => !incomplete.includes(s));
  }

  private load(records: BeatmapSetRecord[]): void {
    records.sort((a, b) => a.seq - b.seq);

    this.beatmapSets = records.map(deserialize);
    this.sequence.clear();
    for (const r of records)
      this.sequence.set(r.id, r.seq);
    this.nextSequence = records.length === 0 ? 0 : records[records.length - 1].seq + 1;
  }

  /** realm.All<BeatmapSetInfo>(): every set (protected and pending deletion included), in insertion order. */
  allBeatmapSets(): readonly BeatmapSetInfo[] {
    return this.beatmapSets;
  }

  /** realm.Find<BeatmapSetInfo>(id). */
  findBeatmapSet(id: string): BeatmapSetInfo | null {
    return this.beatmapSets.find(s => s.id === id) ?? null;
  }

  /** realm.Find<BeatmapInfo>(id). */
  findBeatmap(id: string): BeatmapInfo | null {
    for (const set of this.beatmapSets) {
      const beatmap = set.beatmaps.find(b => b.id === id);
      if (beatmap !== undefined)
        return beatmap;
    }

    return null;
  }

  /**
   * realm.Write: runs the action (synchronously, on the latest state), persists what it touched in one IndexedDB transaction, then publishes
   * the new objects and raises notifications. Writes run one at a time. If the action or the commit throws, nothing changes.
   */
  write<T>(action: (realm: RealmWrite) => T): Promise<T> {
    const result = this.writeQueue.then(() => this.performWrite(action));
    this.writeQueue = result.catch(() => {});
    return result;
  }

  private async performWrite<T>(action: (realm: RealmWrite) => T): Promise<T> {
    const r = new RealmWrite(this.beatmapSets);
    const result = action(r);

    if (r.edited.size === 0 && r.added.length === 0 && r.removed.size === 0)
      return result;

    const sequence = new Map(this.sequence);
    let nextSequence = this.nextSequence;

    for (const set of r.added)
      sequence.set(set.id, nextSequence++);

    const tx = this.db.transaction('beatmapSets', 'readwrite');

    await Promise.all([
      ...[...r.edited.values(), ...r.added].filter(set => !r.removed.has(set.id)).map(set => tx.store.put(serialize(set, sequence.get(set.id)!))),
      ...[...r.removed].map(id => tx.store.delete(id)),
      tx.done,
    ]);

    this.beatmapSets = r.all();
    for (const id of r.removed)
      sequence.delete(id);
    this.sequence.clear();
    sequence.forEach((v, k) => this.sequence.set(k, v));
    this.nextSequence = nextSequence;

    this.notify();

    return result;
  }

  /**
   * realm.RegisterForNotifications: the callback gets the query's results once with null changes, then after every write that changes them.
   * A set counts as modified when the write replaced it (any field of the set or its beatmaps may have changed).
   */
  registerForNotifications(query: Query, callback: NotificationCallback): { dispose(): void } {
    const subscription = { query, callback, results: query(this.beatmapSets) };
    this.subscriptions.add(subscription);

    callback(subscription.results, null);

    return { dispose: () => this.subscriptions.delete(subscription) };
  }

  private notify(): void {
    for (const subscription of this.subscriptions) {
      const previous = subscription.results;
      const results = subscription.query(this.beatmapSets);

      const previousById = new Map(previous.map((s, i) => [s.id, { set: s, index: i }]));
      const newIds = new Set(results.map(s => s.id));

      const deletedIndices = previous.flatMap((s, i) => newIds.has(s.id) ? [] : [i]);
      const insertedIndices: number[] = [];
      const newModifiedIndices: number[] = [];

      results.forEach((s, i) => {
        const old = previousById.get(s.id);

        if (old === undefined)
          insertedIndices.push(i);
        else if (old.set !== s)
          newModifiedIndices.push(i);
      });

      subscription.results = results;

      if (deletedIndices.length > 0 || insertedIndices.length > 0 || newModifiedIndices.length > 0)
        subscription.callback(results, { deletedIndices, insertedIndices, newModifiedIndices });
    }
  }
}

/** A copy of a set with copies of its beatmaps (realm's Detach). */
export function detach(set: BeatmapSetInfo): BeatmapSetInfo {
  return deserialize(serialize(set, 0));
}

function serialize(set: BeatmapSetInfo, seq: number): BeatmapSetRecord {
  return {
    id: set.id,
    seq,
    onlineID: set.onlineID,
    dateAdded: set.dateAdded,
    dateSubmitted: set.dateSubmitted,
    dateRanked: set.dateRanked,
    status: set.status,
    deletePending: set.deletePending,
    hash: set.hash,
    isProtected: set.isProtected,
    files: set.files.map(f => ({ filename: f.filename, hash: f.file.hash })),
    beatmaps: set.beatmaps.map(b => ({
      id: b.id,
      difficultyName: b.difficultyName,
      ruleset: b.ruleset.shortName,
      difficulty: {
        drainRate: b.difficulty.drainRate,
        circleSize: b.difficulty.circleSize,
        overallDifficulty: b.difficulty.overallDifficulty,
        approachRate: b.difficulty.approachRate,
        sliderMultiplier: b.difficulty.sliderMultiplier,
        sliderTickRate: b.difficulty.sliderTickRate,
      },
      metadata: {
        title: b.metadata.title,
        titleUnicode: b.metadata.titleUnicode,
        artist: b.metadata.artist,
        artistUnicode: b.metadata.artistUnicode,
        author: { onlineID: b.metadata.author.onlineID, username: b.metadata.author.username, countryString: b.metadata.author.countryString },
        source: b.metadata.source,
        tags: b.metadata.tags,
        userTags: [...b.metadata.userTags],
        previewTime: b.metadata.previewTime,
        audioFile: b.metadata.audioFile,
        backgroundFile: b.metadata.backgroundFile,
      },
      userSettings: { offset: b.userSettings.offset },
      status: b.status,
      onlineID: b.onlineID,
      length: b.length,
      bpm: b.bpm,
      hash: b.hash,
      starRating: b.starRating,
      md5Hash: b.md5Hash,
      onlineMD5Hash: b.onlineMD5Hash,
      lastLocalUpdate: b.lastLocalUpdate,
      lastOnlineUpdate: b.lastOnlineUpdate,
      hidden: b.hidden,
      endTimeObjectCount: b.endTimeObjectCount,
      totalObjectCount: b.totalObjectCount,
      lastPlayed: b.lastPlayed,
      beatDivisor: b.beatDivisor,
      editorTimestamp: b.editorTimestamp,
    })),
  };
}

function deserialize(record: BeatmapSetRecord): BeatmapSetInfo {
  const set = new BeatmapSetInfo();

  set.id = record.id;
  set.onlineID = record.onlineID;
  set.dateAdded = record.dateAdded;
  set.dateSubmitted = record.dateSubmitted;
  set.dateRanked = record.dateRanked;
  set.status = record.status;
  set.deletePending = record.deletePending;
  set.hash = record.hash;
  set.isProtected = record.isProtected;
  set.files.push(...record.files.map(f => new RealmNamedFileUsage(new RealmFile(f.hash), f.filename)));

  for (const r of record.beatmaps) {
    const metadata = BeatmapMetadata.from({ ...r.metadata, userTags: [...r.metadata.userTags] });
    const beatmap = new BeatmapInfo(RulesetStore.getRuleset(r.ruleset) ?? new RulesetInfo(r.ruleset), new BeatmapDifficulty(r.difficulty), metadata);

    beatmap.id = r.id;
    beatmap.difficultyName = r.difficultyName;
    beatmap.userSettings.offset = r.userSettings.offset;
    beatmap.status = r.status;
    beatmap.onlineID = r.onlineID;
    beatmap.length = r.length;
    beatmap.bpm = r.bpm;
    beatmap.hash = r.hash;
    beatmap.starRating = r.starRating;
    beatmap.md5Hash = r.md5Hash;
    beatmap.onlineMD5Hash = r.onlineMD5Hash;
    beatmap.lastLocalUpdate = r.lastLocalUpdate;
    beatmap.lastOnlineUpdate = r.lastOnlineUpdate;
    beatmap.hidden = r.hidden;
    beatmap.endTimeObjectCount = r.endTimeObjectCount;
    beatmap.totalObjectCount = r.totalObjectCount;
    beatmap.lastPlayed = r.lastPlayed;
    beatmap.beatDivisor = r.beatDivisor;
    beatmap.editorTimestamp = r.editorTimestamp;
    beatmap.beatmapSet = set;

    set.beatmaps.push(beatmap);
  }

  return set;
}
