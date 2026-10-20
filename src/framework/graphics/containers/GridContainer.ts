// Ported from osu.Framework/Graphics/Containers/GridContainer.cs and GridContainerContent.cs

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Cached } from '../../caching/Cached';
import { Axes, Invalidation } from '../../layout/Enums';
import { InvalidationSource, LayoutValue } from '../../layout/Layout';
import { FLOAT_MAX } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { ObservableArray } from '../../lists/ObservableArray';
import type { Drawable, DrawableInit } from '../Drawable';
import { CompositeDrawable } from './CompositeDrawable';
import { Container } from './Container';

/** The `Drawable[][]` a GridContainer's content is implicitly converted from. Null elements represent blank rows/cells. */
export type GridContainerContentSource = (readonly (Drawable | null)[] | null)[];

/** A wrapper for the content of a GridContainer that provides notifications when elements are changed. */
export class GridContainerContent extends ObservableArray<ObservableArray<Drawable | null> | null> {
  private constructor(drawables: GridContainerContentSource) {
    super(new Array<ObservableArray<Drawable | null> | null>(drawables.length).fill(null));

    for (let i = 0; i < drawables.length; i++) {
      const row = drawables[i];

      if (row != null) {
        const observableArray = new ObservableArray(row as (Drawable | null)[]);
        this.set(i, observableArray);
      }
    }
  }

  /** `implicit operator GridContainerContent(Drawable[][] drawables)` */
  static from(drawables: GridContainerContentSource | null): GridContainerContent | null {
    if (drawables === null)
      return null;

    return new GridContainerContent(drawables);
  }
}

/** A container which allows laying out Drawables in a grid. */
export class GridContainer extends CompositeDrawable {
  constructor() {
    super();

    this.addLayout(this.cellLayout);
    this.addLayout(this.cellChildLayout);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.layoutContent();
    return r;
  }

  // C#'s implicit Drawable[][] conversion is accepted by `content` assignment; widen `with` to match.
  override with(props: DrawableInit<this> | (Omit<DrawableInit<this>, 'content'> & { content?: GridContainerContentSource | GridContainerContent | null })): this {
    return super.with(props as DrawableInit<this>);
  }

  private _content: GridContainerContent | null = null;

  /**
   * The content of this GridContainer, arranged in a 2D grid array, where each array
   * of Drawables represents a row and each element of that array represents a column.
   * Null elements are allowed to represent blank rows/cells.
   */
  get content(): GridContainerContent | null {
    return this._content;
  }

  set content(value: GridContainerContent | GridContainerContentSource | null) {
    const content = value instanceof GridContainerContent ? value : GridContainerContent.from(value);

    if (this._content?.equals(content) === true)
      return;

    if (this._content !== null)
      this._content.arrayElementChanged.remove(this.onContentChange);

    this._content = content;

    this.onContentChange();

    if (this._content !== null)
      this._content.arrayElementChanged.add(this.onContentChange);
  }

  private readonly onContentChange = (): void => {
    this.cellContent.invalidate();
  };

  private _rowDimensions: Dimension[] = [];

  /** Explicit dimensions for rows. Each index of this array applies to the respective row index inside content. */
  set rowDimensions(value: Dimension[]) {
    if (this._rowDimensions === value)
      return;

    this._rowDimensions = value;

    this.cellLayout.invalidate();
  }

  private _columnDimensions: Dimension[] = [];

  /** Explicit dimensions for columns. Each index of this array applies to the respective column index inside content. */
  set columnDimensions(value: Dimension[]) {
    if (this._columnDimensions === value)
      return;

    this._columnDimensions = value;

    this.cellLayout.invalidate();
  }

  protected override update(): void {
    super.update();

    this.layoutContent();
    this.layoutCells();
  }

  private readonly cellContent = new Cached();
  private readonly cellLayout = new LayoutValue(Invalidation.DrawSize);
  private readonly cellChildLayout = new LayoutValue(Invalidation.RequiredParentSizeToFit | Invalidation.Presence, InvalidationSource.Child);

  /** CellContainer[rows, columns] */
  private cells: CellContainer[][] = [];

  private get cellRows(): number {
    return this.cells.length;
  }

  private get cellColumns(): number {
    return this.cells[0]?.length ?? 0;
  }

  /** Moves content from content into cells. */
  private layoutContent(): void {
    if (this.cellContent.isValid)
      return;

    const content = this._content;
    const requiredRows = content?.count ?? 0;
    const requiredColumns = requiredRows === 0 ? 0 : [...content!].reduce((max, c) => Math.max(max, c?.count ?? 0), 0);

    // Clear cell containers without disposing, as the content might be reused
    for (const row of this.cells)
      for (const cell of row)
        cell.clear(false);

    // It's easier to just re-construct the cell containers instead of resizing
    // If this becomes a bottleneck we can transition to using lists, but this keeps the structure clean...
    this.clearInternal();
    this.cellLayout.invalidate();

    // Create the new cell containers and add content
    this.cells = Array.from({ length: requiredRows }, () => new Array<CellContainer>(requiredColumns));

    for (let r = 0; r < requiredRows; r++) {
      for (let c = 0; c < requiredColumns; c++) {
        // Add cell
        const cell = this.cells[r][c] = new CellContainer();

        // Allow empty rows
        const row = content!.get(r);
        if (row == null)
          continue;

        // Allow non-square grids
        if (c >= row.count)
          continue;

        // Allow empty cells
        const drawable = row.get(c);
        if (drawable == null)
          continue;

        // Add content
        cell.add(drawable);
        cell.depth = drawable.depth;

        this.addInternal(cell);
      }
    }

    this.cellContent.validate();
  }

  /** Repositions/resizes cells. */
  private layoutCells(): void {
    if (!this.cellChildLayout.isValid) {
      this.cellLayout.invalidate();
      this.cellChildLayout.validate();
    }

    if (this.cellLayout.isValid)
      return;

    const widths = this.distribute(this._columnDimensions, this.drawWidth - this.padding.totalHorizontal, this.getCellSizesAlongAxis(Axes.X, this.drawWidth - this.padding.totalHorizontal));
    const heights = this.distribute(this._rowDimensions, this.drawHeight - this.padding.totalVertical, this.getCellSizesAlongAxis(Axes.Y, this.drawHeight - this.padding.totalVertical));

    for (let col = 0; col < this.cellColumns; col++) {
      for (let row = 0; row < this.cellRows; row++) {
        this.cells[row][col].size = new Vector2(widths[col], heights[row]);

        if (col > 0)
          this.cells[row][col].x = this.cells[row][col - 1].x + this.cells[row][col - 1].width;

        if (row > 0)
          this.cells[row][col].y = this.cells[row - 1][col].y + this.cells[row - 1][col].height;
      }
    }

    this.cellLayout.validate();
  }

  /**
   * Retrieves the size of all cells along the span of an axis.
   * For the X-axis, this retrieves the size of all columns. For the Y-axis, this retrieves the size of all rows.
   */
  private getCellSizesAlongAxis(axis: Axes, spanLength: number): number[] {
    const spanDimensions = axis === Axes.X ? this._columnDimensions : this._rowDimensions;
    const spanCount = axis === Axes.X ? this.cellColumns : this.cellRows;

    const sizes = new Array<number>(spanCount).fill(0);

    for (let i = 0; i < spanCount; i++) {
      if (i >= spanDimensions.length)
        break;

      const dimension = spanDimensions[i];

      switch (dimension.mode) {
        case GridSizeMode.Distributed:
          break;

        case GridSizeMode.Relative:
          sizes[i] = dimension.size * spanLength;
          break;

        case GridSizeMode.Absolute:
          sizes[i] = dimension.size;
          break;

        case GridSizeMode.AutoSize: {
          let size = 0;

          if (axis === Axes.X) {
            // Go through each row and get the width of the cell at the indexed column
            for (let r = 0; r < this.cellRows; r++) {
              const cell = this._content!.get(r)?.get(i);
              if (cell == null || (cell.relativeSizeAxes & axis) !== 0)
                continue;

              size = Math.max(size, getCellWidth(cell));
            }
          } else {
            // Go through each column and get the height of the cell at the indexed row
            for (let c = 0; c < this.cellColumns; c++) {
              const cell = this._content!.get(i)?.get(c);
              if (cell == null || (cell.relativeSizeAxes & axis) !== 0)
                continue;

              size = Math.max(size, getCellHeight(cell));
            }
          }

          sizes[i] = size;
          break;
        }
      }

      sizes[i] = Math.min(Math.max(sizes[i], dimension.minSize), dimension.maxSize);
    }

    return sizes;
  }

  /** Distributes any available length along all distributed dimensions, if required. cellSizes holds pre-filled sizes of any non-distributed cells and is mutated. */
  private distribute(dimensions: Dimension[], spanLength: number, cellSizes: number[]): number[] {
    // Indices of all distributed cells
    const distributedIndices = cellSizes.map((_, i) => i).filter(i => i >= dimensions.length || dimensions[i].mode === GridSizeMode.Distributed);

    // The dimensions corresponding to all distributed cells
    const distributedDimensions = distributedIndices.map(i => ({ index: i, dimension: i >= dimensions.length ? new Dimension() : dimensions[i] }));

    // Total number of distributed cells
    let distributionCount = distributedIndices.length;

    // Non-distributed size
    const requiredSize = cellSizes.reduce((a, b) => a + b, 0);

    // Distribution size for _each_ distributed cell
    let distributionSize = Math.max(0, spanLength - requiredSize) / distributionCount;

    // Write the sizes of distributed cells. Ordering is important to maximize excess at every step
    for (const entry of distributedDimensions.sort((a, b) => a.dimension.range - b.dimension.range)) {
      // Cells start off at their minimum size, and the total size should not exceed their maximum size
      cellSizes[entry.index] = Math.min(entry.dimension.maxSize, entry.dimension.minSize + distributionSize);

      // If there's no excess, any further distributions are guaranteed to also have no excess, so this becomes a null-op
      // If there is an excess, the excess should be re-distributed among all other n-1 distributed cells
      if (--distributionCount > 0)
        distributionSize += Math.max(0, distributionSize - entry.dimension.range) / distributionCount;
    }

    return cellSizes;
  }
}

const shouldConsiderCell = (cell: Drawable | null) => cell != null && cell.isAlive && cell.isPresent;
const getCellWidth = (cell: Drawable) => shouldConsiderCell(cell) ? cell.boundingBox.width : 0;
const getCellHeight = (cell: Drawable) => shouldConsiderCell(cell) ? cell.boundingBox.height : 0;

/** Represents one cell of the GridContainer. */
class CellContainer extends Container {
  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    let result = super.onInvalidate(invalidation, source);

    if (source === InvalidationSource.Child && (invalidation & (Invalidation.RequiredParentSizeToFit | Invalidation.Presence)) > 0)
      result = (this.parent?.invalidate(invalidation, InvalidationSource.Child) ?? false) || result;

    return result;
  }
}

/** Defines the size of a row or column in a GridContainer. */
export class Dimension {
  /** The mode in which this row or column GridContainer is sized. */
  readonly mode: GridSizeMode;

  /** The size of the row or column which this Dimension applies to. Only has an effect if mode is not Distributed. */
  readonly size: number;

  /** The minimum size of the row or column which this Dimension applies to. */
  readonly minSize: number;

  /** The maximum size of the row or column which this Dimension applies to. */
  readonly maxSize: number;

  constructor(mode = GridSizeMode.Distributed, size = 0, minSize = 0, maxSize = FLOAT_MAX) {
    if (minSize < 0)
      throw new RangeError(`minSize ('${minSize}') must be a non-negative value.`);
    if (minSize > maxSize)
      throw new RangeError(`minSize ('${minSize}') must be less than or equal to '${maxSize}'.`);

    this.mode = mode;
    this.size = size;
    this.minSize = minSize;
    this.maxSize = maxSize;
  }

  /** @internal The range of the size of this Dimension. */
  get range(): number {
    return this.maxSize - this.minSize;
  }
}

export enum GridSizeMode {
  /** Any remaining area of the GridContainer will be divided amongst this and all other elements which use Distributed. */
  Distributed,

  /** This element should be sized relative to the dimensions of the GridContainer. */
  Relative,

  /** This element has a size independent of the GridContainer. */
  Absolute,

  /** This element will be sized to the maximum size along its span. */
  AutoSize,
}
