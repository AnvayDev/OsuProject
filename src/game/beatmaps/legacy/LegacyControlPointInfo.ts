// Ported from osu.Game/Beatmaps/Legacy/LegacyControlPointInfo.cs

import { SortedList } from '@fw/lists/SortedList';
import { compareControlPoints, type ControlPoint } from '../controlPoints/ControlPoint';
import { ControlPointInfo } from '../controlPoints/ControlPointInfo';
import { DifficultyControlPoint } from '../controlPoints/DifficultyControlPoint';
import { SampleControlPoint } from '../controlPoints/SampleControlPoint';

export class LegacyControlPointInfo extends ControlPointInfo {
  private readonly _samplePoints = new SortedList<SampleControlPoint>(compareControlPoints);

  /** All sound points. */
  get samplePoints(): readonly SampleControlPoint[] {
    return this._samplePoints.toArray();
  }

  /** Finds the sound control point that is active at time. */
  samplePointAt(time: number): SampleControlPoint {
    return ControlPointInfo.binarySearchWithFallback(this.samplePoints, time, this.samplePoints.length > 0 ? this.samplePoints[0] : SampleControlPoint.DEFAULT);
  }

  private readonly _difficultyPoints = new SortedList<DifficultyControlPoint>(compareControlPoints);

  /** All difficulty points. */
  get difficultyPoints(): readonly DifficultyControlPoint[] {
    return this._difficultyPoints.toArray();
  }

  /** Finds the difficulty control point that is active at time. */
  difficultyPointAt(time: number): DifficultyControlPoint {
    return ControlPointInfo.binarySearchWithFallback(this.difficultyPoints, time, DifficultyControlPoint.DEFAULT);
  }

  override clear(): void {
    super.clear();
    this._samplePoints.removeAll(() => true);
    this._difficultyPoints.removeAll(() => true);
  }

  protected override checkAlreadyExisting(time: number, newPoint: ControlPoint): boolean {
    if (newPoint instanceof SampleControlPoint) {
      // intentionally don't use SamplePointAt (we always need to consider the first sample point).
      const existing = ControlPointInfo.binarySearch(this.samplePoints, time);
      return newPoint.isRedundant(existing);
    }

    if (newPoint instanceof DifficultyControlPoint)
      return newPoint.isRedundant(this.difficultyPointAt(time));

    return super.checkAlreadyExisting(time, newPoint);
  }

  protected override onGroupItemAdded(controlPoint: ControlPoint): void {
    if (controlPoint instanceof SampleControlPoint) {
      this._samplePoints.add(controlPoint);
      return;
    }

    if (controlPoint instanceof DifficultyControlPoint) {
      this._difficultyPoints.add(controlPoint);
      return;
    }

    super.onGroupItemAdded(controlPoint);
  }

  protected override onGroupItemRemoved(controlPoint: ControlPoint): void {
    if (controlPoint instanceof SampleControlPoint)
      this._samplePoints.remove(controlPoint);
    else if (controlPoint instanceof DifficultyControlPoint)
      this._difficultyPoints.remove(controlPoint);

    super.onGroupItemRemoved(controlPoint);
  }
}
