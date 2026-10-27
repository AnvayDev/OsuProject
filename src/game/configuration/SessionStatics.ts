// Ported from osu.Game/Configuration/SessionStatics.cs
// Static is string-valued like the other config lookups. The score, activity and tag statics hold online/gameplay types this port doesn't
// have; their defaults are null as in C#.

import { RuntimeInfo } from '@fw/RuntimeInfo';
import type { APISeasonalBackgrounds } from '../online/api/requests/responses/APISeasonalBackgrounds';
import { InMemoryConfigManager } from './InMemoryConfigManager';

/** Stores global per-session statics. These will not be stored after exiting the game. */
export class SessionStatics extends InMemoryConfigManager<Static> {
  protected override initialiseDefaults(): void {
    this.setDefaultBool(Static.LoginOverlayDisplayed, false);
    this.setDefaultBool(Static.MutedAudioNotificationShownOnce, false);
    this.setDefaultBool(Static.LowBatteryNotificationShownOnce, false);
    this.setDefaultBool(Static.FeaturedArtistDisclaimerShownOnce, false);
    this.setDefault<number | null>(Static.LastHoverSoundPlaybackTime, null);
    this.setDefault<number | null>(Static.LastModSelectPanelSamplePlaybackTime, null);
    this.setDefault<number | null>(Static.LastRankChangeSamplePlaybackTime, null);
    this.setDefault<APISeasonalBackgrounds | null>(Static.SeasonalBackgrounds, null);
    this.setDefaultBool(Static.TouchInputActive, RuntimeInfo.isMobile);
    this.setDefault<unknown>(Static.LastLocalUserScore, null);
    this.setDefault<unknown>(Static.LastAppliedOffsetScore, null);
    this.setDefault<unknown>(Static.UserOnlineActivity, null);
    this.setDefault<unknown>(Static.AllBeatmapTags, null);
  }

  /** Revert statics to their defaults after being idle for appropriate amount of time. This only affects a subset of statics which make sense to reset when a user is away. */
  resetAfterInactivity(): void {
    this.getBindable<boolean>(Static.LoginOverlayDisplayed).setDefault();
    this.getBindable<boolean>(Static.MutedAudioNotificationShownOnce).setDefault();
    this.getBindable<boolean>(Static.LowBatteryNotificationShownOnce).setDefault();
  }
}

export enum Static {
  LoginOverlayDisplayed = 'LoginOverlayDisplayed',
  MutedAudioNotificationShownOnce = 'MutedAudioNotificationShownOnce',
  LowBatteryNotificationShownOnce = 'LowBatteryNotificationShownOnce',
  FeaturedArtistDisclaimerShownOnce = 'FeaturedArtistDisclaimerShownOnce',

  /** Info about seasonal backgrounds available fetched from API - see APISeasonalBackgrounds. Value under this lookup can be null if there are no backgrounds available (or API is not reachable). */
  SeasonalBackgrounds = 'SeasonalBackgrounds',

  /** The last playback time in milliseconds of a hover sample (from HoverSounds). Used to debounce hover sounds game-wide to avoid volume saturation, especially in scrolling views with many UI controls like SettingsOverlay. */
  LastHoverSoundPlaybackTime = 'LastHoverSoundPlaybackTime',

  /** The last playback time in milliseconds of an on/off sample (from ModSelectPanel). Used to debounce ModSelectPanel samples game-wide to avoid volume saturation, esepcially in activating mod presets with many mods. */
  LastModSelectPanelSamplePlaybackTime = 'LastModSelectPanelSamplePlaybackTime',

  /** The last playback time in milliseconds of a rank up/down sample (in RankChangeSamples). Used to debounce rank change sounds game-wide. */
  LastRankChangeSamplePlaybackTime = 'LastRankChangeSamplePlaybackTime',

  /** Whether the last positional input received was a touch input. Used in touchscreen detection scenarios (SongSelectTouchInputDetector). */
  TouchInputActive = 'TouchInputActive',

  /** Contains the local user's last score (can be completed or aborted) after exiting Player. Mainly used for global offset adjustment. */
  LastLocalUserScore = 'LastLocalUserScore',

  /** Retains the local user's last applied offset score. Mainly used for global offset adjustment. */
  LastAppliedOffsetScore = 'LastAppliedOffsetScore',

  /** Whether the intro animation for the daily challenge screen has been played once. This is reset when a new challenge is up. */
  DailyChallengeIntroPlayed = 'DailyChallengeIntroPlayed',

  /** The activity for the current user to broadcast to other players. */
  UserOnlineActivity = 'UserOnlineActivity',

  /** A cache of all beatmap tags fetched from the server. */
  AllBeatmapTags = 'AllBeatmapTags',
}
