// Ported from osu.Game/Models/RealmFile.cs and RealmNamedFileUsage.cs

/** A file stored by content hash (SHA-256). */
export class RealmFile {
  constructor(public hash = '') {}
}

/** A usage of a RealmFile under a filename (e.g. "audio.mp3") within a model such as a beatmap set. */
export class RealmNamedFileUsage {
  constructor(public file: RealmFile, public filename: string) {}
}
