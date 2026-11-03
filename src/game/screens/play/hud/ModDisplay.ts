// Ported from osu.Game/Screens/Play/HUD/ModDisplay.cs

import { Bindable, BindableWithCurrent } from '@fw/bindables/Bindable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { ValueChangedEvent } from '@fw/bindables/Bindable';
import { ReverseChildIDFillFlowContainer } from '../../../graphics/containers/ReverseChildIDFillFlowContainer';
import type { Mod } from '../../../rulesets/mods/Mod';
import { asOrdered } from '../../../rulesets/mods/ModExtensions';
import { ModIcon } from '../../../rulesets/ui/ModIcon';

export enum ExpansionMode {
  /** The ModDisplay will expand only when hovered. */
  ExpandOnHover,

  /** The ModDisplay will always be expanded. */
  AlwaysExpanded,

  /** The ModDisplay will always be contracted. */
  AlwaysContracted,
}

/** Displays a single-line horizontal auto-sized flow of mods. For cases where wrapping is required, use ModFlowDisplay instead. */
export class ModDisplay extends CompositeDrawable {
  static readonly MOD_ICON_SCALE = Math.fround(0.6);

  private _expansionMode = ExpansionMode.ExpandOnHover;

  get expansionMode(): ExpansionMode {
    return this._expansionMode;
  }

  set expansionMode(value: ExpansionMode) {
    if (this._expansionMode === value)
      return;

    this._expansionMode = value;

    if (this.isLoaded)
      this.updateExpansionMode();
  }

  private readonly _current = new BindableWithCurrent<readonly Mod[]>([]);

  get current(): Bindable<readonly Mod[]> {
    return this._current.current;
  }

  set current(value: Bindable<readonly Mod[]>) {
    this._current.current = value;
  }

  private _showExtendedInformation: boolean;

  get showExtendedInformation(): boolean {
    return this._showExtendedInformation;
  }

  set showExtendedInformation(value: boolean) {
    this._showExtendedInformation = value;

    for (const icon of this.iconsContainer.children)
      icon.showExtendedInformation = value;
  }

  get fillDirection(): FillDirection {
    return this.iconsContainer.direction;
  }

  set fillDirection(value: FillDirection) {
    this.iconsContainer.direction = value;
  }

  private readonly iconsContainer: FillFlowContainer<ModIcon>;

  constructor(showExtendedInformation = true) {
    super();

    this._showExtendedInformation = showExtendedInformation;

    this.autoSizeAxes = Axes.Both;

    this.internalChild = this.iconsContainer = new ReverseChildIDFillFlowContainer<ModIcon>().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
    });
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.current.bindValueChanged(m => this.updateDisplay(m), true);

    this.updateExpansionMode(0);
  }

  private updateDisplay(mods: ValueChangedEvent<readonly Mod[]>): void {
    this.iconsContainer.clear();

    for (const mod of asOrdered(mods.newValue))
      this.iconsContainer.add(new ModIcon(mod, true, this._showExtendedInformation).with({ scale: new Vector2(ModDisplay.MOD_ICON_SCALE) }));
  }

  private updateExpansionMode(duration = 500): void {
    switch (this._expansionMode) {
      case ExpansionMode.AlwaysExpanded:
        this.expand(duration);
        break;

      case ExpansionMode.AlwaysContracted:
        this.contract(duration);
        break;

      case ExpansionMode.ExpandOnHover:
        if (this.isHovered)
          this.expand(duration);
        else
          this.contract(duration);
        break;
    }
  }

  private expand(duration = 500): void {
    if (this._expansionMode !== ExpansionMode.AlwaysContracted)
      this.iconsContainer.transformSpacingTo(new Vector2(5, -10), duration, Easing.OutQuint);
  }

  private contract(duration = 500): void {
    if (this._expansionMode !== ExpansionMode.AlwaysExpanded)
      this.iconsContainer.transformSpacingTo(new Vector2(-25), duration, Easing.OutQuint);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.expand();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.contract();
    super.onHoverLost(e);
  }
}
