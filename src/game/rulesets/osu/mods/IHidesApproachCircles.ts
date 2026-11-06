// Ported from osu.Game.Rulesets.Osu/Mods/IHidesApproachCircles.cs
// Implementations carry the hidesApproachCircles marker (instanceof uses Symbol.hasInstance).

/** Marker interface for any mod which completely hides the approach circles. Used for incompatibility with IRequiresApproachCircles. */
export abstract class IHidesApproachCircles {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as IHidesApproachCircles | null)?.hidesApproachCircles === true;
  }

  abstract readonly hidesApproachCircles: true;
}
