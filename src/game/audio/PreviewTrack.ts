// Ported from osu.Game/Audio/PreviewTrack.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Track } from '@fw/audio/track/Track';
import { Signal } from '@fw/bindables/Signal';
import { Component } from '@fw/graphics/Component';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';

export abstract class PreviewTrack extends Component {
  /** Invoked when this PreviewTrack has stopped playing. Not invoked in a thread-safe context. */
  readonly stopped = new Signal();

  /** Invoked when this PreviewTrack has started playing. Not invoked in a thread-safe context. */
  readonly started = new Signal();

  protected track: Track | null = null;

  private hasStarted = false;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.track = await this.getTrack();

    if (this.track !== null) {
      this.track.completed.add(() => this.stop());
      this.track.looping = this._looping;
    }
  }

  /** Length of the track. */
  get length(): number {
    return this.track?.length ?? 0;
  }

  /** The current track time. */
  get currentTime(): number {
    return this.track?.currentTime ?? 0;
  }

  /** Whether the track is loaded. */
  get trackLoaded(): boolean {
    return this.track?.isLoaded ?? false;
  }

  /** Whether the track is playing. */
  get isRunning(): boolean {
    return this.track?.isRunning ?? false;
  }

  private _looping = false;

  /** Whether the track will loop. */
  get looping(): boolean {
    return this._looping;
  }

  set looping(value: boolean) {
    this._looping = value;

    if (this.track !== null)
      this.track.looping = value;
  }

  private startDelegate: ScheduledDelegate | null = null;

  /** Starts playing this PreviewTrack. Returns whether the track is started. */
  start(): boolean {
    const track = this.track;

    if (track === null)
      return false;

    this.startDelegate = this.schedule(() => {
      if (this.hasStarted)
        return;

      this.hasStarted = true;

      track.restart();
      this.started.emit();
    });

    return true;
  }

  /** Stops playing this PreviewTrack. */
  stop(): void {
    this.startDelegate?.cancel();

    if (this.track === null)
      return;

    if (!this.hasStarted)
      return;

    this.hasStarted = false;

    // This pre-check is important, fixes a BASS deadlock in some scenarios.
    if (!this.track.hasCompleted) {
      this.track.stop();

      // Ensure the track is reset immediately on stopping, so the next time it is started it has a correct time value.
      this.track.seek(0);
    }

    this.stopped.emit();
  }

  /** Retrieves the audio track. */
  protected abstract getTrack(): Promise<Track | null>;

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    this.stop();
    this.track?.dispose();
  }
}
