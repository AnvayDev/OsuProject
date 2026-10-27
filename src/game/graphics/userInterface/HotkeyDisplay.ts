// Ported from osu.Game/Graphics/UserInterface/HotkeyDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { ReadableKeyCombinationProvider } from '@fw/input/ReadableKeyCombinationProvider';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import type { Hotkey } from './Hotkey';

export class HotkeyDisplay extends CompositeDrawable {
  private _hotkey: Hotkey | null = null;

  get hotkey(): Hotkey | null {
    return this._hotkey;
  }

  set hotkey(value: Hotkey | null) {
    if (this._hotkey === value || (value !== null && this._hotkey?.equals(value)))
      return;

    this._hotkey = value;

    if (this.isLoaded)
      this.updateState();
  }

  private flow!: FillFlowContainer;

  // (C# resolves the game's ReadableKeyCombinationProvider; the web one has no state.)
  private readonly readableKeyCombinationProvider = new ReadableKeyCombinationProvider();

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.autoSizeAxes = Axes.Both;

    this.internalChild = this.flow = new FillFlowContainer().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(5),
    });

    this.updateState();

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.updateState();
  }

  private updateState(): void {
    this.flow.clear();

    for (const h of this._hotkey?.resolveKeyCombination(this.readableKeyCombinationProvider) ?? [])
      this.flow.add(new HotkeyBox(h));
  }
}

/** (HotkeyDisplay.HotkeyBox) */
class HotkeyBox extends CompositeDrawable {
  constructor(private readonly hotkey: string) {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    const colours = dependencies.resolve(OsuColour);

    this.autoSizeAxes = Axes.Both;
    this.masking = true;
    this.cornerRadius = 3;

    this.internalChildren = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: colourProvider?.background4 ?? Colour4.Black.opacity(0.7),
      }),
      new OsuSpriteText().with({
        margin: MarginPadding.of({ horizontal: 5, bottom: 1 }),
        text: this.hotkey.toUpperCase(),
        font: withFont(OsuFont.Default, { size: 12, weight: FontWeight.Bold }),
        colour: colourProvider?.light2 ?? colours.grayA,
      }),
    ];

    return r;
  }
}
