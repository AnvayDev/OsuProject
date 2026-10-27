// Ported from osu.Game/Graphics/UserInterface/HoverSampleDebounceComponent.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { Component } from '@fw/graphics/Component';
import type { HoverEvent } from '@fw/input/events/UIEvents';
import type { Vector2 } from '@fw/layout/Vector2';
import { SessionStatics, Static } from '../../configuration/SessionStatics';
import { OsuGameBase } from '../../OsuGameBase';

/** Handles debouncing hover sounds at a global level to ensure the effects are not overwhelming. */
export abstract class HoverSampleDebounceComponent extends Component {
  private lastPlaybackTime!: Bindable<number | null>;

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.parent?.receivePositionalInputAt(screenSpacePos) === true;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.lastPlaybackTime = dependencies.resolve(SessionStatics).getBindable<number | null>(Static.LastHoverSoundPlaybackTime);
    return r;
  }

  protected override onHover(e: HoverEvent): boolean {
    // hover sounds shouldn't be played during scroll operations.
    if (e.hasAnyButtonPressed)
      return false;

    const last = this.lastPlaybackTime.value;
    const enoughTimePassedSinceLastPlayback = last === null || this.time.current - last >= OsuGameBase.SAMPLE_DEBOUNCE_TIME;

    if (enoughTimePassedSinceLastPlayback) {
      this.playHoverSample();
      this.lastPlaybackTime.value = this.time.current;
    }

    return false;
  }

  abstract playHoverSample(): void;
}
