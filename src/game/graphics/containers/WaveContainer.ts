// Ported from osu.Game/Graphics/Containers/WaveContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Colour4 } from '@fw/graphics/Colour4';
import type { ColourInfo } from '@fw/graphics/ColourInfo';
import { Container } from '@fw/graphics/containers/Container';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';

const easing_show = Easing.OutSine;
const easing_hide = Easing.InSine;

export class WaveContainer extends VisibilityContainer {
  static readonly APPEAR_DURATION = 800;
  static readonly DISAPPEAR_DURATION = 500;
  static readonly SHADOW_OPACITY = Math.fround(0.2);

  private readonly firstWave: Wave;
  private readonly secondWave: Wave;
  private readonly thirdWave: Wave;
  private readonly fourthWave: Wave;

  private readonly wavesContainer: Container<Wave>;
  private readonly contentContainer: Container;

  protected override get content(): Container<Drawable> {
    return this.contentContainer;
  }

  protected override get startHidden(): boolean {
    return true;
  }

  private samplePopIn: Sample | null = null;
  private samplePopOut: Sample | null = null;

  // required due to LoadAsyncComplete() in `VisibilityContainer` calling PopOut() during load - similar workaround to `OsuDropdownMenu`
  private wasShown = false;

  get firstWaveColour(): ColourInfo {
    return this.firstWave.colour;
  }

  set firstWaveColour(value: Colour4 | ColourInfo) {
    this.firstWave.colour = value;
  }

  get secondWaveColour(): ColourInfo {
    return this.secondWave.colour;
  }

  set secondWaveColour(value: Colour4 | ColourInfo) {
    this.secondWave.colour = value;
  }

  get thirdWaveColour(): ColourInfo {
    return this.thirdWave.colour;
  }

  set thirdWaveColour(value: Colour4 | ColourInfo) {
    this.thirdWave.colour = value;
  }

  get fourthWaveColour(): ColourInfo {
    return this.fourthWave.colour;
  }

  set fourthWaveColour(value: Colour4 | ColourInfo) {
    this.fourthWave.colour = value;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const audio = dependencies.get(AudioManager);

    this.samplePopIn = await audio?.samples.get('UI/wave-pop-in') ?? null;
    this.samplePopOut = await audio?.samples.get('UI/overlay-big-pop-out') ?? null;
  }

  constructor() {
    super();

    this.masking = true;

    this.addInternal(this.wavesContainer = new Container<Wave>().with({
      relativeSizeAxes: Axes.X,
      origin: Anchor.TopCentre,
      anchor: Anchor.TopCentre,
      masking: true,
      children: [
        this.firstWave = new Wave().with({
          rotation: 13,
          finalPosition: -930,
        }),
        this.secondWave = new Wave().with({
          origin: Anchor.TopRight,
          anchor: Anchor.TopRight,
          rotation: -7,
          finalPosition: -560,
        }),
        this.thirdWave = new Wave().with({
          rotation: 4,
          finalPosition: -390,
        }),
        this.fourthWave = new Wave().with({
          origin: Anchor.TopRight,
          anchor: Anchor.TopRight,
          rotation: -2,
          finalPosition: -220,
        }),
      ],
    }));

    this.addInternal(this.contentContainer = new Container().with({
      relativeSizeAxes: Axes.Both,
      relativePositionAxes: Axes.Both,
      anchor: Anchor.BottomCentre,
      origin: Anchor.BottomCentre,
    }));
  }

  protected override popIn(): void {
    for (const w of this.wavesContainer.children)
      w.show();

    this.contentContainer.moveToY(0, WaveContainer.APPEAR_DURATION, Easing.OutQuint);
    this.samplePopIn?.play();
    this.wasShown = true;
  }

  protected override popOut(): void {
    for (const w of this.wavesContainer.children)
      w.hide();

    this.contentContainer.moveToY(2, WaveContainer.DISAPPEAR_DURATION, Easing.In);

    if (this.wasShown)
      this.samplePopOut?.play();
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // This is done as an optimization, such that invisible parts of the waves
    // are masked away, and thus do not consume fill rate.
    // todo: revert https://github.com/ppy/osu/commit/aff9e3617da0c8fe252169fae287e39b44575b5e after FTB is fixed on iOS.
    this.wavesContainer.height = Math.max(0, this.drawHeight - (this.contentContainer.drawHeight - this.contentContainer.y * this.drawHeight));
  }
}

/** (WaveContainer.Wave) */
class Wave extends VisibilityContainer {
  finalPosition = 0;

  protected override get startHidden(): boolean {
    return true;
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.width = 1.5;
    this.masking = true;
    this.edgeEffect = new EdgeEffectParameters({
      type: EdgeEffectType.Shadow,
      colour: Colour4.Black.opacity(50 / 255),
      radius: 20,
    });

    this.child = new Box().with({ relativeSizeAxes: Axes.Both });
  }

  protected override update(): void {
    super.update();

    // We can not use RelativeSizeAxes for Height, because the height
    // of our parent diminishes as the content moves up.
    this.height = this.parent!.parent!.drawSize.y * 1.5;
  }

  protected override popIn(): void {
    this.schedule(() => this.moveToY(this.finalPosition, WaveContainer.APPEAR_DURATION, easing_show));
  }

  protected override popOut(): void {
    const duration = this.isLoaded ? WaveContainer.DISAPPEAR_DURATION : 0;

    // scheduling is required as parent may not be present at the time this is called.
    this.schedule(() => this.moveToY(this.parent!.parent!.drawSize.y, duration, easing_hide));
  }
}
