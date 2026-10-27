// Ported from osu.Game/Screens/IHandlePresentBeatmap.cs
// C# interfaces have no runtime type; a screen handles presenting by having presentBeatmap (isHandlePresentBeatmap).

import type { WorkingBeatmap } from '../beatmaps/WorkingBeatmap';
import type { RulesetInfo } from '../rulesets/RulesetInfo';

/** Denotes a screen which can handle beatmap / ruleset selection via local logic. This is used in the OsuGame.PresentBeatmap flow. */
export interface IHandlePresentBeatmap {
  /** Invoked with a requested beatmap / ruleset for selection. */
  presentBeatmap(beatmap: WorkingBeatmap, ruleset: RulesetInfo): void;
}

export const isHandlePresentBeatmap = (screen: unknown): screen is IHandlePresentBeatmap =>
  typeof (screen as Partial<IHandlePresentBeatmap> | null)?.presentBeatmap === 'function';
