// Ported from osu.Framework/Graphics/Transforms/ITransformSequence.cs

export interface ITransformSequence {
  transformAborted(): void;

  transformCompleted(): void;
}
