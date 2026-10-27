// Ported from osu.Game/Screens/OsuScreenStack.cs

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Axes, LoadState } from '@fw/layout/Enums';
import type { IScreen } from '@fw/screens/IScreen';
import { ScreenStack } from '@fw/screens/ScreenStack';
import { ParallaxContainer } from '../graphics/containers/ParallaxContainer';
import { BackgroundScreenStack } from './BackgroundScreenStack';
import { OsuScreen } from './OsuScreen';

export class OsuScreenStack extends ScreenStack {
  private readonly backgroundScreenStack: BackgroundScreenStack;

  private readonly parallaxContainer: ParallaxContainer;

  protected get parallaxAmount(): number {
    return this.parallaxContainer.parallaxAmount;
  }

  constructor() {
    super();

    this.addInternal(this.parallaxContainer = new ParallaxContainer().with({
      relativeSizeAxes: Axes.Both,
      child: this.backgroundScreenStack = new BackgroundScreenStack().with({ relativeSizeAxes: Axes.Both }),
    }));

    this.screenPushed.add(([prev, next]) => this.onScreenPushed(prev, next));
    this.screenExited.add(([prev, next]) => this.screenChanged(prev, next));
  }

  /** [Cached] backgroundScreenStack */
  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cacheAs(BackgroundScreenStack, this.backgroundScreenStack);
    return dependencies;
  }

  pushSynchronously(screen: OsuScreen): void {
    this.loadComponent(screen);
    this.push(screen);
  }

  private onScreenPushed(prev: IScreen | null, next: IScreen): void {
    if (this.loadState < LoadState.Ready) {
      // dependencies must be present to stay in a sane state.
      // this is generally only ever hit by test scenes.
      this.schedule(() => this.onScreenPushed(prev, next));
      return;
    }

    // create dependencies synchronously to ensure leases are in a sane state.
    (next as OsuScreen).createLeasedDependencies((prev as OsuScreen | null)?.dependencies ?? this.dependencies!);

    this.screenChanged(prev, next);
  }

  protected screenChanged(_prev: IScreen | null, next: IScreen | null): void {
    this.setParallax(next);
  }

  private setParallax(next: IScreen | null): void {
    this.parallaxContainer.parallaxAmount = ParallaxContainer.DEFAULT_PARALLAX_AMOUNT * (next instanceof OsuScreen ? next.backgroundParallaxAmount : 1);
  }
}
