// Ported from osu.Game/Configuration/OsuConfigManager.cs
// Only the defaults read by ported code are set (in the original order); add the others alongside the code that first reads them.
// IGameplaySettings and the tracked (on-screen display) settings are not ported. OsuSetting is string-valued so stored keys are the names, as in C#;
// the obsolete MenuParallax key is left out.

import { IniConfigManager } from '@fw/configuration/IniConfigManager';
import { BackgroundSource } from './BackgroundSource';
import { IntroSequence } from './IntroSequence';
import { RandomSelectAlgorithm } from './RandomSelectAlgorithm';
import { ScalingMode } from './ScalingMode';
import { SeasonalBackgroundMode } from './SeasonalBackgroundMode';
import { LeaderboardSortMode } from '../online/leaderboards/LeaderboardSortMode';
import { BeatmapDetailTab } from '../screens/select/BeatmapDetailTab';
import { GroupMode } from '../screens/select/filter/GroupMode';
import { SortMode } from '../screens/select/filter/SortMode';
import { BeatmapCardSize } from '../beatmaps/drawables/cards/BeatmapCardSize';

export class OsuConfigManager extends IniConfigManager<OsuSetting> {
  constructor(storage: Storage) {
    super(storage, OsuSetting);
  }

  protected override initialiseDefaults(): void {
    // UI/selection defaults
    this.setDefault(OsuSetting.BeatmapDetailTab, BeatmapDetailTab.Local);
    this.setDefault(OsuSetting.BeatmapLeaderboardSortMode, LeaderboardSortMode.Score);
    this.setDefaultBool(OsuSetting.BeatmapDetailModsFilter, false);

    this.setDefaultBool(OsuSetting.ShowConvertedBeatmaps, true);
    this.setDefaultDouble(OsuSetting.DisplayStarsMinimum, 0.0, 0, 10, 0.1);
    this.setDefaultDouble(OsuSetting.DisplayStarsMaximum, 10.1, 0, 10.1, 0.1);

    this.setDefault(OsuSetting.SongSelectGroupMode, GroupMode.None);
    this.setDefault(OsuSetting.SongSelectSortingMode, SortMode.Title);
    this.setDefault(OsuSetting.SongSelectCollectionFilter, '');

    this.setDefault(OsuSetting.RandomSelectAlgorithm, RandomSelectAlgorithm.RandomPermutation);

    this.setDefault(OsuSetting.BeatmapListingCardSize, BeatmapCardSize.Normal);
    this.setDefaultBool(OsuSetting.BeatmapListingFeaturedArtistFilter, true);

    this.setDefaultBool(OsuSetting.SongSelectBackgroundBlur, false);

    // Online
    this.setDefaultBool(OsuSetting.PreferNoVideo, false);

    this.setDefaultBool(OsuSetting.ShowOnlineExplicitContent, false);

    // Audio
    this.setDefaultDouble(OsuSetting.VolumeInactive, 0.25, 0, 1, 0.01);

    this.setDefaultBool(OsuSetting.MenuVoice, true);
    this.setDefaultBool(OsuSetting.MenuMusic, true);
    this.setDefaultBool(OsuSetting.MenuTips, true);
    this.setDefaultDouble(OsuSetting.AudioOffset, 0, -500.0, 500.0, 1);

    // Graphics
    this.setDefaultBool(OsuSetting.ShowStoryboard, true);

    this.setDefaultFloat(OsuSetting.MenuParallaxScale, 1.0, 0.0, 2.0, 0.1);

    // Gameplay
    this.setDefaultDouble(OsuSetting.DimLevel, 0.7, 0, 1, 0.01);
    this.setDefaultDouble(OsuSetting.BlurLevel, 0, 0, 1, 0.01);
    this.setDefaultBool(OsuSetting.LightenDuringBreaks, true);

    this.setDefault(OsuSetting.Scaling, ScalingMode.Off);
    this.setDefaultBool(OsuSetting.SafeAreaConsiderations, true);
    this.setDefaultFloat(OsuSetting.ScalingBackgroundDim, 0.9, 0.5, 1, 0.01);

    this.setDefaultFloat(OsuSetting.ScalingSizeX, 0.8, 0.2, 1, 0.01);
    this.setDefaultFloat(OsuSetting.ScalingSizeY, 0.8, 0.2, 1, 0.01);

    this.setDefaultFloat(OsuSetting.ScalingPositionX, 0.5, 0, 1, 0.01);
    this.setDefaultFloat(OsuSetting.ScalingPositionY, 0.5, 0, 1, 0.01);

    // (the desktop range: RuntimeInfo.IsMobile is false for the web build)
    this.setDefaultFloat(OsuSetting.UIScale, 1, 0.8, 1.6, 0.01);

    this.setDefaultDouble(OsuSetting.UIHoldActivationDelay, 200.0, 0.0, 500.0, 50.0);

    this.setDefault(OsuSetting.IntroSequence, IntroSequence.Triangles);

    this.setDefault(OsuSetting.MenuBackgroundSource, BackgroundSource.Skin);
    this.setDefault(OsuSetting.SeasonalBackgroundMode, SeasonalBackgroundMode.Sometimes);
  }
}

// IMPORTANT: These are used in user configuration files.
// The naming of these keys should not be changed once they are deployed in a release, unless migration logic is also added.
export enum OsuSetting {
  Ruleset = 'Ruleset',
  Token = 'Token',
  MenuCursorSize = 'MenuCursorSize',
  GameplayCursorSize = 'GameplayCursorSize',
  AutoCursorSize = 'AutoCursorSize',
  GameplayCursorDuringTouch = 'GameplayCursorDuringTouch',
  DimLevel = 'DimLevel',
  BlurLevel = 'BlurLevel',
  EditorDim = 'EditorDim',
  LightenDuringBreaks = 'LightenDuringBreaks',
  ShowStoryboard = 'ShowStoryboard',
  KeyOverlay = 'KeyOverlay',
  GameplayLeaderboard = 'GameplayLeaderboard',
  PositionalHitsoundsLevel = 'PositionalHitsoundsLevel',
  AlwaysPlayFirstComboBreak = 'AlwaysPlayFirstComboBreak',
  FloatingComments = 'FloatingComments',
  HUDVisibilityMode = 'HUDVisibilityMode',
  ShowHealthDisplayWhenCantFail = 'ShowHealthDisplayWhenCantFail',
  FadePlayfieldWhenHealthLow = 'FadePlayfieldWhenHealthLow',
  MouseDisableButtons = 'MouseDisableButtons',
  MouseDisableWheel = 'MouseDisableWheel',
  ConfineMouseMode = 'ConfineMouseMode',
  AudioOffset = 'AudioOffset',
  VolumeInactive = 'VolumeInactive',
  MenuMusic = 'MenuMusic',
  MenuVoice = 'MenuVoice',
  MenuTips = 'MenuTips',
  CursorRotation = 'CursorRotation',
  MenuParallaxScale = 'MenuParallaxScale',
  Prefer24HourTime = 'Prefer24HourTime',
  BeatmapDetailTab = 'BeatmapDetailTab',
  BeatmapLeaderboardSortMode = 'BeatmapLeaderboardSortMode',
  BeatmapDetailModsFilter = 'BeatmapDetailModsFilter',
  Username = 'Username',
  ReleaseStream = 'ReleaseStream',
  SavePassword = 'SavePassword',
  SaveUsername = 'SaveUsername',
  DisplayStarsMinimum = 'DisplayStarsMinimum',
  DisplayStarsMaximum = 'DisplayStarsMaximum',
  SongSelectGroupMode = 'SongSelectGroupMode',
  SongSelectSortingMode = 'SongSelectSortingMode',
  SongSelectCollectionFilter = 'SongSelectCollectionFilter',
  RandomSelectAlgorithm = 'RandomSelectAlgorithm',
  ModSelectHotkeyStyle = 'ModSelectHotkeyStyle',
  ShowFpsDisplay = 'ShowFpsDisplay',
  ChatDisplayHeight = 'ChatDisplayHeight',
  BeatmapListingCardSize = 'BeatmapListingCardSize',
  ToolbarClockDisplayMode = 'ToolbarClockDisplayMode',
  SongSelectBackgroundBlur = 'SongSelectBackgroundBlur',
  Version = 'Version',
  ShowFirstRunSetup = 'ShowFirstRunSetup',
  ShowConvertedBeatmaps = 'ShowConvertedBeatmaps',
  Skin = 'Skin',
  ScreenshotFormat = 'ScreenshotFormat',
  ScreenshotCaptureMenuCursor = 'ScreenshotCaptureMenuCursor',
  BeatmapSkins = 'BeatmapSkins',
  BeatmapColours = 'BeatmapColours',
  BeatmapHitsounds = 'BeatmapHitsounds',
  IncreaseFirstObjectVisibility = 'IncreaseFirstObjectVisibility',
  ScoreDisplayMode = 'ScoreDisplayMode',
  ExternalLinkWarning = 'ExternalLinkWarning',
  PreferNoVideo = 'PreferNoVideo',
  Scaling = 'Scaling',
  ScalingPositionX = 'ScalingPositionX',
  ScalingPositionY = 'ScalingPositionY',
  ScalingSizeX = 'ScalingSizeX',
  ScalingSizeY = 'ScalingSizeY',
  ScalingBackgroundDim = 'ScalingBackgroundDim',
  UIScale = 'UIScale',
  IntroSequence = 'IntroSequence',
  NotifyOnUsernameMentioned = 'NotifyOnUsernameMentioned',
  NotifyOnPrivateMessage = 'NotifyOnPrivateMessage',
  NotifyOnFriendPresenceChange = 'NotifyOnFriendPresenceChange',
  UIHoldActivationDelay = 'UIHoldActivationDelay',
  HitLighting = 'HitLighting',
  StarFountains = 'StarFountains',
  MenuBackgroundSource = 'MenuBackgroundSource',
  GameplayDisableWinKey = 'GameplayDisableWinKey',
  SeasonalBackgroundMode = 'SeasonalBackgroundMode',
  EditorWaveformOpacity = 'EditorWaveformOpacity',
  EditorShowHitMarkers = 'EditorShowHitMarkers',
  EditorAutoSeekOnPlacement = 'EditorAutoSeekOnPlacement',
  DiscordRichPresence = 'DiscordRichPresence',
  ShowOnlineExplicitContent = 'ShowOnlineExplicitContent',
  LastProcessedMetadataId = 'LastProcessedMetadataId',
  SafeAreaConsiderations = 'SafeAreaConsiderations',
  ComboColourNormalisationAmount = 'ComboColourNormalisationAmount',
  ProfileCoverExpanded = 'ProfileCoverExpanded',
  EditorLimitedDistanceSnap = 'EditorLimitedDistanceSnap',
  ReplaySettingsOverlay = 'ReplaySettingsOverlay',
  ReplayPlaybackControlsExpanded = 'ReplayPlaybackControlsExpanded',
  AutomaticallyDownloadMissingBeatmaps = 'AutomaticallyDownloadMissingBeatmaps',
  EditorShowSpeedChanges = 'EditorShowSpeedChanges',
  TouchDisableGameplayTaps = 'TouchDisableGameplayTaps',
  ModSelectTextSearchStartsActive = 'ModSelectTextSearchStartsActive',
  UserOnlineStatus = 'UserOnlineStatus',
  MultiplayerRoomFilter = 'MultiplayerRoomFilter',
  HideCountryFlags = 'HideCountryFlags',
  EditorTimelineShowTimingChanges = 'EditorTimelineShowTimingChanges',
  EditorTimelineShowTicks = 'EditorTimelineShowTicks',
  AlwaysShowHoldForMenuButton = 'AlwaysShowHoldForMenuButton',
  EditorContractSidebars = 'EditorContractSidebars',
  EditorScaleOrigin = 'EditorScaleOrigin',
  EditorRotationOrigin = 'EditorRotationOrigin',
  EditorTimelineShowBreaks = 'EditorTimelineShowBreaks',
  EditorAdjustExistingObjectsOnTimingChanges = 'EditorAdjustExistingObjectsOnTimingChanges',
  AlwaysRequireHoldingForPause = 'AlwaysRequireHoldingForPause',
  MultiplayerShowInProgressFilter = 'MultiplayerShowInProgressFilter',
  MultiplayerShowFullFilter = 'MultiplayerShowFullFilter',
  BeatmapListingFeaturedArtistFilter = 'BeatmapListingFeaturedArtistFilter',
  ShowMobileDisclaimer = 'ShowMobileDisclaimer',
  EditorShowStoryboard = 'EditorShowStoryboard',
  EditorSubmissionNotifyOnDiscussionReplies = 'EditorSubmissionNotifyOnDiscussionReplies',
  EditorSubmissionLoadInBrowserAfterSubmission = 'EditorSubmissionLoadInBrowserAfterSubmission',
  WasSupporter = 'WasSupporter',
  LastOnlineTagsPopulation = 'LastOnlineTagsPopulation',
  AutomaticallyAdjustBeatmapOffset = 'AutomaticallyAdjustBeatmapOffset',
  DashboardSortMode = 'DashboardSortMode',
  DashboardDisplayStyle = 'DashboardDisplayStyle',
  PMFriendsOnly = 'PMFriendsOnly',
}
