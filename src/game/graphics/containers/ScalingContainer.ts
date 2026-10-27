// Ported from osu.Game/Graphics/Containers/ScalingContainer.cs
// The web has no safe area and no tablet handler: ISafeArea's padding is always zero, OutputAreaSize/Offset are not set, and
// SizeableAlwaysInputContainer has no host window cursor to confine.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { DrawSizePreservingFillContainer } from '@fw/graphics/containers/DrawSizePreservingFillContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import { FLOAT_MAX, RectangleF } from '@fw/layout/Primitives';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ScalingMode } from '../../configuration/ScalingMode';
import { OsuGame } from '../../OsuGame';
import { BackgroundScreenStack } from '../../screens/BackgroundScreenStack';
import { BackgroundScreenDefault } from '../../screens/backgrounds/BackgroundScreenDefault';
import { OsuColour } from '../OsuColour';

/** Handles user-defined scaling, allowing application at multiple levels defined by ScalingMode. */
export class ScalingContainer extends Container {
  /** @internal */
  static readonly TRANSITION_DURATION = 500;

  private sizeX!: Bindable<number>;
  private sizeY!: Bindable<number>;
  private posX!: Bindable<number>;
  private posY!: Bindable<number>;
  private applySafeAreaPadding!: Bindable<boolean>;

  private readonly targetMode: ScalingMode | null;

  private scalingMode!: Bindable<ScalingMode>;

  private readonly contentContainer: Container;

  protected override get content(): Container<Drawable> {
    return this.contentContainer;
  }

  override receivePositionalInputAt(_screenSpacePos: Vector2): boolean {
    return true;
  }

  private readonly sizableContainer: Container;

  private backgroundStack: BackgroundScreenStack | null = null;

  private scalingMenuBackgroundDim!: Bindable<number>;

  private customRect: RectangleF | null = null;
  private customRectIsRelativePosition = false;

  /** Set a custom position and scale which overrides any user specification. */
  setCustomRect(rect: RectangleF | null, relativePosition = false): void {
    this.customRect = rect;
    this.customRectIsRelativePosition = relativePosition;

    if (this.isLoaded) this.scheduler.addOnce(this.updateSize);
  }

  private static readonly corner_radius = 10;

  /** Create a new instance. targetMode: the mode which this container should be handling. Handles all modes if null. */
  constructor(targetMode: ScalingMode | null = null) {
    super();

    this.targetMode = targetMode;
    this.relativeSizeAxes = Axes.Both;

    this.addInternal(this.sizableContainer = new SizeableAlwaysInputContainer().with({
      relativeSizeAxes: Axes.Both,
      relativePositionAxes: Axes.Both,
      cornerRadius: ScalingContainer.corner_radius,
      child: this.contentContainer = new ScalingDrawSizePreservingFillContainer(targetMode !== ScalingMode.Gameplay),
    }));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const config = dependencies.resolve(OsuConfigManager);
    const updateSize = () => this.scheduler.addOnce(this.updateSize);

    this.scalingMode = config.getBindable<ScalingMode>(OsuSetting.Scaling);
    this.scalingMode.valueChanged.add(updateSize);

    this.sizeX = config.getBindable<number>(OsuSetting.ScalingSizeX);
    this.sizeX.valueChanged.add(updateSize);

    this.sizeY = config.getBindable<number>(OsuSetting.ScalingSizeY);
    this.sizeY.valueChanged.add(updateSize);

    this.posX = config.getBindable<number>(OsuSetting.ScalingPositionX);
    this.posX.valueChanged.add(updateSize);

    this.posY = config.getBindable<number>(OsuSetting.ScalingPositionY);
    this.posY.valueChanged.add(updateSize);

    this.applySafeAreaPadding = config.getBindable<boolean>(OsuSetting.SafeAreaConsiderations);
    this.applySafeAreaPadding.bindValueChanged(updateSize);

    this.scalingMenuBackgroundDim = config.getBindable<number>(OsuSetting.ScalingBackgroundDim);
    this.scalingMenuBackgroundDim.valueChanged.add(updateSize);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateSize();
    this.sizableContainer.finishTransforms();
  }

  private get requiresBackgroundVisible(): boolean {
    return (this.scalingMode.value === ScalingMode.Everything || this.scalingMode.value === ScalingMode.ExcludeOverlays)
      && (this.sizeX.value !== 1 || this.sizeY.value !== 1)
      && this.scalingMenuBackgroundDim.value < 1;
  }

  private readonly updateSize = (): void => {
    if (this.targetMode === ScalingMode.Everything) {
      // the top level scaling container manages the background to be displayed while scaling.
      if (this.requiresBackgroundVisible) {
        if (this.backgroundStack === null) {
          this.addInternal(this.backgroundStack = new BackgroundScreenStack().with({
            alpha: 0,
            colour: Colour4.Black,
            depth: FLOAT_MAX,
          }));

          this.backgroundStack.push(new ScalingBackgroundScreen());
        }

        this.backgroundStack.fadeIn(ScalingContainer.TRANSITION_DURATION);
        this.backgroundStack.fadeColour(OsuColour.gray(1 - this.scalingMenuBackgroundDim.value), ScalingContainer.TRANSITION_DURATION, Easing.OutQuint);
      } else
        this.backgroundStack?.fadeOut(ScalingContainer.TRANSITION_DURATION);
    }

    let targetRect = new RectangleF(0, 0, 1, 1);

    if (this.customRect !== null) {
      this.sizableContainer.relativePositionAxes = this.customRectIsRelativePosition ? Axes.Both : Axes.None;

      targetRect = this.customRect;
    } else if (this.targetMode === null || this.scalingMode.value === this.targetMode) {
      this.sizableContainer.relativePositionAxes = Axes.Both;

      const scale = new Vector2(this.sizeX.value, this.sizeY.value);
      const pos = new Vector2(this.posX.value, this.posY.value).mul(Vector2.One.sub(scale));

      targetRect = new RectangleF(pos.x, pos.y, scale.x, scale.y);
    }

    // (the second condition, the top level container masking for a non-zero safe area, never holds: the web has no safe area.)
    const requiresMasking = targetRect.width !== 1 || targetRect.height !== 1;

    if (requiresMasking)
      this.sizableContainer.masking = true;

    this.sizableContainer.moveTo(new Vector2(targetRect.x, targetRect.y), ScalingContainer.TRANSITION_DURATION, Easing.OutQuart);
    this.sizableContainer.resizeTo(new Vector2(targetRect.width, targetRect.height), ScalingContainer.TRANSITION_DURATION, Easing.OutQuart);

    // Of note, this will not work great in the case of nested ScalingContainers where multiple are applying corner radius.
    // Masking and corner radius should likely only be applied at one point in the full game stack to fix this.
    // An example of how this can occur is when the skin editor is visible and the game screen scaling is set to "Everything".
    this.sizableContainer.transformTo('cornerRadius', requiresMasking ? ScalingContainer.corner_radius : 0, ScalingContainer.TRANSITION_DURATION,
      requiresMasking ? Easing.OutQuart : Easing.None)
      .onComplete(() => { this.sizableContainer.masking = requiresMasking; });
  };
}

export class ScalingDrawSizePreservingFillContainer extends DrawSizePreservingFillContainer {
  private readonly applyUIScale: boolean;
  private uiScale: Bindable<number> | null = null;

  protected currentScale = 1;

  override receivePositionalInputAt(_screenSpacePos: Vector2): boolean {
    return true;
  }

  constructor(applyUIScale: boolean) {
    super();

    this.applyUIScale = applyUIScale;
  }

  private game: OsuGame | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.game = dependencies.get(OsuGame);

    if (this.applyUIScale) {
      this.uiScale = dependencies.resolve(OsuConfigManager).getBindable<number>(OsuSetting.UIScale);
      this.uiScale.bindValueChanged(args => this.transformTo('currentScale', args.newValue, ScalingContainer.TRANSITION_DURATION, Easing.OutQuart), true);
    }

    return r;
  }

  protected override update(): void {
    if (this.game !== null)
      this.targetDrawSize = this.game.scalingContainerTargetDrawSize;

    this.scale = new Vector2(this.currentScale);
    this.size = new Vector2(1 / this.currentScale);

    super.update();
  }
}

class ScalingBackgroundScreen extends BackgroundScreenDefault {
  protected override get allowStoryboardBackground(): boolean {
    return false;
  }

  override onEntering(_e: ScreenTransitionEvent): void {
    this.fadeInFromZero(4000, Easing.OutQuint);
  }
}

class SizeableAlwaysInputContainer extends Container {
  override receivePositionalInputAt(_screenSpacePos: Vector2): boolean {
    return true;
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;
  }
}
