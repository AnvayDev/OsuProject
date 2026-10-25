// Ported from osu.Game/Graphics/Containers/LogoTrackingContainer.cs

import { InvokeOnDisposal } from '@fw/allocation/InvokeOnDisposal';
import { Container } from '@fw/graphics/containers/Container';
import { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { applyEasing, Easing } from '@fw/transforms/Easing';
import type { OsuLogo } from '../../screens/menu/OsuLogo';

/** A dummy object used to denote another object's location. */
export abstract class Facade extends Drawable {
  override get size(): Vector2 {
    return super.size;
  }

  override set size(_value: Vector2) {
    throw new Error('Cannot set the Size of a Facade outside of a LogoTrackingContainer');
  }

  protected setSize(size: Vector2): void {
    super.size = size;
  }
}

class InternalFacade extends Facade {
  override setSize(size: Vector2): void {
    super.setSize(size);
  }
}

/** A container that handles tracking of an OsuLogo through different layout scenarios. */
export class LogoTrackingContainer extends Container {
  get logoFacade(): Facade {
    return this.facade;
  }

  private _logo: OsuLogo | null = null;

  protected get logo(): OsuLogo | null {
    return this._logo;
  }

  private readonly facade = new InternalFacade();

  private easing = Easing.None;
  private startPosition: Vector2 | null = null;
  private startTime: number | null = null;
  private duration = 0;

  /**
   * Assign the logo that should track the facade's position, as well as how it should transform to its initial position.
   * @param logo The instance of the logo to be used for tracking.
   * @param duration The duration of the initial transform. Default is instant.
   * @param easing The easing type of the initial transform.
   */
  startTracking(logo: OsuLogo, duration = 0, easing = Easing.None): InvokeOnDisposal {
    if (this._logo !== null && this._logo !== logo)
      throw new Error('A different logo is already being tracked.');

    if (logo.isTracking && this._logo === null)
      throw new Error('Cannot track an instance of OsuLogo to multiple LogoTrackingContainers');

    if (logo.isTracking)
      throw new Error('A previous tracking operation is still active. Dispose of its return value before starting a new tracking operation.');

    this._logo = logo;
    this._logo.isTracking = true;

    this.duration = duration;
    this.easing = easing;

    this.startTime = null;
    this.startPosition = null;

    return new InvokeOnDisposal(() => {
      this._logo!.isTracking = false;
      this._logo = null;
    });
  }

  /**
   * Gets the position that the logo should move to with respect to the logoFacade.
   * Manually performs a conversion of the Facade's position to the Logo's parent's relative space.
   * Will only be correct if the logo's relativePositionAxes are set to Axes.Both.
   */
  protected computeLogoTrackingPosition(): Vector2 {
    const parent = this._logo!.parent!;
    const absolutePos = parent.toLocalSpace(this.logoFacade.screenSpaceDrawQuad.centre);

    return new Vector2(Math.fround(absolutePos.x / parent.relativeToAbsoluteFactor.x),
      Math.fround(absolutePos.y / parent.relativeToAbsoluteFactor.y));
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    const logo = this._logo;

    if (logo === null)
      return;

    if (logo.relativePositionAxes !== Axes.Both)
      throw new Error('Tracking logo must have RelativePositionAxes = Axes.Both');

    // Account for the scale of the actual OsuLogo, as SizeForFlow only accounts for the sprite scale.
    this.facade.setSize(new Vector2(Math.fround(logo.sizeForFlow * logo.scale.x)));

    const localPos = this.computeLogoTrackingPosition();

    if (this.logoFacade.parent !== null && !logo.position.equals(localPos)) {
      // If this is our first update since tracking has started, initialize our starting values for interpolation
      if (this.startTime === null || this.startPosition === null) {
        this.startTime = this.time.current;
        this.startPosition = logo.position;
      }

      if (this.duration !== 0) {
        const elapsedDuration = this.time.current - this.startTime;

        const amount = Math.fround(applyEasing(this.easing, Math.min(elapsedDuration / this.duration, 1)));

        // Interpolate the position of the logo, where amount 0 is where the logo was when it first began interpolating, and amount 1 is the target location.
        logo.position = this.startPosition.add(localPos.sub(this.startPosition).mul(amount));
      } else {
        logo.position = localPos;
      }
    }
  }

  override dispose(): void {
    if (this._logo !== null)
      this._logo.isTracking = false;

    super.dispose();
  }
}
