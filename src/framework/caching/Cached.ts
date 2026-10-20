// Ported from osu.Framework/Caching/Cached.cs (the non-generic Cached)

export class Cached {
  private _isValid = false;

  get isValid(): boolean {
    return this._isValid;
  }

  /** Invalidate the cache of this object. Returns true if we invalidated from a valid state. */
  invalidate(): boolean {
    if (this._isValid) {
      this._isValid = false;
      return true;
    }

    return false;
  }

  validate(): void {
    this._isValid = true;
  }
}
