// Ported from osu.Game/Screens/Backgrounds/BackgroundScreenBeatmap.cs
// LoadComponentAsync's cancellation token is an AbortController checked before the loaded background is switched in.
// Web addition (user request): with showVideo set (by song select), the beatmap's video plays over the background (BeatmapBackgroundVideo).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { BindableFloat } from '@fw/bindables/BindableNumber';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { Background } from '../../graphics/backgrounds/Background';
import { BeatmapBackground } from '../../graphics/backgrounds/BeatmapBackground';
import { UserDimContainer } from '../../graphics/containers/UserDimContainer';
import { BackgroundScreen } from '../BackgroundScreen';
import { BeatmapBackgroundVideo } from './BeatmapBackgroundVideo';

export class BackgroundScreenBeatmap extends BackgroundScreen {
  /** The amount of blur to apply when full user blur is requested. */
  static readonly USER_BLUR_FACTOR = 25;

  protected background: Background | null = null;

  private _beatmap: WorkingBeatmap | null = null;

  /** Whether or not user-configured settings relating to brightness of elements should be ignored. */
  readonly ignoreUserSettings = new Bindable<boolean>(true);

  readonly storyboardReplacesBackground = new Bindable<boolean>(false);

  /** (Web addition) Whether the beatmap's video, if it has one, plays over the background. */
  readonly showVideo = new Bindable<boolean>(false);

  /** The amount of blur to be applied in addition to user-specified blur. */
  readonly blurAmount = new BindableFloat();

  /** The amount of dim to be used when ignoreUserSettings is true. */
  readonly dimWhenUserSettingsIgnored = new Bindable<number>(0);

  /** @internal */
  readonly isBreakTime = new Bindable<boolean>(false);

  private readonly dimmable: DimmableBackground;

  protected createFadeContainer(): DimmableBackground {
    return new DimmableBackground().with({ relativeSizeAxes: Axes.Both });
  }

  constructor(beatmap: WorkingBeatmap | null = null) {
    super();

    this.beatmap = beatmap;

    this.addInternal(this.dimmable = this.createFadeContainer());

    this.dimmable.storyboardReplacesBackground.bindTo(this.storyboardReplacesBackground);
    this.dimmable.ignoreUserSettings.bindTo(this.ignoreUserSettings);
    this.dimmable.isBreakTime.bindTo(this.isBreakTime);
    this.dimmable.blurAmount.bindTo(this.blurAmount);
    this.dimmable.dimWhenUserSettingsIgnored.bindTo(this.dimWhenUserSettingsIgnored);

    this.showVideo.valueChanged.add(() => this.schedule(() => this.updateVideo()));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const background = new BeatmapBackground(this._beatmap);
    this.loadComponent(background);
    this.switchBackground(background);

    return r;
  }

  private cancellationSource: AbortController | null = null;

  get beatmap(): WorkingBeatmap | null {
    return this._beatmap;
  }

  set beatmap(value: WorkingBeatmap | null) {
    if (this._beatmap === value && this._beatmap !== null)
      return;

    this._beatmap = value;

    this.schedule(() => {
      this.updateVideo();

      if ((this.background as BeatmapBackground | null)?.beatmap?.beatmapInfo.backgroundEquals(this._beatmap?.beatmapInfo ?? null) ?? false)
        return;

      this.cancellationSource?.abort();

      const source = this.cancellationSource = new AbortController();

      void this.loadComponentAsync(new BeatmapBackground(this._beatmap), b => {
        if (!source.signal.aborted)
          this.switchBackground(b);
      });
    });
  }

  private videoCancellationSource: AbortController | null = null;

  /** (Web addition) Replaces the video when the beatmap set changes; difficulties of a set share their video. */
  private updateVideo(): void {
    const beatmap = this.showVideo.value ? this._beatmap : null;
    const current = this.dimmable.video;

    // the playing track moves between a set's difficulties (MusicController transfers it), so follow the current beatmap's.
    if (current !== null && beatmap !== null && current.beatmap.beatmapSetInfo.id === beatmap.beatmapSetInfo.id) {
      current.trackSource = beatmap;
      return;
    }

    this.videoCancellationSource?.abort();
    this.videoLoadDelegate?.cancel();
    this.dimmable.video = null;

    if (beatmap === null)
      return;

    const source = this.videoCancellationSource = new AbortController();

    // reading (and remuxing) a video is expensive: only start once the selection has settled, so skipping through sets loads nothing.
    this.videoLoadDelegate = this.scheduler.addDelayed(() => {
      void this.loadComponentAsync(new BeatmapBackgroundVideo(beatmap), v => {
        if (!source.signal.aborted)
          this.dimmable.video = v;
        else
          v.dispose();
      });
    }, BackgroundScreenBeatmap.VIDEO_LOAD_DELAY);
  }

  private videoLoadDelegate: ScheduledDelegate | null = null;

  /** (Web addition) How long the beatmap has to stay selected before its video is loaded. */
  private static readonly VIDEO_LOAD_DELAY = 400;

  private switchBackground(b: BeatmapBackground): void {
    let newDepth = 0;

    if (this.background !== null) {
      newDepth = this.background.depth + 1;
      this.background.fadeOut(250);
      this.background.expire();
    }

    b.depth = newDepth;
    b.fadeInFromZero(500, Easing.OutQuint);
    this.dimmable.background = this.background = b;
  }

  override equals(other: BackgroundScreen | null): boolean {
    if (!(other instanceof BackgroundScreenBeatmap)) return false;

    return super.equals(other) && this._beatmap === other.beatmap;
  }
}

export class DimmableBackground extends UserDimContainer {
  /** The amount of blur to be applied to the background in addition to user-specified blur. Used in contexts where there can potentially be both user and screen-specified blurring occurring at the same time, such as in PlayerLoader */
  readonly blurAmount = new BindableFloat();

  readonly storyboardReplacesBackground = new Bindable<boolean>(false);

  get background(): Background | null {
    return this._background;
  }

  set background(value: Background) {
    this._background?.expire();

    super.add(this._background = value);
    this._background.blurTo(this.blurTarget, 0, Easing.OutQuint);
  }

  /** (Web addition) The beatmap video shown over the background. */
  get video(): BeatmapBackgroundVideo | null {
    return this._video;
  }

  set video(value: BeatmapBackgroundVideo | null) {
    if (this._video !== null) {
      this._video.fadeOut(250);
      this._video.expire();
    }

    this._video = value;

    if (value !== null) {
      value.depth = -1;
      super.add(value);
      value.blurTo(this.blurTarget, 0, Easing.OutQuint);
    }
  }

  private _video: BeatmapBackgroundVideo | null = null;

  private userBlurLevel!: Bindable<number>;

  private _background: Background | null = null;

  constructor() {
    super();
  }

  override add(drawable: Drawable): void {
    if (drawable instanceof Background)
      throw new Error('Use background to set a background.');

    super.add(drawable);
  }

  private get blurTarget(): Vector2 {
    return !this.ignoreUserSettings.value
      ? new Vector2(this.blurAmount.value + Math.fround(this.userBlurLevel.value) * BackgroundScreenBeatmap.USER_BLUR_FACTOR)
      : new Vector2(this.blurAmount.value);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.userBlurLevel = dependencies.resolve(OsuConfigManager).getBindable<number>(OsuSetting.BlurLevel);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.userBlurLevel.valueChanged.add(() => this.updateVisuals());
    this.blurAmount.valueChanged.add(() => this.updateVisuals());
    this.storyboardReplacesBackground.valueChanged.add(() => this.updateVisuals());
  }

  protected override get dimLevel(): number {
    if ((this.ignoreUserSettings.value || this.showStoryboard.value) && this.storyboardReplacesBackground.value)
      return 1;

    return super.dimLevel;
  }

  protected override updateVisuals(): void {
    super.updateVisuals();

    this.background?.blurTo(this.blurTarget, UserDimContainer.BACKGROUND_FADE_DURATION, Easing.OutQuint);
    this._video?.blurTo(this.blurTarget, UserDimContainer.BACKGROUND_FADE_DURATION, Easing.OutQuint);
  }
}
