// Ported from osu.Game/Rulesets/Objects/SliderEventGenerator.cs

export enum SliderEventType {
  Tick,
  /** Occurs just before the tail. See generate. Should generally be ignored. */
  LegacyLastTick,
  Head,
  Tail,
  Repeat,
}

/** Describes a point in time on a slider given special meaning. Should be used to position and place nested HitObjects. */
export interface SliderEventDescriptor {
  /** The type of event. */
  type: SliderEventType;
  /** The time of this event. */
  time: number;
  /** The zero-based index of the span. In the case of repeat sliders, this will increase after each SliderEventType.Repeat. */
  spanIndex: number;
  /** The time at which the contained spanIndex begins. */
  spanStartTime: number;
  /** The progress along the slider's SliderPath at which this event occurs. */
  pathProgress: number;
}

export const SliderEventGenerator = {
  /** Historically, slider's final tick (aka the place where the slider would receive a final judgement) was offset by -36 ms. */
  TAIL_LENIENCY: -36,

  *generate(startTime: number, spanDuration: number, velocity: number, tickDistance: number, totalDistance: number, spanCount: number): Iterable<SliderEventDescriptor> {
    // A very lenient maximum length of a slider for ticks to be generated.
    // This exists for edge cases such as /b/1573664 where the beatmap has been edited by the user, and should never be reached in normal usage.
    const max_length = 100000;

    const length = Math.min(max_length, totalDistance);
    // (Math.Clamp: a NaN tick distance stays NaN, and generates no ticks.)
    tickDistance = tickDistance < 0 ? 0 : tickDistance > length ? length : tickDistance;

    const minDistanceFromEnd = velocity * 10;

    yield { type: SliderEventType.Head, spanIndex: 0, spanStartTime: startTime, time: startTime, pathProgress: 0 };

    for (let span = 0; span < spanCount; span++) {
      const spanStartTime = startTime + span * spanDuration;
      const reversed = span % 2 === 1;

      if (tickDistance !== 0) {
        const ticks = [...generateTicks(span, spanStartTime, spanDuration, reversed, length, tickDistance, minDistanceFromEnd)];

        // For repeat spans, ticks are returned in reverse-StartTime order, which is undesirable for some rulesets
        if (reversed)
          ticks.reverse();

        yield* ticks;
      }

      if (span < spanCount - 1) {
        yield {
          type: SliderEventType.Repeat,
          spanIndex: span,
          spanStartTime: startTime + span * spanDuration,
          time: spanStartTime + spanDuration,
          pathProgress: (span + 1) % 2,
        };
      }
    }

    const totalDuration = spanCount * spanDuration;

    // Okay, I'll level with you. I made a mistake. It was 2007.
    // Times were simpler. osu! was but in its infancy and sliders were a new concept.
    // A hack was made, which has unfortunately lived through until this day.
    //
    // This legacy tick is used for some calculations and judgements where audio output is not required.
    // Generally we are keeping this around just for difficulty compatibility.
    // Optimistically we do not want to ever use this for anything user-facing going forwards.

    const finalSpanIndex = spanCount - 1;
    const finalSpanStartTime = startTime + finalSpanIndex * spanDuration;

    // Note that `finalSpanStartTime + spanDuration ≈ startTime + totalDuration`, but we write it like this to match floating point precision
    // of stable.
    //
    // So thinking about this in a saner way, the time of the LegacyLastTick is
    //
    // `slider.StartTime + max(slider.Duration / 2, slider.Duration - 36)`
    //
    // As a slider gets shorter than 72 ms, the leniency offered falls below the 36 ms `TAIL_LENIENCY` constant.
    const legacyLastTickTime = Math.max(startTime + totalDuration / 2, (finalSpanStartTime + spanDuration) + SliderEventGenerator.TAIL_LENIENCY);
    let legacyLastTickProgress = (legacyLastTickTime - finalSpanStartTime) / spanDuration;

    if (spanCount % 2 === 0) legacyLastTickProgress = 1 - legacyLastTickProgress;

    yield { type: SliderEventType.LegacyLastTick, spanIndex: finalSpanIndex, spanStartTime: finalSpanStartTime, time: legacyLastTickTime, pathProgress: legacyLastTickProgress };

    yield {
      type: SliderEventType.Tail,
      spanIndex: finalSpanIndex,
      spanStartTime: startTime + (spanCount - 1) * spanDuration,
      time: startTime + totalDuration,
      pathProgress: spanCount % 2,
    };
  },
};

/** Generates the ticks for a span of the slider. */
function* generateTicks(spanIndex: number, spanStartTime: number, spanDuration: number, reversed: boolean, length: number, tickDistance: number, minDistanceFromEnd: number): Iterable<SliderEventDescriptor> {
  for (let d = tickDistance; d <= length; d += tickDistance) {
    if (d >= length - minDistanceFromEnd)
      break;

    // Always generate ticks from the start of the path rather than the span to ensure that ticks in repeat spans are positioned identically to those in non-repeat spans
    const pathProgress = d / length;
    const timeProgress = reversed ? 1 - pathProgress : pathProgress;

    yield { type: SliderEventType.Tick, spanIndex, spanStartTime, time: spanStartTime + timeProgress * spanDuration, pathProgress };
  }
}
