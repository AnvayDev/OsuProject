import { describe, expect, it } from 'vitest';
import { humanize } from '@game/utils/HumanizerUtils';

const base = new Date(Date.UTC(2026, 9, 26, 12, 0, 0));
const ago = (ms: number) => new Date(base.getTime() - ms);

describe('HumanizerUtils.humanize (Humanizer DefaultHumanize, English)', () => {
  it.each([
    [100, 'now'],
    [1_000, 'one second ago'],
    [30_000, '30 seconds ago'],
    [90_000, 'a minute ago'],
    [5 * 60_000, '5 minutes ago'],
    [70 * 60_000, 'an hour ago'],
    [5 * 3_600_000, '5 hours ago'],
    [30 * 3_600_000, 'yesterday'],
    [10 * 86_400_000, '10 days ago'],
    [100 * 86_400_000, '3 months ago'],
    [400 * 86_400_000, 'one year ago'],
    [11 * 365.25 * 86_400_000, '11 years ago'],
  ])('%d ms ago → %s', (ms, expected) => {
    expect(humanize(ago(ms), base)).toBe(expected);
  });

  it('formats future dates', () => {
    expect(humanize(new Date(base.getTime() + 3 * 86_400_000), base)).toBe('3 days from now');
    expect(humanize(new Date(base.getTime() + 30 * 3_600_000), base)).toBe('tomorrow');
  });
});
