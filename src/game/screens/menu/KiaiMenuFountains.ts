// Ported from osu.Game/Screens/Menu/KiaiMenuFountains.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor, Axes } from '@fw/layout/Enums';
import { GameHost } from '@fw/platform/GameHost';
import { RNG } from '@fw/utils/RNG';
import { BeatSyncedContainer } from '../../graphics/containers/BeatSyncedContainer';
import { StarFountain } from './StarFountain';
import { StarFountainSounds } from './StarFountainSounds';

export class KiaiMenuFountains extends BeatSyncedContainer {
  private leftFountain!: StarFountain;
  private rightFountain!: StarFountain;

  private host!: GameHost;

  private sounds!: StarFountainSounds;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.host = dependencies.resolve(GameHost);

    this.relativeSizeAxes = Axes.Both;

    this.children = [
      this.leftFountain = new StarFountain().with({
        anchor: Anchor.BottomLeft,
        origin: Anchor.BottomLeft,
        x: 250,
      }),
      this.rightFountain = new StarFountain().with({
        anchor: Anchor.BottomRight,
        origin: Anchor.BottomRight,
        x: -250,
      }),
      this.sounds = new StarFountainSounds(),
    ];

    return r;
  }

  private isTriggered = false;

  protected override update(): void {
    super.update();

    if (this.effectPoint.kiaiMode && !this.isTriggered) {
      const isNearEffectPoint = Math.abs(this.beatSyncSource.clock.currentTime - this.effectPoint.time) < 500;
      if (isNearEffectPoint)
        this.shoot();
    }

    this.isTriggered = this.effectPoint.kiaiMode;
  }

  shoot(): void {
    const direction = RNG.next(-1, 2);

    switch (direction) {
      case -1:
        this.leftFountain.shoot(1);
        this.rightFountain.shoot(-1);
        break;

      case 0:
        this.leftFountain.shoot(0);
        this.rightFountain.shoot(0);
        break;

      case 1:
        this.leftFountain.shoot(-1);
        this.rightFountain.shoot(1);
        break;
    }

    // Don't play SFX when game is in background, as it can be a bit noisy.
    if (this.host.isActive.value)
      this.sounds.play();
  }
}
