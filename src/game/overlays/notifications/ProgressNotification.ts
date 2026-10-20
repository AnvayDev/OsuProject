// Ported from osu.Game/Overlays/Notifications/ProgressNotification.cs (the state the importer and model managers drive; the drawable, its
// transitions and posting the completion notification come with the notification overlay).

import { Notification } from './Notification';

export enum ProgressNotificationState {
  Queued,
  Active,
  Completed,
  Cancelled,
}

export class ProgressNotification extends Notification {
  private readonly cancellationTokenSource = new AbortController();

  get cancellationToken(): AbortSignal {
    return this.cancellationTokenSource.signal;
  }

  /** The current progress (0 to 1). */
  progress = 0;

  private _state = ProgressNotificationState.Queued;

  get state(): ProgressNotificationState {
    return this._state;
  }

  set state(value: ProgressNotificationState) {
    if (this._state === value)
      return;

    this._state = value;

    if (value === ProgressNotificationState.Cancelled)
      this.cancellationTokenSource.abort();
  }

  completionText = 'Task has completed!';

  /** An action to complete when the completion notification is clicked. Return true to close. */
  completionClickAction: (() => boolean) | null = null;
}
