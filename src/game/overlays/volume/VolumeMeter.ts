// Ported from osu.Game/Overlays/Volume/VolumeMeter.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Signal } from '@fw/bindables/Signal';
import { Colour4 } from '@fw/graphics/Colour4';
import { BufferedContainer } from '@fw/graphics/containers/BufferedContainer';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { GlowEffect } from '@fw/graphics/effects/GlowEffect';
import { withEffect } from '@fw/graphics/effects/IEffect';
import { Box } from '@fw/graphics/shapes/Box';
import { Circle } from '@fw/graphics/shapes/Circle';
import { CircularProgress } from '@fw/graphics/userInterface/CircularProgress';
import type { IStateful } from '@fw/IStateful';
import type { DragEvent, DragStartEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseMoveEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Precision } from '@fw/layout/Primitives';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { kernelSize } from '@fw/utils/Blur';
import { RNG } from '@fw/utils/RNG';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { HoverSampleSet, HoverSampleSetExtensions } from '../../graphics/userInterface/HoverSampleSet';
import { SelectionState } from '../../graphics/userInterface/SelectionState';

const transition_length = 500;

const adjust_step = 0.01;

const max_acceleration = 5;
const acceleration_multiplier = 1.8;

/** Precision.DOUBLE_EPSILON */
const double_epsilon = 1e-7;

export class VolumeMeter extends Container implements IStateful<SelectionState> {
  private volumeCircle!: CircularProgress;
  private volumeCircleGlow!: CircularProgress;

  protected static readonly LABEL_SIZE = new Vector2(120, 20);

  readonly bindable = new BindableDouble().with({ minValue: 0, maxValue: 1, precision: 0.01 });

  protected readonly circleSize: number;

  private readonly meterColour: Colour4;
  private readonly name_: string;

  private text!: OsuSpriteText;
  private maxGlow!: BufferedContainer;

  private selectedGlowContainer!: Container;

  private hoverSample: Sample | null = null;
  private notchSample: Sample | null = null;
  private sampleLastPlaybackTime = 0;

  readonly stateChanged = new Signal<SelectionState>();

  private _state = SelectionState.NotSelected;

  get state(): SelectionState {
    return this._state;
  }

  set state(value: SelectionState) {
    if (this._state === value)
      return;

    this._state = value;
    this.stateChanged.emit(value);

    this.updateSelectedState();
  }

  constructor(name: string, circleSize: number, meterColour: Colour4) {
    super();

    this.circleSize = circleSize;
    this.meterColour = meterColour;
    this.name_ = name;

    this.autoSizeAxes = Axes.Both;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    const audio = dependencies.resolve(AudioManager);

    this.hoverSample = await audio.samples.get(`UI/${HoverSampleSetExtensions.getResourceName(HoverSampleSet.Button)}-hover`);
    this.notchSample = await audio.samples.get('UI/notch-tick');
    this.sampleLastPlaybackTime = this.time.current;

    const backgroundColour = colours.gray1;

    let bgProgress!: CircularProgress;

    const progress_start_radius = Math.fround(0.75);
    const progress_size = Math.fround(0.03);
    const progress_end_radius = Math.fround(progress_start_radius + progress_size);

    const blur_amount = 5;

    this.children = [
      new Container().with({
        size: new Vector2(this.circleSize),
        children: [
          new BufferedContainer().with({
            relativeSizeAxes: Axes.Both,
            children: [
              new Circle().with({
                relativeSizeAxes: Axes.Both,
                colour: backgroundColour,
              }),
              new CircularContainer().with({
                masking: true,
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                relativeSizeAxes: Axes.Both,
                size: new Vector2(progress_end_radius),
                children: [
                  bgProgress = new CircularProgress().with({
                    anchor: Anchor.Centre,
                    origin: Anchor.Centre,
                    relativeSizeAxes: Axes.Both,
                    rotation: 180,
                    colour: backgroundColour,
                  }),
                  new Container().with({
                    anchor: Anchor.Centre,
                    origin: Anchor.Centre,
                    name: 'Progress under covers for smoothing',
                    relativeSizeAxes: Axes.Both,
                    rotation: 180,
                    child: this.volumeCircle = new CircularProgress().with({
                      relativeSizeAxes: Axes.Both,
                    }),
                  }),
                ],
              }),
              new Circle().with({
                name: 'Inner Cover',
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                relativeSizeAxes: Axes.Both,
                colour: backgroundColour,
                size: new Vector2(progress_start_radius),
              }),
              new Container().with({
                name: 'Progress overlay for glow',
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                relativeSizeAxes: Axes.Both,
                size: new Vector2(Math.fround(progress_start_radius + progress_size / Math.fround(1.5))),
                rotation: 180,
                padding: new MarginPadding(-kernelSize(blur_amount)),
                child: withEffect(this.volumeCircleGlow = new CircularProgress().with({
                  relativeSizeAxes: Axes.Both,
                  innerRadius: Math.fround(progress_size * Math.fround(0.8)),
                }), Object.assign(new GlowEffect(), {
                  colour: this.meterColour,
                  blurSigma: new Vector2(blur_amount),
                  strength: 5,
                  padExtent: true,
                })),
              }),
            ],
          }),
          this.selectedGlowContainer = new CircularContainer().with({
            masking: true,
            relativeSizeAxes: Axes.Both,
            alpha: 0,
            child: new Box().with({
              relativeSizeAxes: Axes.Both,
              alpha: 0,
              alwaysPresent: true,
            }),
            edgeEffect: new EdgeEffectParameters({
              type: EdgeEffectType.Glow,
              colour: this.meterColour.opacity(Math.fround(0.1)),
              radius: 10,
            }),
          }),
          this.maxGlow = withEffect(this.text = new OsuSpriteText().with({
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            font: withFont(OsuFont.Numeric, { size: Math.fround(0.16) * this.circleSize }),
          }), Object.assign(new GlowEffect(), {
            colour: Colour4.Transparent,
            padExtent: true,
          })),
        ],
      }),
      new Container().with({
        size: VolumeMeter.LABEL_SIZE,
        autoSizeAxes: Axes.X,
        cornerRadius: 10,
        masking: true,
        margin: MarginPadding.of({ left: this.circleSize + 10 }),
        origin: Anchor.CentreLeft,
        anchor: Anchor.CentreLeft,
        children: [
          new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: backgroundColour,
          }),
          new OsuSpriteText().with({
            margin: MarginPadding.of({ horizontal: 32 }),
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            font: OsuFont.getFont({ weight: FontWeight.Bold }),
            text: this.name_,
          }),
        ],
      }),
    ];

    this.bindable.bindValueChanged(volume => {
      this.transformTo('displayVolume', volume.newValue, 400, Easing.OutQuint);
    }, true);

    bgProgress.progress = Math.fround(0.75);
  }

  private displayVolumeInt: number | null = null;

  private _displayVolume = 0;

  protected get displayVolume(): number {
    return this._displayVolume;
  }

  protected set displayVolume(value: number) {
    this._displayVolume = value;

    const intValue = Math.round(this._displayVolume * 100);
    const intVolumeChanged = intValue !== this.displayVolumeInt;

    this.displayVolumeInt = intValue;

    if (this._displayVolume >= Math.fround(0.995)) {
      this.text.text = 'MAX';
      this.maxGlow.effectColour = this.meterColour.opacity(2);
    } else {
      this.maxGlow.effectColour = Colour4.Transparent;
      this.text.text = String(intValue);
    }

    this.volumeCircle.progress = this._displayVolume * Math.fround(0.75);
    this.volumeCircleGlow.progress = this._displayVolume * Math.fround(0.75);

    if (intVolumeChanged && this.isLoaded)
      this.scheduler.addOnce(this.playTickSound);
  }

  private readonly playTickSound = (): void => {
    const tick_debounce_time = 30;

    if (this.time.current - this.sampleLastPlaybackTime <= tick_debounce_time)
      return;

    const channel = this.notchSample?.getChannel();
    if (channel === undefined)
      return;

    channel.frequency.value = Math.fround(0.99) + RNG.nextDouble(Math.fround(0.02)) + this._displayVolume * Math.fround(0.1);

    // intentionally pitched down, even when hitting max.
    if (this.displayVolumeInt === 0 || this.displayVolumeInt === 100)
      channel.frequency.value -= Math.fround(0.5);

    channel.play();
    this.sampleLastPlaybackTime = this.time.current;
  };

  get volume(): number {
    return this.bindable.value;
  }

  private set volume(value: number) {
    this.bindable.value = value;
  }

  increase(amount = 1, isPrecise = false): void {
    this.adjust(amount, isPrecise);
  }

  decrease(amount = 1, isPrecise = false): void {
    this.adjust(-amount, isPrecise);
  }

  // because volume precision is set to 0.01, this local is required to keep track of more precise adjustments and only apply when possible.
  private scrollAccumulation = 0;

  private accelerationModifier = 1;

  private accelerationDebounce: ScheduledDelegate | null = null;

  private readonly resetAcceleration = (): void => {
    this.accelerationModifier = 1;
  };

  private dragDelta = 0;

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return true; // handle to prevent drawables behind from potentially receiving the mouse down
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    this.dragDelta = 0;
    this.adjustFromDrag(e.delta);
    return true;
  }

  protected override onDrag(e: DragEvent): void {
    this.adjustFromDrag(e.delta);
    super.onDrag(e);
  }

  private adjustFromDrag(delta: Vector2): void {
    const mouse_drag_divisor = 200;

    this.dragDelta += Math.fround(delta.y / mouse_drag_divisor);

    if (Math.abs(this.dragDelta) < 0.01) return;

    this.volume -= this.dragDelta;
    this.dragDelta = 0;
  }

  private adjust(delta: number, isPrecise: boolean): void {
    if (delta === 0)
      return;

    // every adjust increment increases the rate at which adjustments happen up to a cutoff.
    // this debounce will reset on inactivity.
    this.accelerationDebounce?.cancel();
    this.accelerationDebounce = this.scheduler.addDelayed(this.resetAcceleration, 150);

    delta *= this.accelerationModifier;
    this.accelerationModifier = Math.min(max_acceleration, this.accelerationModifier * acceleration_multiplier);

    const precision = this.bindable.precision;

    if (isPrecise) {
      this.scrollAccumulation += delta * adjust_step;

      while (Precision.almostBigger(Math.abs(this.scrollAccumulation), precision, double_epsilon)) {
        this.volume += Math.sign(this.scrollAccumulation) * precision;
        this.scrollAccumulation = this.scrollAccumulation < 0 ? Math.min(0, this.scrollAccumulation + precision) : Math.max(0, this.scrollAccumulation - precision);
      }
    } else {
      this.volume += Math.sign(delta) * Math.max(precision, Math.abs(delta * adjust_step));
    }
  }

  protected override onScroll(e: ScrollEvent): boolean {
    this.adjust(e.scrollDelta.y, e.isPrecise);
    return true;
  }

  protected override onMouseMove(e: MouseMoveEvent): boolean {
    this.state = SelectionState.Selected;
    return super.onMouseMove(e);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.state = SelectionState.Selected;
    return false;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
  }

  private updateSelectedState(): void {
    switch (this._state) {
      case SelectionState.Selected:
        this.scaleTo(Math.fround(1.04), transition_length, Easing.OutExpo);
        this.selectedGlowContainer.fadeIn(transition_length, Easing.OutExpo);
        this.hoverSample?.play();
        break;

      case SelectionState.NotSelected:
        this.scaleTo(1, transition_length, Easing.OutExpo);
        this.selectedGlowContainer.fadeOut(transition_length, Easing.OutExpo);
        break;
    }
  }
}
