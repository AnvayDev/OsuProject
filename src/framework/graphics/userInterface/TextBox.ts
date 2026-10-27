// Ported from osu.Framework/Graphics/UserInterface/TextBox.cs
// Numerical input types use the invariant ("en-US") number format. The text input scheduler takes closures (C# passes the text as data).

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Bindable, BindableWithCurrent } from '../../bindables/Bindable';
import { Cached } from '../../caching/Cached';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '../../input/bindings/KeyBindings';
import type {
  ClickEvent, DoubleClickEvent, DragEvent, DragStartEvent, FocusEvent, FocusLostEvent, KeyDownEvent, KeyUpEvent, MouseDownEvent, MouseUpEvent,
} from '../../input/events/UIEvents';
import { Key } from '../../input/Key';
import { PlatformAction } from '../../input/PlatformAction';
import { isNumerical, isPassword, TextInputSource, TextInputType, type TextInputProperties } from '../../input/TextInputSource';
import { Anchor, Axes, FillDirection } from '../../layout/Enums';
import { RectangleF } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { Clipboard } from '../../platform/Clipboard';
import { GameHost } from '../../platform/GameHost';
import { FontUsage } from '../../text/FontUsage';
import { Scheduler } from '../../timing/Scheduler';
import { Easing } from '../../transforms/Easing';
import type { Drawable } from '../Drawable';
import { Container } from '../containers/Container';
import { FillFlowContainer } from '../containers/FillFlowContainer';
import { TabbableContainer } from '../containers/TabbableContainer';
import { SpriteText } from '../sprites/SpriteText';
import type { Caret } from './Caret';

const isWhiteSpace = (c: string) => /\s/u.test(c);
const isLetterOrDigit = (c: string) => /[\p{L}\p{N}]/u.test(c);
const isControl = (c: string) => /\p{Cc}/u.test(c);
const isAsciiDigit = (c: string) => c >= '0' && c <= '9';

/** (PlatformActionExtensions.IsCommonTextEditingAction) */
function isCommonTextEditingAction(action: PlatformAction): boolean {
  switch (action) {
    case PlatformAction.Cut:
    case PlatformAction.Copy:
    case PlatformAction.Paste:
    case PlatformAction.SelectAll:
    case PlatformAction.MoveBackwardChar:
    case PlatformAction.MoveForwardChar:
    case PlatformAction.MoveBackwardWord:
    case PlatformAction.MoveForwardWord:
    case PlatformAction.MoveBackwardLine:
    case PlatformAction.MoveForwardLine:
    case PlatformAction.DeleteBackwardChar:
    case PlatformAction.DeleteForwardChar:
    case PlatformAction.DeleteBackwardWord:
    case PlatformAction.DeleteForwardWord:
    case PlatformAction.DeleteBackwardLine:
    case PlatformAction.DeleteForwardLine:
    case PlatformAction.SelectBackwardChar:
    case PlatformAction.SelectForwardChar:
    case PlatformAction.SelectBackwardWord:
    case PlatformAction.SelectForwardWord:
    case PlatformAction.SelectBackwardLine:
    case PlatformAction.SelectForwardLine:
      return true;

    default:
      return false;
  }
}

export enum TextSelectionType {
  /** A character was added or removed from the selection. */
  Character,
  /** A word was added or removed from the selection. */
  Word,
  /** All of the text was selected (i.e. via PlatformAction.SelectAll). */
  All,
}

enum WordTraversalStep {
  Whitespace,
  LetterOrDigit,
  Symbol,
}

interface SelectionBounds {
  start: number;
  end: number;
}

export abstract class TextBox extends TabbableContainer implements IKeyBindingHandler<PlatformAction> {
  readonly keyBindingActionTypes: readonly object[] = [PlatformAction];

  protected textFlow!: FillFlowContainer;
  protected textContainer!: Container;

  override get handleNonPositionalInput(): boolean {
    return this.hasFocus;
  }

  /** A character displayed whenever the type of text input set by TextInputProperties.type is hidden. */
  protected get maskCharacter(): string {
    return '*';
  }

  /** Padding to be used within the TextContainer. Requires special handling due to the sideways scrolling of text content. */
  protected get leftRightPadding(): number {
    return 5;
  }

  /** Maximum allowed length of text. Any input beyond this limit will be dropped and then notifyInputError will be called. */
  lengthLimit: number | null = null;

  /** Whether clipboard copying functionality is allowed. */
  protected get allowClipboardExport(): boolean {
    return !isPassword(this.inputProperties.type);
  }

  /** Whether seeking to word boundaries is allowed. */
  protected get allowWordNavigation(): boolean {
    return !isPassword(this.inputProperties.type);
  }

  /** Represents the left/right selection coordinates of the word double clicked on when dragging. */
  private doubleClickWord: [number, number] | null = null;

  /** Whether this TextBox should accept left and right arrow keys for navigation. */
  get handleLeftRightArrows(): boolean {
    return true;
  }

  /** A set of properties to consider when interacting with this TextBox. */
  inputProperties: TextInputProperties = { type: TextInputType.Text, allowIme: true };

  /** Check if a character can be added to this TextBox. */
  protected canAddCharacter(_character: string): boolean {
    return true;
  }

  /** Private helper for canAddCharacter, additionally requiring that the character is not a control character and obeys TextInputProperties.type. */
  private canAddCharacterInternal(character: string): boolean {
    if (!this.canAddCharacter(character))
      // discard characters explicitly overriden by custom implementation.
      return false;

    if (isControl(character))
      // discard control/special characters.
      return false;

    if (isNumerical(this.inputProperties.type)) {
      let validNumericalCharacter = false;

      validNumericalCharacter ||= isAsciiDigit(character);
      validNumericalCharacter ||= this.selectionLeft === 0 && character === '-';

      if (this.inputProperties.type === TextInputType.Decimal)
        validNumericalCharacter ||= character === '.';

      return validNumericalCharacter;
    }

    return true;
  }

  private _readOnly = false;

  get readOnly(): boolean {
    return this._readOnly;
  }

  set readOnly(value: boolean) {
    this._readOnly = value;

    if (this._readOnly)
      this.killFocus();
  }

  /** Whether the textbox should rescind focus on commit. */
  releaseFocusOnCommit = true;

  /** Whether a commit should be triggered whenever the textbox loses focus. */
  commitOnFocusLost = false;

  override get canBeTabbedTo(): boolean {
    return !this.readOnly;
  }

  private textInput!: TextInputSource;

  private clipboard!: Clipboard;

  /** Whether the GameHost is active (has keyboard focus). */
  private isActive!: Bindable<boolean>;

  private readonly caret: Caret;

  /** Fired whenever text is committed via a user action (C#'s OnCommit event). */
  readonly onCommit = new Set<(sender: TextBox, newText: boolean) => void>();

  /**
   * Scheduler used for scheduling text input events, IME composition and result events coming from textInput.
   * Updated early in the update frame in onKeyDown (so that the key event is blocked), and later in update().
   */
  private readonly textInputScheduler = new Scheduler();

  protected constructor() {
    super();

    this.masking = true;

    let placeholder!: SpriteText;
    let caret!: Caret;

    this.children = [
      this.textContainer = new Container().with({
        autoSizeAxes: Axes.X,
        relativeSizeAxes: Axes.Y,
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        position: new Vector2(this.leftRightPadding, 0),
        children: [
          placeholder = this.createPlaceholder().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
          }),
          caret = this.createCaret().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
          }),
          this.textFlow = new FillFlowContainer().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            direction: FillDirection.Horizontal,
            autoSizeAxes: Axes.Both,
          }),
        ],
      }),
    ];

    this.placeholder = placeholder;
    this.caret = caret;

    this.current.valueChanged.add(e => {
      // we generally want Text and Current to be synchronised at all times.
      // a change to Text will trigger a Current set, and potentially cause a feedback loop which isn't always desirable
      // (could lead to no animations playing out, etc.)
      // the following guard is supposed to not allow that feedback loop to close.
      if (this.text !== e.newValue)
        this.text = e.newValue;
    });

    this.caretVisible = false;
    this.caret.hide();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.textInput = dependencies.resolve(TextInputSource);
    this.clipboard = dependencies.resolve(Clipboard);
    this.isActive = dependencies.resolve(GameHost).isActive.getBoundCopy();

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.isActive.bindValueChanged(() => this.scheduler.addOnce(this.updateCaretVisibility));
    this.current.bindDisabledChanged(disabled => {
      if (disabled) {
        // disabling Current means that the textbox shouldn't accept any more user input.
        // if there is currently an ongoing composition, we want to finalize it and reset the user's IME
        // so that the user understands that compositing is done and that further input won't be accepted.
        this.finalizeImeComposition(false);
      }
    });

    this.setText(this.text);
  }

  onPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    if (!this.hasFocus)
      return false;

    if (!this.handleLeftRightArrows && (e.action === PlatformAction.MoveBackwardChar || e.action === PlatformAction.MoveForwardChar))
      return false;

    if (isCommonTextEditingAction(e.action) && this.imeCompositionActive)
      return true;

    const lastSelectionBounds = this.getTextSelectionBounds();

    switch (e.action) {
      // Clipboard
      case PlatformAction.Cut:
      case PlatformAction.Copy:
        if (!this.allowClipboardExport) return false;

        if (this.selectedText !== '') {
          this.clipboard.setText(this.selectedText);

          if (e.action === PlatformAction.Cut)
            this.deleteBy(0);
        }

        return true;

      case PlatformAction.Paste:
        if (this.textInputBlocking)
          // TextInputSource received text while this action got activated.
          // This is an indicator that text has already been pasted at an OS level
          // and has been received here through the TextInputSource flow.
          return true;

        this.insertString(this.clipboard.getText());
        return true;

      case PlatformAction.SelectAll:
        this.selectAll();
        this.onTextSelectionChangedInternal(TextSelectionType.All, lastSelectionBounds);
        return true;

      // Cursor Manipulation
      case PlatformAction.MoveBackwardChar:
        if (this.hasSelection)
          this.moveCursorBy(this.selectionLeft - this.selectionEnd);
        else
          this.moveCursorBy(-1);

        return true;

      case PlatformAction.MoveForwardChar:
        if (this.hasSelection)
          this.moveCursorBy(this.selectionRight - this.selectionEnd);
        else
          this.moveCursorBy(1);

        return true;

      case PlatformAction.MoveBackwardWord:
        if (this.hasSelection)
          this.moveCursorBy(this.selectionLeft - this.selectionEnd);
        else
          this.moveCursorBy(this.getBackwardWordAmount());

        return true;

      case PlatformAction.MoveForwardWord:
        if (this.hasSelection)
          this.moveCursorBy(this.selectionRight - this.selectionEnd);
        else
          this.moveCursorBy(this.getForwardWordAmount());

        return true;

      case PlatformAction.MoveBackwardLine:
        this.moveCursorBy(this.getBackwardLineAmount());
        return true;

      case PlatformAction.MoveForwardLine:
        this.moveCursorBy(this.getForwardLineAmount());
        return true;

      // Deletion
      case PlatformAction.DeleteBackwardChar:
        this.deleteBy(-1);
        return true;

      case PlatformAction.DeleteForwardChar:
        this.deleteBy(1);
        return true;

      case PlatformAction.DeleteBackwardWord:
        this.deleteBy(this.getBackwardWordAmount());
        return true;

      case PlatformAction.DeleteForwardWord:
        this.deleteBy(this.getForwardWordAmount());
        return true;

      case PlatformAction.DeleteBackwardLine:
        this.deleteBy(this.getBackwardLineAmount());
        return true;

      case PlatformAction.DeleteForwardLine:
        this.deleteBy(this.getForwardLineAmount());
        return true;

      // Expand selection
      case PlatformAction.SelectBackwardChar:
        this.expandSelectionBy(-1);
        this.onTextSelectionChangedInternal(TextSelectionType.Character, lastSelectionBounds);
        return true;

      case PlatformAction.SelectForwardChar:
        this.expandSelectionBy(1);
        this.onTextSelectionChangedInternal(TextSelectionType.Character, lastSelectionBounds);
        return true;

      case PlatformAction.SelectBackwardWord:
        this.expandSelectionBy(this.getBackwardWordAmount());
        this.onTextSelectionChangedInternal(TextSelectionType.Word, lastSelectionBounds);
        return true;

      case PlatformAction.SelectForwardWord:
        this.expandSelectionBy(this.getForwardWordAmount());
        this.onTextSelectionChangedInternal(TextSelectionType.Word, lastSelectionBounds);
        return true;

      case PlatformAction.SelectBackwardLine:
        this.expandSelectionBy(this.getBackwardLineAmount());
        // TODO: Differentiate 'line' and 'all' selection types if/when multi-line support is added
        this.onTextSelectionChangedInternal(TextSelectionType.All, lastSelectionBounds);
        return true;

      case PlatformAction.SelectForwardLine:
        this.expandSelectionBy(this.getForwardLineAmount());
        // TODO: Differentiate 'line' and 'all' selection types if/when multi-line support is added
        this.onTextSelectionChangedInternal(TextSelectionType.All, lastSelectionBounds);
        return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<PlatformAction>): void {
  }

  /** Selects all text in this TextBox. Focus must be acquired before calling this method. Returns false if the text box does not have focus. */
  selectAll(): boolean {
    if (!this.hasFocus)
      return false;

    this.selectionStart = 0;
    this.selectionEnd = this._text.length;
    this.cursorAndLayout.invalidate();
    return true;
  }

  /** Find the word boundary in the backward direction, then return the negative amount of characters. */
  protected getBackwardWordAmount(): number {
    if (!this.allowWordNavigation)
      return -1;

    return TextBox.findNextWord(this._text, this.selectionEnd, -1) - this.selectionEnd;
  }

  /** Find the word boundary in the forward direction, then return the positive amount of characters. */
  protected getForwardWordAmount(): number {
    if (!this.allowWordNavigation)
      return 1;

    return TextBox.findNextWord(this._text, this.selectionEnd, 1) - this.selectionEnd;
  }

  /** Finds the position of the next word from the current index in a given string, in the range [0, text.length]. */
  private static findNextWord(text: string, position: number, direction: number): number {
    // When going backwards, the initial position will always be the index of the first character in the next word,
    // but it should be the index of the character in the last word.
    if (direction === -1)
      position -= 1;

    let currentStep = WordTraversalStep.Whitespace;

    for (;;) {
      if (position < 0)
        return 0;

      if (position >= text.length)
        return text.length;

      const character = text[position];

      if (currentStep === WordTraversalStep.Whitespace) {
        if (isWhiteSpace(character))
          position += direction;
        else if (isLetterOrDigit(character))
          currentStep = WordTraversalStep.LetterOrDigit;
        else
          currentStep = WordTraversalStep.Symbol;

        continue;
      }

      if (currentStep === WordTraversalStep.Symbol) {
        if (isLetterOrDigit(character))
          currentStep = WordTraversalStep.LetterOrDigit;
        else if (isWhiteSpace(character))
          break;

        position += direction;
        continue;
      }

      // WordTraversalStep.LetterOrDigit
      if (isLetterOrDigit(character)) {
        position += direction;
        continue;
      }

      break;
    }

    // When going backwards, the final position will always be the the index of the last character of the previous word,
    // but it should be the index of the first character in the next word.
    if (direction === -1)
      position += 1;

    return position;
  }

  // Currently only single line is supported and line length and text length are the same.
  protected getBackwardLineAmount(): number {
    return -this._text.length;
  }

  protected getForwardLineAmount(): number {
    return this._text.length;
  }

  /** Move the current cursor by the signed amount. */
  protected moveCursorBy(amount: number): void {
    const lastSelectionBounds = this.getTextSelectionBounds();
    this.selectionStart = this.selectionEnd;
    this.cursorAndLayout.invalidate();
    this.moveSelection(amount, false);
    this.onTextDeselectedInternal(lastSelectionBounds);
  }

  /** Expand the current selection by the signed amount. */
  protected expandSelectionBy(amount: number): void {
    this.moveSelection(amount, true);
  }

  /**
   * If there is a selection, delete the selected text. Otherwise, delete characters from the cursor position by the signed amount.
   * A negative amount represents a backward deletion, and a positive amount represents a forward deletion.
   */
  protected deleteBy(amount: number): void {
    if (this.selectionLength === 0)
      this.selectionEnd = Math.min(Math.max(this.selectionStart + amount, 0), this._text.length);

    if (this.hasSelection) {
      const removedText = this.removeSelection();
      this.onUserTextRemoved(removedText);
    }
  }

  /** Finalize the current IME composition if one is active. userEvent: whether this was invoked from a user action (onImeResult is then invoked). */
  protected finalizeImeComposition(userEvent: boolean): void {
    // do nothing if there isn't an active composition.
    // importantly, if there are pending tasks, we should finish those off regardless
    // and then call `onImeResult()`.
    // the composition being inactive and having scheduled tasks shouldn't happen,
    // but the check is here to cover that improbable edge case.
    if (!this.imeCompositionActive && !this.textInputScheduler.hasPendingTasks)
      return;

    this.textInputScheduler.add(() => this.onImeResultInternal(userEvent, false));

    if (this.textInputBound)
      this.textInput.resetIme();

    // importantly, we want to force-update all pending composition events,
    // so that when we return control to the caller, those events won't mutate text and/or caret position.
    this.textInputScheduler.update();
  }

  /** Cancels the current IME composition, removing it from the text. */
  protected cancelImeComposition(): void {
    // same rationale as above, in `finalizeImeComposition()`
    if (!this.imeCompositionActive && !this.textInputScheduler.hasPendingTasks)
      return;

    if (this.textInputBound)
      this.textInput.resetIme();

    this.textInputScheduler.add(() => this.onImeCompositionInternal('', 0, 0, false));
    this.textInputScheduler.update(); // same rationale as above, in `finalizeImeComposition()`
  }

  protected override disposeInternal(isDisposing: boolean): void {
    this.onCommit.clear();

    this.unbindInput(null);

    super.disposeInternal(isDisposing);
  }

  private textContainerPosX = 0;

  private textAtLastLayout = '';

  private updateCursorAndLayout(): void {
    this.caret.height = this.fontSize;
    this.placeholder.font = this.placeholder.font.with({ size: this.fontSize });

    let cursorPos = 0;
    if (this._text.length > 0)
      cursorPos = this.getPositionAt(this.selectionLeft);

    const cursorPosEnd = this.getPositionAt(this.selectionEnd);

    let selectionWidth: number | null = null;
    if (this.hasSelection)
      selectionWidth = this.getPositionAt(this.selectionRight) - cursorPos;

    const cursorRelativePositionAxesInBox = (cursorPosEnd - this.textContainerPosX) / (this.drawWidth - 2 * this.leftRightPadding);

    //we only want to reposition the view when the cursor reaches near the extremities.
    if (cursorRelativePositionAxesInBox < 0.1 || cursorRelativePositionAxesInBox > 0.9)
      this.textContainerPosX = cursorPosEnd - this.drawWidth / 2 + this.leftRightPadding * 2;

    this.textContainerPosX = Math.min(Math.max(this.textContainerPosX, 0), Math.max(0, this.textFlow.drawWidth - this.drawWidth + this.leftRightPadding * 2));

    this.textContainer.moveToX(this.leftRightPadding - this.textContainerPosX, 300, Easing.OutExpo);

    if (this.caretVisible)
      this.caret.displayAt(new Vector2(cursorPos, 0), selectionWidth);

    if (this.textAtLastLayout.length === 0 || this._text.length === 0) {
      if (this._text.length === 0)
        this.placeholder.show();
      else
        this.placeholder.hide();
    }

    this.textAtLastLayout = this._text;
  }

  protected override update(): void {
    super.update();

    // update the schedulers before updating children as it might mutate TextFlow.
    // we want the character drawables to be up-to date for further calculations in `updateCursorAndLayout()`.
    this.textInputScheduler.update();
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // have to run this after children flow
    if (!this.cursorAndLayout.isValid) {
      // update in case selection length has changed.
      this.updateCaretVisibility();

      this.updateCursorAndLayout();
      this.cursorAndLayout.validate();

      // keep the IME window up-to date with the current selection / composition string.
      this.updateImeWindowPosition();
    }
  }

  private getPositionAt(index: number): number {
    if (index > 0) {
      const characters = this.textFlow.children;

      if (index < this._text.length)
        return characters[index].drawPosition.x + this.textFlow.drawPosition.x;

      const d = characters[index - 1];
      return d.drawPosition.x + d.drawSize.x + this.textFlow.spacing.x + this.textFlow.drawPosition.x;
    }

    return 0;
  }

  private getCharacterClosestTo(pos: Vector2): number {
    pos = this.parent!.toSpaceOfOtherDrawable(pos, this.textFlow);

    let i = 0;

    for (const d of this.textFlow.children) {
      if (d.drawPosition.x + d.drawSize.x / 2 > pos.x)
        break;

      i++;
    }

    return i;
  }

  private selectionStart = 0;
  private selectionEnd = 0;

  private get selectionLength(): number {
    return Math.abs(this.selectionEnd - this.selectionStart);
  }

  private get hasSelection(): boolean {
    return this.selectionLength > 0;
  }

  private get selectionLeft(): number {
    return Math.min(this.selectionStart, this.selectionEnd);
  }

  private get selectionRight(): number {
    return Math.max(this.selectionStart, this.selectionEnd);
  }

  private readonly cursorAndLayout = new Cached();

  private moveSelection(offset: number, expand: boolean): void {
    if (this.textInput.imeActive) return;

    const oldStart = this.selectionStart;
    const oldEnd = this.selectionEnd;
    const clamp = (v: number) => Math.min(Math.max(v, 0), this._text.length);

    if (expand)
      this.selectionEnd = clamp(this.selectionEnd + offset);
    else {
      if (this.hasSelection && Math.abs(offset) <= 1) {
        //we don't want to move the location when "removing" an existing selection, just set the new location.
        if (offset > 0)
          this.selectionEnd = this.selectionStart = this.selectionRight;
        else
          this.selectionEnd = this.selectionStart = this.selectionLeft;
      } else
        this.selectionEnd = this.selectionStart = clamp((offset > 0 ? this.selectionRight : this.selectionLeft) + offset);
    }

    if (oldStart !== this.selectionStart || oldEnd !== this.selectionEnd) {
      this.onCaretMoved(expand);
      this.cursorAndLayout.invalidate();
    }
  }

  /**
   * Indicates whether a complex change operation to text has begun.
   * We want to ensure that text is transferred out to current only at the end of such an operation chain.
   */
  private textChanging = false;

  /** Starts a text change operation. Returns whether this call has initiated a text change. */
  private beginTextChange(): boolean {
    if (this.textChanging)
      return false;

    return this.textChanging = true;
  }

  /** Ends a text change operation. This causes text to be transferred out to current. */
  private endTextChange(started: boolean): void {
    if (!started)
      return;

    if (this.current.value !== this.text)
      this.current.value = this.text;

    this.textChanging = false;
  }

  private ignoreOngoingDragSelection = false;

  /** Removes the selected text if a selection persists. */
  private removeSelection(): string {
    return this.removeCharacters(this.selectionLength);
  }

  /** Removes a specified number of characters left side of the current position. Returns a string of the removed characters. */
  private removeCharacters(number = 1): string {
    if (this.current.disabled || this._text.length === 0)
      return '';

    const removeStart = Math.min(Math.max(this.selectionRight - number, 0), this.selectionRight);
    const removeCount = this.selectionRight - removeStart;

    if (removeCount === 0)
      return '';

    const beganChange = this.beginTextChange();

    //(copied since we are removing items from the children in this block.)
    for (const d of this.textFlow.children.slice(removeStart, removeStart + removeCount)) {
      this.textFlow.remove(d, false);

      this.textContainer.add(d);

      // account for potentially altered height of textbox
      d.y = this.textFlow.boundingBox.y;

      d.hide();
      d.expire();
    }

    const removedText = this._text.substring(removeStart, removeStart + removeCount);

    this._text = this._text.substring(0, removeStart) + this._text.substring(removeStart + removeCount);

    // Reorder characters depth after removal to avoid ordering issues with newly added characters.
    const remaining = this.textFlow.children;
    for (let i = removeStart; i < remaining.length; i++)
      this.textFlow.changeChildDepth(remaining[i], this.getDepthForCharacterIndex(i));

    this.selectionStart = this.selectionEnd = removeStart;
    this.doubleClickWord = null;

    this.endTextChange(beganChange);
    this.cursorAndLayout.invalidate();

    return removedText;
  }

  /** Creates a single character. Override show and hide for custom behavior. */
  protected getDrawableCharacter(c: string): Drawable {
    return new SpriteText().with({ text: c, font: new FontUsage(null, this.fontSize) });
  }

  protected addCharacterToFlow(c: string): Drawable {
    if (isPassword(this.inputProperties.type))
      c = this.maskCharacter;

    // Remove all characters to the right and store them in a local list,
    // such that their depth can be updated.
    const charsRight = this.textFlow.children.slice(this.selectionLeft);
    this.textFlow.removeRange(charsRight, false);

    // Update their depth to make room for the to-be inserted character.
    let i = this.selectionLeft;
    for (const d of charsRight)
      d.depth = this.getDepthForCharacterIndex(i++);

    // Add the character
    const ch = this.getDrawableCharacter(c);
    ch.depth = this.getDepthForCharacterIndex(this.selectionLeft);

    this.textFlow.add(ch);

    // Add back all the previously removed characters
    this.textFlow.addRange(charsRight);

    return ch;
  }

  private getDepthForCharacterIndex(index: number): number {
    return -index;
  }

  private customFontSize: number | null = null;

  /** A fixed size for the text displayed in this TextBox. If left unset, text size will be computed based on the dimensions of the TextBox. */
  get fontSize(): number {
    return this.customFontSize ?? this.textContainer.drawSize.y;
  }

  set fontSize(value: number) {
    this.customFontSize = value;
  }

  protected insertString(value: string | null): void {
    // inserting text could insert it in the middle of an active composition, leading to an invalid state.
    // so finalize the composition before adding text.
    this.finalizeImeComposition(false);

    this.insertStringInternal(value);
  }

  private insertStringInternal(value: string | null, drawableCreationParameters: ((d: Drawable) => void) | null = null): void {
    if (!value) return;

    if (this.current.disabled) {
      this.notifyInputError();
      return;
    }

    const beganChange = this.beginTextChange();

    // (UTF-16 units, as C# iterates chars: one drawable per index of text.)
    for (let ci = 0; ci < value.length; ci++) {
      const c = value[ci];

      if (!this.canAddCharacterInternal(c)) {
        this.notifyInputError();
        continue;
      }

      if (this.hasSelection)
        this.removeSelection();

      if (this.lengthLimit !== null && this._text.length + 1 > this.lengthLimit) {
        this.notifyInputError();
        break;
      }

      const drawable = this.addCharacterToFlow(c);

      drawable.show();
      drawableCreationParameters?.(drawable);

      this._text = this._text.substring(0, this.selectionLeft) + c + this._text.substring(this.selectionLeft);

      this.selectionStart = this.selectionEnd = this.selectionLeft + 1;
      this.ignoreOngoingDragSelection = true;

      this.cursorAndLayout.invalidate();
    }

    this.endTextChange(beganChange);
  }

  /** Called whenever an invalid character has been entered. */
  protected abstract notifyInputError(): void;

  /** Invoked when new text is added via user input. */
  protected onUserTextAdded(_added: string): void {
  }

  /** Invoked when text is removed via user input. */
  protected onUserTextRemoved(_removed: string): void {
  }

  /** Invoked whenever a text string has been committed to the textbox. */
  protected onTextCommitted(_textChanged: boolean): void {
  }

  /** Invoked whenever the caret has moved from its position. */
  protected onCaretMoved(_selecting: boolean): void {
  }

  /** Invoked whenever text selection changes. For deselection, see onTextDeselected. */
  protected onTextSelectionChanged(_selectionType: TextSelectionType): void {
  }

  /** Invoked whenever selected text is deselected. For selection, see onTextSelectionChanged. */
  protected onTextDeselected(): void {
  }

  private onTextSelectionChangedInternal(selectionType: TextSelectionType, lastSelectionBounds: SelectionBounds): void {
    if (lastSelectionBounds.start === this.selectionStart && lastSelectionBounds.end === this.selectionEnd)
      return;

    if (this.hasSelection)
      this.onTextSelectionChanged(selectionType);
    else
      this.onTextDeselectedInternal(lastSelectionBounds);
  }

  private onTextDeselectedInternal(lastSelectionBounds: SelectionBounds): void {
    if (lastSelectionBounds.start === this.selectionStart && lastSelectionBounds.end === this.selectionEnd)
      return;

    if (lastSelectionBounds.start !== lastSelectionBounds.end)
      this.onTextDeselected();
  }

  private getTextSelectionBounds(): SelectionBounds {
    return { start: this.selectionStart, end: this.selectionEnd };
  }

  /** Invoked whenever the IME composition has changed. */
  protected onImeComposition(_newComposition: string, _removedTextLength: number, _addedTextLength: number, _selectionMoved: boolean): void {
  }

  /** Invoked when the IME has finished compositing. successful is false if ended prematurely. */
  protected onImeResult(_result: string, _successful: boolean): void {
  }

  /** Creates a placeholder that shows whenever the textbox is empty. Override show or hide for custom behavior. */
  protected abstract createPlaceholder(): SpriteText;

  protected placeholder: SpriteText;

  get placeholderText(): string {
    return this.placeholder.text;
  }

  set placeholderText(value: string) {
    this.placeholder.text = value;
  }

  protected abstract createCaret(): Caret;

  /** Whether the caret should be visible. */
  private caretVisible = false;

  private readonly updateCaretVisibility = (): void => {
    // a blinking cursor signals to the user that keyboard input will appear at that cursor,
    // hide the caret when we don't have keyboard focus to conform with that expectation.
    // importantly, we want the caret to remain visible when there is a selection.
    const newVisibility = this.hasFocus && (this.isActive.value || this.selectionLength !== 0);

    if (this.caretVisible !== newVisibility) {
      this.caretVisible = newVisibility;

      if (this.caretVisible)
        this.caret.show();
      else
        this.caret.hide();

      this.cursorAndLayout.invalidate();
    }
  };

  private readonly _current = new BindableWithCurrent<string>('');

  get current(): Bindable<string> {
    return this._current.current;
  }

  set current(value: Bindable<string>) {
    this._current.current = value;
  }

  private _text = '';

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    if (this.current.disabled)
      return;

    if (value === this._text)
      return;

    this.lastCommitText = value ??= '';

    if (value.length === 0)
      this.placeholder.show();
    else
      this.placeholder.hide();

    this.setText(value);
  }

  private setText(value: string): void {
    const beganChange = this.beginTextChange();

    // finalize and cleanup the IME composition (if one is active) so we get a clean slate for pending text changes and future IME composition.
    // `isLoaded` check is required because `text` could be set in the initializer / before the drawable loaded.
    // `finalizeImeComposition()` crashes if textbox isn't fully loaded.
    if (this.isLoaded) this.finalizeImeComposition(false);

    this.selectionStart = this.selectionEnd = 0;

    this.textFlow?.clear();
    this._text = '';

    // insert string and fast forward any transforms (generally when replacing the full content of a textbox we don't want any kind of fade etc.).
    this.insertStringInternal(value, d => d.finishTransforms());

    this.endTextChange(beganChange);
    this.cursorAndLayout.invalidate();
  }

  get selectedText(): string {
    return this.hasSelection ? this.text.substring(this.selectionLeft, this.selectionLeft + this.selectionLength) : '';
  }

  /**
   * Whether KeyDownEvents should be blocked because of recent text input from a TextInputSource.
   * Blocking starts when a text events occurs and ends when all keys are released (or on the next frame if no keys are pressed).
   */
  private textInputBlocking = false;

  /** Whether there is a ongoing IME composition. */
  protected get imeCompositionActive(): boolean {
    return (this.textInputBound && this.textInput.imeActive) || this.imeCompositionLength > 0;
  }

  // #region Input event handling

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (this._readOnly)
      return true;

    if (this.imeCompositionActive)
      return true;

    switch (e.key) {
      case Key.Escape:
        // if keypress is repeating, the IME was probably closed with the first, non-repeating keypress
        // so don't kill focus unless the user has explicitly released and pressed the key again.
        if (!e.repeat)
          this.killFocus();
        return true;

      case Key.KeypadEnter:
      case Key.Enter:
        // alt-enter is commonly used to toggle fullscreen.
        if (e.altPressed)
          return false;

        // same rationale as comment in case statement above.
        if (!e.repeat)
          this.commit();
        return true;

      // avoid blocking certain keys which we need propagated to a PlatformActionContainer,
      // so that we can get them as appropriate `PlatformAction`s in onPressed(KeyBindingPressEvent<PlatformAction>).
      case Key.BackSpace:
      case Key.Delete:
        return false;
    }

    // check for any pending text input.
    // updating here will set `textInputBlocking` accordingly.
    this.textInputScheduler.update();

    // block on recent text input *after* handling the above keys so those keys can be used during text input.
    return super.onKeyDown(e) || this.textInputBlocking;
  }

  /** Removes focus from this TextBox if it currently has focus. */
  protected killFocus(): void {
    this.killFocusInternal();
  }

  private lastCommitText = '';

  private killFocusInternal(): void {
    if (this.getContainingInputManager()?.focusedDrawable === this)
      this.getContainingFocusManager()?.changeFocus(null);
  }

  /** Commits current text on this TextBox and releases focus if releaseFocusOnCommit is set. */
  protected commit(): void {
    this.finalizeImeComposition(false);

    if (this.releaseFocusOnCommit && this.hasFocus) {
      this.killFocusInternal();
      if (this.commitOnFocusLost)
        // the commit will happen as a result of the focus loss.
        return;
    }

    const isNew = this._text !== this.lastCommitText;
    this.lastCommitText = this._text;

    this.onTextCommitted(isNew);
    for (const h of [...this.onCommit]) h(this, isNew);
  }

  protected override onKeyUp(e: KeyUpEvent): void {
    this.scheduler.addOnce(this.revertBlockingStateIfRequired);
    super.onKeyUp(e);
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    this.ignoreOngoingDragSelection = false;

    if (this.hasFocus)
      return true;

    const posDiff = e.mouseDownPosition.sub(e.mousePosition);
    return Math.abs(posDiff.x) > Math.abs(posDiff.y);
  }

  protected override onDrag(e: DragEvent): void {
    if (this.readOnly)
      return;

    this.finalizeImeComposition(true);

    if (this.ignoreOngoingDragSelection || this.tripleClickOngoing)
      return;

    const lastSelectionBounds = this.getTextSelectionBounds();

    if (this.doubleClickWord !== null) {
      //select words at a time
      if (this.getCharacterClosestTo(e.mousePosition) > this.doubleClickWord[1]) {
        this.selectionStart = this.doubleClickWord[0];
        this.selectionEnd = TextBox.findSeparatorIndex(this._text, this.getCharacterClosestTo(e.mousePosition) - 1, 1);
        this.selectionEnd = this.selectionEnd >= 0 ? this.selectionEnd : this._text.length;
      } else if (this.getCharacterClosestTo(e.mousePosition) < this.doubleClickWord[0]) {
        this.selectionStart = this.doubleClickWord[1];
        this.selectionEnd = TextBox.findSeparatorIndex(this._text, this.getCharacterClosestTo(e.mousePosition), -1);
        this.selectionEnd = this.selectionEnd >= 0 ? this.selectionEnd + 1 : 0;
      } else {
        //in the middle
        this.selectionStart = this.doubleClickWord[0];
        this.selectionEnd = this.doubleClickWord[1];
      }
    } else {
      if (this._text.length === 0) return;

      this.selectionEnd = this.getCharacterClosestTo(e.mousePosition);
      if (this.hasSelection)
        this.getContainingFocusManager()!.changeFocus(this);
    }

    this.cursorAndLayout.invalidate();

    this.onTextSelectionChangedInternal(this.doubleClickWord !== null ? TextSelectionType.Word : TextSelectionType.Character, lastSelectionBounds);
  }

  private lastDoubleClickTime: number | null = null;

  protected override onDoubleClick(e: DoubleClickEvent): boolean {
    this.lastDoubleClickTime = this.time.current;

    this.finalizeImeComposition(true);

    const lastSelectionBounds = this.getTextSelectionBounds();

    if (this._text.length === 0) return true;

    if (this.allowClipboardExport) {
      const hover = Math.min(this._text.length - 1, this.getCharacterClosestTo(e.mousePosition));

      const lastSeparator = TextBox.findSeparatorIndex(this._text, hover, -1);
      const nextSeparator = TextBox.findSeparatorIndex(this._text, hover, 1);

      this.selectionStart = lastSeparator >= 0 ? lastSeparator + 1 : 0;
      this.selectionEnd = nextSeparator >= 0 ? nextSeparator : this._text.length;
    } else {
      this.selectionStart = 0;
      this.selectionEnd = this._text.length;
    }

    //in order to keep the home word selected
    this.doubleClickWord = [this.selectionStart, this.selectionEnd];

    this.cursorAndLayout.invalidate();

    this.onTextSelectionChangedInternal(TextSelectionType.Word, lastSelectionBounds);

    return true;
  }

  private static findSeparatorIndex(input: string, searchPos: number, direction: number): number {
    const letterOrDigit = isLetterOrDigit(input[searchPos]);

    for (let i = searchPos; i >= 0 && i < input.length; i += direction) {
      if (isLetterOrDigit(input[i]) !== letterOrDigit)
        return i;
    }

    return -1;
  }

  private tripleClickOngoing = false;

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (this.readOnly)
      return true;

    this.finalizeImeComposition(true);

    const lastSelectionBounds = this.getTextSelectionBounds();

    const tripleClickTime = this.getContainingInputManager()!.getButtonEventManagerFor(e.button)!.doubleClickTime;

    if (this.lastDoubleClickTime !== null && this.time.current - this.lastDoubleClickTime < tripleClickTime) {
      this.lastDoubleClickTime = null;

      this.selectAll();

      this.onTextSelectionChangedInternal(TextSelectionType.All, lastSelectionBounds);

      this.tripleClickOngoing = true;

      return true;
    }

    this.selectionStart = this.selectionEnd = this.getCharacterClosestTo(e.mousePosition);

    this.cursorAndLayout.invalidate();

    this.onTextDeselectedInternal(lastSelectionBounds);

    return false;
  }

  protected override onMouseUp(_e: MouseUpEvent): void {
    this.doubleClickWord = null;
    this.tripleClickOngoing = false;
  }

  protected override onFocusLost(e: FocusLostEvent): void {
    // let's say that a focus loss is not a user event as focus is commonly indirectly lost.
    this.finalizeImeComposition(false);

    this.unbindInput(e.nextFocused instanceof TextBox ? e.nextFocused : null);

    this.updateCaretVisibility();

    if (this.commitOnFocusLost)
      this.commit();
  }

  override get acceptsFocus(): boolean {
    return true;
  }

  protected override onClick(_e: ClickEvent): boolean {
    if (!this.readOnly && this.textInputBound)
      this.textInput.ensureActivated(this.inputProperties);

    return !this.readOnly;
  }

  protected override onFocus(e: FocusEvent): void {
    this.bindInput(e.previouslyFocused instanceof TextBox ? e.previouslyFocused : null);

    this.updateCaretVisibility();
  }

  // #endregion

  // #region Native TextBox handling (platform-specific)

  /** Whether textInput has been activated and bound to. */
  private textInputBound = false;

  private bindInput(previous: TextBox | null): void {
    if (this.textInputBound) {
      this.textInput.ensureActivated(this.inputProperties);
      return;
    }

    // TextBox has special handling of text input activation when focus is changed directly from one TextBox to another.
    // We don't deactivate and activate, but instead keep text input active during the focus handoff, so that virtual keyboards on phones don't flicker.

    if (previous?.textInput === this.textInput)
      this.textInput.ensureActivated(this.inputProperties, this.screenSpaceDrawQuad.aabbFloat);
    else
      this.textInput.activate(this.inputProperties, this.screenSpaceDrawQuad.aabbFloat);

    this.textInput.onTextInput.add(this.handleTextInput);
    this.textInput.onImeComposition.add(this.handleImeComposition);
    this.textInput.onImeResult.add(this.handleImeResult);

    this.textInputBound = true;
  }

  private unbindInput(next: TextBox | null): void {
    if (!this.textInputBound)
      return;

    this.textInputBound = false;

    // see the comment above, in `bindInput()`.
    if (next?.textInput !== this.textInput)
      this.textInput.deactivate();

    this.textInput.onTextInput.delete(this.handleTextInput);
    this.textInput.onImeComposition.delete(this.handleImeComposition);
    this.textInput.onImeResult.delete(this.handleImeResult);

    // in case keys are held and we lose focus, we should no longer block key events
    this.textInputBlocking = false;
  }

  private readonly handleTextInput = (text: string): void => {
    this.textInputScheduler.add(() => {
      this.textInputBlocking = true;

      this.insertStringInternal(text);
      this.onUserTextAdded(text);

      // clear the flag in the next frame if no buttons are pressed/held.
      // needed in case a text event happens without an associated button press (and release).
      // this could be the case for software keyboards, for instance.
      this.scheduler.addOnce(this.revertBlockingStateIfRequired);
    });
  };

  /** Reverts the textInputBlocking flag to false if no keys are pressed. */
  private readonly revertBlockingStateIfRequired = (): void => {
    this.textInputBlocking &&= this.getContainingInputManager()?.currentState.keyboard.keys.hasAnyButtonPressed === true;
  };

  private readonly handleImeComposition = (composition: string, selectionStart: number, selectionLength: number): void => {
    this.textInputScheduler.add(() => this.onImeCompositionInternal(composition, selectionStart, selectionLength, true));
  };

  private readonly handleImeResult = (result: string): void => {
    this.textInputScheduler.add(() => {
      this.onImeCompositionInternal(result, result.length, 0, false);
      this.onImeResultInternal(true, true);
    });
  };

  /** Returns how many characters of the two strings match from the beginning, and from the end (characters matched from the beginning will not match from the end). */
  private static matchBeginningEnd(a: string, b: string): { matchBeginning: number; matchEnd: number } {
    const minLength = Math.min(a.length, b.length);

    let matchBeginning = 0;

    for (let i = 0; i < minLength; i++) {
      if (a[i] === b[i])
        matchBeginning = i + 1;
      else
        break;
    }

    let matchEnd = 0;

    // check how many match (of the ones we didn't match), starting from the end
    for (let i = 1; i <= minLength - matchBeginning; i++) {
      if (a[a.length - i] === b[b.length - i])
        matchEnd = i;
      else
        break;
    }

    return { matchBeginning, matchEnd };
  }

  /** Sanitizes the given composition, ensuring it fits within lengthLimit and respects canAddCharacter (sanitized: whether it changed). */
  private sanitizeComposition(composition: string, selectionStart: number, selectionLength: number): { composition: string; selectionStart: number; selectionLength: number; sanitized: boolean } {
    let sanitized = false;

    // remove characters that can't be added.

    const builder = composition.split('');

    for (let index = 0; index < builder.length; index++) {
      if (!this.canAddCharacterInternal(builder[index])) {
        builder.splice(index, 1);
        sanitized = true;

        if (index < selectionStart)
          selectionStart--;
        else if (index < selectionStart + selectionLength)
          selectionLength--;

        // move index back so we don't skip over the next character.
        index--;
      }
    }

    if (sanitized)
      composition = builder.join('');

    // trim composition if goes beyond the LengthLimit.

    const lengthWithoutComposition = this._text.length - this.imeCompositionLength;

    if (this.lengthLimit !== null && lengthWithoutComposition + composition.length > this.lengthLimit) {
      composition = composition.substring(0, this.lengthLimit - lengthWithoutComposition);
      sanitized = true;
    }

    // keep selection within bounds.
    // the selection could be out of bounds if it was trimmed by the above,
    // or if the platform-native composition event was ill-formed.

    if (selectionStart > composition.length) {
      selectionStart = composition.length;
      sanitized = true;
    }

    if (selectionStart + selectionLength > composition.length) {
      selectionLength = composition.length - selectionStart;
      sanitized = true;
    }

    return { composition, selectionStart, selectionLength, sanitized };
  }

  /** Contains all the Drawables from the textFlow that are part of the current IME composition. */
  private readonly imeCompositionDrawables: Drawable[] = [];

  /** Length of the current IME composition. A length of 0 means that IME composition isn't active. */
  private get imeCompositionLength(): number {
    return this.imeCompositionDrawables.length;
  }

  /** Index of the first character in the current composition. */
  private imeCompositionStart = 0;

  /** Checks which parts of the old and new compositions match, and only updates the non-matching part in the current composition text. */
  private onImeCompositionInternal(newComposition: string, newSelectionStart: number, newSelectionLength: number, userEvent: boolean): void {
    if (this.current.disabled) {
      // don't raise error if composition text is empty, as the empty event could be generated indirectly,
      // and not by explicit user interaction. eg. if IME is reset, input language is changed, etc.
      if (userEvent && newComposition !== '') {
        this.notifyInputError();

        // importantly, we want to reset the IME so it doesn't falsely report that IME composition is active.
        this.textInput.resetIme();
      }

      return;
    }

    // used for tracking the selection to report for `onImeComposition()`
    const oldStart = this.selectionStart;
    const oldEnd = this.selectionEnd;

    if (this.imeCompositionLength === 0) {
      // this is the start of a new composition, as we currently have no composition text.

      this.imeCompositionStart = this.selectionLeft;

      if (newComposition === '') {
        // we might get an empty composition when the IME is first activated,
        // the IME mode has changed (eg. plaintext -> kana),
        // or when the keyboard layout and language have changed to a one supported by an IME.
        // we can use this opportunity to update the IME window so it appears in
        // the correct place once the user starts compositing.
        this.updateImeWindowPosition();

        // early return as we might sometimes get empty text editing events.
        // we don't want the currently selected text to be removed in that case
        // (we only want it removed once the user has entered _some_ text).
        return;
      }

      if (this.hasSelection)
        this.removeSelection();
    }

    const beganChange = this.beginTextChange();

    const s = this.sanitizeComposition(newComposition, newSelectionStart, newSelectionLength);
    newComposition = s.composition;
    newSelectionStart = s.selectionStart;
    newSelectionLength = s.selectionLength;

    if (s.sanitized)
      this.notifyInputError();

    const oldComposition = this._text.substring(this.imeCompositionStart, this.imeCompositionStart + this.imeCompositionLength);

    const { matchBeginning, matchEnd } = TextBox.matchBeginningEnd(oldComposition, newComposition);

    // how many characters have been removed, starting from `matchBeginning`
    const removeCount = oldComposition.length - matchEnd - matchBeginning;

    // remove the characters that don't match
    if (removeCount > 0) {
      this.selectionStart = this.imeCompositionStart + matchBeginning;
      this.selectionEnd = this.selectionStart + removeCount;
      this.removeSelection();

      this.imeCompositionDrawables.splice(matchBeginning, removeCount);
    }

    // how many characters have been added, starting from `matchBeginning`
    const addCount = newComposition.length - matchEnd - matchBeginning;

    if (addCount > 0) {
      const addedText = newComposition.substring(matchBeginning, matchBeginning + addCount);

      // set up selection for `insertString`
      this.selectionStart = this.selectionEnd = this.imeCompositionStart + matchBeginning;

      let insertPosition = matchBeginning;
      this.insertStringInternal(addedText, d => {
        d.alpha = 0.6;
        this.imeCompositionDrawables.splice(insertPosition++, 0, d);
      });
    }

    // update the selection to the one the IME requested.
    // this selection is only a hint to the user, and is not used in the compositing logic.
    this.selectionStart = this.imeCompositionStart + newSelectionStart;
    this.selectionEnd = this.selectionStart + newSelectionLength;

    if (userEvent) this.onImeComposition(newComposition, removeCount, addCount, oldStart !== this.selectionStart || oldEnd !== this.selectionEnd);

    this.endTextChange(beganChange);
    this.cursorAndLayout.invalidate();
  }

  private onImeResultInternal(userEvent: boolean, successful: boolean): void {
    if (this.current.disabled) {
      if (userEvent) this.notifyInputError();
      // importantly, we don't return here so that we can finalize the composition
      // if we were called because Current was disabled.
    }

    // we only succeeded if there is pending data in the textbox
    if (this.imeCompositionDrawables.length > 0) {
      for (const d of this.imeCompositionDrawables)
        d.fadeTo(1, 200, Easing.Out);

      // move the cursor to end of finalized composition.
      this.selectionStart = this.selectionEnd = this.imeCompositionStart + this.imeCompositionLength;

      if (userEvent) this.onImeResult(this._text.substring(this.imeCompositionStart, this.imeCompositionStart + this.imeCompositionLength), successful);
    }

    this.imeCompositionDrawables.length = 0;

    this.cursorAndLayout.invalidate();
  }

  /** Updates the location of the platform-native IME composition window to the current composition string / current selection. */
  private updateImeWindowPosition(): void {
    if (!this.cursorAndLayout.isValid || !this.textInputBound)
      return;

    let startIndex: number, endIndex: number;

    if (this.imeCompositionLength > 0) {
      startIndex = this.imeCompositionStart;
      endIndex = this.imeCompositionStart + this.imeCompositionLength;
    } else {
      startIndex = this.selectionLeft;
      endIndex = this.selectionRight;
    }

    let start = this.getPositionAt(startIndex) - this.textContainerPosX + this.leftRightPadding;
    let end = this.getPositionAt(endIndex) - this.textContainerPosX + this.leftRightPadding;

    if (this.leftRightPadding <= this.drawWidth - this.leftRightPadding) {
      const clamp = (v: number) => Math.min(Math.max(v, this.leftRightPadding), this.drawWidth - this.leftRightPadding);
      start = clamp(start);
      end = clamp(end);
    } else {
      // DrawWidth is probably zero/invalid, sane fallback instead of throwing in Math.Clamp
      start = 0;
      end = 0;
    }

    const compositionTextRectangle = new RectangleF(start, 0, end - start, this.drawHeight);

    const quad = this.toScreenSpaceRect(compositionTextRectangle);
    this.textInput.setImeRectangle(quad.aabbFloat);
  }

  // #endregion
}
