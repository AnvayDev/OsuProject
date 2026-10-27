// Web counterpart of osu.Framework/Graphics/Video/Video.cs: an HTMLVideoElement decodes the video (there's no FFmpeg). Only what the song
// select background video needs: a muted video from a URL, filling its box like a FillMode.Fill sprite, played at a position set by its owner.

import { Drawable } from '../Drawable';

/**
 * Drift (in ms) between the requested position and the element's beyond which the element is seeked. Below it, the playback rate is nudged
 * instead: seeking an H.264 video decodes from the previous keyframe (often seconds away), and seeking on every small drift never catches up.
 */
const seek_drift = 1000;

/** Minimum time (in ms) between seeks while playing, so slow seeks don't chain. */
const seek_cooldown = 1000;

/** Drift (in ms) tolerated without correction. */
const tolerated_drift = 40;

export class Video extends Drawable {
  /** The playback position (in ms) the video should be at. Set by the owner every frame. */
  playbackPosition = 0;

  /** Whether the video should be playing (otherwise it holds the frame at playbackPosition). */
  playing = false;

  /** The playback rate. */
  rate = 1;

  private _loaded = false;

  /** Whether the first frame has been decoded. */
  get loaded(): boolean {
    return this._loaded;
  }

  /** The video's duration in ms (NaN until loaded). */
  get duration(): number {
    return this.videoElement.duration * 1000;
  }

  private get videoElement(): HTMLVideoElement {
    return this.element as HTMLVideoElement;
  }

  constructor(url: string) {
    super();

    const el = this.videoElement;
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.addEventListener('loadeddata', () => this._loaded = true, { once: true });
    el.src = url;
  }

  protected override createElement(): HTMLElement {
    const el = document.createElement('video');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.transformOrigin = '0 0';
    el.style.boxSizing = 'border-box';
    el.style.pointerEvents = 'none';
    el.style.objectFit = 'cover';
    return el;
  }

  private lastSeek = -Infinity;

  protected override update(): void {
    super.update();

    if (!this._loaded || this.videoElement.seeking)
      return;

    const el = this.videoElement;
    const now = performance.now();

    const position = Math.min(Math.max(this.playbackPosition, 0), this.duration);
    // positive: the video is behind the requested position.
    const drift = position - el.currentTime * 1000;

    const shouldPlay = this.playing && this.rate > 0 && position < this.duration;

    if (!shouldPlay) {
      if (!el.paused)
        el.pause();

      if (Math.abs(drift) > tolerated_drift)
        this.seek(position, now);

      return;
    }

    if (Math.abs(drift) > seek_drift) {
      if (now - this.lastSeek > seek_cooldown)
        this.seek(position, now);
    } else {
      // catch up (or wait) over about a second, by at most 10%.
      const correction = Math.abs(drift) > tolerated_drift ? Math.min(Math.max(drift / 1000, -0.1), 0.1) : 0;
      const playbackRate = this.rate * (1 + correction);

      if (Math.abs(el.playbackRate - playbackRate) > 0.005)
        el.playbackRate = playbackRate;
    }

    if (el.paused)
      void el.play().catch(() => {});
  }

  private seek(position: number, now: number): void {
    this.videoElement.currentTime = position / 1000;
    this.lastSeek = now;
  }

  protected override disposeInternal(isDisposing: boolean): void {
    const el = this.videoElement;
    el.pause();
    el.removeAttribute('src');
    el.load();

    super.disposeInternal(isDisposing);
  }
}
