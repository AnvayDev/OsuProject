// Ported from osu.Framework/Graphics/Containers/TextFlowContainer.cs (+ ITextPart.cs, TextPart.cs, TextPartManual.cs, TextChunk.cs, TextNewLine.cs,
// Graphics/Sprites/IHasLineBaseHeight.cs).
// There is no LocalisationManager: text is a plain string, so parts are only recreated when the parts cache is invalidated by removePart.

import { Signal } from '../../bindables/Signal';
import { Cached } from '../../caching/Cached';
import { Anchor, Axes, FillDirection, FillMode } from '../../layout/Enums';
import { Precision } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import type { Drawable } from '../Drawable';
import { SpriteText } from '../sprites/SpriteText';
import { CompositeDrawable } from './CompositeDrawable';
import { Container } from './Container';
import { FillFlowContainer } from './FillFlowContainer';

/** An object that has a line base height (IHasLineBaseHeight). */
export interface IHasLineBaseHeight {
  readonly lineBaseHeight: number;
}

const lineBaseHeightOf = (d: Drawable): number | null => {
  const value = (d as Partial<IHasLineBaseHeight>).lineBaseHeight;
  return typeof value === 'number' ? value : null;
};

/**
 * Represents a part of text inside a TextFlowContainer.
 * This implementation allows for the contents of a text part to be swapped out, in order to support things like text localisation, for instance.
 */
export interface ITextPart {
  /** The drawables which currently correspond to this text part. */
  readonly drawables: readonly Drawable[];

  /** Raised when drawables is reconstructed. Can be used by consumers to re-apply manual adjustments to the appearance of drawables. */
  readonly drawablePartsRecreated: Signal<readonly Drawable[]>;

  /** Recreates the drawables for this text part, in order for them to be appended to the textFlowContainer. */
  recreateDrawablesFor(textFlowContainer: TextFlowContainer): void;
}

/** A basic implementation of ITextPart, which automatically handles returning correct drawables and raising drawablePartsRecreated. */
export abstract class TextPart implements ITextPart {
  private readonly drawablesList: Drawable[] = [];

  get drawables(): readonly Drawable[] {
    return this.drawablesList;
  }

  readonly drawablePartsRecreated = new Signal<readonly Drawable[]>();

  recreateDrawablesFor(textFlowContainer: TextFlowContainer): void {
    this.drawablesList.length = 0;
    this.drawablesList.push(...this.createDrawablesFor(textFlowContainer));
    this.drawablePartsRecreated.emit(this.drawablesList);
  }

  /** Creates drawables representing the contents of this TextPart, to be appended to the textFlowContainer. */
  protected abstract createDrawablesFor(textFlowContainer: TextFlowContainer): Iterable<Drawable>;
}

/** An ITextPart which utilises externally-provided drawables. Will never recreate its contents or raise drawablePartsRecreated. */
export class TextPartManual implements ITextPart {
  readonly drawables: readonly Drawable[];

  readonly drawablePartsRecreated = new Signal<readonly Drawable[]>();

  constructor(drawables: Iterable<Drawable>) {
    this.drawables = [...drawables];
  }

  recreateDrawablesFor(_textFlowContainer: TextFlowContainer): void {
  }
}

export class TextNewLine extends TextPart {
  constructor(private readonly indicatesNewParagraph: boolean) {
    super();
  }

  protected override createDrawablesFor(_textFlowContainer: TextFlowContainer): Iterable<Drawable> {
    return [new NewLineContainer(this.indicatesNewParagraph)];
  }
}

const isSeparator = (c: string): boolean => /\p{Z}/u.test(c);
const isControl = (c: string): boolean => /\p{Cc}/u.test(c);
const isDashPunctuation = (c: string): boolean => /\p{Pd}/u.test(c);
const isPunctuation = (c: string): boolean => /\p{P}/u.test(c);
const isCjkCharacter = (c: string): boolean => c >= '⺀' && c <= '鿿';

/** Represents a plain chunk of text to be displayed in a text flow. */
export class TextChunk<TSpriteText extends SpriteText> extends TextPart {
  constructor(
    private readonly text: string,
    private readonly newLineIsParagraph: boolean,
    private readonly creationFunc: () => TSpriteText,
    private readonly creationParameters: ((t: TSpriteText) => void) | null = null,
  ) {
    super();
  }

  protected override createDrawablesFor(textFlowContainer: TextFlowContainer): Iterable<Drawable> {
    const currentContent = this.text;
    const drawables: Drawable[] = [];

    // !newLineIsParagraph effectively means that we want to add just *one* paragraph, which means we need to make sure that any previous paragraphs
    // are terminated. Thus, we add a NewLineContainer that indicates the end of the paragraph before adding our current paragraph.
    if (!this.newLineIsParagraph) {
      const newLine = new TextNewLine(true);
      newLine.recreateDrawablesFor(textFlowContainer);
      drawables.push(...newLine.drawables);
    }

    drawables.push(...this.createDrawablesForText(currentContent, textFlowContainer));

    return drawables;
  }

  protected createDrawablesForText(text: string, textFlowContainer: TextFlowContainer): Drawable[] {
    let first = true;
    const sprites: Drawable[] = [];

    for (const l of text.split('\n')) {
      if (!first) {
        const lastChild = sprites.at(-1) ?? textFlowContainer.children.at(-1);

        if (lastChild !== undefined) {
          const newLine = new NewLineContainer(this.newLineIsParagraph);
          sprites.push(newLine);
        }
      }

      for (const word of this.splitWords(l)) {
        if (word === '') continue;

        const textSprite = this.createSpriteText(textFlowContainer);
        textSprite.text = word;
        sprites.push(textSprite);
      }

      first = false;
    }

    return sprites;
  }

  protected splitWords(text: string): string[] {
    const words: string[] = [];
    let builder = '';

    for (let i = 0; i < text.length; i++) {
      if (i === 0
        || isSeparator(text[i - 1])
        || isControl(text[i - 1])
        || isDashPunctuation(text[i - 1])
        || text[i - 1] === '/'
        || text[i - 1] === '\\'
        || (isCjkCharacter(text[i - 1]) && !isPunctuation(text[i]))) {
        words.push(builder);
        builder = '';
      }

      builder += text[i];
    }

    if (builder.length > 0)
      words.push(builder);

    return words;
  }

  protected createSpriteText(textFlowContainer: TextFlowContainer): TSpriteText {
    const spriteText = this.creationFunc();
    textFlowContainer.applyDefaultCreationParameters(spriteText);
    this.creationParameters?.(spriteText);
    return spriteText;
  }
}

export class NewLineContainer extends Container {
  constructor(readonly indicatesNewParagraph: boolean) {
    super();
  }
}

const toAxes = (direction: FillDirection): Axes => {
  switch (direction) {
    case FillDirection.Full:
      return Axes.Both;

    case FillDirection.Horizontal:
      return Axes.X;

    case FillDirection.Vertical:
      return Axes.Y;
  }
};

export class InnerFlow extends FillFlowContainer {
  private _firstLineIndent = 0;

  /** An indent value for the first (header) line of a paragraph. */
  get firstLineIndent(): number {
    return this._firstLineIndent;
  }

  set firstLineIndent(value: number) {
    if (value === this._firstLineIndent) return;

    this._firstLineIndent = value;

    this.invalidateLayout();
  }

  private _contentIndent = 0;

  /** An indent value for all lines proceeding the first line in a paragraph. */
  get contentIndent(): number {
    return this._contentIndent;
  }

  set contentIndent(value: number) {
    if (value === this._contentIndent) return;

    this._contentIndent = value;

    this.invalidateLayout();
  }

  private _paragraphSpacing = Math.fround(0.5);

  /** Vertical space between paragraphs (i.e. text separated by '\n') in multiples of the text size. The default value is 0.5. */
  get paragraphSpacing(): number {
    return this._paragraphSpacing;
  }

  set paragraphSpacing(value: number) {
    if (value === this._paragraphSpacing) return;

    this._paragraphSpacing = value;

    this.invalidateLayout();
  }

  private _lineSpacing = 0;

  /** Vertical space between lines both when a new paragraph begins and when line wrapping occurs. Additive with paragraphSpacing on new paragraph. */
  get lineSpacing(): number {
    return this._lineSpacing;
  }

  set lineSpacing(value: number) {
    if (value === this._lineSpacing) return;

    this._lineSpacing = value;

    this.invalidateLayout();
  }

  private _textAnchor = Anchor.TopLeft;

  /** The Anchor which text should flow from. */
  get textAnchor(): Anchor {
    return this._textAnchor;
  }

  set textAnchor(value: Anchor) {
    if (this._textAnchor === value)
      return;

    this._textAnchor = value;

    this.anchor = value;
    this.origin = value;

    this.invalidateLayout();
  }

  protected override *computeLayoutPositions(): Iterable<Vector2> {
    // NOTE: This is a copy of `FillFlowContainer.ComputeLayoutPositions()`
    // with significant enough alterations to support all of the weird features that text flow wants to support
    // (like "bottom right anchor" that doesn't invert the order of the lines of text,
    // or like content indent, etc., etc.)
    // All differences will be highlighted via inline comments prefixed with DIFFERENCE:

    let maxX = this.maximumSize.x;

    if (this.maximumSize.equals(Vector2.Zero)) {
      const s = this.childSize;

      // If we are autosize and haven't specified a maximum size, we should allow infinite expansion.
      // If we are inheriting then we need to use the parent size (our ActualSize).
      maxX = (this.autoSizeAxes & Axes.X) !== 0 ? Number.POSITIVE_INFINITY : s.x;
    }

    const children = this.flowingChildren;
    if (children.length === 0)
      return;

    // The positions for each child we will return later on.
    const layoutPositions: Vector2[] = new Array(children.length);

    // We need to keep track of row widths such that we can compute correct
    // positions for horizontal centre anchor children.
    // We also store for each child to which row it belongs.
    const rowIndices: number[] = new Array(children.length);

    // DIFFERENCE: Contrary to `FillFlow` we care about the offset to the end of the flow (right side),
    // rather than to the middle.
    const rowWidths: number[] = [0];
    // DIFFERENCE: We need to track "line base heights" as provided by `IHasLineBaseHeight`
    // for correct layouting of multiple font sizes on one line.
    const lineBaseHeights: number[] = [0];

    // Variables keeping track of the current state while iterating over children
    // and computing initial flow positions.
    let rowHeight = 0;
    // DIFFERENCE: rowBeginOffset is missing because all children are presumed to be anchored and origined top-left.
    let currentX = 0;
    let currentY = 0;

    // First pass, computing initial flow positions
    let size = Vector2.Zero;

    for (let i = 0; i < children.length; ++i) {
      let c = children[i];

      // In some cases (see the right hand side of the conditional) we want to permit relatively sized children
      // in our fill direction; specifically, when children use FillMode.Fit to preserve the aspect ratio.
      // Consider the following use case: A fill flow container has a fixed width but an automatic height, and fills
      // in the vertical direction. Now, we can add relatively sized children with FillMode.Fit to make sure their
      // aspect ratio is preserved while still allowing them to fill vertically. This special case can not result
      // in an autosize-related feedback loop, and we can thus simply allow it.
      if ((c.relativeSizeAxes & this.autoSizeAxes & toAxes(this.direction)) !== 0
        && (c.fillMode !== FillMode.Fit || c.relativeSizeAxes !== Axes.Both || c.size.x > this.relativeChildSize.x
          || c.size.y > this.relativeChildSize.y || this.autoSizeAxes === Axes.Both)) {
        throw new Error(
          'Drawables inside a fill flow container may not have a relative size axis that the fill flow container is filling in and auto sizing for. '
          + `The fill flow container is set to flow in the ${FillDirection[this.direction]} direction and autosize in ${this.autoSizeAxes} axes and the child is set to relative size in ${c.relativeSizeAxes} axes.`);
      }

      // DIFFERENCE: Disallow custom anchor/origin positions other than top left.
      // Things will be accounted for accurately later.
      // All calls to `spacingFactor()` in the original code thus reduce to returning (0,0).
      if (!c.relativeAnchorPosition.equals(Vector2.Zero))
        throw new Error('All drawables in a TextFlowContainer must not specify custom relativeAnchorPositions. Only (0,0) is supported.');
      if (!c.relativeOriginPosition.equals(Vector2.Zero))
        throw new Error('All drawables in a TextFlowContainer must not specify custom relativeOriginPositions. Only (0,0) is supported.');

      // Populate running variables with sane initial values.
      if (i === 0) {
        size = c.boundingBox.size;
        // DIFFERENCE: Handle `ContentIndent` & `FirstLineIndent`.
        // This only does the correct thing if the text is anchored to the left;
        // right still could be made to work I guess, but what do you even do with centre?
        currentX = this.contentIndent + this.firstLineIndent;
      }

      // DIFFERENCE: As per prior comments, `1 - spacingFactor(c).X` from the original code is just 1.
      const rowWidth = Math.fround(currentX + size.x);

      // We've exceeded our allowed width, move to a new row
      // DIFFERENCE: `NewLineContainer`s also force a new row.
      if (this.direction !== FillDirection.Horizontal && (Precision.definitelyBigger(rowWidth, maxX) || this.direction === FillDirection.Vertical || c instanceof NewLineContainer)) {
        // DIFFERENCE: Handle `ContentIndent`. Only kinda correct for left text anchor.
        currentX = this.contentIndent;
        // DIFFERENCE: Handle `LineSpacing`. This is deferred to the point of line break to avoid complicating the accounting.
        currentY = Math.fround(currentY + Math.fround(rowHeight * (1 + this.lineSpacing)));

        // DIFFERENCE: A new line also has an implicit height if it starts a new paragraph.
        if (c instanceof NewLineContainer)
          currentY = Math.fround(currentY + (c.indicatesNewParagraph ? Math.fround(rowHeight * this.paragraphSpacing) : 0));

        layoutPositions[i] = new Vector2(currentX, currentY);

        // DIFFERENCE: `FillFlowContainer` does 0 here, because it's tracking offsets *to middle*, not total row widths.
        rowWidths.push(Math.fround(currentX + size.x));
        // DIFFERENCE: `IHasLineBaseHeight` tracking.
        lineBaseHeights.push(lineBaseHeightOf(c) ?? 0);

        rowHeight = 0;
      } else {
        layoutPositions[i] = new Vector2(currentX, currentY);

        // DIFFERENCE: Store width of the row, to be applied in case of non-left anchor
        // in a second pass.
        rowWidths[rowWidths.length - 1] = rowWidth;
        // DIFFERENCE: `IHasLineBaseHeight` tracking.
        lineBaseHeights[lineBaseHeights.length - 1] = Math.max(lineBaseHeights[lineBaseHeights.length - 1], lineBaseHeightOf(c) ?? 0);
      }

      rowIndices[i] = rowWidths.length - 1;
      let stride = Vector2.Zero;

      if (i < children.length - 1) {
        // Compute stride.
        // DIFFERENCE: All drawables are anchored top-left, so this reduces just to size.
        stride = size;

        c = children[i + 1];
        size = c.boundingBox.size;

        // DIFFERENCE: The original code did `stride += spacingFactor(c) * size`,
        // but because all drawables here are anchored top-left, that's just zero.
      }

      stride = stride.add(this.spacing);

      if (stride.y > rowHeight)
        rowHeight = stride.y;
      currentX = Math.fround(currentX + stride.x);
    }

    // DIFFERENCE: Original code did height accounting here to handle bottom / centre anchors.
    // We don't need to do that. This flow's children will always be anchored top.

    // DIFFERENCE: Second pass, adjusting the positions for text anchor & line base height.
    if (!Number.isFinite(maxX)) {
      let newMax = 0;
      for (const rowWidth of rowWidths)
        newMax = Math.max(newMax, rowWidth);
      maxX = newMax;
    }

    for (let i = 0; i < children.length; i++) {
      const c = children[i];

      let { x, y } = layoutPositions[i];

      const rowOffsetToEnd = Math.fround(maxX - rowWidths[rowIndices[i]]);

      if ((this.textAnchor & Anchor.x1) !== 0)
        x = Math.fround(x + rowOffsetToEnd / 2);
      else if ((this.textAnchor & Anchor.x2) !== 0)
        x = Math.fround(x + rowOffsetToEnd);

      const lineBaseHeight = lineBaseHeightOf(c);
      if (lineBaseHeight !== null)
        y = Math.fround(y + lineBaseHeights[rowIndices[i]] - lineBaseHeight);

      yield new Vector2(x, y);
    }
  }
}

/** A drawable text object that supports more advanced text formatting. */
export class TextFlowContainer extends CompositeDrawable {
  private readonly defaultCreationParameters: ((t: SpriteText) => void) | null;

  private readonly parts: ITextPart[] = [];

  private readonly partsCache = new Cached();

  /** An indent value for the first (header) line of a paragraph. */
  get firstLineIndent(): number {
    return this.flow.firstLineIndent;
  }

  set firstLineIndent(value: number) {
    this.flow.firstLineIndent = value;
  }

  /** An indent value for all lines proceeding the first line in a paragraph. */
  get contentIndent(): number {
    return this.flow.contentIndent;
  }

  set contentIndent(value: number) {
    this.flow.contentIndent = value;
  }

  /** Vertical space between paragraphs (i.e. text separated by '\n') in multiples of the text size. The default value is 0.5. */
  get paragraphSpacing(): number {
    return this.flow.paragraphSpacing;
  }

  set paragraphSpacing(value: number) {
    this.flow.paragraphSpacing = value;
  }

  /** Vertical space between lines both when a new paragraph begins and when line wrapping occurs. Additive with paragraphSpacing on new paragraph. */
  get lineSpacing(): number {
    return this.flow.lineSpacing;
  }

  set lineSpacing(value: number) {
    this.flow.lineSpacing = value;
  }

  /** The Anchor which text should flow from. */
  get textAnchor(): Anchor {
    return this.flow.textAnchor;
  }

  set textAnchor(value: Anchor) {
    this.flow.textAnchor = value;
  }

  /** An easy way to set the full text of a text flow in one go. This will overwrite any existing text added using this method of addText. */
  set text(value: string) {
    this.flow.clear();
    this.parts.length = 0;

    this.addText(value);
  }

  override get relativeSizeAxes(): Axes {
    return super.relativeSizeAxes;
  }

  override set relativeSizeAxes(value: Axes) {
    super.relativeSizeAxes = value;
    this.setFlowSizing();
  }

  override get autoSizeAxes(): Axes {
    return super.autoSizeAxes;
  }

  override set autoSizeAxes(value: Axes) {
    super.autoSizeAxes = value;
    this.setFlowSizing();
  }

  override get width(): number {
    return super.width;
  }

  override set width(value: number) {
    super.width = value;
    this.setFlowSizing();
  }

  private setFlowSizing(): void {
    // (the setters above also run from the base constructors, before the flow exists.)
    if (this.flow === undefined)
      return;

    // if the user has imposed `RelativeSizeAxes` or a fixed size on the X axis on the entire flow,
    // we want the child flow that actually does the layout here to match that.
    // however, the child flow must always be auto-sized in the Y axis
    // to correctly respect `TextAnchor`.
    if ((this.autoSizeAxes & Axes.X) !== 0) {
      this.flow.relativeSizeAxes = Axes.None;
      this.flow.autoSizeAxes = Axes.Both;
    } else {
      this.flow.autoSizeAxes = Axes.Y;
      this.flow.relativeSizeAxes = Axes.X;
    }
  }

  get spacing(): Vector2 {
    return this.flow.spacing;
  }

  set spacing(value: Vector2) {
    this.flow.spacing = value;
  }

  get maximumSize(): Vector2 {
    return this.flow.maximumSize;
  }

  set maximumSize(value: Vector2) {
    this.flow.maximumSize = value;
  }

  get direction(): FillDirection {
    return this.flow.direction;
  }

  set direction(value: FillDirection) {
    this.flow.direction = value;
  }

  get children(): readonly Drawable[] {
    return this.flow.children;
  }

  protected readonly flow: InnerFlow;

  constructor(defaultCreationParameters: ((t: SpriteText) => void) | null = null) {
    super();

    this.defaultCreationParameters = defaultCreationParameters;

    this.internalChild = this.flow = this.createFlow().with({ autoSizeAxes: Axes.Both });
  }

  protected createFlow(): InnerFlow {
    return new InnerFlow();
  }

  protected override loadAsyncComplete(): void {
    super.loadAsyncComplete();

    this.recreateAllParts();
  }

  protected override update(): void {
    super.update();

    if (!this.partsCache.isValid)
      this.recreateAllParts();
  }

  protected override compare(x: Drawable, y: Drawable): number {
    // FillFlowContainer will reverse the ordering of right-anchored words such that the (previously) first word would be
    // the right-most word, whereas it should still be flowed left-to-right. This is achieved by reversing the comparator.
    if ((this.textAnchor & Anchor.x2) !== 0)
      return super.compare(y, x);

    return super.compare(x, y);
  }

  /**
   * Add new text to this text flow. The \n character will create a new paragraph, not just a line break.
   * If you need \n to be a line break, use addParagraph instead.
   */
  addText(text: string, creationParameters: ((t: SpriteText) => void) | null = null): ITextPart {
    return this.addPart(this.createChunkFor(text, true, () => this.createSpriteText(), creationParameters));
  }

  /**
   * Add an arbitrary SpriteText to this TextFlowContainer.
   * While default creation parameters are applied automatically, word wrapping is unavailable for contained words.
   */
  addSpriteText<TSpriteText extends SpriteText>(text: TSpriteText, creationParameters: ((t: TSpriteText) => void) | null = null): void {
    this.defaultCreationParameters?.(text);
    creationParameters?.(text);
    this.addPart(new TextPartManual([text]));
  }

  /**
   * Add a new paragraph to this text flow. The \n character will create a line break.
   * If you need \n to be a new paragraph, not just a line break, use addText instead.
   */
  addParagraph(paragraph: string, creationParameters: ((t: SpriteText) => void) | null = null): ITextPart {
    return this.addPart(this.createChunkFor(paragraph, false, () => this.createSpriteText(), creationParameters));
  }

  /** Creates an appropriate implementation of TextChunk for this text flow container type. */
  createChunkFor<TSpriteText extends SpriteText>(text: string, newLineIsParagraph: boolean, creationFunc: () => TSpriteText,
    creationParameters: ((t: TSpriteText) => void) | null = null): TextChunk<TSpriteText> {
    return new TextChunk<TSpriteText>(text, newLineIsParagraph, creationFunc, creationParameters);
  }

  /** End current line and start a new one. */
  newLine(): void {
    this.addPart(new TextNewLine(false));
  }

  /** End current paragraph and start a new one. */
  newParagraph(): void {
    this.addPart(new TextNewLine(true));
  }

  createSpriteText(): SpriteText {
    return new SpriteText();
  }

  /** @internal */
  applyDefaultCreationParameters(spriteText: SpriteText): void {
    this.defaultCreationParameters?.(spriteText);
  }

  clear(disposeChildren = true): void {
    this.flow.clear(disposeChildren);
    this.parts.length = 0;
  }

  /** Adds an ITextPart and its associated drawables to this TextFlowContainer. */
  addPart(part: ITextPart): ITextPart {
    this.parts.push(part);

    // if the parts cached is already invalid, there's no need to recreate the new addition. it will be created as part of the next validation.
    if (this.partsCache.isValid)
      this.recreatePart(part);

    return part;
  }

  /** Removes an ITextPart from this text flow. Returns whether it was successfully removed from the flow. */
  removePart(partToRemove: ITextPart): boolean {
    const index = this.parts.indexOf(partToRemove);
    if (index < 0)
      return false;

    this.parts.splice(index, 1);
    this.partsCache.invalidate();
    return true;
  }

  protected recreateAllParts(): void {
    // manual parts need to be manually removed before clearing contents,
    // to avoid accidentally disposing of them in the process.
    for (const manualPart of this.parts) {
      if (manualPart instanceof TextPartManual)
        this.flow.removeRange(manualPart.drawables, false);
    }

    // make sure not to clear the list of parts by accident.
    this.flow.clear(true);

    for (const part of this.parts)
      this.recreatePart(part);

    this.partsCache.validate();
  }

  private recreatePart(part: ITextPart): void {
    part.recreateDrawablesFor(this);
    for (const drawable of part.drawables)
      this.flow.add(drawable);
  }
}
