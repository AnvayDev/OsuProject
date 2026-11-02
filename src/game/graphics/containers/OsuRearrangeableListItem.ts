// Ported from osu.Game/Graphics/Containers/OsuRearrangeableListItem.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { RearrangeableListItem } from '@fw/graphics/containers/RearrangeableListItem';
import type { Drawable } from '@fw/graphics/Drawable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { DragEndEvent, DragStartEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { HoverClickSounds } from '../userInterface/HoverClickSounds';

export abstract class OsuRearrangeableListItem<TModel> extends RearrangeableListItem<TModel> {
  static readonly FADE_DURATION = 100;

  /** Whether any item is currently being dragged. Used to hide other items' drag handles. */
  readonly dragActive = new BindableBool();

  private _handleColour = Colour4.White;

  /** The colour of the drag handle. */
  protected get handleColour(): Colour4 {
    return this._handleColour;
  }

  protected set handleColour(value: Colour4) {
    if (this._handleColour.equals(value))
      return;

    this._handleColour = value;

    if (this.dragHandle)
      this.dragHandle.colour = value;
  }

  /** Whether the drag handle should be shown. */
  protected readonly showDragHandle = new Bindable<boolean>(true);

  private handleContainer!: Container;
  /** (C#'s handle: Drawable.handle is the input event handler here) */
  private dragHandle!: PlaylistItemHandle;

  protected constructor(item: TModel) {
    super(item);

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.internalChildren = [
      new HoverClickSounds(),
      new GridContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        content: [
          [
            this.handleContainer = new Container().with({
              anchor: Anchor.Centre,
              origin: Anchor.Centre,
              autoSizeAxes: Axes.Both,
              padding: MarginPadding.of({ horizontal: 5 }),
              child: this.dragHandle = new PlaylistItemHandle().with({
                size: new Vector2(12),
                colour: this.handleColour,
                alwaysPresent: true,
                alpha: 0,
              }),
            }),
            this.createContent(),
          ],
        ],
        columnDimensions: [new Dimension(GridSizeMode.AutoSize)],
        rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.showDragHandle.bindValueChanged(show => this.handleContainer.alpha = show.newValue ? 1 : 0, true);
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    if (!super.onDragStart(e))
      return false;

    this.dragActive.value = true;
    return true;
  }

  protected override onDragEnd(e: DragEndEvent): void {
    this.dragActive.value = false;
    super.onDragEnd(e);
  }

  protected override isDraggableAt(_screenSpacePos: Vector2): boolean {
    return this.dragHandle.handlingDrag;
  }

  protected override onHover(e: HoverEvent): boolean {
    this.dragHandle.updateHoverState(this.isDragged || !this.dragActive.value);
    return super.onHover(e);
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.dragHandle.updateHoverState(false);
  }

  protected abstract createContent(): Drawable;
}

/** (OsuRearrangeableListItem<TModel>.PlaylistItemHandle) */
export class PlaylistItemHandle extends SpriteIcon {
  private _handlingDrag = false;

  get handlingDrag(): boolean {
    return this._handlingDrag;
  }

  private isHovering = false;

  constructor() {
    super();

    this.icon = FontAwesome.Solid.Bars;
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    super.onMouseDown(e);

    this._handlingDrag = true;
    this.updateHoverState(this.isHovering);

    return false;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    super.onMouseUp(e);

    this._handlingDrag = false;
    this.updateHoverState(this.isHovering);
  }

  updateHoverState(hovering: boolean): void {
    this.isHovering = hovering;

    if (this.isHovering || this._handlingDrag)
      this.fadeIn(OsuRearrangeableListItem.FADE_DURATION);
    else
      this.fadeOut(OsuRearrangeableListItem.FADE_DURATION);
  }
}
