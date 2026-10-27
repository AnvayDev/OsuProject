// Web addition (user request, not in osu!): song select plays the beatmap's video behind the UI, muted and synced to the music, in place of
// the still background. osu! only shows videos in gameplay, as part of the storyboard (StoryboardVideo / DrawableStoryboardVideo), so the
// lookup follows LegacyStoryboardDecoder's Video event handling (from the .osu file; .osb storyboards aren't read). Browsers play MP4/M4V/MOV
// (H.264) directly; AVI files, which most beatmaps use, are rewrapped into MP4 first (AviRemuxer: H.264 only). Any other video (FLV, WMV,
// MPEG-1, non-H.264 AVI) stays hidden and the background image shows as before.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BufferedContainer } from '@fw/graphics/containers/BufferedContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Video } from '@fw/graphics/video/Video';
import { Anchor, Axes } from '@fw/layout/Enums';
import type { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { parseIntInvariant } from '@fw/utils/DotNet';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { SupportedExtensions } from '../../utils/SupportedExtensions';
import { remuxAviToMp4 } from './AviRemuxer';

/** A storyboard video event: the file and the time (in ms) the video starts at. (StoryboardVideo) */
export interface BeatmapVideoInfo {
  readonly path: string;
  readonly startTime: number;
}

/** Finds the first video event in a .osu file's [Events] section (LegacyStoryboardDecoder's handling of LegacyEventType.Video). */
export function findVideo(osuFileText: string): BeatmapVideoInfo | null {
  let inEvents = false;

  for (const rawLine of osuFileText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith('[')) {
      inEvents = line === '[Events]';
      continue;
    }

    if (!inEvents || line.startsWith('//'))
      continue;

    const split = line.split(',');

    if (split.length < 3 || (split[0] !== 'Video' && split[0] !== '1'))
      continue;

    const path = cleanFilename(split[2]);

    // See handling in LegacyBeatmapDecoder for the special case where a video type is used but the file extension is not a valid video.
    if (!SupportedExtensions.VIDEO_EXTENSIONS.includes(getExtension(path).toLowerCase()))
      continue;

    return { path, startTime: parseIntInvariant(split[1]) };
  }

  return null;
}

/** (LegacyDecoder.CleanFilename) */
function cleanFilename(path: string): string {
  return path.replaceAll('\\\\', '\\').replace(/^"+|"+$/g, '').replaceAll('\\', '/');
}

/** (Path.GetExtension) */
function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot <= path.lastIndexOf('/') || dot === path.length - 1)
    return '';
  return path.slice(dot);
}

export class BeatmapBackgroundVideo extends CompositeDrawable {
  readonly beatmap: WorkingBeatmap;

  /** The beatmap whose track the video follows (the current difficulty of the set). */
  trackSource: WorkingBeatmap;

  private readonly bufferedContainer: BufferedContainer;

  private video: Video | null = null;
  private startTime = 0;
  /** Where the first frame is in the played file (non-zero for remuxed AVIs with B-frames). */
  private fileStartOffset = 0;
  private url: string | null = null;

  constructor(beatmap: WorkingBeatmap) {
    super();

    this.beatmap = beatmap;
    this.trackSource = beatmap;
    this.relativeSizeAxes = Axes.Both;
    this.alpha = 0;
    // (keeps updating while hidden, to fade in once the track reaches the video)
    this.alwaysPresent = true;

    this.addInternal(this.bufferedContainer = new BufferedContainer().with({
      relativeSizeAxes: Axes.Both,
    }));
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const info = await this.lookupVideo();
    if (info === null)
      return;

    const storagePath = this.beatmap.beatmapSetInfo.getPathForFile(info.path);
    const data = storagePath === null ? null : await this.beatmap.getStream(storagePath);
    if (data === null)
      return;

    let blob: Blob;

    if (getExtension(info.path).toLowerCase() === '.avi') {
      const remuxed = remuxAviToMp4(data);
      if (remuxed === null)
        return;

      blob = new Blob([remuxed.data], { type: 'video/mp4' });
      this.fileStartOffset = remuxed.startOffset;
    } else {
      blob = new Blob([data as Uint8Array<ArrayBuffer>]);
    }

    this.startTime = info.startTime;
    this.url = URL.createObjectURL(blob);

    this.bufferedContainer.add(this.video = new Video(this.url).with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
    }));
  }

  private async lookupVideo(): Promise<BeatmapVideoInfo | null> {
    const path = this.beatmap.beatmapInfo.path;
    const storagePath = path === null ? null : this.beatmap.beatmapSetInfo.getPathForFile(path);
    const data = storagePath === null ? null : await this.beatmap.getStream(storagePath);

    return data === null ? null : findVideo(new TextDecoder().decode(data));
  }

  /** Smoothly adjusts the blur of the video over time (as Background.blurTo). */
  blurTo(newBlurSigma: Vector2, duration = 0, easing = Easing.None): void {
    this.bufferedContainer.transformTo('blurSigma', newBlurSigma, duration, easing);
  }

  private shown = false;

  protected override update(): void {
    super.update();

    if (this.video === null)
      return;

    const track = this.trackSource.trackLoaded ? this.trackSource.track : null;

    const position = (track?.currentTime ?? 0) - this.startTime;

    this.video.playbackPosition = position + this.fileStartOffset;
    this.video.playing = track?.isRunning ?? false;
    this.video.rate = track?.rate ?? 1;

    // the video replaces the background image only while it has a frame for the current time.
    const visible = this.video.loaded && position >= 0 && this.video.playbackPosition < this.video.duration;

    if (visible !== this.shown) {
      this.shown = visible;
      this.fadeTo(visible ? 1 : 0, 500, Easing.OutQuint);
    }
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    if (this.url !== null)
      URL.revokeObjectURL(this.url);
  }
}
