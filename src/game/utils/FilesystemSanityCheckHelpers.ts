// Ported from osu.Game/Utils/FilesystemSanityCheckHelpers.cs (IncursPathTraversalRisk). Path.IsPathRooted follows the user's (macOS) client: a
// leading '/'.

export const FilesystemSanityCheckHelpers = {
  /** Returns whether path is potentially susceptible to path traversal style attacks. */
  incursPathTraversalRisk(path: string): boolean {
    return path.includes('../') || path.includes('..\\') || path.startsWith('/');
  },
};
