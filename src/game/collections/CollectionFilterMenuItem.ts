// Ported from osu.Game/Collections/CollectionFilterMenuItem.cs
// Collections (BeatmapCollection in realm) aren't ported, so only the collection-less items exist: "All beatmaps" and "Manage collections...".

/** A BeatmapCollection filter. */
export class CollectionFilterMenuItem {
  /** The collection to filter beatmaps from. Always null: collections aren't ported. */
  readonly collection = null;

  protected constructor(readonly collectionName: string) {}
}

export class AllBeatmapsCollectionFilterMenuItem extends CollectionFilterMenuItem {
  constructor() {
    super('All beatmaps');
  }
}

export class ManageCollectionsFilterMenuItem extends CollectionFilterMenuItem {
  constructor() {
    super('Manage collections...');
  }
}
