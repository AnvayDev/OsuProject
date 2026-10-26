# Assets & formats: beatmap import, storage, decoding, download

Source: osu! 2026.1005.0-lazer (`_reference/osu`), osu-framework 2026.921.1. Paths below are relative to `osu/osu.Game/` unless noted.

## 0. TL;DR

- A beatmap set is a `.osz` (zip). Import reads every file and stores each by **SHA-256 of its content** (deduplicated). The set records
  `{shortened filename → file hash}` usages. Set `Hash` = SHA-256 of the **concatenation of all `.osu` files, ordered by filename**.
- Each top-level `.osu` file becomes a `BeatmapInfo`. It gets `Hash` = SHA-256 and `MD5Hash` = MD5 of the file, plus decoded difficulty,
  metadata, `EndTimeObjectCount` and `TotalObjectCount`. Then `BeatmapUpdater.Process` computes `StarRating` (ruleset difficulty calculator),
  `Length` (first object start → last object end), `BPM` (60000 / most common beat length) and the object counts.
- Web: IndexedDB replaces Realm and the on-disk file store. Two object stores are needed: `files` (hash → Blob) and `beatmapSets` (ID →
  serialised `BeatmapSetInfo`, beatmaps embedded). Zip reading uses `fflate`, SHA-256 uses `crypto.subtle`, and MD5 is a local implementation.
  Backgrounds and tracks are served as Blob URLs from `files`.
- The bundled intro sets `Tracks/{circles,triangles,welcome}.osz` (osu-resources) are imported on first run and marked `Protected`
  (`Screens/Menu/IntroScreen.cs:125-170`).
- Downloads: **osu.direct** (CORS verified 2026-10-20): `GET https://osu.direct/api/d/{setId}` → 302 to S3 storage with CORS. Search:
  `GET https://osu.direct/api/v2/search?query=…&amount=…`, returning osu! API v2 `APIBeatmapSet` JSON. Lookup: `/api/v2/s/{setId}`.

## 1. Archive handling (`Database/RealmArchiveModelImporter.cs`)

- `getShortenedFilenames` (:520-545): strip the archive's common prefix, but only if it ends with `/` or `\`. Standardise the path (`\` → `/`).
  Throw if two names collide case-insensitively. Reject path-traversal names (`FilesystemSanityCheckHelpers.IncursPathTraversalRisk`).
- `ImportModel` (:326-450), non-batch path:
  1. Store every archive file in the file store (dedupe by content hash) → `RealmNamedFileUsage(file, shortenedName)`.
  2. `item.Hash = ComputeHash(item)` (:484-500): SHA-256 over the concatenated bytes of all files ending in `HashableFileTypes`
     (`.osu` for beatmaps), **ordered by filename**. If there are none, keep the existing hash.
  3. `Populate` (BeatmapImporter, see §2).
  4. `CheckForExisting` (:585): any set with the same `Hash`, preferring non-deleted ones. If `CanReuseExisting` holds (same file hashes and
     filenames in filename order, plus `BeatmapImporter.CanReuseExisting`: same set `OnlineID` and same sorted beatmap `OnlineID`s), undelete
     the existing set and return it. Otherwise mark the existing set `DeletePending`.
  5. `PreImport`: any other set with the same `OnlineID > 0` is marked `DeletePending`, gets `OnlineID = -1`, and its beatmaps get
     `ResetOnlineInfo()`.
  6. Add the set. `PostImport` → `ProcessBeatmap` (BeatmapUpdater).
- `HandledExtensions` = `.osz`, `.olz`.

## 2. BeatmapImporter (`Beatmaps/BeatmapImporter.cs`)

- `CreateModel` (:306-334): the first `.osu` (any depth) is decoded only for `BeatmapSetInfo.OnlineID` (`BeatmapSetID`, else -1). If there is
  no `.osu`, or the file is empty → skip silently.
- `createBeatmapDifficulties` (:366-457): only **top-level** `.osu` files (no `/` in the shortened name). For each one:
  - skip empty files;
  - decode;
  - `hash = SHA-256(file)`; skip duplicate content within the set;
  - skip if the ruleset isn't available (web: only rulesets 0–3 exist; all are "available" for metadata);
  - copy difficulty (DrainRate, CircleSize, OverallDifficulty, ApproachRate, SliderMultiplier, SliderTickRate);
  - copy metadata (Title, TitleUnicode, Artist, ArtistUnicode, Author{OnlineID, Username}, Source, Tags, PreviewTime, AudioFile,
    BackgroundFile);
  - set `DifficultyName`, `OnlineID`, `BeatDivisor`, `MD5Hash = MD5(file)`, `EndTimeObjectCount` = objects with duration,
    `TotalObjectCount`.

  If none remain → throw "No valid beatmap files found in the beatmap archive."
- `Populate` (:167-198): sets `DateAdded = now`, links beatmaps to the set and validates online IDs (`validateOnlineIds`: duplicate IDs
  within the set, or IDs already used by another set not being reused → `ResetOnlineInfo()` for all). The following "all online IDs lost →
  set `OnlineID = -1`" branch is dead code (`hadOnlineIDs` is computed after the reset), so the set keeps its `OnlineID`.
- `UndeleteForReuse` also resets `DateAdded = now` when undeleting.
- Import notification texts (`RealmArchiveModelImporter.cs:101-198`), shown by the notification overlay: "Beatmap import is initialising...",
  "Imported {n} of {total} beatmaps", on failure "Beatmap import failed! Check logs for more information." (state Cancelled), on success
  "Imported {n} of {total} beatmaps." / "Imported {n} beatmaps!" / "Imported {artist} - {title} ({creator})!", plus " Click to view." when
  imports can be presented. A failed task doesn't advance the count; an aborted one (no `.osu`) does.
- Port status: done and tested (`src/game/database/*`, `src/game/beatmaps/BeatmapImporter.ts`, `src/game/io/archives/*`; tests port
  `BeatmapImporterTests` with the `virtual_quick` Renatus set, plus the intro-set hashes and a Shift-JIS archive). Not ported: the batch fast
  path (≥10 archives), `ImportAsUpdate`, score re-attachment, directory/stable imports, deleting the source file, pausing during gameplay.
  The zip reader parses the central directory itself (fflate inflates): central-directory order, Shift-JIS names unless the UTF-8 flag or an
  Info-ZIP Unicode path field is set, stored and deflate entries only. Filename sorting for the set hash uses `Intl.Collator('en-US')` as the
  closest match to .NET's culture-sensitive default comparer; this only matters for sets with several `.osu` files.

## 3. Decoding `.osu` (`Beatmaps/Formats/LegacyDecoder.cs`, `LegacyBeatmapDecoder.cs`)

- Magic `osu file format v{N}` selects `LegacyBeatmapDecoder(N)`; otherwise the fallback is the latest version (14). Leading blank lines
  are skipped.
- Lines: skip blank lines and lines starting with `//`. Strip trailing `// …` comments except in `[Metadata]` (index > 0 only). Trim the end.
  `[Section]` switches section; unknown sections are logged and ignored. Each line's parse error is logged and the line skipped.
  `SplitKeyVal` splits on the first `:` and trims both sides.
- Format version < 5: every time (`PreviewTime` unless -1, breaks, timing points, hit objects) gets **+24 ms** (`EARLY_VERSION_TIMING_OFFSET`).
- `[General]`: AudioFilename (standardised path), AudioLeadIn, PreviewTime, SampleSet, SampleVolume, StackLeniency (default 0.7), Mode
  (ruleset 0–3), LetterboxInBreaks, SpecialStyle, WidescreenStoryboard, EpilepsyWarning, SamplesMatchPlaybackRate, Countdown,
  CountdownOffset.
- `[Metadata]`: Title, TitleUnicode, Artist, ArtistUnicode, Creator → Author.Username, Version → DifficultyName, Source, Tags,
  BeatmapID → OnlineID, BeatmapSetID → set OnlineID.
- `[Difficulty]`: HPDrainRate, CircleSize, OverallDifficulty (also sets ApproachRate until an ApproachRate line is seen), ApproachRate,
  SliderMultiplier, SliderTickRate. Clamped after parsing: DrainRate/OD/AR to [0, 10]; CS to [0, 10] (mania: [1, 18]); SliderMultiplier to
  [0.4, 3.6]; SliderTickRate to [0.5, 8].
- `[Events]`: `0,…,"bg"` → BackgroundFile. `1`/`Video` → video, unless the extension isn't a video extension, in which case it's the
  background. `Sprite` → background only if none is set yet. `2`/`Break` → BreakPeriod(start, max(start, end)). Filenames go through
  `CleanFilename` (`\\` → `\`, trim `"`, standardise).
- `[TimingPoints]` `time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects`: uninherited → TimingControlPoint. Every line also
  yields a DifficultyControlPoint (SV = 100/-beatLength for negative beatLength, GenerateTicks = !NaN), an EffectControlPoint (kiai = effects
  & 1, omit first bar line = effects & 8; scroll speed for taiko/mania) and a LegacySampleControlPoint. Points at the same time are buffered:
  non-timing changes override timing-point ones (`flushPendingPoints`).
- `[HitObjects]` → `ConvertHitObjectParser` (`Rulesets/Objects/Legacy/ConvertHitObjectParser.cs`). After parsing, objects are stably sorted by
  start time, breaks force new combos, then `ApplyDefaults` and samples are applied.
- `[Colours]`: `Combo1..8` → combo colours; other keys → custom colours. `Beatmap` implements neither colour interface, so the beatmap decoder only
  validates these lines; the colours are read by `LegacySkinDecoder` (beatmap skin).
- Port status: done and tested (`src/game/beatmaps/{Beatmap,formats/*}.ts`, `src/game/rulesets/objects/**`; tests port
  `LegacyBeatmapDecoderTest`/`ParsingTest` with osu!'s own resources in `tests/fixtures/osu-tests/`, and every bundled `.osz` decodes without
  a failed line). Not ported: `JsonBeatmapDecoder`, `LegacyStoryboardDecoder`, `LegacyDifficultyCalculatorBeatmapDecoder`, UTF-32 byte
  order marks (UTF-8/UTF-16 are handled like `StreamReader`).

## 4. Post-import processing (`Beatmaps/BeatmapUpdater.cs`, `BeatmapInfoExtensions.cs:18-24`, `IBeatmap.cs:157-210`, `Beatmap.cs:80-120`)

- `StarRating = ruleset.CreateDifficultyCalculator(working).Calculate().StarRating` (no mods). **Web:** no difficulty calculator is ported
  (no gameplay). The star rating comes from the mirror lookup (osu-web `difficulty_rating` matched by MD5): measured on 2026-10-20 it matched
  the real client's song select on all 9 difficulties checked (sets 16722 and 268431, `docs/reference/real/04-*`, `05-*`), while
  `osu-standard-stable` 5.0.1 matched none (errors −0.17 to +0.13). A beatmap with fewer than two hit objects gets 0 (what the calculators
  give it, e.g. the intro sets); any other beatmap keeps −1 ("-" in the UI) until looked up or when the mirror doesn't know it.
- `Length = CalculatePlayableLength(HitObjects)` = max(end time) − first object's start time (0 if no objects).
- `BPM = 60000 / GetMostCommonBeatLength()`. Each timing point's duration runs to the next point (the first starts at 0, the last ends at
  the last object's end time); durations are grouped by beat length rounded to 1e-3 ms; the result is the longest group, clamped to the raw
  [min, max] beat length. With no timing points the default is 60000/60 = 1000 ms (60 BPM).
- `EndTimeObjectCount` / `TotalObjectCount` are taken again from the decoded (unconverted) beatmap.
- Online metadata lookup (`BeatmapUpdaterMetadataLookup`: status, dates, online IDs) is replaced by the mirror lookup (§7). It is optional;
  without it, `Status` = None ("local").
- `Process` runs inside the import transaction (`PostImport`), so a set appears with its final values; the carousel ignores later changes
  that only touch star rating, length or BPM (`BeatmapCarousel.cs:423-474`). The web importer runs it before its write for the same reason.
- Port status: `BeatmapUpdater.process` (statistics + the <2-objects rule) and the metadata/star-rating lookup (`BeatmapUpdaterMetadataLookup`
  with `MirrorBeatmapMetadataSource`: `/api/v2/md5/{md5}` then `/api/v2/s/{setId}` for status and dates, through the shared rate limiter
  of §7) done and tested. Sets imported before this keep their values (BackgroundDataStoreProcessor isn't ported).

## 5. Bundled sets (`Screens/Menu/IntroScreen.cs`, `IntroCircles/Triangles/Welcome.cs`)

| Intro | File | Expected set `Hash` |
|---|---|---|
| Circles | `Tracks/circles.osz` | `3c8b1fcc9434dbb29e2fb613d3b9eada9d7bb6c125ceb32396c3b53437280c83` |
| Triangles | `Tracks/triangles.osz` | `a1556d0801b3a6b175dda32ef546f0ec812b400499f575c44fccbe9c67f9b1e5` |
| Welcome | `Tracks/welcome.osz` | `64e00d7022195959bfa3109d09c2e2276c8f12f486b91fcf6175583e973b48f2` |

If the protected set with the expected hash is missing, the intro imports it and sets `Protected = true`. The intro's `beatmap hash`
check is a strong end-to-end test of the importer's set-hash computation (§1, step 2).

## 6. Web storage (IndexedDB, replacing Realm + `files/` store)

- Database `osu` (`src/game/database/RealmAccess.ts`):
  - `files`: key = SHA-256 hex, value = ArrayBuffer (Blobs don't survive fake-indexeddb in tests; the data is the same). `RealmFileStore.add`
    dedupes by hash. A file's storage path is its hash.
  - `beatmapSets`: key = `ID` (GUID string). The value holds the set fields, `files: [{filename, hash}]`, embedded `beatmaps[]` (each with
    `difficulty`, `metadata`, ruleset short name) and an insertion sequence.
- osu! queries realm synchronously (`Find`, `All`, `QueryBeatmapSet`), so all sets are mirrored in memory **in insertion order** (realm's
  unsorted order, relied on by `MusicController` and the intro's random pick). A write edits copies and swaps them in after IndexedDB
  commits: a failed write changes nothing (realm's rollback), and readers keep the objects they had (realm's detached copies; the carousel's
  change detection compares old and new objects). `registerForNotifications(query, callback)` reports realm-style change sets (deleted
  indices in the old results; inserted and modified ones in the new), which the carousel's `RealmDetachedBeatmapStore` will consume.
- Startup (`RealmAccess.cleanupPendingDeletions`): sets pending deletion are removed, then files no set references.
- `WorkingBeatmap` (`WorkingBeatmapCache`, cached per beatmap ID via weak references; `refetch` invalidates first):
  - `Beatmap`: the `.osu` is decoded asynchronously (`loadBeatmapAsync()`; the C# getter blocks), checked against `MD5Hash`;
  - background: `BackgroundFile` → `LargeTextureStore` (object URL, scale adjust 2, cached by hash, failures too). The panel crop
    (512:80 strip) isn't reproduced: panels fill with the background and are always at least that wide;
  - track: `AudioFile` → `TrackWeb` from `TrackStore.getSync` (the set's file list says whether it exists; the data arrives afterwards),
    else a virtual track of `Length + 1000` ms. `prepareTrackForPreview` queues its length-dependent part on the track (C# blocks until
    the track has loaded). `DummyWorkingBeatmap`: "no beatmap selected!", `Backgrounds/bg2`, 1000 ms virtual track, ruleset `dummy`.

## 7. Downloads and online metadata (web replacement for `BeatmapModelDownloader` + osu! API)

- osu.direct (verified with `Origin:` headers on 2026-10-20):
  - `GET /api/d/{setId}` → 302 to `storage.osu.direct/...osz?X-Amz-…`. Both send `Access-Control-Allow-Origin: <origin>`.
  - `GET /api/v2/search?query=&amount=` → `APIBeatmapSet[]` (osu! API v2 shape: covers, beatmaps[], status, ranked_date, …).
  - `GET /api/v2/s/{setId}` → `APIBeatmapSet`.
- Fallback mirror: nerinyan (`api.nerinyan.moe/d/{id}` → `dl.nerinyan.moe`, `Access-Control-Allow-Origin: *`). Search returned 530 at the time.
- catboy.best answered 403 from the build environment; not used.
- Downloaded archives go through the normal import (§1–4). Online status/dates populate `BeatmapSetInfo.Status`, `DateRanked` and
  `DateSubmitted`, as the metadata lookup does.
- Limits (response headers, 2026-10-26): `ratelimit-limit: 120` per minute and `ratelimit-burst-limit: 25` per 5 s, shared by every
  endpoint; `/api/d` also reports a download budget (`x-download-budget-limit: 200` downloads, 8 GiB). Every mirror request goes through
  one sliding-window limiter (`online/api/MirrorAccess.ts`) that keeps within both rate limits.
- 429 responses carry no CORS headers, so page code sees a bare network failure. The browser still intermittently gets a 429
  (`retry-after: 10`) from `/api/d` even when the limiter is satisfied and the reported counters have room; curl with identical headers
  never reproduced it. As in osu!, a failed download isn't retried (the tracker returns to NotDownloaded, the user can start it again).
- Port status: `ModelDownloader`/`BeatmapModelDownloader`, `ArchiveDownloadRequest`/`DownloadBeatmapSetRequest` (fetch with progress from
  the streamed body, the 60 s inactivity timeout, cancel), `DownloadTracker`/`BeatmapDownloadTracker` done and tested; verified in the
  browser (8 MB set downloaded with progress and imported). Not ported: download notifications (no NotificationOverlay yet),
  `DownloadAsUpdate`.

## 8. Open questions

1. Which beatmaps ship with the portfolio beyond the three intro sets: a curated `.osz` list served with the site, imported on first run like
   the intro sets? It is a content decision for the site owner. Default: intro sets only, plus drag-and-drop import and mirror download.
2. Star ratings come from the mirror (§4), which follows live osu-web: if osu-web deploys a newer difficulty algorithm, values drift from the
   pinned client. Converted star ratings (the toolbar ruleset switch recomputes them in osu!) are not available from the mirror; the
   song-select port has to choose between showing the native value or not offering the switch.
