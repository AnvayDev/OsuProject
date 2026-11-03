// Ported from osu.Game/Overlays/Mods/ModSearchContainer.cs

import { SearchContainer } from '@fw/graphics/containers/SearchContainer';

export class ModSearchContainer extends SearchContainer {
  override get searchTerm(): string | null {
    return super.searchTerm;
  }

  override set searchTerm(value: string | null) {
    if (value === this.searchTerm)
      return;

    super.searchTerm = value;

    // Manual filtering here is required because ModColumn can be hidden when search term applied,
    // causing the whole SearchContainer to become non-present and never actually perform a subsequent
    // filter.
    this.filter();
  }
}
