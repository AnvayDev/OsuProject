// Ported from osu.Game/Graphics/UserInterface/OsuTabControl.cs
// Not ported yet: the overflow dropdown (OsuTabDropdown; the framework TabControl port has no dropdown). C# adds T's enum values
// automatically (AddEnumEntriesAutomatically); here subclasses add their items.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Colour4 } from '@fw/graphics/Colour4';
import type { ColourInfo } from '@fw/graphics/ColourInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { TabControl } from '@fw/graphics/userInterface/TabControl';
import { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { DefaultEasingFunction, Easing } from '@fw/transforms/Easing';
import { valueAtNumber } from '@fw/transforms/Interpolation';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { HoverSampleSet } from './HoverSampleSet';
import { HoverSounds } from './HoverSounds';

const out_quint = new DefaultEasingFunction(Easing.OutQuint);

export class OsuTabControl<T> extends TabControl<T> {
  private _accentColour: Colour4 | null = null;

  static readonly HORIZONTAL_SPACING = 10;

  get accentColour(): Colour4 {
    return this._accentColour ?? Colour4.Transparent;
  }

  set accentColour(value: Colour4) {
    this._accentColour = value;

    for (const i of this.tabContainer.children) {
      if (i instanceof OsuTabItem)
        i.accentColour = value;
    }
  }

  private readonly strip: Box;

  protected override createTabItem(value: T): TabItem<T> {
    return new OsuTabItem(value);
  }

  protected get stripWidth(): number {
    return this.tabContainer.children.reduce((sum, c) => sum + (c.isPresent ? c.drawWidth + this.tabContainer.spacing.x : 0), 0) - this.tabContainer.spacing.x;
  }

  constructor() {
    super();

    this.tabContainer.spacing = new Vector2(OsuTabControl.HORIZONTAL_SPACING, 0);

    this.addInternal(this.strip = new Box().with({
      anchor: Anchor.BottomLeft,
      origin: Anchor.BottomLeft,
      height: 1,
      colour: Colour4.White.opacity(0),
    }));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    if (this._accentColour === null)
      this.accentColour = dependencies.resolve(OsuColour).blue;

    return r;
  }

  get stripColour(): ColourInfo {
    return this.strip.colour;
  }

  set stripColour(value: Colour4) {
    this.strip.colour = value;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // dont bother calculating if the strip is invisible
    if (this.strip.colour.maxAlpha > 0)
      this.strip.width = valueAtNumber(Math.min(Math.max(this.clock!.elapsedFrameTime, 0), 1000), this.strip.width, this.stripWidth, 0, 500, out_quint);
  }
}

/** (OsuTabControl.OsuTabItem) */
export class OsuTabItem<T> extends TabItem<T> {
  protected readonly text: SpriteText;
  protected readonly bar: Box;

  private _accentColour: Colour4 | null = null;

  get accentColour(): Colour4 {
    return this._accentColour ?? Colour4.Transparent;
  }

  set accentColour(value: Colour4) {
    this._accentColour = value;

    if (!this.active.value)
      this.text.colour = value;
  }

  protected static readonly TRANSITION_LENGTH = 500;

  protected fadeHovered(): void {
    this.bar.fadeIn(OsuTabItem.TRANSITION_LENGTH, Easing.OutQuint);
    this.text.fadeColour(Colour4.White, OsuTabItem.TRANSITION_LENGTH, Easing.OutQuint);
  }

  protected fadeUnhovered(): void {
    this.bar.fadeTo(this.isHovered ? 1 : 0, OsuTabItem.TRANSITION_LENGTH, Easing.OutQuint);
    this.text.fadeColour(this.isHovered ? Colour4.White : this.accentColour, OsuTabItem.TRANSITION_LENGTH, Easing.OutQuint);
  }

  protected override onHover(_e: HoverEvent): boolean {
    if (!this.active.value)
      this.fadeHovered();

    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    if (!this.active.value)
      this.fadeUnhovered();
  }

  constructor(value: T, text: string = String(value)) {
    super(value);

    this.autoSizeAxes = Axes.X;
    this.relativeSizeAxes = Axes.Y;

    this.children = [
      this.text = new OsuSpriteText().with({
        margin: MarginPadding.of({ top: 5, bottom: 5 }),
        origin: Anchor.BottomLeft,
        anchor: Anchor.BottomLeft,
        text,
        font: OsuFont.getFont({ size: 14 }),
      }),
      this.bar = new Box().with({
        relativeSizeAxes: Axes.X,
        height: 1,
        alpha: 0,
        colour: Colour4.White,
        origin: Anchor.BottomLeft,
        anchor: Anchor.BottomLeft,
      }),
      new HoverSounds(HoverSampleSet.TabSelect),
    ];
  }

  private selectSample: Sample | null = null;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    if (this._accentColour === null)
      this.accentColour = dependencies.resolve(OsuColour).blue;

    this.selectSample = await dependencies.resolve(AudioManager).samples.get('UI/tabselect-select');
  }

  protected override onActivated(): void {
    this.text.font = withFont(this.text.font, { weight: FontWeight.Bold });
    this.fadeHovered();
  }

  protected override onDeactivated(): void {
    this.text.font = withFont(this.text.font, { weight: FontWeight.Medium });
    this.fadeUnhovered();
  }

  override onActivatedByUser(): void {
    this.selectSample?.play();
  }
}
