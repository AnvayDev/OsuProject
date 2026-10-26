// Ported from osu.Game/Graphics/Containers/SelectionCycleFillFlowContainer.cs

import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { IStateful } from '@fw/IStateful';
import { SelectionState } from '../userInterface/SelectionState';

/**
 * A FillFlowContainer that provides functionality to cycle selection between children
 * The selection wraps around when overflowing past the first or last child.
 */
export class SelectionCycleFillFlowContainer<T extends Drawable & IStateful<SelectionState>> extends FillFlowContainer<T> {
  get selected(): T | null {
    return (this.selectedIndex !== null && this.selectedIndex >= 0 && this.selectedIndex < this.count) ? this.children[this.selectedIndex] : null;
  }

  private selectedIndex: number | null = null;

  selectNext(): void {
    if (this.selectedIndex === null || this.selectedIndex === this.count - 1)
      this.setSelected(0);
    else
      this.setSelected(this.selectedIndex + 1);
  }

  selectPrevious(): void {
    if (this.selectedIndex === null || this.selectedIndex === 0)
      this.setSelected(this.count - 1);
    else
      this.setSelected(this.selectedIndex - 1);
  }

  deselect(): void {
    this.setSelected(null);
  }

  select(item: T): void {
    const newIndex = this.indexOf(item);

    if (newIndex < 0)
      this.setSelected(null);
    else
      this.setSelected(this.indexOf(item));
  }

  override add(drawable: T): void {
    super.add(drawable);

    drawable.stateChanged.add(state => this.selectionChanged(drawable, state));
  }

  override remove(_drawable: T, _disposeImmediately: boolean): boolean {
    throw new Error('Cannot remove drawables from SelectionCycleFillFlowContainer');
  }

  private setSelected(value: number | null): void {
    if (this.selectedIndex === value)
      return;

    // Deselect the previously-selected button
    if (this.selectedIndex !== null)
      this.children[this.selectedIndex].state = SelectionState.NotSelected;

    this.selectedIndex = value;

    // Select the newly-selected button
    if (this.selectedIndex !== null)
      this.children[this.selectedIndex].state = SelectionState.Selected;
  }

  private selectionChanged(drawable: T, state: SelectionState): void {
    if (state === SelectionState.NotSelected)
      this.deselect();
    else
      this.select(drawable);
  }
}
