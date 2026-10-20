// Visual smoke test for the framework port: masking, borders, edge effects, gradients, additive blending, transforms.
import { Game } from '@fw/Game';
import { GameHost } from '@fw/platform/GameHost';
import { Container } from '@fw/graphics/containers/Container';
import { DrawSizePreservingFillContainer } from '@fw/graphics/containers/DrawSizePreservingFillContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { FontUsage } from '@fw/text/FontUsage';
import { BasicScrollContainer } from '@fw/graphics/containers/BasicScrollContainer';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { FillDirection } from '@fw/layout/Enums';

class SceneGame extends Game {
  // Like osu! games, content is added in LoadComplete: children added in the constructor would load before Game.load caches the FontStore.
  protected override loadComplete(): void {
    super.loadComplete();

    const pink = Colour4.fromHex('#ff66aa');

    this.add(new DrawSizePreservingFillContainer().with({
      children: [
        new Box().with({ relativeSizeAxes: Axes.Both, colour: ColourInfo.gradientVertical(Colour4.fromHex('#222'), Colour4.fromHex('#000')) }),
        // masked rounded container with border + shadow
        new Container().with({
          position: new Vector2(100, 100), size: new Vector2(300, 200), masking: true, cornerRadius: 20, borderThickness: 4, borderColour: Colour4.White,
          edgeEffect: new EdgeEffectParameters({ type: EdgeEffectType.Shadow, colour: Colour4.Black.opacity(0.6), radius: 30, offset: new Vector2(0, 10) }),
          children: [
            new Box().with({ relativeSizeAxes: Axes.Both, colour: pink }),
            new Box().with({ anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(400, 40), rotation: 20, colour: Colour4.Yellow }),
          ],
        }),
        // glow, hollow
        new Container().with({
          position: new Vector2(500, 100), size: new Vector2(200, 200), masking: true, cornerRadius: 100,
          edgeEffect: new EdgeEffectParameters({ type: EdgeEffectType.Glow, colour: pink.opacity(0.8), radius: 40, hollow: true }),
          children: [new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.fromHex('#333') })],
        }),
        // additive blending overlap
        new Box().with({ position: new Vector2(100, 450), size: new Vector2(200, 150), colour: Colour4.Red, blending: BlendingParameters.Additive }),
        new Box().with({ position: new Vector2(200, 500), size: new Vector2(200, 150), colour: Colour4.Lime, blending: BlendingParameters.Additive }),
        // alpha: overlapping children of a half-transparent container show through each other (per-vertex alpha like osu!)
        new Container().with({
          position: new Vector2(500, 450), alpha: 0.5, autoSizeAxes: Axes.Both,
          children: [
            new Box().with({ size: new Vector2(150, 150), colour: Colour4.White }),
            new Box().with({ position: new Vector2(75, 75), size: new Vector2(150, 150), colour: Colour4.Cyan }),
          ],
        }),
        new SpriteText().with({ position: new Vector2(800, 100), text: 'Torus Regular 24', font: new FontUsage('Torus', 24, 'Regular') }),
        new SpriteText().with({ position: new Vector2(800, 140), text: 'Torus Bold 32 — osu!', font: new FontUsage('Torus', 32, 'Bold'), shadow: true }),
        new SpriteText().with({ position: new Vector2(800, 190), text: 'VENERA BLACK', font: new FontUsage('Venera', 28, 'Black'), colour: pink }),
        new SpriteText().with({ position: new Vector2(800, 240), text: 'Gradient text 日本語 한국어', font: new FontUsage('Torus', 28, 'SemiBold'),
          colour: ColourInfo.gradientVertical(Colour4.White, pink) }),
        new SpriteText().with({ position: new Vector2(800, 290), width: 200, truncate: true, text: 'A very long truncated beatmap title that keeps going', font: new FontUsage('Torus', 20, 'Regular') }),
        new SpriteText().with({ position: new Vector2(800, 330), text: '\uf001 \uf004 \uf013', font: new FontUsage('FontAwesome', 30, 'Solid') }),
        // scroll container (masked, BasicScrollbar) over a vertical fill flow
        new BasicScrollContainer().with({
          position: new Vector2(800, 400), size: new Vector2(250, 300),
          child: new FillFlowContainer().with({
            direction: FillDirection.Vertical, relativeSizeAxes: Axes.X, autoSizeAxes: Axes.Y, spacing: new Vector2(0, 5),
            children: Array.from({ length: 12 }, (_, i) => new Container().with({
              relativeSizeAxes: Axes.X, height: 40,
              children: [
                new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.fromHSV(i / 12, 0.5, 0.6) }),
                new SpriteText().with({ anchor: Anchor.CentreLeft, origin: Anchor.CentreLeft, x: 10, text: `item ${i}`, font: new FontUsage('Torus', 20, 'SemiBold') }),
              ],
            })),
          }),
        }),
      ],
    }));
  }
}

const host = new GameHost();
const game = new SceneGame();
host.run(game);
(window as any).__scene = { host, game, Easing };
(window as any).__osu = { ready: Promise.resolve(true), goto: () => {} };
