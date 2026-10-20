// Ported from osu.Framework/Audio/Track/TrackVirtual.cs

import { StopwatchClock } from '../../timing/StopwatchClock';
import { Track } from './Track';

export class TrackVirtual extends Track {
  private readonly clock = new StopwatchClock();

  private seekOffset = 0;

  constructor(length: number, name = 'virtual') {
    super(name);

    this.length = length;
  }

  override seek(seek: number): boolean {
    this.seekOffset = Math.min(Math.max(seek, 0), this.length);

    const success = this.seekOffset === seek;

    if (success && this.isRunning)
      this.clock.restart();
    else
      this.clock.reset();

    return success;
  }

  override start(): void {
    if (this.length === 0 || this.currentTime >= this.length)
      return;

    this.clock.start();
  }

  override reset(): void {
    this.clock.reset();
    this.seekOffset = 0;

    super.reset();
  }

  override stop(): void {
    this.clock.stop();
  }

  override get isRunning(): boolean {
    return this.clock.isRunning;
  }

  override get currentTime(): number {
    return Math.min(this.length, this.seekOffset + this.clock.currentTime);
  }

  protected override updateState(): void {
    super.updateState();

    if (this.clock.isRunning && this.currentTime >= this.length) {
      if (this.looping)
        this.restart();
      else {
        this.stop();
        this.raiseCompleted();
      }
    }
  }

  override onStateChanged(): void {
    super.onStateChanged();

    this.clock.rate = this.rate;
  }

  protected override onDispose(disposing: boolean): void {
    if (!this.isDisposed)
      this.stop();

    super.onDispose(disposing);
  }
}
