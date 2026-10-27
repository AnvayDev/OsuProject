// Ported from osu.Game/Online/DownloadTracker.cs

import { Bindable } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Component } from '@fw/graphics/Component';
import { DownloadState } from './DownloadState';

export abstract class DownloadTracker<T> extends Component {
  readonly trackedItem: T;

  /** Holds the current download state of the download - whether is has already been downloaded, is in progress, or is not downloaded. */
  get state(): Bindable<DownloadState> {
    return this._state;
  }

  private readonly _state = new Bindable<DownloadState>(DownloadState.Unknown);

  /** The progress of an active download. */
  get progress(): Bindable<number> {
    return this._progress;
  }

  private readonly _progress = new BindableDouble();

  protected constructor(trackedItem: T) {
    super();

    this._progress.minValue = 0;
    this._progress.maxValue = 1;

    this.trackedItem = trackedItem;
  }

  protected updateState(newState: DownloadState): void {
    this._state.value = newState;
  }

  protected updateProgress(newProgress: number): void {
    this._progress.value = newProgress;
  }
}
