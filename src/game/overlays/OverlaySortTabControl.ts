// Ported from osu.Game/Overlays/OverlaySortTabControl.cs
// Takes the label function explicitly (C# reads the enum's [LocalisableDescription]).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool, BindableWithCurrent, type Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { TabFillFlowContainer, type TabControl } from '@fw/graphics/userInterface/TabControl';
import { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { FontWeight, OsuFont, withFont } from '../graphics/OsuFont';
import { OsuSpriteText } from '../graphics/sprites/OsuSpriteText';
import { HoverClickSounds } from '../graphics/userInterface/HoverClickSounds';
import { HoverSampleSet } from '../graphics/userInterface/HoverSampleSet';
import { OsuTabControl } from '../graphics/userInterface/OsuTabControl';
import { HeaderButton } from './comments/HeaderButton';
import { OverlayColourProvider } from './OverlayColourProvider';

export class OverlaySortTabControl<T> extends CompositeDrawable {
  readonly tabControl: TabControl<T>;

  private readonly _current = new BindableWithCurrent<T>(undefined as T);

  get current(): Bindable<T> {
    return this._current.current;
  }

  set current(value: Bindable<T>) {
    this._current.current = value;
  }

  get title(): string {
    return this.text.text;
  }

  set title(value: string) {
    this.text.text = value;
  }

  private readonly text: OsuSpriteText;

  constructor(protected readonly describe: (value: T) => string) {
    super();

    this.autoSizeAxes = Axes.Both;

    let tabControl!: TabControl<T>;

    this.addInternal(new FillFlowContainer().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(10, 0),
      children: [
        this.text = new OsuSpriteText().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          font: OsuFont.getFont({ size: 12, weight: FontWeight.SemiBold }),
          text: 'Sort by',
        }),
        tabControl = this.createControl(describe).with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
        }),
      ],
    }));

    tabControl.current = this._current;
    this.tabControl = tabControl;
  }

  protected createControl(describe: (value: T) => string): SortTabControl<T> {
    return new SortTabControl<T>(describe);
  }
}

/** (OverlaySortTabControl.SortTabControl) */
export class SortTabControl<T> extends OsuTabControl<T> {
  protected override createTabItem(value: T): TabItem<T> {
    return new SortTabItem<T>(value, this.describe);
  }

  protected override createTabFlow(): TabFillFlowContainer<T> {
    return new TabFillFlowContainer<T>().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(5, 0),
    });
  }

  constructor(protected readonly describe: (value: T) => string) {
    super();

    this.autoSizeAxes = Axes.Both;
  }
}

/** (OverlaySortTabControl.SortTabItem) */
export class SortTabItem<T> extends TabItem<T> {
  constructor(value: T, describe: (value: T) => string) {
    super(value);

    this.autoSizeAxes = Axes.Both;
    this.child = this.createTabButton(value, describe);
  }

  protected createTabButton(value: T, describe: (value: T) => string): TabButton<T> {
    const button = new TabButton<T>(value, describe);
    button.active.bindTarget = this.active;
    return button;
  }

  protected override onActivated(): void {
  }

  protected override onDeactivated(): void {
  }
}

/** (OverlaySortTabControl.TabButton) */
export class TabButton<T> extends HeaderButton {
  readonly active = new BindableBool();

  protected override get content(): Container<Drawable> {
    return this.buttonFlow;
  }

  protected set contentColour(value: Colour4) {
    this.text.colour = value;
  }

  private colourProvider!: OverlayColourProvider;

  private readonly text: SpriteText;
  /** (C#'s private content) */
  private readonly buttonFlow: FillFlowContainer;

  constructor(value: T, describe: (value: T) => string) {
    super();

    let text!: SpriteText;

    // (base.Content)
    super.content.add(this.buttonFlow = new FillFlowContainer().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(3, 0),
      children: [
        text = new OsuSpriteText().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          font: OsuFont.getFont({ size: 12, weight: FontWeight.SemiBold }),
          text: describe(value),
        }),
      ],
    }));

    this.text = text;

    this.addInternal(new HoverClickSounds(HoverSampleSet.TabSelect));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.active.bindValueChanged(() => this.updateState(), true);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.updateState();
    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.updateState();
  }

  protected updateState(): void {
    if (this.active.value || this.isHovered)
      this.showBackground();
    else
      this.hideBackground();

    this.contentColour = this.active.value && !this.isHovered ? this.colourProvider.light1 : Colour4.White;

    this.text.font = withFont(this.text.font, { weight: this.active.value ? FontWeight.Bold : FontWeight.SemiBold });
  }
}
