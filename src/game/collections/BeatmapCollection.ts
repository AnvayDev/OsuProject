// Ported from osu.Game/Collections/BeatmapCollection.cs
// Stored in IndexedDB by RealmAccess ('collections'); a committed collection is never mutated (writes work on copies, see RealmAccess).

/** A collection of beatmaps grouped by a name. */
export class BeatmapCollection {
  id: string;

  /** The collection's name. */
  name: string;

  /** The MD5 hashes of all beatmaps contained by this collection. */
  readonly beatmapMD5Hashes: string[];

  /** The date when this collection was last modified. */
  lastModified: Date;

  constructor(name: string | null = null, beatmapMD5Hashes: string[] | null = null) {
    this.id = crypto.randomUUID();
    this.name = name ?? '';
    this.beatmapMD5Hashes = beatmapMD5Hashes ?? [];
    this.lastModified = new Date();
  }

  /** A copy (realm's Detach). */
  clone(): BeatmapCollection {
    const c = new BeatmapCollection(this.name, [...this.beatmapMD5Hashes]);
    c.id = this.id;
    c.lastModified = this.lastModified;
    return c;
  }
}

/** (IList<string>.Remove on BeatmapMD5Hashes: removes the first occurrence; whether it was found) */
export function removeFrom(list: string[], item: string): boolean {
  const index = list.indexOf(item);
  if (index < 0)
    return false;

  list.splice(index, 1);
  return true;
}

const realmStringCollator = new Intl.Collator('en', { caseFirst: 'upper' });

/**
 * The order of realm's OrderBy(c => c.Name). realm-core isn't in the reference sources: it sorts strings by a Latin collation table (letters
 * compared case-insensitively, uppercase first on a tie), approximated here with the English collation.
 */
export function compareCollectionNames(a: string, b: string): number {
  return realmStringCollator.compare(a, b);
}
