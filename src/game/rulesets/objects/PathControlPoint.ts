// Ported from osu.Game/Rulesets/Objects/PathControlPoint.cs

import { Signal } from '@fw/bindables/Signal';
import { Vector2F } from '@fw/layout/Vector2F';
import { PathType } from './types/PathType';

export class PathControlPoint {
  private _position = Vector2F.Zero;

  /** The position of this PathControlPoint. */
  get position(): Vector2F {
    return this._position;
  }

  set position(value: Vector2F) {
    if (value.equals(this._position))
      return;

    this._position = value;
    this.changed.emit();
  }

  private _type: PathType | null = null;

  /** The type of path segment starting at this PathControlPoint. If null, this will be a part of the previous path segment. */
  get type(): PathType | null {
    return this._type;
  }

  set type(value: PathType | null) {
    if (PathType.equals(value, this._type))
      return;

    this._type = value;
    this.changed.emit();
  }

  /** Invoked when any property of this PathControlPoint is changed. */
  readonly changed = new Signal();

  constructor(position: Vector2F = Vector2F.Zero, type: PathType | null = null) {
    this.position = position;
    this.type = type;
  }

  equals(other: PathControlPoint | null): boolean {
    return other !== null && this.position.equals(other.position) && PathType.equals(this.type, other.type);
  }

  toString(): string {
    return this._type === null ? `Position=${this.position}` : `Position=${this.position}, Type=${this._type}`;
  }
}
