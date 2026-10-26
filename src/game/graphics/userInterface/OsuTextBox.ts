// Ported from osu.Game/Graphics/UserInterface/OsuTextBox.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import type { Sample } from '@fw/audio/sample/Sample';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import { Colour4 } from '@fw/graphics/Colour4';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { BasicTextBox, FallingDownContainer } from '@fw/graphics/userInterface/BasicTextBox';
import { Caret } from '@fw/graphics/userInterface/Caret';
import { TextSelectionType } from '@fw/graphics/userInterface/TextBox';
import type { FocusEvent, FocusLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { FontUsage } from '@fw/text/FontUsage';
import { Easing } from '@fw/transforms/Easing';
import { RNG } from '@fw/utils/RNG';
import type { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import type { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { BeatSyncedContainer } from '../containers/BeatSyncedContainer';
import { OsuColour } from '../OsuColour';
import { OsuFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';

export enum FeedbackSampleType {
  TextAdd,
  TextAddCaps,
  TextRemove,
  TextConfirm,
  TextInvalid,
  CaretMove,
  SelectCharacter,
  SelectWord,
  SelectAll,
  Deselect,
}

const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();

export class OsuTextBox extends BasicTextBox {
  /** Whether to allow playing a different samples based on the type of character. If set to false, the same sample will be used for all characters. */
  protected get allowUniqueCharacterSamples(): boolean {
    return true;
  }

  protected override get leftRightPadding(): number {
    return 10;
  }

  protected override get caretWidth(): number {
    return 3;
  }

  protected override createPlaceholder(): SpriteText {
    return new OsuSpriteText().with({
      font: OsuFont.getFont({ italics: true }),
      margin: MarginPadding.of({ left: 2 }),
    });
  }

  /** (init-only) */
  protected drawBorder = true;

  // (declare: assigned by createCaret() during the base constructor, which a field initializer would then reset.)
  declare private osuCaret: OsuCaret | null;

  private selectionStarted = false;
  private sampleLastPlaybackTime = 0;

  private sampleMap = new Map<FeedbackSampleType, (Sample | null)[]>();

  /** Whether all text should be selected when the OsuTextBox gains focus. */
  selectAllOnFocus = false;

  constructor() {
    super();

    this.height = 40;
    this.textContainer.height = 0.5;
    this.cornerRadius = 5;
    this.lengthLimit = 1000;

    this.current.disabledChanged.add(disabled => this.alpha = disabled ? 0.3 : 1);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    const colour = dependencies.resolve(OsuColour);
    const audio = dependencies.resolve(AudioManager);

    this.backgroundUnfocused = colourProvider?.background5 ?? Colour4.Black.opacity(0.5);
    this.backgroundFocused = colourProvider?.background4 ?? OsuColour.gray(0.3).opacity(0.8);
    this.backgroundCommit = colourProvider?.highlight1 ?? colour.yellow;
    this.borderColour = this.backgroundCommit;
    this._selectionColour = colourProvider?.background1 ?? Colour4.fromBytes(249, 90, 255, 255);

    if (this.osuCaret != null)
      this.osuCaret.selectionColour = this._selectionColour;

    this.placeholder.colour = colourProvider?.foreground1 ?? Colour4.fromBytes(180, 180, 180, 255);

    // Note that `KeyBindingRow` uses similar logic for input feedback, so remember to update there if changing here.
    const textAddedSamples: (Sample | null)[] = [null, null, null, null];
    const load = (name: string, into: (Sample | null)[], index: number) =>
      void audio.samples.get(name).then(s => into[index] = s);

    for (let i = 0; i < textAddedSamples.length; i++)
      load(`Keyboard/key-press-${1 + i}`, textAddedSamples, i);

    const single = (name: string) => {
      const arr: (Sample | null)[] = [null];
      load(name, arr, 0);
      return arr;
    };

    this.sampleMap = new Map([
      [FeedbackSampleType.TextAdd, textAddedSamples],
      [FeedbackSampleType.TextAddCaps, single('Keyboard/key-caps')],
      [FeedbackSampleType.TextRemove, single('Keyboard/key-delete')],
      [FeedbackSampleType.TextConfirm, single('Keyboard/key-confirm')],
      [FeedbackSampleType.TextInvalid, single('Keyboard/key-invalid')],
      [FeedbackSampleType.CaretMove, single('Keyboard/key-movement')],
      [FeedbackSampleType.SelectCharacter, single('Keyboard/select-char')],
      [FeedbackSampleType.SelectWord, single('Keyboard/select-word')],
      [FeedbackSampleType.SelectAll, single('Keyboard/select-all')],
      [FeedbackSampleType.Deselect, single('Keyboard/deselect')],
    ]);

    return r;
  }

  private _selectionColour = Colour4.Transparent;

  protected override get selectionColour(): Colour4 {
    return this._selectionColour;
  }

  protected override onUserTextAdded(added: string): void {
    super.onUserTextAdded(added);

    if (!added.split('').some(c => this.canAddCharacter(c)))
      return;

    if (added.split('').some(isUpper) && this.allowUniqueCharacterSamples)
      this.playFeedbackSample(FeedbackSampleType.TextAddCaps);
    else
      this.playFeedbackSample(FeedbackSampleType.TextAdd);
  }

  protected override onUserTextRemoved(removed: string): void {
    super.onUserTextRemoved(removed);

    this.playFeedbackSample(FeedbackSampleType.TextRemove);
  }

  protected override notifyInputError(): void {
    super.notifyInputError();

    this.playFeedbackSample(FeedbackSampleType.TextInvalid);
  }

  protected override onTextCommitted(textChanged: boolean): void {
    super.onTextCommitted(textChanged);

    this.playFeedbackSample(FeedbackSampleType.TextConfirm);
  }

  protected override onCaretMoved(selecting: boolean): void {
    super.onCaretMoved(selecting);

    if (!selecting)
      this.playFeedbackSample(FeedbackSampleType.CaretMove);
  }

  protected override onTextSelectionChanged(selectionType: TextSelectionType): void {
    super.onTextSelectionChanged(selectionType);

    switch (selectionType) {
      case TextSelectionType.Character:
        this.playFeedbackSample(FeedbackSampleType.SelectCharacter);
        break;

      case TextSelectionType.Word:
        this.playFeedbackSample(this.selectionStarted ? FeedbackSampleType.SelectCharacter : FeedbackSampleType.SelectWord);
        break;

      case TextSelectionType.All:
        this.playFeedbackSample(FeedbackSampleType.SelectAll);
        break;
    }

    this.selectionStarted = true;
  }

  protected override onTextDeselected(): void {
    super.onTextDeselected();

    if (!this.selectionStarted) return;

    this.playFeedbackSample(FeedbackSampleType.Deselect);

    this.selectionStarted = false;
  }

  protected override onImeComposition(newComposition: string, removedTextLength: number, addedTextLength: number, caretMoved: boolean): void {
    super.onImeComposition(newComposition, removedTextLength, addedTextLength, caretMoved);

    if (newComposition === '') {
      switch (removedTextLength) {
        case 0:
          // empty composition event, composition wasn't changed, don't play anything.
          return;

        case 1:
          // composition probably ended by pressing backspace, or was cancelled.
          this.playFeedbackSample(FeedbackSampleType.TextRemove);
          return;

        default:
          // longer text removed, composition ended because it was cancelled.
          // could be a different sample if desired.
          this.playFeedbackSample(FeedbackSampleType.TextRemove);
          return;
      }
    }

    if (addedTextLength > 0) {
      // some text was added, probably due to typing new text or by changing the candidate.
      this.playFeedbackSample(FeedbackSampleType.TextAdd);
      return;
    }

    if (removedTextLength > 0) {
      // text was probably removed by backspacing.
      // it's also possible that a candidate that only removed text was changed to.
      this.playFeedbackSample(FeedbackSampleType.TextRemove);
      return;
    }

    if (caretMoved) {
      // only the caret/selection was moved.
      this.playFeedbackSample(FeedbackSampleType.CaretMove);
    }
  }

  protected override onImeResult(result: string, successful: boolean): void {
    super.onImeResult(result, successful);

    // composition was successfully completed (usually by pressing the enter key), or prematurely ended (eg. by clicking inside the textbox).
    // could be a different sample if desired.
    this.playFeedbackSample(FeedbackSampleType.TextConfirm);
  }

  protected override onFocus(e: FocusEvent): void {
    if (this.drawBorder)
      this.borderThickness = 3;

    super.onFocus(e);

    // we may become focused from an ongoing drag operation, we don't want to overwrite selection in that case.
    if (this.selectAllOnFocus && this.selectedText === '')
      this.selectAll();
  }

  protected override onFocusLost(e: FocusLostEvent): void {
    if (this.drawBorder)
      this.borderThickness = 0;

    super.onFocusLost(e);
  }

  protected override getDrawableCharacter(c: string): Drawable {
    return new FallingDownContainer().with({
      autoSizeAxes: Axes.Both,
      child: new OsuSpriteText().with({ text: c, font: this.font }),
    });
  }

  protected get font(): FontUsage {
    return OsuFont.getFont({ size: this.fontSize });
  }

  protected override createCaret(): Caret {
    return this.osuCaret = new OsuCaret().with({
      caretWidth: this.caretWidth,
      selectionColour: this.selectionColour,
    });
  }

  private getSampleChannel(feedbackSampleType: FeedbackSampleType): SampleChannel | null {
    const samples = this.sampleMap.get(feedbackSampleType);

    if (samples === undefined || samples.length === 0)
      return null;

    return samples[RNG.next(0, samples.length)]?.getChannel() ?? null;
  }

  protected playFeedbackSample(feedbackSample: FeedbackSampleType): void {
    this.schedule(() => {
      if (this.time.current < this.sampleLastPlaybackTime + 15) return;

      const channel = this.getSampleChannel(feedbackSample);

      if (channel === null) return;

      let pitch = 0.98 + RNG.nextDouble(0.04);

      if (feedbackSample === FeedbackSampleType.SelectCharacter)
        pitch += (this.selectedText.length / Math.max(1, this.text.length)) * 0.15;

      channel.frequency.value = pitch;
      channel.play();

      this.sampleLastPlaybackTime = this.time.current;
    });
  }
}

const caret_move_time = 60;

class CaretBeatSyncedContainer extends BeatSyncedContainer {
  private _hasSelection = false;

  set hasSelection(value: boolean) {
    this._hasSelection = value;
    if (value)
      this.fadeTo(0.5, 200, Easing.Out);
  }

  constructor() {
    super();

    this.minimumBeatLength = 300;
    this.internalChild = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: Colour4.White,
    });
  }

  protected override onNewBeat(_beatIndex: number, timingPoint: TimingControlPoint, _effectPoint: EffectControlPoint, _amplitudes: ChannelAmplitudes): void {
    if (!this._hasSelection)
      this.fadeTo(0.7).fadeTo(0.4, timingPoint.beatLength, Easing.InOutSine);
  }
}

class OsuCaret extends Caret {
  private readonly beatSync: CaretBeatSyncedContainer;

  constructor() {
    super();

    this.colour = Colour4.Transparent;

    this.internalChild = this.beatSync = new CaretBeatSyncedContainer().with({
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      masking: true,
      cornerRadius: 1,
      relativeSizeAxes: Axes.Both,
      height: 0.9,
    });
  }

  override hide(): void {
    this.fadeOut(200);
  }

  caretWidth = 0;

  selectionColour = Colour4.Transparent;

  displayAt(position: Vector2, selectionWidth: number | null): void {
    this.beatSync.hasSelection = selectionWidth !== null;

    if (selectionWidth !== null) {
      this.moveTo(new Vector2(position.x, position.y), 60, Easing.Out);
      this.resizeWidthTo(selectionWidth + this.caretWidth / 2, caret_move_time, Easing.Out);
      this.fadeColour(this.selectionColour, 200, Easing.Out);
    } else {
      this.moveTo(new Vector2(position.x - this.caretWidth / 2, position.y), 60, Easing.Out);
      this.resizeWidthTo(this.caretWidth, caret_move_time, Easing.Out);
      this.fadeColour(Colour4.White, 200, Easing.Out);
    }
  }
}
