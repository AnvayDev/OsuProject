// Web counterpart of osu.Framework/Graphics/Video/Video.cs: an HTMLVideoElement decodes the video (there's no FFmpeg). Only what the song
// select background video needs: a muted video from a URL, filling its box like a FillMode.Fill sprite, played at a position set by its owner.

import { Drawable } from '../Drawable';

/** Maximum drift (in ms) between the requested position and the element's before it is seeked. */
const max_drift = 150;

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

  protected override update(): void {
    super.update();

    if (!this._loaded || this.videoElement.seeking)
      return;

    const el = this.videoElement;

    if (el.playbackRate !== this.rate && this.rate > 0)
      el.playbackRate = this.rate;

    const position = Math.min(Math.max(this.playbackPosition, 0), this.duration);

    if (Math.abs(el.currentTime * 1000 - position) > max_drift)
      el.currentTime = position / 1000;

    const shouldPlay = this.playing && position < this.duration;

    if (shouldPlay && el.paused)
      void el.play().catch(() => {});
    else if (!shouldPlay && !el.paused)
      el.pause();
  }

  protected override disposeInternal(isDisposing: boolean): void {
    const el = this.videoElement;
    el.pause();
    el.removeAttribute('src');
    el.load();

    super.disposeInternal(isDisposing);
  }
}
