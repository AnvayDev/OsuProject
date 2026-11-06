// Ported from osu.Game/Collections/CollectionFilterMenuItem.cs

import type { Live } from '../database/Live';
import type { BeatmapCollection } from './BeatmapCollection';

/** A BeatmapCollection filter. */
export class CollectionFilterMenuItem {
  /** The collection to filter beatmaps from. May be null to not filter by collection (include all beatmaps). */
  readonly collection: Live<BeatmapCollection> | null = null;

  /** The name of the collection. */
  readonly collectionName: string;

  /** (C# has a public constructor taking a collection and a protected one taking a name.) */
  constructor(collectionOrName: Live<BeatmapCollection> | string) {
    if (typeof collectionOrName === 'string')
      this.collectionName = collectionOrName;
    else {
      this.collectionName = collectionOrName.performRead(c => c.name);
      this.collection = collectionOrName;
    }
  }

  /** (IEquatable<CollectionFilterMenuItem>) */
  equals(other: CollectionFilterMenuItem | null): boolean {
    if (other == null) return false;
    if (this === other) return true;

    if (this.collection === null) return false;

    return this.collection.id === other.collection?.id;
  }
}

export class AllBeatmapsCollectionFilterMenuItem extends CollectionFilterMenuItem {
  constructor() {
    super('All beatmaps');
  }

  override equals(other: CollectionFilterMenuItem | null): boolean {
    return other instanceof AllBeatmapsCollectionFilterMenuItem;
  }
}

export class ManageCollectionsFilterMenuItem extends CollectionFilterMenuItem {
  constructor() {
    super('Manage collections...');
  }

  override equals(other: CollectionFilterMenuItem | null): boolean {
    return other instanceof ManageCollectionsFilterMenuItem;
  }
}
