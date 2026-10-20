// Ported from osu.Framework/Input/IHandleGlobalKeyboardInput.cs
// C# marker interface; TS needs a runtime-checkable member.

/** Denotes that this class handles keyboard input globally. */
export interface IHandleGlobalKeyboardInput {
  readonly handlesGlobalKeyboardInput: true;
}

export const isHandleGlobalKeyboardInput = (d: object): d is IHandleGlobalKeyboardInput =>
  (d as Partial<IHandleGlobalKeyboardInput>).handlesGlobalKeyboardInput === true;
