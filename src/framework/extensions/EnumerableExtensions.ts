// Ported from osu.Framework/Extensions/IEnumerableExtensions/EnumerableExtensions.cs (GetCommonPrefix).

/**
 * Returns the most common prefix of every string in this collection, or an empty string if no common prefix could be found.
 * Example: "ab" == ["abc", "abd"].getCommonPrefix()
 */
export function getCommonPrefix(collection: Iterable<string>): string {
  let prefix = '';

  for (const str of collection) {
    if (prefix.length === 0) { // the first string
      prefix = str;
      continue;
    }

    while (prefix.length > 0) {
      if (str.startsWith(prefix))
        break;
      else
        prefix = prefix.slice(0, -1);
    }

    if (prefix.length === 0)
      return '';
  }

  return prefix;
}
