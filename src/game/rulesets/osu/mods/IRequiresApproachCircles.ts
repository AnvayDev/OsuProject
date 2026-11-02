// Ported from osu.Game.Rulesets.Osu/Mods/IRequiresApproachCircles.cs
// Implementations carry the requiresApproachCircles marker (instanceof uses Symbol.hasInstance).

/** Marker interface for any mod which requires the approach circles to be visible. Used for incompatibility with IHidesApproachCircles. */
export abstract class IRequiresApproachCircles {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as IRequiresApproachCircles | null)?.requiresApproachCircles === true;
  }

  abstract readonly requiresApproachCircles: true;
}
