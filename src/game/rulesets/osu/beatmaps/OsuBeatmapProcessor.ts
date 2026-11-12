// Ported from osu.Game.Rulesets.Osu/Beatmaps/OsuBeatmapProcessor.cs

import { Vector2F } from '@fw/layout/Vector2F';
import type { IBeatmap } from '../../../beatmaps/Beatmap';
import { BeatmapProcessor } from '../../../beatmaps/BeatmapProcessor';
import { getEndTime } from '../../objects/HitObject';
import { hasComboInformation, type IHasComboInformation } from '../../objects/types/Types';
import { HitCircle } from '../objects/HitCircle';
import { OsuHitObject } from '../objects/OsuHitObject';
import { Slider } from '../objects/Slider';
import { Spinner } from '../objects/Spinner';

export class OsuBeatmapProcessor extends BeatmapProcessor {
  static readonly STACK_DISTANCE = 3;

  override preProcess(): void {
    let lastObj: IHasComboInformation | null = null;

    // For sanity, ensures that both the first hitobject and the first hitobject after a spinner start a new combo.
    // This is normally enforced by the legacy decoder, but is not enforced by the editor.
    for (const obj of this.beatmap.hitObjects) {
      if (!hasComboInformation(obj))
        continue;

      if (!(obj instanceof Spinner) && (lastObj === null || lastObj instanceof Spinner))
        obj.newCombo = true;
      lastObj = obj;
    }

    super.preProcess();
  }

  override postProcess(): void {
    super.postProcess();

    OsuBeatmapProcessor.applyStacking(this.beatmap);
  }

  /** Applies the stacking algorithm to the osu! hit objects of a beatmap. */
  static applyStacking(beatmap: IBeatmap): void {
    const hitObjects = beatmap.hitObjects.filter((h): h is OsuHitObject => h instanceof OsuHitObject);

    if (hitObjects.length > 0) {
      // Reset stacking
      for (const h of hitObjects)
        h.stackHeight = 0;

      if (beatmap.beatmapVersion >= 6)
        applyStacking(beatmap, hitObjects, 0, hitObjects.length - 1);
      else
        applyStackingOld(beatmap, hitObjects);
    }
  }
}

const STACK_DISTANCE = OsuBeatmapProcessor.STACK_DISTANCE;
const distance = Vector2F.distance;

function applyStacking(beatmap: IBeatmap, hitObjects: OsuHitObject[], startIndex: number, endIndex: number): void {
  if (startIndex > endIndex) throw new RangeError('startIndex');
  if (startIndex < 0) throw new RangeError('startIndex');
  if (endIndex < 0) throw new RangeError('endIndex');

  let extendedEndIndex = endIndex;

  if (endIndex < hitObjects.length - 1) {
    // Extend the end index to include objects they are stacked on
    for (let i = endIndex; i >= startIndex; i--) {
      let stackBaseIndex = i;

      for (let n = stackBaseIndex + 1; n < hitObjects.length; n++) {
        const stackBaseObject = hitObjects[stackBaseIndex];
        if (stackBaseObject instanceof Spinner) break;

        const objectN = hitObjects[n];
        if (objectN instanceof Spinner)
          continue;

        const endTime = getEndTime(stackBaseObject);
        const stackThreshold = calculateStackThreshold(beatmap, objectN);

        if (objectN.startTime - endTime > stackThreshold)
          // We are no longer within stacking range of the next object.
          break;

        if (distance(stackBaseObject.position, objectN.position) < STACK_DISTANCE
          || (stackBaseObject instanceof Slider && distance(stackBaseObject.endPosition, objectN.position) < STACK_DISTANCE)) {
          stackBaseIndex = n;

          // HitObjects after the specified update range haven't been reset yet
          objectN.stackHeight = 0;
        }
      }

      if (stackBaseIndex > extendedEndIndex) {
        extendedEndIndex = stackBaseIndex;
        if (extendedEndIndex === hitObjects.length - 1)
          break;
      }
    }
  }

  // Reverse pass for stack calculation.
  let extendedStartIndex = startIndex;

  for (let i = extendedEndIndex; i > startIndex; i--) {
    let n = i;

    /* We should check every note which has not yet got a stack.
     * Consider the case we have two interwound stacks and this will make sense.
     *
     * o <-1      o <-2
     *  o <-3      o <-4
     *
     * We first process starting from 4 and handle 2,
     * then we come backwards on the i loop iteration until we reach 3 and handle 1.
     * 2 and 1 will be ignored in the i loop because they already have a stack value.
     */

    let objectI = hitObjects[i];
    if (objectI.stackHeight !== 0 || objectI instanceof Spinner) continue;

    const stackThreshold = calculateStackThreshold(beatmap, objectI);

    /* If this object is a hitcircle, then we enter this "special" case.
     * It either ends with a stack of hitcircles only, or a stack of hitcircles that are underneath a slider.
     * Any other case is handled by the "is Slider" code below this.
     */
    if (objectI instanceof HitCircle) {
      while (--n >= 0) {
        const objectN = hitObjects[n];
        if (objectN instanceof Spinner) continue;

        const endTime = getEndTime(objectN);

        // truncation to integer is required to match stable
        // compare https://github.com/peppy/osu-stable-reference/blob/08e3dafd525934cf48880b08e91c24ce4ad8b761/osu!/GameplayElements/HitObjectManager.cs#L1725
        // - both quantities being subtracted there are integers
        if (Math.trunc(objectI.startTime) - Math.trunc(endTime) > stackThreshold)
          // We are no longer within stacking range of the previous object.
          break;

        // HitObjects before the specified update range haven't been reset yet
        if (n < extendedStartIndex) {
          objectN.stackHeight = 0;
          extendedStartIndex = n;
        }

        /* This is a special case where hticircles are moved DOWN and RIGHT (negative stacking) if they are under the *last* slider in a stacked pattern.
         *    o==o <- slider is at original location
         *        o <- hitCircle has stack of -1
         *         o <- hitCircle has stack of -2
         */
        if (objectN instanceof Slider && distance(objectN.endPosition, objectI.position) < STACK_DISTANCE) {
          const offset = objectI.stackHeight - objectN.stackHeight + 1;

          for (let j = n + 1; j <= i; j++) {
            // For each object which was declared under this slider, we will offset it to appear *below* the slider end (rather than above).
            const objectJ = hitObjects[j];
            if (distance(objectN.endPosition, objectJ.position) < STACK_DISTANCE)
              objectJ.stackHeight -= offset;
          }

          // We have hit a slider.  We should restart calculation using this as the new base.
          // Breaking here will mean that the slider still has StackCount of 0, so will be handled in the i-outer-loop.
          break;
        }

        if (distance(objectN.position, objectI.position) < STACK_DISTANCE) {
          // Keep processing as if there are no sliders.  If we come across a slider, this gets cancelled out.
          //NOTE: Sliders with start positions stacking are a special case that is also handled here.

          objectN.stackHeight = objectI.stackHeight + 1;
          objectI = objectN;
        }
      }
    } else if (objectI instanceof Slider) {
      /* We have hit the first slider in a possible stack.
       * From this point on, we ALWAYS stack positive regardless.
       */
      while (--n >= startIndex) {
        const objectN = hitObjects[n];
        if (objectN instanceof Spinner) continue;

        if (objectI.startTime - objectN.startTime > stackThreshold)
          // We are no longer within stacking range of the previous object.
          break;

        if (distance(objectN.endPosition, objectI.position) < STACK_DISTANCE) {
          objectN.stackHeight = objectI.stackHeight + 1;
          objectI = objectN;
        }
      }
    }
  }
}

function applyStackingOld(beatmap: IBeatmap, hitObjects: OsuHitObject[]): void {
  for (let i = 0; i < hitObjects.length; i++) {
    const currHitObject = hitObjects[i];

    if (currHitObject.stackHeight !== 0 && !(currHitObject instanceof Slider))
      continue;

    let startTime = getEndTime(currHitObject);
    let sliderStack = 0;

    for (let j = i + 1; j < hitObjects.length; j++) {
      const stackThreshold = calculateStackThreshold(beatmap, hitObjects[i]);

      if (hitObjects[j].startTime - stackThreshold > startTime)
        break;

      // The start position of the hitobject, or the position at the end of the path if the hitobject is a slider
      const position2 = currHitObject instanceof Slider
        ? currHitObject.position.add(currHitObject.path.positionAt(1))
        : currHitObject.position;

      // Note the use of `StartTime` in the code below doesn't match stable's use of `EndTime`.
      // This is because in the stable implementation, `UpdateCalculations` is not called on the inner-loop hitobject (j)
      // and therefore it does not have a correct `EndTime`, but instead the default of `EndTime = StartTime`.
      //
      // Effects of this can be seen on https://osu.ppy.sh/beatmapsets/243#osu/1146 at sliders around 86647 ms, where
      // if we use `EndTime` here it would result in unexpected stacking.

      if (distance(hitObjects[j].position, currHitObject.position) < STACK_DISTANCE) {
        currHitObject.stackHeight++;
        startTime = hitObjects[j].startTime;
      } else if (distance(hitObjects[j].position, position2) < STACK_DISTANCE) {
        // Case for sliders - bump notes down and right, rather than up and left.
        sliderStack++;
        hitObjects[j].stackHeight -= sliderStack;
        startTime = hitObjects[j].startTime;
      }
    }
  }
}

/** (int)hitObject.TimePreempt * beatmap.StackLeniency, as a float. */
function calculateStackThreshold(beatmap: IBeatmap, hitObject: OsuHitObject): number {
  return Math.fround(Math.trunc(hitObject.timePreempt) * beatmap.stackLeniency);
}
