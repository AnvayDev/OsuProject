// Ported from osu.Game/Rulesets/Mods/ICreateReplayData.cs
// Replays aren't ported: implementations carry the isCreateReplayData marker (instanceof uses Symbol.hasInstance).

/** A mod which creates full replay data and is to be used to fully automate gameplay. */
export abstract class ICreateReplayData {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as ICreateReplayData | null)?.isCreateReplayData === true;
  }

  abstract readonly isCreateReplayData: true;
}
