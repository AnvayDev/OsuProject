// Visual equivalence scene for the renderer port: the same drawables drawn by the DOM (?gl=0) and by the WebGL2 renderer (?gl=1).
// Compare the two screenshots with scripts/pixeldiff.mjs. Covers masking, corner radii, borders, edge effects (glow, shadow, hollow),
// gradients, additive blending, per-vertex alpha, rotation/shear/scale, textures, edge smoothness and proxies.
import { Game } from '@fw/Game';
import { GameHost } from '@fw/platform/GameHost';
import { Container } from '@fw/graphics/containers/Container';
import { GLContainer } from '@fw/graphics/containers/GLContainer';
import { DrawSizePreservingFillContainer } from '@fw/graphics/containers/DrawSizePreservingFillContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Circle } from '@fw/graphics/shapes/Circle';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Texture } from '@fw/graphics/textures/Texture';
import { ASSET_ROOT } from '@fw/Game';

const params = new URLSearchParams(location.search);
const useGL = params.get('gl') !== '0';

class SceneGame extends Game {
  protected override loadComplete(): void {
    super.loadComplete();

    void this.build();
  }

  private async build(): Promise<void> {
    const pink = Colour4.fromHex('#ff66aa');
    const logo = await Texture.fromUrl(`${ASSET_ROOT}/osu.Game.Resources/Textures/Menu/logo.png`, 2);

    const proxied = new Box().with({ position: new Vector2(60, 60), size: new Vector2(80, 80), colour: Colour4.Orange });

    const content = new DrawSizePreservingFillContainer().with({
      children: [
        new Box().with({ relativeSizeAxes: Axes.Both, colour: ColourInfo.gradientVertical(Colour4.fromHex('#222'), Colour4.fromHex('#000')) }),
        // masked rounded container with border + shadow
        new Container().with({
          position: new Vector2(60, 60), size: new Vector2(300, 200), masking: true, cornerRadius: 20, borderThickness: 4, borderColour: Colour4.White,
          edgeEffect: new EdgeEffectParameters({ type: EdgeEffectType.Shadow, colour: Colour4.Black.opacity(0.6), radius: 30, offset: new Vector2(0, 10) }),
          children: [
            new Box().with({ relativeSizeAxes: Axes.Both, colour: pink }),
            new Box().with({ anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(400, 40), rotation: 20, colour: Colour4.Yellow }),
          ],
        }),
        // glow, hollow
        new Container().with({
          position: new Vector2(440, 60), size: new Vector2(200, 200), masking: true, cornerRadius: 100,
          edgeEffect: new EdgeEffectParameters({ type: EdgeEffectType.Glow, colour: pink.opacity(0.8), radius: 40, hollow: true }),
          children: [new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.fromHex('#333') })],
        }),
        // glow, not hollow, with roundness and a gradient border
        new Container().with({
          position: new Vector2(720, 80), size: new Vector2(160, 160), masking: true, cornerRadius: 30, borderThickness: 10,
          borderColour: ColourInfo.gradientVertical(Colour4.White, Colour4.Cyan),
          edgeEffect: new EdgeEffectParameters({ type: EdgeEffectType.Glow, colour: Colour4.Cyan.opacity(0.5), radius: 20, roundness: 10 }),
          children: [new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.fromHex('#224') })],
        }),
        // circles of several sizes (hit circle sized and smaller), nested masking
        ...[64, 32, 16, 8, 4].map((d, i) => new Circle().with({ position: new Vector2(940 + i * 20 + (64 - d) / 2, 60 + i * 70), size: new Vector2(d), colour: Colour4.White })),
        new Container().with({
          position: new Vector2(1040, 60), size: new Vector2(128), masking: true, cornerRadius: 64, borderThickness: 8, borderColour: Colour4.White,
          children: [
            new Box().with({ relativeSizeAxes: Axes.Both, colour: ColourInfo.gradientVertical(pink, Colour4.fromHex('#aa2266')) }),
            new Container().with({
              anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(60), masking: true, cornerRadius: 30,
              child: new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.White, alpha: 0.5 }),
            }),
          ],
        }),
        // additive blending overlap
        new Box().with({ position: new Vector2(60, 340), size: new Vector2(200, 150), colour: Colour4.Red, blending: BlendingParameters.Additive }),
        new Box().with({ position: new Vector2(160, 390), size: new Vector2(200, 150), colour: Colour4.Lime, blending: BlendingParameters.Additive }),
        // alpha: overlapping children of a half-transparent container show through each other (per-vertex alpha like osu!)
        new Container().with({
          position: new Vector2(440, 340), alpha: 0.5, autoSizeAxes: Axes.Both,
          children: [
            new Box().with({ size: new Vector2(150, 150), colour: Colour4.White }),
            new Box().with({ position: new Vector2(75, 75), size: new Vector2(150, 150), colour: Colour4.Cyan }),
          ],
        }),
        // horizontal gradient with alpha, shear, scale
        new Box().with({ position: new Vector2(720, 340), size: new Vector2(200, 60), colour: ColourInfo.gradientHorizontal(pink, pink.opacity(0)) }),
        new Box().with({ position: new Vector2(720, 420), size: new Vector2(200, 60), shear: new Vector2(0.2, 0), colour: Colour4.SkyBlue }),
        new Box().with({ position: new Vector2(760, 520), size: new Vector2(50, 50), scale: new Vector2(2, 1.5), rotation: 45, origin: Anchor.Centre, colour: Colour4.Gold }),
        // rotated boxes with and without edge smoothing
        new Box().with({ position: new Vector2(980, 420), size: new Vector2(120, 40), rotation: 12, colour: Colour4.White }),
        new Box().with({ position: new Vector2(980, 500), size: new Vector2(120, 40), rotation: 12, colour: Colour4.White, edgeSmoothness: new Vector2(1) }),
        // textures: plain, tinted, translucent, scaled down (mipmaps)
        new Sprite().with({ position: new Vector2(60, 560), size: new Vector2(160), texture: logo }),
        new Sprite().with({ position: new Vector2(240, 560), size: new Vector2(160), texture: logo, colour: Colour4.Cyan }),
        new Sprite().with({ position: new Vector2(420, 560), size: new Vector2(160), texture: logo, alpha: 0.4 }),
        new Sprite().with({ position: new Vector2(600, 600), size: new Vector2(40), texture: logo }),
        new Sprite().with({ position: new Vector2(660, 600), size: new Vector2(20), texture: logo }),
        // a proxy: the orange box is a child of the lower container but is drawn above the white one, through its proxy.
        new Container().with({
          position: new Vector2(880, 560), size: new Vector2(200, 200),
          children: [
            new Container().with({ relativeSizeAxes: Axes.Both, child: proxied }),
            new Box().with({ position: new Vector2(20, 20), size: new Vector2(80, 80), colour: Colour4.White }),
            proxied.createProxy(),
          ],
        }),
      ],
    });

    this.add(useGL ? new GLContainer().with({ relativeSizeAxes: Axes.Both, child: content }) : content);

    (window as any).__sceneReady = true;
  }
}

const host = new GameHost();
const game = new SceneGame();
host.run(game);
(window as any).__scene = { host, game };
(window as any).__osu = { ready: Promise.resolve(true), goto: () => {} };
