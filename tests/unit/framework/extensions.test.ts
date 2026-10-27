import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getCommonPrefix } from '@fw/extensions/EnumerableExtensions';
import { computeMD5Hash, computeSHA2Hash, toStandardisedPath } from '@fw/extensions/ExtensionMethods';
import { excludeSystemFileNames } from '@fw/io/ResourceStore';

describe('ExtensionMethods', () => {
  it('computes MD5 like System.Security.Cryptography.MD5 (lower-case hex)', () => {
    expect(computeMD5Hash('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(computeMD5Hash('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');

    for (const length of [1, 55, 56, 63, 64, 65, 1000, 100_003]) {
      const data = new Uint8Array(randomBytes(length));
      expect(computeMD5Hash(data)).toBe(createHash('md5').update(data).digest('hex'));
    }
  });

  it('computes SHA-256 (lower-case hex)', async () => {
    const data = new Uint8Array(randomBytes(4097));
    expect(await computeSHA2Hash(data)).toBe(createHash('sha256').update(data).digest('hex'));
    expect(await computeSHA2Hash('virtual')).toBe(createHash('sha256').update('virtual', 'utf8').digest('hex'));
  });

  it('standardises paths', () => {
    expect(toStandardisedPath('a\\b\\c.osu')).toBe('a/b/c.osu');
  });
});

describe('EnumerableExtensions.getCommonPrefix', () => {
  it('returns the longest common prefix', () => {
    expect(getCommonPrefix(['abc', 'abd'])).toBe('ab');
    expect(getCommonPrefix(['Song/audio.mp3', 'Song/abc.osu'])).toBe('Song/a');
    expect(getCommonPrefix(['a', 'b'])).toBe('');
    expect(getCommonPrefix(['only'])).toBe('only');
    expect(getCommonPrefix([])).toBe('');
  });
});

describe('ResourceStoreExtensions.excludeSystemFileNames', () => {
  it('drops OS noise anywhere in the path, ignoring case', () => {
    expect(excludeSystemFileNames(['a.osu', '__MACOSX/._a.osu', 'x/.ds_store', 'Thumbs.db', 'my__macosx_bg.png'])).toEqual(['a.osu']);
  });
});
