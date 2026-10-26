// Ported from osu.Framework/Graphics/UserInterface/SliderBar.cs
// C#'s generic T is double here (the only slider so far, the song select star range); positions are single precision as in C#.

import type { Bindable } from '../../bindables/Bindable';
import { BindableDouble, type BindableNumber, BindableNumberWithCurrent } from '../../bindables/BindableNumber';
import { type ClickEvent, type DragEndEvent, DragEvent, type DragStartEvent, type KeyDownEvent, type KeyUpEvent, type MouseButtonEvent, type MouseDownEvent } from '../../input/events/UIEvents';
import { Key } from '../../input/Key';
import { Container } from '../containers/Container';

export abstract class SliderBar extends Container {
  /** Range padding reduces the range of movement a slider bar is allowed to have while still receiving input in the padded region. */
  rangePadding = 0;

  get usableWidth(): number {
    return this.drawWidth - 2 * this.rangePadding;
  }

  /** A custom step value for each key press which actuates a change on this control. */
  keyboardStep = 0;

  /** The instantaneous value, which may not yet be committed to current (see transferValueOnCommit). */
  private readonly currentNumberInstantaneous: BindableNumber;

  /** When set, value changes based on user input are only transferred to any bound current on commit. */
  transferValueOnCommit = false;

  private readonly _current = new BindableNumberWithCurrent();

  protected get currentNumber(): BindableNumber {
    return this._current;
  }

  get current(): Bindable<number> {
    return this._current;
  }

  set current(value: Bindable<number>) {
    this._current.current = value;

    this.currentNumberInstantaneous.default = this._current.default;
  }

  protected constructor() {
    super();

    const instantaneous = this.currentNumberInstantaneous = new BindableDouble();

    this._current.valueChanged.add(e => instantaneous.value = e.newValue);
    this._current.minValueChanged.add(v => instantaneous.minValue = v);
    this._current.maxValueChanged.add(v => instantaneous.maxValue = v);
    this._current.precisionChanged.add(v => instantaneous.precision = v);
    this._current.disabledChanged.add(disabled => {
      if (disabled) {
        // revert any changes before disabling to make sure we are in a consistent state.
        instantaneous.value = this._current.value;
        this.uncommittedChanges = false;
      }

      instantaneous.disabled = disabled;
    });

    instantaneous.valueChanged.add(e => {
      if (!this.transferValueOnCommit)
        this._current.value = e.newValue;
    });
  }

  protected get normalizedValue(): number {
    if (!this.currentNumberInstantaneous.hasDefinedRange)
      throw new Error('A SliderBar\'s current must have user-defined minValue and maxValue to produce a valid normalizedValue.');

    return Math.fround(this.currentNumberInstantaneous.normalizedValue);
  }

  /** Triggered when the value is changed based on end-user input to this control. */
  protected abstract updateValue(value: number): void;

  protected override loadComplete(): void {
    super.loadComplete();

    this.currentNumberInstantaneous.valueChanged.add(() => this.scheduler.addOnce(this.updateValueNow));
    this.currentNumberInstantaneous.minValueChanged.add(() => this.scheduler.addOnce(this.updateValueNow));
    this.currentNumberInstantaneous.maxValueChanged.add(() => this.scheduler.addOnce(this.updateValueNow));

    this.scheduler.addOnce(this.updateValueNow);
  }

  private readonly updateValueNow = (): void => this.updateValue(this.normalizedValue);

  private handleClick = false;
  private relativeValueAtMouseDown: number | null = null;

  protected override onMouseDown(e: MouseDownEvent): boolean {
    // Relative value at MouseDown shouldn't change until dragging ends.
    if (this.isDragged)
      return super.onMouseDown(e);

    if (this.shouldHandleAsRelativeDrag(e)) {
      const min = Math.fround(this.currentNumberInstantaneous.minValue);
      const max = Math.fround(this.currentNumberInstantaneous.maxValue);
      const val = Math.fround(this.currentNumberInstantaneous.value);

      this.relativeValueAtMouseDown = Math.fround((val - min) / (max - min));

      // Click shouldn't be handled if relative dragging is happening (i.e. while holding a nub).
      // This is generally an expectation by most OSes and UIs.
      this.handleClick = false;
    } else {
      this.handleClick = true;
      this.relativeValueAtMouseDown = null;
    }

    return super.onMouseDown(e);
  }

  protected override onClick(e: ClickEvent): boolean {
    if (this.handleClick) {
      this.handleMouseInput(e);
      this.commit();
    }

    return true;
  }

  protected override onDrag(e: DragEvent): void {
    this.handleMouseInput(e);
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    const posDiff = e.mouseDownPosition.sub(e.mousePosition);

    if (Math.abs(posDiff.x) < Math.abs(posDiff.y)) {
      this.handleClick = false;
      return false;
    }

    this.getContainingFocusManager()?.changeFocus(this);
    this.handleMouseInput(e);
    return true;
  }

  protected override onDragEnd(_e: DragEndEvent): void {
    this.commit();
  }

  override get acceptsFocus(): boolean {
    return true;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (this.currentNumberInstantaneous.disabled)
      return false;

    if (!this.isHovered && !this.hasFocus)
      return false;

    let step = this.keyboardStep !== 0
      ? this.keyboardStep
      : Math.fround((Math.fround(this.currentNumberInstantaneous.maxValue) - Math.fround(this.currentNumberInstantaneous.minValue)) / 20);
    if (this.currentNumberInstantaneous.isInteger) step = Math.ceil(step);

    switch (e.key) {
      case Key.Right:
        this.currentNumberInstantaneous.add(step);
        this.onUserChangeInternal(this.currentNumberInstantaneous.value);
        return true;

      case Key.Left:
        this.currentNumberInstantaneous.add(-step);
        this.onUserChangeInternal(this.currentNumberInstantaneous.value);
        return true;

      default:
        return false;
    }
  }

  protected override onKeyUp(e: KeyUpEvent): void {
    if (e.key === Key.Left || e.key === Key.Right)
      this.commit();
  }

  private uncommittedChanges = false;

  protected commit(): boolean {
    if (!this.uncommittedChanges)
      return false;

    this._current.value = this.currentNumberInstantaneous.value;
    this.uncommittedChanges = false;
    return true;
  }

  /** Whether mouse handling should be relative to the distance travelled, or absolute in line with the exact position of the cursor. */
  protected shouldHandleAsRelativeDrag(_e: MouseDownEvent): boolean {
    return false;
  }

  private handleMouseInput(e: MouseButtonEvent): void {
    if (this.currentNumberInstantaneous.disabled)
      return;

    const localX = this.toLocalSpace(e.screenSpaceMousePosition).x;

    let newValue: number;

    if (this.relativeValueAtMouseDown !== null && e instanceof DragEvent)
      newValue = Math.fround(this.relativeValueAtMouseDown + (localX - this.toLocalSpace(e.screenSpaceMouseDownPosition).x) / this.usableWidth);
    else
      newValue = Math.fround((localX - this.rangePadding) / this.usableWidth);

    this.currentNumberInstantaneous.setProportional(newValue, e.shiftPressed ? this.keyboardStep : 0);
    this.onUserChangeInternal(this.currentNumberInstantaneous.value);
  }

  private onUserChangeInternal(value: number): void {
    this.uncommittedChanges = true;
    this.onUserChange(value);
  }

  /** Triggered when the value is changed based on end-user input to this control. */
  protected onUserChange(_value: number): void {
  }
}
