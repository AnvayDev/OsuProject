// Ported from osu.Framework/Graphics/Cursor/TooltipContainer.cs
// Touch input isn't ported (computeTouchTooltipPosition): tooltips follow the mouse. The browser draws the cursor, so there is no
// CursorContainer and the cursor's bounding circle is the C# default for a missing one (radius 14 around the mouse position).

import { Vector2 } from '../../layout/Vector2';
import { Axes } from '../../layout/Enums';
import type { InputManager } from '../../input/InputManager';
import { Colour4 } from '../Colour4';
import type { CompositeDrawable } from '../containers/CompositeDrawable';
import { Container } from '../containers/Container';
import { VisibilityContainer } from '../containers/VisibilityContainer';
import type { Drawable } from '../Drawable';
import { Box } from '../shapes/Box';
import { SpriteText } from '../sprites/SpriteText';
import { MarginPadding } from '../../layout/MarginPadding';
import { CursorEffectContainer } from './CursorEffectContainer';
import { appearDelayOf, isHasCustomTooltip, isHasTooltip, type ITooltipContentProvider } from './IHasTooltip';
import type { ITooltip } from './ITooltip';

interface TimedPosition {
  readonly time: number;
  readonly position: Vector2;
}

/** Displays Tooltips for all its children that inherit from the IHasTooltip or IHasCustomTooltip interfaces. */
export class TooltipContainer extends CursorEffectContainer<ITooltipContentProvider> {
  private readonly defaultTooltip: ITooltip;

  protected currentTooltip: ITooltip;

  private tooltipInputManager: InputManager | null = null;

  /** Duration the cursor has to stay in a circular region of AppearRadius for the tooltip to appear. */
  protected get appearDelay(): number {
    return 220;
  }

  /** Radius of the circular region the cursor has to stay in for AppearDelay milliseconds for the tooltip to appear. */
  protected get appearRadius(): number {
    return 20;
  }

  private currentlyDisplayed: ITooltipContentProvider | null = null;

  /** Creates a new tooltip. Can be overridden to supply custom subclass of Tooltip. */
  protected createTooltip(): ITooltip {
    return new Tooltip();
  }

  private readonly tooltipContent: Container;

  protected override get content(): Container<Drawable> {
    return this.tooltipContent;
  }

  constructor() {
    super();

    this.addInternal(this.tooltipContent = new Container().with({
      relativeSizeAxes: Axes.Both,
    }));

    this.addInternal(this.currentTooltip = this.createTooltip());
    this.defaultTooltip = this.currentTooltip;
  }

  protected override isTarget(d: Drawable): d is ITooltipContentProvider {
    return isHasTooltip(d) || isHasCustomTooltip(d);
  }

  protected override isSelfType(d: CompositeDrawable | null): boolean {
    return d instanceof TooltipContainer;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.tooltipInputManager = this.getContainingInputManager();
  }

  private computeTooltipPosition(): Vector2 {
    // Our goal is to find the bounding circle of the cursor in screen-space, and to
    // position the top-left corner of the tooltip at the circle's southeast position.
    const cursorCentre = this.toLocalSpace(this.tooltipInputManager!.currentState.mouse.position);
    const boundingRadius = 14;

    const southEast = new Vector2(1, 1).normalized();
    let x = cursorCentre.x + southEast.x * boundingRadius;
    let y = cursorCentre.y + southEast.y * boundingRadius;

    // Clamp position to tooltip container
    x = Math.min(x, this.drawWidth - this.currentTooltip.drawSize.x - 5);
    const dX = Math.max(0, x - cursorCentre.x);
    const dY = Math.sqrt(Math.max(0, boundingRadius * boundingRadius - dX * dX));

    if (y > this.drawHeight - this.currentTooltip.drawSize.y - 5)
      y = cursorCentre.y - dY - this.currentTooltip.drawSize.y;
    else
      y = cursorCentre.y + dY;

    return new Vector2(x, y);
  }

  private getTargetContent(target: ITooltipContentProvider): unknown {
    return isHasCustomTooltip(target) ? target.tooltipContent : target.tooltipText;
  }

  protected override update(): void {
    super.update();

    const target = this.findTooltipTarget();

    if (target !== null && target !== this.currentlyDisplayed) {
      this.currentlyDisplayed = target;

      const proposedTooltip = this.getTooltip(target);

      if (proposedTooltip.constructor === this.currentTooltip.constructor)
        this.currentTooltip.setContent(this.getTargetContent(target));
      else {
        this.removeInternal(this.currentTooltip, false);
        this.currentTooltip = proposedTooltip;
        this.addInternal(proposedTooltip);
      }

      if (this.hasValidTooltip(target))
        this.currentTooltip.show();
    }

    this.refreshTooltip(this.currentTooltip, this.currentlyDisplayed);

    if (this.currentlyDisplayed !== null && this.shallHideTooltip(this.currentlyDisplayed))
      this.hideTooltip();
  }

  private readonly recentMousePositions: TimedPosition[] = [];
  private lastRecordedPositionTime = 0;

  private hasValidTooltip(target: ITooltipContentProvider): boolean {
    const targetContent = this.getTargetContent(target);

    if (typeof targetContent === 'string' || targetContent === null || targetContent === undefined)
      return !!targetContent;

    return true;
  }

  private lastCandidate: ITooltipContentProvider | null = null;

  private findTooltipTarget(): ITooltipContentProvider | null {
    // While we are dragging a tooltipped drawable we should show a tooltip for it.
    const dragged = this.tooltipInputManager!.draggedDrawable;

    if (dragged !== null && this.isTarget(dragged))
      return this.hasValidTooltip(dragged) ? dragged : null;

    let targetCandidate: ITooltipContentProvider | null = null;

    for (const target of this.findTargets()) {
      if (this.hasValidTooltip(target)) {
        targetCandidate = target;
        break;
      }
    }

    // check this first - if we find no target candidate we still want to clear the recorded positions and update the lastCandidate.
    if (targetCandidate !== this.lastCandidate) {
      this.recentMousePositions.length = 0;
      this.lastCandidate = targetCandidate;
    }

    if (targetCandidate === null)
      return null;

    return this.handlePotentialTarget(targetCandidate);
  }

  private handlePotentialTarget(targetCandidate: ITooltipContentProvider): ITooltipContentProvider | null {
    const appearDelay = appearDelayOf(targetCandidate) ?? this.appearDelay;

    // Always keep 10 positions at equally-sized time intervals that add up to AppearDelay.
    const positionRecordInterval = appearDelay / 10;

    if (this.time.current - this.lastRecordedPositionTime >= positionRecordInterval) {
      this.lastRecordedPositionTime = this.time.current;
      this.recentMousePositions.push({
        time: this.time.current,
        position: this.toLocalSpace(this.tooltipInputManager!.currentState.mouse.position),
      });
    }

    // check that we have recorded enough positions to make a judgement about whether or not the cursor has been standing still for the required amount of time.
    // we can skip this if the appear-delay is set to 0, since then tooltips can appear instantly and we don't need to wait to record enough positions.
    if (appearDelay > 0 && (this.recentMousePositions.length === 0 || this.lastRecordedPositionTime - this.recentMousePositions[0].time < appearDelay - positionRecordInterval))
      return null;

    for (let i = this.recentMousePositions.length - 1; i >= 0; i--) {
      if (this.time.current - this.recentMousePositions[i].time > appearDelay)
        this.recentMousePositions.splice(i, 1);
    }

    // For determining whether to show a tooltip we first select only those positions
    // which happened within a shorter, alpha-adjusted appear delay.
    const alphaModifiedAppearDelay = (1 - this.currentTooltip.alpha) * appearDelay;

    // We then check whether all relevant positions fall within a radius of AppearRadius within the
    // first relevant position. If so, then the mouse has stayed within a small circular region of
    // AppearRadius for the duration of the modified appear delay, and we therefore want to display
    // the tooltip.
    let first: Vector2 | null = null;
    const appearRadiusSq = this.appearRadius * this.appearRadius;

    for (const mPos of this.recentMousePositions) {
      if (this.time.current - mPos.time > alphaModifiedAppearDelay)
        continue;

      first ??= mPos.position;

      const dx = mPos.position.x - first.x;
      const dy = mPos.position.y - first.y;
      if (dx * dx + dy * dy > appearRadiusSq)
        return null;
    }

    return targetCandidate;
  }

  /** Refreshes the displayed tooltip. By default, this moves the tooltip to the current mouse position and updates its content. */
  protected refreshTooltip(tooltip: ITooltip, tooltipTarget: ITooltipContentProvider | null): void {
    const isValid = tooltipTarget !== null && this.hasValidTooltip(tooltipTarget);

    if (isValid)
      tooltip.setContent(this.getTargetContent(tooltipTarget));

    if (isValid || tooltip.isPresent)
      tooltip.move(this.computeTooltipPosition());
  }

  private hideTooltip(): void {
    this.currentTooltip.hide();
    this.currentlyDisplayed = null;
  }

  /** Returns true if the currently visible tooltip should be hidden, false otherwise. */
  protected shallHideTooltip(tooltipTarget: ITooltipContentProvider): boolean {
    return !this.hasValidTooltip(tooltipTarget) || (!tooltipTarget.isHovered && !tooltipTarget.isDragged);
  }

  private getTooltip(target: ITooltipContentProvider): ITooltip {
    return isHasCustomTooltip(target) ? target.getCustomTooltip() : this.defaultTooltip;
  }
}

/** The default tooltip. Simply displays its text on a gray background and performs no easing. */
export class Tooltip extends VisibilityContainer implements ITooltip {
  private readonly text: SpriteText;

  set tooltipText(value: string) {
    this.setContent(value);
  }

  setContent(content: unknown): void {
    this.text.text = String(content ?? '');
  }

  constructor() {
    super();

    this.alpha = 0;
    this.autoSizeAxes = Axes.Both;

    this.children = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.Gray,
      }),
      // (FrameworkFont.Regular isn't bundled: SpriteText's default font, at text_size 16)
      this.text = new SpriteText().with({
        padding: new MarginPadding(5),
      }),
    ];
  }

  refresh(): void {
  }

  protected override popIn(): void {
    this.fadeIn();
  }

  protected override popOut(): void {
    this.fadeOut();
  }

  move(pos: Vector2): void {
    this.position = pos;
  }
}
