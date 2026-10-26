// Ported from osu.Game/Overlays/Toolbar/ToolbarOverlayToggleButton.cs
// Web: most of the overlays the toolbar toggles aren't ported yet. Their buttons have no state container, and show the overlay's
// INamedOverlayComponent values (applyNamedOverlayComponent) so the toolbar looks as it does in osu!; clicking them does nothing.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import type { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import type { INamedOverlayComponent } from '../INamedOverlayComponent';
import { ToolbarButton } from './ToolbarButton';

// C# float.MaxValue
const float_max_value = 3.4028234663852886e38;

function isNamedOverlayComponent(o: object): o is INamedOverlayComponent {
  return 'icon' in o && 'title' in o && 'description' in o;
}

export class ToolbarOverlayToggleButton extends ToolbarButton {
  private stateBackground!: Box;

  private _stateContainer: OverlayContainer | null = null;

  private readonly overlayState = new Bindable<Visibility>(Visibility.Hidden);

  get stateContainer(): OverlayContainer | null {
    return this._stateContainer;
  }

  set stateContainer(value: OverlayContainer | null) {
    this._stateContainer = value;

    this.overlayState.unbindBindings();

    if (value !== null) {
      this.action = () => value.toggleVisibility();
      this.overlayState.bindTo(value.state);
    }

    if (value !== null && isNamedOverlayComponent(value))
      this.applyNamedOverlayComponent(value);
  }

  protected applyNamedOverlayComponent(named: INamedOverlayComponent): void {
    this.tooltipMain = named.title;
    this.tooltipSub = named.description;
    this.setIcon(named.icon);
  }

  // (public in C#, as the toolbar buttons' constructors are)
  constructor() {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.backgroundContent.add(this.stateBackground = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: colours.carmine.opacityByte(180),
      blending: BlendingParameters.Additive,
      depth: float_max_value,
      alpha: 0,
    }));

    this.overlayState.valueChanged.add(state => this.stateChanged(state));

    return r;
  }

  private stateChanged(state: ValueChangedEvent<Visibility>): void {
    switch (state.newValue) {
      case Visibility.Hidden:
        this.stateBackground.fadeOut(200, Easing.OutQuint);
        break;

      case Visibility.Visible:
        this.stateBackground.fadeIn(200, Easing.OutQuint);
        break;
    }
  }
}
