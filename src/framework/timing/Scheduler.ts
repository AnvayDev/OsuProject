// Ported from osu.Framework/Threading/Scheduler.cs, osu.Framework/Threading/ScheduledDelegate.cs and ScheduledDelegateWithData.cs
// Single-threaded: there is no "main thread" distinction, so forceScheduled=false always runs inline.

import { SortedList } from '../lists/SortedList';
import type { IClock } from './IClock';

export enum RunState {
  Waiting,
  Running,
  Complete,
  Cancelled,
}

export class ScheduledDelegate {
  /** The earliest ElapsedTime value at which we can be executed. */
  executionTime: number;

  /** Time in milliseconds between repeats of this task. -1 means no repeats. */
  readonly repeatInterval: number;

  /** Whether this task should run repeatedly to catch up if the scheduler fell behind (default true). */
  performRepeatCatchUpExecutions = true;

  get completed(): boolean {
    return this.state === RunState.Complete;
  }

  get cancelled(): boolean {
    return this.state === RunState.Cancelled;
  }

  state = RunState.Waiting;

  /** @internal */ task: (() => void) | null;

  /** A null task is C#'s protected constructor, for subclasses that override invokeTask (ScheduledDelegateWithData). */
  constructor(task: (() => void) | null, executionTime = 0, repeatInterval = -1) {
    this.task = task;
    this.executionTime = executionTime;
    this.repeatInterval = repeatInterval;
  }

  /** Invokes the scheduled task. Throws if cancelled or already completed. */
  runTask(): void {
    if (this.cancelled)
      throw new Error('Can not run a ScheduledDelegate that has been Cancelled.');

    if (this.completed)
      throw new Error('Can not run a ScheduledDelegate that has been already Completed.');

    this.runTaskInternal();
  }

  /** @internal */
  runTaskInternal(): void {
    if (this.state !== RunState.Waiting)
      return;

    this.state = RunState.Running;

    this.invokeTask();

    // task may have been cancelled during execution.
    if ((this.state as RunState) === RunState.Cancelled)
      return;

    this.state = RunState.Complete;
  }

  protected invokeTask(): void {
    this.task!();
  }

  /** Cancel a task. Note that this will only work if the task hasn't been run yet. */
  cancel(): void {
    this.state = RunState.Cancelled;
  }

  static compare(a: ScheduledDelegate, b: ScheduledDelegate): number {
    return a.executionTime === b.executionTime ? -1 : a.executionTime < b.executionTime ? -1 : 1;
  }

  /** @internal Set the time of the next execution of this task (null for per-update tasks). */
  setNextExecution(currentTime: number | null): void {
    if (this.state === RunState.Cancelled)
      return;

    this.state = RunState.Waiting;

    if (currentTime !== null) {
      this.executionTime += this.repeatInterval;

      if (this.executionTime < currentTime && !this.performRepeatCatchUpExecutions)
        this.executionTime = currentTime + this.repeatInterval;
    }
  }
}

/** Ported from ScheduledDelegateWithData.cs. C# hides Task with `new`; here it is taskWithData, and the base task stays null. */
class ScheduledDelegateWithData<T> extends ScheduledDelegate {
  constructor(readonly taskWithData: (data: T) => void, public data: T, executionTime = 0, repeatInterval = -1) {
    super(null, executionTime, repeatInterval);
  }

  protected override invokeTask(): void {
    this.taskWithData(this.data);
  }
}

/** Marshals delegates to run from the Scheduler's base thread in a threadsafe manner. */
export class Scheduler {
  private readonly runQueue: ScheduledDelegate[] = [];
  private readonly timedTasks = new SortedList<ScheduledDelegate>(ScheduledDelegate.compare);
  private readonly perUpdateTasks: ScheduledDelegate[] = [];

  private clock: IClock | null;

  private get currentTime(): number {
    return this.clock?.currentTime ?? 0;
  }

  get hasPendingTasks(): boolean {
    return this.totalPendingTasks > 0;
  }

  totalTasksRun = 0;

  /** @internal */ get totalPendingTasks(): number {
    return this.runQueue.length + this.timedTasks.count + this.perUpdateTasks.length;
  }

  constructor(clock: IClock | null = null) {
    this.clock = clock;
  }

  updateClock(newClock: IClock): void {
    if (newClock === this.clock)
      return;

    if (this.clock === null) {
      // This is the first time we will get a valid time, so assume this is the
      // reference point everything scheduled so far starts from.
      for (const s of this.timedTasks.toArray())
        s.executionTime += newClock.currentTime;
    }

    this.clock = newClock;
  }

  private readonly tasksToSchedule: ScheduledDelegate[] = [];
  private readonly tasksToRemove: ScheduledDelegate[] = [];

  /** Run any pending work tasks. Returns the number of tasks that were run. */
  update(): number {
    const hasTimedTasks = this.timedTasks.count > 0;
    const hasPerUpdateTasks = this.perUpdateTasks.length > 0;

    if (hasTimedTasks || hasPerUpdateTasks) {
      this.queueTimedTasks();
      this.queuePerUpdateTasks();
    }

    const countToRun = this.runQueue.length;

    if (countToRun === 0)
      return 0;

    let countRun = 0;
    let sd: ScheduledDelegate | undefined;

    while ((sd = this.runQueue.shift()) !== undefined) {
      sd.runTaskInternal();
      this.totalTasksRun++;

      if (++countRun === countToRun)
        break;
    }

    return countRun;
  }

  private queueTimedTasks(): void {
    if (this.timedTasks.count !== 0) {
      const currentTimeLocal = this.currentTime;

      for (const sd of this.timedTasks.toArray()) {
        if (sd.executionTime <= currentTimeLocal) {
          this.tasksToRemove.push(sd);

          if (sd.cancelled) continue;

          if (sd.repeatInterval === 0) {
            // handling of every-frame tasks is slightly different to reduce overhead.
            this.perUpdateTasks.push(sd);
            continue;
          }

          if (sd.repeatInterval > 0) {
            // schedule the next repeat of the task.
            sd.setNextExecution(currentTimeLocal);
            this.tasksToSchedule.push(sd);
          }

          if (!sd.completed) this.enqueue(sd);
        }
      }

      for (const t of this.tasksToRemove) {
        const i = this.timedTasks.toArray().indexOf(t);
        if (i >= 0) this.timedTasks.removeAt(i);
      }

      this.tasksToRemove.length = 0;

      for (const t of this.tasksToSchedule)
        this.timedTasks.add(t);

      this.tasksToSchedule.length = 0;
    }
  }

  private queuePerUpdateTasks(): void {
    for (let i = 0; i < this.perUpdateTasks.length; i++) {
      const task = this.perUpdateTasks[i];

      task.setNextExecution(null);

      if (task.cancelled) {
        this.perUpdateTasks.splice(i--, 1);
        continue;
      }

      this.enqueue(task);
    }
  }

  /** Cancel any pending timed tasks. */
  cancelDelayedTasks(): void {
    for (const t of this.timedTasks.toArray())
      t.cancel();

    this.timedTasks.removeAll(() => true);
  }

  /** Add a task to be scheduled. Returns the scheduled delegate, or null if it was run inline (forceScheduled = false). */
  add(task: (() => void) | ScheduledDelegate, forceScheduled = true): ScheduledDelegate | null {
    if (task instanceof ScheduledDelegate) {
      // Add(ScheduledDelegate): add a timed task.
      if (task.completed)
        throw new Error('Can not add a ScheduledDelegate that has been already Completed');

      this.timedTasks.add(task);
      return task;
    }

    if (!forceScheduled) {
      // We are on the main thread already - don't need to schedule.
      task();
      return null;
    }

    const del = new ScheduledDelegate(task);

    this.enqueue(del);

    return del;
  }

  /** Add a task which will be run after a specified delay from the current clock time (optionally repeating). */
  addDelayed(task: () => void, timeUntilRun: number, repeat = false): ScheduledDelegate {
    const del = new ScheduledDelegate(task, this.currentTime + timeUntilRun, repeat ? timeUntilRun : -1);

    this.add(del);

    return del;
  }

  /**
   * Adds a task which will only be run once per frame, no matter how many times it was scheduled in the previous frame.
   * With data (AddOnce<T>(Action<T>, T)): tasks are deduplicated by the task alone, and the single queued instance always gets the most recent data.
   * Returns whether this is the first queue attempt of this work.
   */
  addOnce(task: () => void): boolean;
  addOnce<T>(task: (data: T) => void, data: T): boolean;
  addOnce<T>(task: (() => void) | ((data: T) => void), ...data: [] | [T]): boolean {
    if (data.length === 1) {
      const existing = this.runQueue.find(sd => sd instanceof ScheduledDelegateWithData && sd.taskWithData === task) as ScheduledDelegateWithData<T> | undefined;

      if (existing !== undefined) {
        // ensure the single queued instance always has the most recent data.
        existing.data = data[0];
        return false;
      }

      this.enqueue(new ScheduledDelegateWithData<T>(task, data[0]));
      return true;
    }

    if (this.runQueue.some(sd => sd.task === task))
      return false;

    this.enqueue(new ScheduledDelegate(task as () => void));

    return true;
  }

  private enqueue(task: ScheduledDelegate): void {
    this.runQueue.push(task);
  }
}
