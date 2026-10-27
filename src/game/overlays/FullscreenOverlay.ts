// Ported from osu.Game/Overlays/FullscreenOverlay.cs
// Web: there is no IAPIProvider (the overlays' online data comes from the mirror, docs/spec/assets-formats.md §7).

import { type IReadOnlyDependencyContainer, DependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { WaveContainer } from '../graphics/containers/WaveContainer';
import type { INamedOverlayComponent } from './INamedOverlayComponent';
import { OverlayColourProvider } from './OverlayColourProvider';
import type { OverlayColourScheme } from './OverlayColourScheme';
import type { OverlayHeader } from './OverlayHeader';
import { WaveOverlayContainer } from './WaveOverlayContainer';

export abstract class FullscreenOverlay<T extends OverlayHeader> extends WaveOverlayContainer implements INamedOverlayComponent {
  get icon(): IconUsage {
    return this.header.title.icon;
  }

  get title(): string {
    return this.header.title.title;
  }

  get description(): string {
    return this.header.title.description;
  }

  /** (declared: assigned by recreateHeader() during this constructor, which a field initializer would reset) */
  declare header: T;

  protected get backgroundColour(): Colour4 {
    return this.colourProvider.background5;
  }

  /** [Cached] */
  protected readonly colourProvider: OverlayColourProvider;

  protected override get content(): Container<Drawable> {
    return this.overlayContent;
  }

  private readonly background: Box;
  /** (C#'s private content) */
  private readonly overlayContent: Container;

  protected constructor(colourScheme: OverlayColourScheme) {
    super();

    this.recreateHeader();

    this.colourProvider = new OverlayColourProvider(colourScheme);

    this.relativeSizeAxes = Axes.Both;
    this.relativePositionAxes = Axes.Both;
    this.width = Math.fround(0.85);
    this.anchor = Anchor.TopCentre;
    this.origin = Anchor.TopCentre;

    this.masking = true;

    this.edgeEffect = new EdgeEffectParameters({
      colour: Colour4.Black.opacity(0),
      type: EdgeEffectType.Shadow,
      hollow: true,
      radius: 10,
    });

    // (base.Content)
    this.waves.addRange([
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      this.overlayContent = new Container().with({
        relativeSizeAxes: Axes.Both,
      }),
    ]);
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cache(this.colourProvider);
    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    const r = super.load(dependencies);

    this.updateColours();

    return r;
  }

  protected abstract createHeader(): T;

  protected recreateHeader(): void {
    this.header = this.createHeader();
  }

  override show(): void {
    if (this.state.value === Visibility.Visible) {
      // re-trigger the state changed so we can potentially surface to front
      this.state.triggerChange();
    } else {
      super.show();
    }
  }

  protected updateColours(): void {
    this.waves.firstWaveColour = this.colourProvider.light4;
    this.waves.secondWaveColour = this.colourProvider.light3;
    this.waves.thirdWaveColour = this.colourProvider.dark4;
    this.waves.fourthWaveColour = this.colourProvider.dark3;
    this.background.colour = this.backgroundColour;
  }

  protected override popIn(): void {
    super.popIn();

    this.fadeEdgeEffectTo(WaveContainer.SHADOW_OPACITY, WaveContainer.APPEAR_DURATION, Easing.Out);
  }

  protected override popOut(): void {
    super.popOut();

    this.fadeEdgeEffectTo(0, WaveContainer.DISAPPEAR_DURATION, Easing.In).onComplete(() => this.popOutComplete());
  }

  protected popOutComplete(): void {
  }
}
