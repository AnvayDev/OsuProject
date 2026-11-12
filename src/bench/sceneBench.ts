// Bench: a synthetic playfield built from real framework drawables, drawn either by the DOM renderer or by the WebGL2 renderer
// (GLContainer). It measures what the proposed design costs per frame: the scene graph's update (transforms, layout, masking) and its draw.
//
// One "density" is roughly a busy moment of a hard map: 16 hit circles and 4 sliders visible at once, plus a HUD's worth of static
// drawables. A hit circle mirrors the structure of ArgonMainCirclePiece (osu.Game.Rulesets.Osu/Skinning/Argon/ArgonMainCirclePiece.cs:
// four filled circles, a flash, a ring with a border, a number) with an approach circle, and every object animates on every frame.

import { Game } from '@fw/Game';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import { DrawSizePreservingFillContainer } from '@fw/graphics/containers/DrawSizePreservingFillContainer';
import { GLContainer } from '@fw/graphics/containers/GLContainer';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Circle } from '@fw/graphics/shapes/Circle';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { Texture } from '@fw/graphics/textures/Texture';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { GameHost } from '@fw/platform/GameHost';
import { Easing } from '@fw/transforms/Easing';
import { nextFrame, sleep, summarise, type Summary } from './stats';

/** A deterministic generator, so every variant and every run lays out the same scene. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

async function ringTexture(size: number, thickness: number): Promise<Texture> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = thickness;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - thickness, 0, Math.PI * 2);
  g.stroke();
  return Texture.fromUrl(canvas.toDataURL(), 1, 'bench-ring');
}

const OBJECT_SIZE = 128;
const PERIOD = 1400;

function fill(diameter: number, colour: Colour4 | ColourInfo, alpha = 1): Circle {
  return new Circle().with({ anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(diameter), colour, alpha });
}

function hitCircle(position: Vector2, scale: number, colour: Colour4, ring: Texture, phase: number): Drawable[] {
  const flash = fill(OBJECT_SIZE, Colour4.White, 0).with({ blending: BlendingParameters.Additive });

  const piece = new Container().with({
    position, origin: Anchor.Centre, size: new Vector2(OBJECT_SIZE), scale: new Vector2(scale), alpha: 0,
    children: [
      fill(OBJECT_SIZE - 8, colour.darken(4)),
      fill(OBJECT_SIZE - 16, ColourInfo.gradientVertical(colour, colour.darken(0.5))),
      fill(OBJECT_SIZE - 38, ColourInfo.gradientVertical(colour.darken(0.5), colour.darken(0.6))),
      fill(OBJECT_SIZE - 50, colour.darken(4)),
      new Sprite().with({ anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(40), texture: ring }),
      flash,
      new CircularContainer().with({
        anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(OBJECT_SIZE), masking: true, borderThickness: 8, borderColour: Colour4.White,
        child: new Box().with({ relativeSizeAxes: Axes.Both, alpha: 0, alwaysPresent: true }),
      }),
    ],
  });

  const approach = new Sprite().with({ position, origin: Anchor.Centre, size: new Vector2(OBJECT_SIZE), texture: ring, colour, alpha: 0 });

  // The life of a hit circle, looped: fade in while the approach circle closes, flash and expand on the hit, fade out.
  // (applied on load, when the drawables have a clock; a scheduled task would never run on a drawable that starts at alpha 0)
  approach.onLoadComplete.add(() => {
    piece.delay(phase).loop(t => t
      .fadeIn(400).scaleTo(scale)
      .then(PERIOD - 600).scaleTo(scale * 1.4, 200, Easing.OutQuint).fadeOut(200));
    flash.delay(phase).loop(t => t.fadeTo(0).then(PERIOD - 200).fadeTo(0.8).fadeOut(200));
    approach.delay(phase).loop(t => t
      .fadeTo(0).scaleTo(scale * 4)
      .fadeTo(0.9, 400).scaleTo(scale, PERIOD - 200)
      .then(PERIOD - 200).fadeOut(100).then(100));
  });

  return [piece, approach];
}

function slider(position: Vector2, scale: number, colour: Colour4, ring: Texture, phase: number): Drawable[] {
  const length = 320;

  // The body stands in for the slider path's frame buffer, which the client also draws as one textured quad.
  const body = new Container().with({
    position, origin: Anchor.CentreLeft, size: new Vector2(length + OBJECT_SIZE * scale, OBJECT_SIZE * scale), alpha: 0,
    masking: true, cornerRadius: OBJECT_SIZE * scale / 2, borderThickness: 6 * scale, borderColour: Colour4.White,
    child: new Box().with({ relativeSizeAxes: Axes.Both, colour: colour.darken(2).opacity(0.7) }),
  });

  const ticks = Array.from({ length: 4 }, (_, i) => fill(16, Colour4.White).with({ position: new Vector2(position.x + (i + 1) * length / 5, position.y), scale: new Vector2(scale), anchor: Anchor.TopLeft }));

  const ball = new Container().with({
    position: new Vector2(position.x + OBJECT_SIZE * scale / 2, position.y), origin: Anchor.Centre, size: new Vector2(OBJECT_SIZE), scale: new Vector2(scale),
    children: [
      fill(OBJECT_SIZE, colour),
      new CircularContainer().with({
        anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(OBJECT_SIZE * 2.4), masking: true, borderThickness: 6, borderColour: Colour4.Orange,
        child: new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.Orange, alpha: 0.2 }),
      }),
    ],
  });

  ball.onLoadComplete.add(() => {
    body.delay(phase).loop(t => t.fadeIn(300).then(PERIOD * 2 - 500).fadeOut(200));
    ball.delay(phase).loop(t => t.moveToX(position.x + OBJECT_SIZE * scale / 2).moveToX(position.x + length, PERIOD * 2));
  });

  const [head, approach] = hitCircle(new Vector2(position.x + OBJECT_SIZE * scale / 2, position.y), scale, colour, ring, phase);

  return [body, ...ticks, ball, head, approach];
}

class BenchGame extends Game {
  drawableCount = 0;
  surface: GLContainer | null = null;

  constructor(private readonly useGL: boolean, private readonly density: number, private readonly ring: Texture) {
    super();
  }

  protected override loadComplete(): void {
    super.loadComplete();

    const random = mulberry32(1234);
    const scale = 0.57; // circle size 4
    const objects: Drawable[] = [];

    for (let i = 0; i < 16 * this.density; i++) {
      const colour = Colour4.fromHSV(random(), 0.7, 1);
      objects.push(...hitCircle(new Vector2(60 + random() * 900, 60 + random() * 640), scale, colour, this.ring, random() * PERIOD));
    }

    for (let i = 0; i < 4 * this.density; i++) {
      const colour = Colour4.fromHSV(random(), 0.7, 1);
      objects.push(...slider(new Vector2(40 + random() * 600, 60 + random() * 640), scale, colour, this.ring, random() * PERIOD));
    }

    // A HUD's worth of static drawables (they cost an update and a draw each, but never invalidate).
    const hud: Drawable[] = [];

    for (let i = 0; i < 150; i++)
      hud.push(new Box().with({ position: new Vector2(10 + (i % 50) * 20, 4 + Math.floor(i / 50) * 8), size: new Vector2(16, 5), colour: Colour4.White, alpha: 0.6 }));

    const content = new DrawSizePreservingFillContainer().with({ children: [...objects, ...hud] });

    const count = (d: Drawable): number => 1 + ((d as unknown as { internalChildren?: readonly Drawable[] }).internalChildren ?? []).reduce((a, c) => a + count(c), 0);
    this.drawableCount = count(content);

    this.add(this.useGL ? this.surface = new GLContainer().with({ relativeSizeAxes: Axes.Both, child: content }) : content);
  }
}

export interface SceneResult {
  drawables: number;
  /** Our JavaScript in the update part of the frame, ms. */
  update: Summary;
  /** Our JavaScript in the draw part of the frame (element writes, or draw list + WebGL submission), ms. */
  draw: Summary;
  total: Summary;
  interval: Summary;
  droppedPercent: number;
  drawCalls?: number;
  quads?: number;
  maskingChanges?: number;
}

/** Runs the synthetic playfield for `duration` ms in `mount` and reports the host's own frame timings. */
export async function runScene(mount: HTMLElement, useGL: boolean, density: number, frameInterval: number, duration = 3000, warmup = 1200): Promise<SceneResult> {
  const ring = await ringTexture(256, 12);

  const host = new GameHost(mount);
  const game = new BenchGame(useGL, density, ring);
  host.run(game);

  const update: number[] = [];
  const draw: number[] = [];
  const total: number[] = [];
  const intervals: number[] = [];

  const start = performance.now();
  let last = 0;
  let lastFrameStart = 0;

  for (;;) {
    const t = await nextFrame();
    const now = performance.now();

    // (our callback runs after the host's in the same animation frame; skip a frame the host hasn't run yet)
    if (now - start > warmup && host.lastFrameStart !== lastFrameStart) {
      update.push(host.lastUpdateDuration);
      draw.push(host.lastDrawDuration);
      total.push(host.lastUpdateDuration + host.lastDrawDuration);
      if (last !== 0) intervals.push(t - last);
      last = t;
    }

    lastFrameStart = host.lastFrameStart;

    if (now - start > warmup + duration)
      break;
  }

  const statistics = game.surface?.renderer?.statistics;

  const result: SceneResult = {
    drawables: game.drawableCount,
    update: summarise(update),
    draw: summarise(draw),
    total: summarise(total),
    interval: summarise(intervals),
    droppedPercent: Math.round(intervals.filter(i => i > frameInterval * 1.5).length / Math.max(1, intervals.length) * 100000) / 1000,
    ...(statistics ? { drawCalls: statistics.drawCalls, quads: statistics.quads, maskingChanges: statistics.maskingChanges } : {}),
  };

  host.exit();
  mount.replaceChildren();
  await sleep(100);

  return result;
}
