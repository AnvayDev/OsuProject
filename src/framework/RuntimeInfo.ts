// Ported from osu.Framework/RuntimeInfo.cs (OS detection only).
// The browser reports the visitor's OS through navigator; iPadOS identifies as "MacIntel" but has a touch screen.

export enum Platform {
  Windows = 1,
  Linux = 2,
  macOS = 3,
  iOS = 4,
  Android = 5,
}

function detectOS(): Platform {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const platform = (nav as (Navigator & { userAgentData?: { platform: string } }) | undefined)?.userAgentData?.platform ?? nav?.platform ?? '';
  const ua = nav?.userAgent ?? '';

  if (/Win/i.test(platform)) return Platform.Windows;
  if (/iPhone|iPad|iPod/i.test(platform) || /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && (nav?.maxTouchPoints ?? 0) > 1)) return Platform.iOS;
  if (/Android/i.test(platform) || /Android/i.test(ua)) return Platform.Android;
  if (/Mac/i.test(platform)) return Platform.macOS;
  return Platform.Linux;
}

export const RuntimeInfo = {
  OS: detectOS(),

  get isUnix(): boolean { return this.OS !== Platform.Windows; },
  get isDesktop(): boolean { return this.OS === Platform.Linux || this.OS === Platform.macOS || this.OS === Platform.Windows; },
  get isMobile(): boolean { return this.OS === Platform.iOS || this.OS === Platform.Android; },
  get isApple(): boolean { return this.OS === Platform.iOS || this.OS === Platform.macOS; },
};
