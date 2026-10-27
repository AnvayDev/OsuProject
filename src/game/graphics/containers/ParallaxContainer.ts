// Ported from osu.Game/Graphics/Containers/ParallaxContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import type { InputManager, IRequireHighFrequencyMousePosition } from '@fw/input/InputManager';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Precision } from '@fw/layout/Primitives';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { damp, valueAt } from '@fw/transforms/Interpolation';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';

export class ParallaxContainer extends Container implements IRequireHighFrequencyMousePosition {
  readonly requireHighFrequencyMousePosition = true;

  static readonly DEFAULT_PARALLAX_AMOUNT = Math.fround(0.02);

  /** The amount of parallax movement. Negative values will reverse the direction of parallax relative to user input. */
  parallaxAmount = ParallaxContainer.DEFAULT_PARALLAX_AMOUNT;

  private parallaxScale!: Bindable<number>;

  private static readonly parallax_duration = 100;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;

    this.addInternal(this.contentContainer = new Container().with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
    }));
  }

  private readonly contentContainer: Container;
  private input!: InputManager;

  protected override get content(): Container<Drawable> {
    return this.contentContainer;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.parallaxScale = dependencies.resolve(OsuConfigManager).getBindable<number>(OsuSetting.MenuParallaxScale);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.input = this.getContainingInputManager()!;
  }

  protected override update(): void {
    super.update();

    const amount = Math.fround(this.parallaxAmount * this.parallaxScale.value);

    if (amount === 0 && this.contentContainer.position.equals(Vector2.Zero) && this.contentContainer.scale.equals(Vector2.One))
      return;

    const scale = new Vector2(1 + Math.abs(amount));

    // (C# checks input.CurrentState.Mouse != null, which always holds.)
    const sizeDiv2 = this.drawSize.div(2);
    const relativeAmount = this.toLocalSpace(this.input.currentState.mouse.position).sub(sizeDiv2);

    const base_factor = Math.fround(0.999);

    const relativeAmountX = Math.fround(Math.sign(relativeAmount.x) * damp(0, 1, base_factor, Math.abs(relativeAmount.x)));
    const relativeAmountY = Math.fround(Math.sign(relativeAmount.y) * damp(0, 1, base_factor, Math.abs(relativeAmount.y)));

    const offset = new Vector2(relativeAmountX, relativeAmountY).mul(sizeDiv2).mul(amount);

    const elapsed = Math.min(Math.max(this.clock!.elapsedFrameTime, 0), ParallaxContainer.parallax_duration);

    this.contentContainer.position = Precision.almostEqualsVector(this.contentContainer.position, offset)
      ? offset
      : valueAt(elapsed, this.contentContainer.position, offset, 0, ParallaxContainer.parallax_duration, Easing.OutQuint);

    this.contentContainer.scale = Precision.almostEqualsVector(this.contentContainer.scale, scale)
      ? scale
      : valueAt(elapsed, this.contentContainer.scale, scale, 0, 1000, Easing.OutQuint);
  }
}
