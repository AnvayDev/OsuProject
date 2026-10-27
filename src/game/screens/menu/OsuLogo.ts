// Ported from osu.Game/Screens/Menu/OsuLogo.cs
// IntroSequence (only IntroCircles plays it, through PlayIntro) is not ported yet, so neither is PlayIntro.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { InvokeOnDisposal } from '@fw/allocation/InvokeOnDisposal';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { TextureStore } from '@fw/graphics/textures/TextureStore';
import type { ClickEvent, DragEndEvent, DragEvent, DragStartEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { MouseButton } from '@fw/input/Key';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { damp } from '@fw/transforms/Interpolation';
import { RNG } from '@fw/utils/RNG';
import type { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import type { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { TrianglesV2 } from '../../graphics/backgrounds/TrianglesV2';
import { BeatSyncedContainer } from '../../graphics/containers/BeatSyncedContainer';
import { MusicController } from '../../overlays/MusicController';
import { MenuLogoVisualisation } from './MenuLogoVisualisation';

const transition_length = 300;

const visualizer_default_alpha = Math.fround(0.5);

const early_activation = 60;

const triangles_paused_velocity = Math.fround(0.5);

/** osu! logo and its attachments (pulsing, visualiser etc.) */
export class OsuLogo extends BeatSyncedContainer {
  static readonly SCALE_ADJUST = new Vector2(Math.fround(0.94));

  private readonly logo: Sprite;
  private readonly logoContainer: CircularContainer;
  private readonly logoBounceContainer: Container;
  private readonly logoBeatContainer: Container;
  private readonly logoAmplitudeContainer: Container;
  private readonly logoHoverContainer: Container;

  private readonly visualizer: MenuLogoVisualisation;

  private sampleClick: Sample | null = null;
  private sampleClickChannel: SampleChannel | null = null;

  protected createMenuLogoVisualisation(): MenuLogoVisualisation {
    return new MenuLogoVisualisation();
  }

  protected get beatSampleVariance(): number {
    return 0.1;
  }

  protected sampleBeat: Sample | null = null;
  protected sampleDownbeat: Sample | null = null;

  private readonly colourAndTriangles: Container;
  /** C#'s private `triangles` (renamed: the public Triangles setter takes the name in camelCase). */
  private readonly trianglesV2: TrianglesV2;

  /** Return value decides whether the logo should play its own sample for the click action. */
  action: (() => boolean) | null = null;

  /** The size of the logo Sprite with respect to the scale of its hover and bounce containers. */
  get sizeForFlow(): number {
    return this.logo.drawSize.x * this.logo.scale.x * this.logoBounceContainer.scale.x * this.logoHoverContainer.scale.x;
  }

  isTracking = false;

  /** C#'s private `ripple` (renamed: the public Ripple property takes the name in camelCase). */
  private readonly rippleSprite: Sprite;
  private readonly rippleContainer: Container;

  set triangles(value: boolean) {
    this.colourAndTriangles.fadeTo(value ? 1 : 0, transition_length, Easing.OutQuint);
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.logoContainer.receivePositionalInputAt(screenSpacePos);
  }

  get ripple(): boolean {
    return this.rippleContainer.alpha > 0;
  }

  set ripple(value: boolean) {
    this.rippleContainer.fadeTo(value ? 1 : 0, transition_length, Easing.OutQuint);
  }

  private readonly flashLayer: Box;

  private readonly impactContainer: Container;

  override get isPresent(): boolean {
    return super.isPresent || this.scheduler.hasPendingTasks;
  }

  readonly logoElements: Container;

  constructor() {
    super();

    this.earlyActivationMilliseconds = early_activation;

    this.origin = Anchor.Centre;
    this.autoSizeAxes = Axes.Both;

    this.children = [
      this.logoHoverContainer = new Container().with({
        autoSizeAxes: Axes.Both,
        children: [
          this.logoBounceContainer = new Container().with({
            autoSizeAxes: Axes.Both,
            children: [
              this.rippleContainer = new Container().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                relativeSizeAxes: Axes.Both,
                children: [
                  this.rippleSprite = new Sprite().with({
                    anchor: Anchor.Centre,
                    origin: Anchor.Centre,
                    blending: BlendingParameters.Additive,
                    alpha: 0,
                  }),
                ],
              }),
              this.logoAmplitudeContainer = new Container().with({
                autoSizeAxes: Axes.Both,
                children: [
                  this.logoBeatContainer = new Container().with({
                    autoSizeAxes: Axes.Both,
                    children: [
                      this.visualizer = this.createMenuLogoVisualisation().with({
                        relativeSizeAxes: Axes.Both,
                        origin: Anchor.Centre,
                        anchor: Anchor.Centre,
                        alpha: visualizer_default_alpha,
                        size: OsuLogo.SCALE_ADJUST,
                      }),
                      this.logoElements = new Container().with({
                        autoSizeAxes: Axes.Both,
                        children: [
                          this.logoContainer = new CircularContainer().with({
                            anchor: Anchor.Centre,
                            origin: Anchor.Centre,
                            relativeSizeAxes: Axes.Both,
                            scale: OsuLogo.SCALE_ADJUST,
                            masking: true,
                            children: [
                              this.colourAndTriangles = new Container().with({
                                relativeSizeAxes: Axes.Both,
                                anchor: Anchor.Centre,
                                origin: Anchor.Centre,
                                children: [
                                  new Box().with({
                                    relativeSizeAxes: Axes.Both,
                                    colour: ColourInfo.gradientVertical(Colour4.fromHex('ff66ab'), Colour4.fromHex('cc5289')),
                                  }),
                                  this.trianglesV2 = new TrianglesV2().with({
                                    anchor: Anchor.Centre,
                                    origin: Anchor.Centre,
                                    thickness: Math.fround(0.009),
                                    scaleAdjust: 3,
                                    spawnRatio: Math.fround(1.4),
                                    colour: ColourInfo.gradientVertical(Colour4.fromHex('ff66ab'), Colour4.fromHex('b6346f')),
                                    relativeSizeAxes: Axes.Both,
                                  }),
                                ],
                              }),
                              this.flashLayer = new Box().with({
                                relativeSizeAxes: Axes.Both,
                                blending: BlendingParameters.Additive,
                                colour: Colour4.White,
                                alpha: 0,
                              }),
                            ],
                          }),
                          this.logo = new Sprite().with({
                            anchor: Anchor.Centre,
                            origin: Anchor.Centre,
                          }),
                        ],
                      }),
                      this.impactContainer = new CircularContainer().with({
                        anchor: Anchor.Centre,
                        origin: Anchor.Centre,
                        alpha: 0,
                        borderColour: Colour4.White,
                        relativeSizeAxes: Axes.Both,
                        borderThickness: 10,
                        masking: true,
                        children: [
                          new Box().with({
                            relativeSizeAxes: Axes.Both,
                            alwaysPresent: true,
                            alpha: 0,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];
  }

  /**
   * Schedule a new external animation. Handled queueing and finishing previous animations in a sane way.
   * action: the animation to be performed. waitForPrevious: if true, the new animation is delayed until all previous transforms finish.
   * If false, existing transformed are cleared.
   */
  appendAnimatingAction(action: () => void, waitForPrevious: boolean): void {
    const runnableAction = () => {
      if (waitForPrevious)
        this.delayUntilTransformsFinished().schedule(action);
      else {
        this.clearTransforms();
        action();
      }
    };

    if (this.isLoaded)
      runnableAction();
    else
      this.schedule(runnableAction);
  }

  private musicController!: MusicController;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.musicController = dependencies.resolve(MusicController);

    const samples = dependencies.resolve(AudioManager).samples;
    const textures = dependencies.resolve(TextureStore);

    const [click, beat, downbeat, logo] = await Promise.all([
      samples.get('Menu/osu-logo-select'),
      samples.get('Menu/osu-logo-heartbeat'),
      samples.get('Menu/osu-logo-downbeat'),
      textures.get('Menu/logo'),
    ]);

    this.sampleClick = click;
    this.sampleBeat = beat;
    this.sampleDownbeat = downbeat;

    this.logo.texture = logo;
    this.rippleSprite.texture = logo;
  }

  private lastBeatIndex = 0;

  protected override onNewBeat(beatIndex: number, timingPoint: TimingControlPoint, effectPoint: EffectControlPoint, amplitudes: ChannelAmplitudes): void {
    super.onNewBeat(beatIndex, timingPoint, effectPoint, amplitudes);

    this.lastBeatIndex = beatIndex;

    const beatLength = timingPoint.beatLength;

    const amplitudeAdjust = Math.min(1, Math.fround(0.4 + amplitudes.maximum));

    if (beatIndex < 0) return;

    if (this.action !== null && this.isHovered) {
      this.delay(early_activation).schedule(() => {
        if (beatIndex % timingPoint.timeSignature.numerator === 0)
          this.sampleDownbeat?.play();
        else {
          const channel = this.sampleBeat?.getChannel();
          if (channel) {
            channel.frequency.value = 1 - this.beatSampleVariance / 2 + RNG.nextDouble(this.beatSampleVariance);
            channel.play();
          }
        }
      });
    }

    this.logoBeatContainer
      .scaleTo(1 - Math.fround(0.02 * amplitudeAdjust), early_activation, Easing.Out).then()
      .scaleTo(1, beatLength * 2, Easing.OutQuint);

    this.rippleSprite.clearTransforms();
    this.rippleSprite
      .scaleTo(this.logoAmplitudeContainer.scale)
      .scaleTo(this.logoAmplitudeContainer.scale.mul(1 + Math.fround(0.04 * amplitudeAdjust)), beatLength, Easing.OutQuint)
      .fadeTo(Math.fround(0.15 * amplitudeAdjust)).fadeOut(beatLength, Easing.OutQuint);

    if (effectPoint.kiaiMode && this.flashLayer.alpha < 0.4) {
      this.flashLayer.clearTransforms();
      this.flashLayer
        .fadeTo(Math.fround(0.2 * amplitudeAdjust), early_activation, Easing.Out).then()
        .fadeOut(beatLength);

      this.visualizer.clearTransforms();
      this.visualizer
        .fadeTo(Math.fround(visualizer_default_alpha * 1.8 * amplitudeAdjust), early_activation, Easing.Out).then()
        .fadeTo(visualizer_default_alpha, beatLength);
    }

    this.delay(early_activation).schedule(() => {
      this.trianglesV2.velocity += amplitudeAdjust * (effectPoint.kiaiMode ? 6 : 3);
    });
  }

  protected override update(): void {
    super.update();

    const scale_adjust_cutoff = Math.fround(0.4);

    if (this.musicController.currentTrack.isRunning) {
      const maxAmplitude = this.lastBeatIndex >= 0 ? this.musicController.currentTrack.currentAmplitudes.maximum : 0;
      this.logoAmplitudeContainer.scale = new Vector2(Math.fround(damp(this.logoAmplitudeContainer.scale.x,
        1 - Math.max(0, maxAmplitude - scale_adjust_cutoff) * Math.fround(0.04), Math.fround(0.9), this.time.elapsed)));
      this.trianglesV2.velocity = Math.fround(damp(this.trianglesV2.velocity, triangles_paused_velocity * (this.isKiaiTime ? 4 : 2), Math.fround(0.995), this.time.elapsed));
    } else {
      this.trianglesV2.velocity = Math.fround(damp(this.trianglesV2.velocity, triangles_paused_velocity, Math.fround(0.9), this.time.elapsed));
    }
  }

  override get handlePositionalInput(): boolean {
    return super.handlePositionalInput && this.alpha > 0.2;
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (e.button !== MouseButton.Left) return true;

    this.logoBounceContainer.scaleTo(Math.fround(0.9), 1000, Easing.Out);
    return true;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (e.button !== MouseButton.Left) return;

    this.logoBounceContainer.scaleTo(1, 500, Easing.OutElastic);
  }

  protected override onClick(_e: ClickEvent): boolean {
    this.flashLayer.clearTransforms();
    this.flashLayer.alpha = Math.fround(0.4);
    this.flashLayer.fadeOut(1500, Easing.OutExpo);

    if (this.action?.() === true) {
      this.stopSamplePlayback();
      this.sampleClickChannel = this.sampleClick?.getChannel() ?? null;
      this.sampleClickChannel?.play();
    }

    return true;
  }

  protected override onHover(_e: HoverEvent): boolean {
    if (this.action !== null)
      this.logoHoverContainer.scaleTo(Math.fround(1.1), 500, Easing.OutElastic);
    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.logoHoverContainer.scaleTo(1, 500, Easing.OutElastic);
  }

  impact(): void {
    this.impactContainer.fadeOutFromOne(250, Easing.In);
    this.impactContainer.scaleTo(OsuLogo.SCALE_ADJUST);
    this.impactContainer.scaleTo(Math.fround(1.12), 250);
  }

  override get dragBlocksClick(): boolean {
    return false;
  }

  protected override onDragStart(_e: DragStartEvent): boolean {
    return true;
  }

  protected override onDrag(e: DragEvent): void {
    let change = e.mousePosition.sub(e.mouseDownPosition);

    // Diminish the drag distance as we go further to simulate "rubber band" feeling.
    const length = change.length;
    change = change.mul(length <= 0 ? 0 : Math.fround(Math.pow(length, 0.6)) / length);

    this.logoBounceContainer.moveTo(change);
  }

  protected override onDragEnd(e: DragEndEvent): void {
    this.logoBounceContainer.moveTo(Vector2.Zero, 800, Easing.OutElastic);
    super.onDragEnd(e);
  }

  private defaultProxyTarget: Container | null = null;
  private currentProxyTarget: Container | null = null;
  /** C#'s private `proxy` (Drawable already has a `proxy` member here). */
  private logoProxy: Drawable | null = null;

  stopSamplePlayback(): void {
    this.sampleClickChannel?.stop();
  }

  proxyToContainer(c: Container): { dispose(): void } {
    if (this.currentProxyTarget !== null)
      throw new Error('Previous proxy usage was not returned');

    if (this.defaultProxyTarget === null)
      throw new Error('setupDefaultContainer must be called first');

    this.currentProxyTarget = c;

    this.defaultProxyTarget.remove(this.logoProxy!, false);
    this.currentProxyTarget.add(this.logoProxy!);

    return new InvokeOnDisposal(() => {
      this.currentProxyTarget!.remove(this.logoProxy!, false);
      this.currentProxyTarget = null;

      this.defaultProxyTarget!.add(this.logoProxy!);
    });
  }

  setupDefaultContainer(container: Container): void {
    this.defaultProxyTarget = container;

    this.defaultProxyTarget.add(this);
    this.defaultProxyTarget.add(this.logoProxy = this.createProxy());
  }

  changeAnchor(anchor: Anchor): void {
    const previousAnchor = this.anchorPosition;
    this.anchor = anchor;
    this.position = this.position.sub(this.anchorPosition.sub(previousAnchor));
  }
}
