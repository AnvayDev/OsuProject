// Ported from osu.Game/Beatmaps/BeatmapOnlineStatus.cs

export enum BeatmapOnlineStatus {
  /** This is a special status given when local changes are made via the editor. Once in this state, online status changes should be ignored unless the beatmap is reverted or submitted. */
  LocallyModified = -4,

  /** This is a special status given when a beatmap is not found online, but present locally. */
  None = -3,

  Graveyard = -2,
  WIP = -1,
  Pending = 0,
  Ranked = 1,
  Approved = 2,
  Qualified = 3,
  Loved = 4,
}

/** The enum's [LocalisableDescription] (GetLocalisableDescription()). */
export function getOnlineStatusDescription(status: BeatmapOnlineStatus): string {
  switch (status) {
    case BeatmapOnlineStatus.LocallyModified: return 'Local';
    case BeatmapOnlineStatus.None: return 'Unknown';
    case BeatmapOnlineStatus.Graveyard: return 'Graveyard';
    case BeatmapOnlineStatus.WIP: return 'WIP';
    case BeatmapOnlineStatus.Pending: return 'Pending';
    case BeatmapOnlineStatus.Ranked: return 'Ranked';
    case BeatmapOnlineStatus.Approved: return 'Approved';
    case BeatmapOnlineStatus.Qualified: return 'Qualified';
    case BeatmapOnlineStatus.Loved: return 'Loved';
  }
}
