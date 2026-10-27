// Ported from osu.Game/Screens/Menu/LogoVisualisation.cs
// The DrawNode is a canvas (CanvasDrawable): each bar is the C# quad (a rectangle rotated about the logo edge), filled with
// DrawColourInfo.Colour × white α0.2. Bars blend additively with each other ('lighter') as well as with what is behind the drawable
// (Blending.Additive); the per-bar edge smoothing (blend range) is left to the canvas' antialiasing.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { IHasAmplitudes } from '@fw/audio/IHasAmplitudes';
import { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { BeatSyncProviderExtensions } from '../../beatmaps/BeatSyncProviderExtensions';
import { IBeatSyncProvider } from '../../beatmaps/IBeatSyncProvider';

/** The number of bars to jump each update iteration. */
const index_change = 5;

/** The maximum length of each bar in the visualiser. Will be reduced when kiai is not activated. */
const bar_length = 600;

/** The number of bars in one rotation of the visualiser. */
const bars_per_visualiser = 200;

/** How many times we should stretch around the circumference (overlapping overselves). */
const visualiser_rounds = 5;

/** How much should each bar go down each millisecond (based on a full bar). */
const decay_per_millisecond = Math.fround(0.0024);

/** Number of milliseconds between each amplitude update. */
const time_between_updates = 50;

/** The minimum amplitude to show a bar. */
const amplitude_dead_zone = Math.fround(1 / bar_length);

const transparent_white = ColourInfo.singleColour(Colour4.White.opacity(0.2));

/** A visualiser that reacts to music coming from beatmaps. */
export class LogoVisualisation extends CanvasDrawable {
  /** The relative movement of bars based on input amplification. Defaults to 1. */
  magnitude = 1;

  private indexOffset = 0;

  private readonly frequencyAmplitudes = new Float32Array(256);

  constructor() {
    super();

    this.blending = BlendingParameters.Additive;
  }

  private readonly amplitudeSources: IHasAmplitudes[] = [];

  addAmplitudeSource(amplitudeSource: IHasAmplitudes): void {
    this.amplitudeSources.push(amplitudeSource);
  }

  private readonly temporalAmplitudes = new Float32Array(ChannelAmplitudes.AMPLITUDES_SIZE);

  private beatSyncProvider!: IBeatSyncProvider;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.beatSyncProvider = dependencies.resolve(IBeatSyncProvider);
    return r;
  }

  private readonly updateAmplitudes = (): void => {
    this.temporalAmplitudes.fill(0);

    this.addAmplitudesFromSource(this.beatSyncProvider);

    for (const source of this.amplitudeSources)
      this.addAmplitudesFromSource(source);

    const kiaiMultiplier = BeatSyncProviderExtensions.checkIsKiaiTime(this.beatSyncProvider) ? 1 : 0.5;

    for (let i = 0; i < bars_per_visualiser; i++) {
      const targetAmplitude = Math.fround(this.temporalAmplitudes[(i + this.indexOffset) % bars_per_visualiser] * kiaiMultiplier);
      if (targetAmplitude > this.frequencyAmplitudes[i])
        this.frequencyAmplitudes[i] = targetAmplitude;
    }

    this.indexOffset = (this.indexOffset + index_change) % bars_per_visualiser;
  };

  protected override loadComplete(): void {
    super.loadComplete();

    const delayed = this.scheduler.addDelayed(this.updateAmplitudes, time_between_updates, true);
    delayed.performRepeatCatchUpExecutions = false;
  }

  protected override update(): void {
    super.update();

    const decayFactor = Math.fround(this.time.elapsed * decay_per_millisecond);

    for (let i = 0; i < bars_per_visualiser; i++) {
      //3% of extra bar length to make it a little faster when bar is almost at it's minimum
      this.frequencyAmplitudes[i] -= decayFactor * (this.frequencyAmplitudes[i] + 0.03);
      if (this.frequencyAmplitudes[i] < 0)
        this.frequencyAmplitudes[i] = 0;
    }

    this.invalidateDraw();
  }

  private addAmplitudesFromSource(source: IHasAmplitudes): void {
    const amplitudes = source.currentAmplitudes.frequencyAmplitudes;

    for (let i = 0; i < amplitudes.length; i++) {
      if (i < this.temporalAmplitudes.length)
        this.temporalAmplitudes[i] += amplitudes[i];
    }
  }

  // Bars reach bar_length past the logo edge (amplitudes from several sources can add up beyond 1, but the bars are short-lived).
  protected override get drawOverflow(): number {
    return bar_length;
  }

  protected override draw(ctx: CanvasRenderingContext2D): void {
    // Assuming the logo is a circle, we don't need a second dimension.
    const size = this.drawSize.x;

    const colourInfo = this.drawColourInfo.colour.applyChild(transparent_white);
    ctx.fillStyle = colourInfo.averageColour.toCss();
    ctx.globalCompositeOperation = 'lighter';

    const barWidth = size * Math.sqrt(2 * (1 - Math.cos((360 / bars_per_visualiser) * Math.PI / 180))) / 2;

    for (let j = 0; j < visualiser_rounds; j++) {
      for (let i = 0; i < bars_per_visualiser; i++) {
        if (this.frequencyAmplitudes[i] < amplitude_dead_zone)
          continue;

        const rotation = (i / bars_per_visualiser * 360 + j * 360 / visualiser_rounds) * Math.PI / 180;
        const rotationCos = Math.cos(rotation);
        const rotationSin = Math.sin(rotation);

        // taking the cos and sin to the 0..1 range
        const barX = (rotationCos / 2 + 0.5) * size;
        const barY = (rotationSin / 2 + 0.5) * size;

        const barLength = bar_length * this.frequencyAmplitudes[i];

        // The C# quad: from the bar position ± half the width along the tangent, extended outwards by the amplitude.
        ctx.save();
        ctx.translate(barX, barY);
        ctx.rotate(rotation);
        ctx.fillRect(0, -barWidth / 2, barLength, barWidth);
        ctx.restore();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
