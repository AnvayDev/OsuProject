// Ported from osu.Game.Tests/Database/BeatmapImporterTests.cs (the cases that don't involve scores, directories, batch imports or the editor),
// run against fake-indexeddb with the ~10 s "virtual_quick" version of the Renatus test set (12 difficulties + background).

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeatmapImporter } from '@game/beatmaps/BeatmapImporter';
import { BeatmapDifficulty } from '@game/beatmaps/BeatmapDifficulty';
import { BeatmapInfo } from '@game/beatmaps/BeatmapInfo';
import { BeatmapMetadata } from '@game/beatmaps/BeatmapMetadata';
import { BeatmapOnlineStatus } from '@game/beatmaps/BeatmapOnlineStatus';
import { BeatmapSetInfo } from '@game/beatmaps/BeatmapSetInfo';
import { ImportTask } from '@game/database/ImportTask';
import { RealmAccess } from '@game/database/RealmAccess';
import { ProgressNotification, ProgressNotificationState } from '@game/overlays/notifications/ProgressNotification';
import { RulesetStore } from '@game/rulesets/RulesetInfo';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.resolve('tests/fixtures/osu-tests', name)));
const quickOsz = () => fixture('241526 Soleily - Renatus_virtual_quick.osz');

/** The archive's entries (without __MACOSX noise) as name → content, for rebuilding modified archives. */
function extract(osz: Uint8Array): Record<string, Uint8Array> {
  const files = unzipSync(osz);
  return Object.fromEntries(Object.entries(files).filter(([name]) => !name.includes('__MACOSX')));
}

const zip = (files: Zippable) => zipSync(files, { level: 9 });

let dbCounter = 0;
let dbName = '';
let realm: RealmAccess;
let importer: BeatmapImporter;

beforeEach(async () => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  dbName = `importer-test-${dbCounter++}`;
  realm = await RealmAccess.open(dbName);
  importer = new BeatmapImporter(realm);
});

afterEach(() => vi.restoreAllMocks());

async function loadOszIntoStore(data = quickOsz()): Promise<BeatmapSetInfo> {
  const importedSet = await importer.importTask(new ImportTask(data, 'renatus.osz'));

  expect(importedSet).not.toBeNull();

  ensureLoaded();

  return realm.findBeatmapSet(importedSet!.id)!;
}

function ensureLoaded(): void {
  const resultSets = realm.allBeatmapSets().filter(s => !s.deletePending && s.onlineID === 241526);

  // ensure we were stored to beatmap database backing...
  expect(resultSets.length, 'Incorrect result count found').toBe(1);
  expect(resultSets[0].beatmaps.length, 'Beatmap count was not correct').toBe(12);

  for (const b of resultSets[0].beatmaps)
    expect(b.beatmapSet).toBe(resultSets[0]);
}

const setCount = (includeDeletePending = false) => realm.allBeatmapSets().filter(s => includeDeletePending || !s.deletePending).length;
const beatmapCount = () => realm.allBeatmapSets().flatMap(s => s.beatmaps).length;

/** Files referenced by exactly one stored set (C#: RealmFile.BacklinksCount == 1). */
function singleReferencedFileCount(): number {
  const counts = new Map<string, number>();
  for (const f of realm.allBeatmapSets().flatMap(s => s.files))
    counts.set(f.file.hash, (counts.get(f.file.hash) ?? 0) + 1);
  return [...counts.values()].filter(c => c === 1).length;
}

const markDeleted = (set: BeatmapSetInfo) => realm.write(r => { r.edit(set).deletePending = true; });

describe('BeatmapImporter', () => {
  it('purges a deleted set and its files on the next startup', async () => {
    const imported = await loadOszIntoStore();
    expect(setCount(true)).toBe(1);

    await markDeleted(imported);
    expect(setCount()).toBe(0);
    expect(setCount(true)).toBe(1);

    realm.db.close();
    realm = await RealmAccess.open(dbName);

    expect(realm.allBeatmapSets()).toEqual([]);
    expect(await realm.db.count('files')).toBe(0);
  });

  it('links each difficulty to its .osu file', async () => {
    const beatmap = (await loadOszIntoStore()).beatmaps[0];

    expect(beatmap.file).not.toBeNull();
    expect(beatmap.file!.file.hash).toBe(beatmap.hash);
  });

  it('reuses the existing set when importing the same archive again', async () => {
    const imported = await loadOszIntoStore();
    const importedSecondTime = await loadOszIntoStore();

    // check the newly "imported" beatmap is actually just the restored previous import. since it matches hash.
    expect(importedSecondTime.id).toBe(imported.id);
    expect(importedSecondTime.beatmaps[0].id).toBe(imported.beatmaps[0].id);

    expect(setCount()).toBe(1);
    expect(singleReferencedFileCount()).toBe(13);
  });

  it('reuses the existing set for a re-zipped archive with the same contents', async () => {
    const imported = await loadOszIntoStore();

    const rezipped = zip(extract(quickOsz()));
    expect(rezipped.length).not.toBe(quickOsz().length);

    const importedSecondTime = await loadOszIntoStore(rezipped);

    expect(importedSecondTime.id).toBe(imported.id);
    expect(importedSecondTime.beatmaps[0].id).toBe(imported.beatmaps[0].id);
  });

  it('replaces the set when a hashed (.osu) file changed', async () => {
    const imported = await loadOszIntoStore();

    const files = extract(quickOsz());
    const firstOsu = Object.keys(files).find(f => f.endsWith('.osu'))!;
    files[firstOsu] = new Uint8Array([...files[firstOsu], ...new TextEncoder().encode('// changed\n')]);

    const importedSecondTime = await loadOszIntoStore(zip(files));

    // check the newly "imported" beatmap is not the original.
    expect(importedSecondTime.id).not.toBe(imported.id);
    expect(importedSecondTime.beatmaps[0].id).not.toBe(imported.beatmaps[0].id);

    // the old set shares its OnlineID, so PreImport disassociated and soft-deleted it.
    const old = realm.findBeatmapSet(imported.id)!;
    expect(old.deletePending).toBe(true);
    expect(old.onlineID).toBe(-1);
  });

  it('replaces the set when a non-hashed file changed', async () => {
    const imported = await loadOszIntoStore();

    const files = extract(quickOsz());
    files['machinetop_background.jpg'] = new Uint8Array([...files['machinetop_background.jpg'], 1, 2, 3]);

    const importedSecondTime = await loadOszIntoStore(zip(files));

    expect(importedSecondTime.id).not.toBe(imported.id);
    expect(importedSecondTime.beatmaps[0].id).not.toBe(imported.beatmaps[0].id);
  });

  it('replaces the set when a filename changed', async () => {
    const imported = await loadOszIntoStore();

    const files = extract(quickOsz());
    files['machinetop_background-changed.jpg'] = files['machinetop_background.jpg'];
    delete files['machinetop_background.jpg'];

    const importedSecondTime = await loadOszIntoStore(zip(files));

    expect(importedSecondTime.id).not.toBe(imported.id);
  });

  it('cancels the notification when an empty zip creates no model', async () => {
    const progressNotification = new ProgressNotification();

    const imported = await importer.importWithNotification(progressNotification, [new ImportTask(zip({}), '')]);

    expect(setCount(true)).toBe(0);
    expect(beatmapCount()).toBe(0);

    expect(imported).toEqual([]);
    expect(progressNotification.state).toBe(ProgressNotificationState.Cancelled);
    expect(progressNotification.text).toBe('Beatmap import failed! Check logs for more information.');
  });

  it('leaves the store untouched by an archive whose only .osu is empty', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await loadOszIntoStore();

    expect(setCount()).toBe(1);
    expect(beatmapCount()).toBe(12);
    expect(singleReferencedFileCount()).toBe(13);

    const files = Object.fromEntries(Object.entries(extract(quickOsz())).filter(([name]) => !name.endsWith('.osu')));
    files['broken.osu'] = new Uint8Array();

    expect(await importer.importTask(new ImportTask(zip(files), 'broken.osz'))).toBeNull();

    ensureLoaded();
    expect(setCount(true)).toBe(1);
    expect(beatmapCount()).toBe(12);
    expect(singleReferencedFileCount()).toBe(13);
    expect(errors.mock.calls.filter(c => String(c[0]).startsWith('[database]'))).toEqual([]);
  });

  it('restores a deleted set on re-import and bumps its date added', async () => {
    const imported = await loadOszIntoStore();

    await markDeleted(imported);
    expect(realm.findBeatmapSet(imported.id)!.deletePending).toBe(true);

    const originalAddedDate = imported.dateAdded;
    await new Promise(r => setTimeout(r, 5));

    const importedSecondTime = await loadOszIntoStore();

    expect(importedSecondTime.id).toBe(imported.id);
    expect(importedSecondTime.beatmaps[0].id).toBe(imported.beatmaps[0].id);
    expect(importedSecondTime.deletePending).toBe(false);
    expect(importedSecondTime.dateAdded.getTime()).toBeGreaterThan(originalAddedDate.getTime());
  });

  it('replaces the set when a re-import adds a difficulty', async () => {
    const files = extract(quickOsz());
    const missingOneBeatmap = { ...files };
    delete missingOneBeatmap[Object.keys(files).find(f => f.endsWith('.osu'))!];

    const firstImport = await importer.importTask(new ImportTask(zip(missingOneBeatmap), 'missing.osz'));
    expect(firstImport).not.toBeNull();

    expect(realm.allBeatmapSets().filter(s => !s.deletePending).length).toBe(1);
    expect(realm.allBeatmapSets().find(s => !s.deletePending)!.beatmaps.length).toBe(11);

    // Second import matches first but contains one extra .osu file.
    const secondImport = await importer.importTask(new ImportTask(quickOsz(), 'renatus.osz'));
    expect(secondImport).not.toBeNull();

    expect(beatmapCount()).toBe(23);
    expect(setCount(true)).toBe(2);

    expect(realm.allBeatmapSets().filter(s => !s.deletePending).length).toBe(1);
    expect(realm.allBeatmapSets().find(s => !s.deletePending)!.beatmaps.length).toBe(12);

    // check the newly "imported" beatmap is not the original.
    expect(secondImport!.id).not.toBe(firstImport!.id);
  });

  it('restores missing files when re-importing a deleted set', async () => {
    const imported = await loadOszIntoStore();

    await markDeleted(imported);

    // intentionally nuke all files
    await realm.db.clear('files');
    for (const f of imported.files)
      expect(await realm.files.exists(f.file.hash)).toBe(false);

    const importedSecondTime = await loadOszIntoStore();

    expect(importedSecondTime.id).toBe(imported.id);
    expect(importedSecondTime.deletePending).toBe(false);

    // check that the files now exist, even though they were deleted above.
    for (const f of importedSecondTime.files)
      expect(await realm.files.exists(f.file.hash)).toBe(true);
  });

  it('imports a new set when the deleted one lost its online IDs', async () => {
    const imported = await loadOszIntoStore();

    await realm.write(r => {
      for (const b of r.edit(imported).beatmaps)
        b.resetOnlineInfo();
    });

    await markDeleted(imported);

    const importedSecondTime = await loadOszIntoStore();

    // check the newly "imported" beatmap has been reimported due to mismatch (even though hashes matched)
    expect(importedSecondTime.id).not.toBe(imported.id);
    expect(importedSecondTime.beatmaps[0].id).not.toBe(imported.beatmaps[0].id);
  });

  it('resets duplicate beatmap online IDs', async () => {
    const metadata = BeatmapMetadata.from({ artist: 'SomeArtist', author: { username: 'SomeAuthor' } });
    const ruleset = RulesetStore.getRuleset(0)!;

    const toImport = new BeatmapSetInfo([
      Object.assign(new BeatmapInfo(ruleset, new BeatmapDifficulty(), metadata), { onlineID: 2 }),
      Object.assign(new BeatmapInfo(ruleset, new BeatmapDifficulty(), metadata), { onlineID: 2, status: BeatmapOnlineStatus.Loved }),
    ]);
    toImport.onlineID = 1;

    const imported = await importer.importModel(toImport);

    expect(imported.beatmaps[0].onlineID).toBe(-1);
    expect(imported.beatmaps[1].onlineID).toBe(-1);
  });

  it('skips a difficulty with duplicate content', async () => {
    const files = extract(quickOsz());
    files['duplicate.osu'] = files[Object.keys(files).find(f => f.endsWith('.osu'))!];

    await loadOszIntoStore(zip(files));
  });

  it('fails on filenames differing only in case', async () => {
    const files = extract(quickOsz());
    files['MACHINETOP_BACKGROUND.JPG'] = files['machinetop_background.jpg'];

    await expect(importer.importTask(new ImportTask(zip(files), 'renatus.osz'))).rejects.toThrow('Multiple files with the name "MACHINETOP_BACKGROUND.JPG" (ignoring case) are present. Only one of them can be kept.');
    expect(setCount(true)).toBe(0);
  });

  it('ignores .osu files in nested directories', async () => {
    const files = extract(quickOsz());
    const first = files[Object.keys(files).find(f => f.endsWith('.osu'))!];
    files['subdir/duplicate.osu'] = new Uint8Array([...first, ...new TextEncoder().encode('# adding a comment so that the hashes are different\n')]);

    await loadOszIntoStore(zip(files));
  });

  it('strips a common folder', async () => {
    const files = Object.fromEntries(Object.entries(extract(quickOsz())).map(([name, data]) => [`subfolder/${name}`, data]));

    const imported = await loadOszIntoStore(zip(files));

    expect(imported.files.some(f => f.filename.includes('subfolder')), 'Files contain common subfolder').toBe(false);
  });

  it('ignores a resource fork folder', async () => {
    const files: Zippable = Object.fromEntries(Object.entries(extract(quickOsz())).map(([name, data]) => [`actual_data/${name}`, data]));
    files['__MACOSX/.extracted'] = new TextEncoder().encode("adding content so that it's not empty\n");

    const imported = await loadOszIntoStore(zip(files));

    expect(imported.files.some(f => f.filename.includes('__MACOSX')), 'Files contain resource fork folder, which should be ignored').toBe(false);
    expect(imported.files.some(f => f.filename.includes('actual_data')), 'Files contain common subfolder').toBe(false);
  });

  it('decodes Shift-JIS filenames', async () => {
    const imported = await importer.importTask(new ImportTask(fixture('japanese-filename.osz'), 'japanese-filename.osz'));

    expect(imported!.files.map(f => f.filename)).toContain('見本.ogg');
  });

  it('keeps files whose names differ only by extension', async () => {
    const imported = await importer.importTask(new ImportTask(fixture('conflicting-filenames-beatmap.osz'), 'conflicting-filenames-beatmap.osz'));

    expect(imported!.files.map(f => f.filename).sort()).toEqual(['conflicting-filenames-beatmap.osu', 'spinner-osu.ogg', 'spinner-osu.png', 'track.ogg']);
    expect(imported!.getFile('SPINNER-OSU.PNG')).not.toBeNull();
  });

  it.each([
    ['circles.osz', '3c8b1fcc9434dbb29e2fb613d3b9eada9d7bb6c125ceb32396c3b53437280c83'],
    ['triangles.osz', 'a1556d0801b3a6b175dda32ef546f0ec812b400499f575c44fccbe9c67f9b1e5'],
    ['welcome.osz', '64e00d7022195959bfa3109d09c2e2276c8f12f486b91fcf6175583e973b48f2'],
    ['christmas2024.osz', '7e26183e72a496f672c3a21292e6b469fdecd084d31c259ea10a31df5b46cd77'],
  ])('imports the bundled %s with the hash the intro looks up', async (file, hash) => {
    const data = new Uint8Array(fs.readFileSync(path.resolve('_reference/osu-resources/osu.Game.Resources/Tracks', file)));

    const imported = await importer.importTask(new ImportTask(data, file));

    expect(imported!.hash).toBe(hash);
  });

  it('reports progress and completion in the notification', async () => {
    const notification = new ProgressNotification();

    const imported = await importer.importWithNotification(notification, [
      new ImportTask(quickOsz(), 'renatus.osz'),
      new ImportTask(fixture('../not-a-zip.osz'), 'not-a-zip.osz'),
    ]);

    expect(imported.length).toBe(1);
    expect(notification.text).toBe('Imported 2 of 2 beatmaps');
    expect(notification.progress).toBe(1);
    expect(notification.completionText).toBe('Imported 1 of 2 beatmaps.');
    expect(notification.state).toBe(ProgressNotificationState.Completed);

    const single = new ProgressNotification();
    importer.presentImport = () => {};
    await importer.importWithNotification(single, [new ImportTask(quickOsz(), 'renatus.osz')]);

    expect(single.completionText).toBe(`Imported ${imported[0].metadata.artist} - ${imported[0].metadata.title} (${imported[0].metadata.author.username})! Click to view.`);
    expect(single.completionClickAction).not.toBeNull();
  });

  it('persists sets in insertion order', async () => {
    const circles = new Uint8Array(fs.readFileSync(path.resolve('_reference/osu-resources/osu.Game.Resources/Tracks/circles.osz')));
    const triangles = new Uint8Array(fs.readFileSync(path.resolve('_reference/osu-resources/osu.Game.Resources/Tracks/triangles.osz')));

    const a = await importer.importTask(new ImportTask(triangles, 'triangles.osz'));
    const b = await importer.importTask(new ImportTask(circles, 'circles.osz'));
    const c = await loadOszIntoStore();

    realm.db.close();
    realm = await RealmAccess.open(dbName);

    expect(realm.allBeatmapSets().map(s => s.id)).toEqual([a!.id, b!.id, c.id]);

    const reloaded = realm.findBeatmapSet(c.id)!;
    expect(reloaded.beatmaps.map(x => x.difficultyName)).toEqual(c.beatmaps.map(x => x.difficultyName));
    expect(reloaded.beatmaps[0].metadata.title).toBe(c.beatmaps[0].metadata.title);
    expect(reloaded.beatmaps.map(x => x.ruleset)).toEqual(c.beatmaps.map(x => RulesetStore.getRuleset(x.ruleset.shortName)));
    expect(reloaded.beatmaps.every((x, i) => x.ruleset === c.beatmaps[i].ruleset)).toBe(true);
    expect(reloaded.dateAdded.getTime()).toBe(c.dateAdded.getTime());
  });
});
