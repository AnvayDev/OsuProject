// Ported from osu.Framework/Graphics/Containers/SearchContainer.cs, IFilterable.cs and IHasFilterTerms.cs
// IConditionalFilterable isn't ported (nothing implements it yet). There is one language, so filter terms are matched as given.
// The filterable interfaces are recognised by their isFilterable marker (TS interfaces don't exist at runtime).

import { Cached } from '../../caching/Cached';
import { Signal } from '../../bindables/Signal';
import type { Drawable } from '../Drawable';
import { Container } from './Container';
import { FillFlowContainer } from './FillFlowContainer';

export interface IHasFilterTerms {
  /** An enumerator of relevant terms which match the current object in a filtered scenario. */
  readonly filterTerms: Iterable<string>;
}

export interface IFilterable extends IHasFilterTerms {
  readonly isFilterable: true;

  /** Whether the current object is matching (ie. visible) given the current filter criteria of a parent. */
  set matchingFilter(value: boolean);

  /** Whether a filter is currently being performed. */
  set filteringActive(value: boolean);
}

function isFilterable(d: unknown): d is IFilterable {
  return (d as Partial<IFilterable>).isFilterable === true;
}

export class SearchContainer<T extends Drawable = Drawable> extends FillFlowContainer<T> {
  /** Fired whenever a filter operation completes. */
  readonly filterCompleted = new Signal();

  private _allowNonContiguousMatching = false;

  /** Whether the matching algorithm should consider cases where other characters exist between consecutive characters in the search term. */
  get allowNonContiguousMatching(): boolean {
    return this._allowNonContiguousMatching;
  }

  set allowNonContiguousMatching(value: boolean) {
    if (value === this._allowNonContiguousMatching)
      return;

    this._allowNonContiguousMatching = value;
    this.filterValid.invalidate();
  }

  private _searchTerm: string | null = null;

  /** A string that should match the IFilterable children. */
  get searchTerm(): string | null {
    return this._searchTerm;
  }

  set searchTerm(value: string | null) {
    if (value === this._searchTerm)
      return;

    this._searchTerm = value;
    this.filterValid.invalidate();
  }

  private readonly filterValid = new Cached();

  protected override addInternal(drawable: Drawable): void {
    super.addInternal(drawable);
    // (children added by a base constructor arrive before this field exists; the filter starts invalid anyway.)
    this.filterValid?.invalidate();
  }

  protected override update(): void {
    super.update();

    if (!this.filterValid.isValid)
      this.filter();
  }

  /** Immediately filter IFilterable children based on the current searchTerm. Filtering is done automatically after a change to searchTerm, on new drawables being added, and on certain changes to searchable children. */
  protected filter(): void {
    if (this.filterValid.isValid)
      return;

    this.performFilter();
    this.filterValid.validate();
    this.filterCompleted.emit();
  }

  private performFilter(): void {
    const terms = (this._searchTerm ?? '').split(' ').filter(t => t.length > 0);
    this.matchSubTree(this, terms, terms.length > 0, this._allowNonContiguousMatching);
  }

  private matchSubTree(drawable: Drawable, searchTerms: readonly string[], searchActive: boolean, nonContiguousMatching: boolean): boolean {
    const { matching: selfMatching, nonMatchingTerms } = this.match(drawable, searchTerms, nonContiguousMatching);
    let matching = selfMatching;

    // (IContainerEnumerable<Drawable>)
    if (drawable instanceof Container) {
      for (const child of drawable.children)
        matching = this.matchSubTree(child, nonMatchingTerms, searchActive, nonContiguousMatching) || matching;
    }

    if (isFilterable(drawable)) {
      drawable.filteringActive = searchActive;
      drawable.matchingFilter = matching;
    }

    return matching;
  }

  private match(drawable: Drawable, searchTerms: readonly string[], nonContiguousMatching: boolean): { matching: boolean; nonMatchingTerms: readonly string[] } {
    let nonMatchingTerms = searchTerms;

    if (isFilterable(drawable)) {
      const filterTerms = [...drawable.filterTerms];

      //Words matched by parent is not needed to match children
      nonMatchingTerms = searchTerms.filter(term => !filterTerms.some(filterTerm => SearchContainer.checkTerm(filterTerm, term, nonContiguousMatching)));
    }

    return { matching: nonMatchingTerms.length === 0, nonMatchingTerms };
  }

  private static checkTerm(haystack: string, needle: string, nonContiguous: boolean): boolean {
    // (OrdinalIgnoreCase)
    const h = haystack.toUpperCase();
    const n = needle.toUpperCase();

    if (!nonContiguous)
      return h.includes(n);

    let index = 0;

    for (let i = 0; i < n.length; i++) {
      const found = h.indexOf(n[i], index);
      if (found < 0)
        return false;

      index = found + 1;
    }

    return true;
  }
}
