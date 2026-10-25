// Ported from osu.Game/Screens/Menu/IntroTriangles.cs
// OutlineTriangle (a cached BufferedContainer of a white Triangle with a black Blending.None triangle on top, drawn additively) is a canvas:
// the inner triangle is punched out, which is what overwriting with black adds under additive blending. Ruleset icons are
// `ruleset.CreateInstance().CreateIcon()`; ruleset instances aren't ported, so the four official rulesets' icons are mapped by short name.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScreenTransitionEvent } from '@fw/screens/IScreen';
import { DecouplingFramedClock } from '@fw/timing/DecouplingFramedClock';
import { InterpolatingFramedClock } from '@fw/timing/InterpolatingFramedClock';
import { Easing } from '@fw/transforms/Easing';
import { RNG } from '@fw/utils/RNG';
import { ConstrainedIconContainer } from '../../graphics/containers/ConstrainedIconContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { OsuIcon } from '../../graphics/OsuIcon';
import { LogoAnimation } from '../../graphics/sprites/LogoAnimation';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OsuGameBase } from '../../OsuGameBase';
import { RulesetStore } from '../../rulesets/RulesetInfo';
import { IntroScreen } from './IntroScreen';
import type { MainMenu } from './MainMenu';
import type { OsuLogo } from './OsuLogo';

/** IntroCircles.TRACK_START_DELAY (IntroCircles isn't ported yet). */
const intro_circles_track_start_delay = 600;

class GameWideFlash extends Box {
  private static readonly flash_length = 1000;

  constructor() {
    super();

    this.colour = Colour4.White;
    this.relativeSizeAxes = Axes.Both;
    this.blending = BlendingParameters.Additive;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.fadeOutFromOne(GameWideFlash.flash_length, Easing.Out);
  }
}

class LazerLogo extends CompositeDrawable {
  private highlight!: LogoAnimation;
  private background!: LogoAnimation;

  get progress(): number {
    return this.background.animationProgress;
  }

  set progress(value: number) {
    this.background.animationProgress = value;
    this.highlight.animationProgress = value;
  }

  constructor() {
    super();

    this.size = new Vector2(960);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const textures = dependencies.resolve(LargeTextureStore);
    const [highlight, background] = await Promise.all([textures.get('Intro/Triangles/logo-highlight'), textures.get('Intro/Triangles/logo-background')]);

    this.internalChildren = [
      this.highlight = new LogoAnimation().with({
        relativeSizeAxes: Axes.Both,
        texture: highlight,
        colour: Colour4.White,
      }),
      this.background = new LogoAnimation().with({
        relativeSizeAxes: Axes.Both,
        texture: background,
        colour: OsuColour.gray(Math.fround(0.6)),
      }),
    ];
  }
}

const rulesetIcons: Record<string, IconUsage> = {
  osu: OsuIcon.RulesetOsu,
  taiko: OsuIcon.RulesetTaiko,
  fruits: OsuIcon.RulesetCatch,
  mania: OsuIcon.RulesetMania,
};

class RulesetFlow extends FillFlowContainer {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.autoSizeAxes = Axes.Both;

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    for (const ruleset of RulesetStore.availableRulesets) {
      const icon = new ConstrainedIconContainer().with({
        icon: new SpriteIcon().with({ icon: rulesetIcons[ruleset.shortName] }),
        size: new Vector2(30),
      });

      this.add(icon);
    }

    return r;
  }
}

/** Represents a sprite that is drawn in a triangle shape, instead of a rectangle shape. */
class OutlineTriangle extends CanvasDrawable {
  constructor(private readonly outlineOnly: boolean, private readonly triangleSize: number) {
    super();

    this.size = new Vector2(triangleSize);

    this.blending = BlendingParameters.Additive;
  }

  protected override draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const colour = this.drawColourInfo.colour.averageColour;

    // Triangle: the vertices are the top centre, bottom left and bottom right of the quad.
    const triangle = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
    };

    ctx.fillStyle = colour.toCss();
    triangle(0, 0, width, height);

    if (this.outlineOnly) {
      const inner = this.triangleSize - 5;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'black';
      triangle((width - inner) / 2, (height - inner) / 2, inner, inner);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

const time_between_triangles = 22;

class GlitchingTriangles extends CompositeDrawable {
  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;
  }

  private lastGenTime: number | null = null;

  protected override update(): void {
    super.update();

    if (this.lastGenTime === null || this.time.current - this.lastGenTime > time_between_triangles) {
      this.lastGenTime = (this.lastGenTime ?? this.time.current) + time_between_triangles;

      const triangle: Drawable = new OutlineTriangle(RNG.nextBool(), Math.fround((RNG.nextSingle() + Math.fround(0.2)) * 80)).with({
        relativePositionAxes: Axes.Both,
        position: new Vector2(RNG.nextSingle(), RNG.nextSingle()),
      });

      this.addInternal(triangle);

      triangle.fadeOutFromOne(120);
    }
  }
}

const text_1 = 200;
const text_2 = 400;
const text_3 = 700;
const text_4 = 900;
const text_glitch = 1060;

const rulesets_1 = 1450;
const rulesets_2 = 1650;
const rulesets_3 = 1850;

const logo_scale_duration = 920;
const logo_1 = 2080;
const logo_2 = logo_1 + logo_scale_duration;

class TrianglesIntroSequence extends CompositeDrawable {
  private welcomeText!: OsuSpriteText;

  private rulesets!: RulesetFlow;
  private rulesetsScale!: Container;
  private logoContainerSecondary!: Container;
  private lazerLogo!: LazerLogo;

  private triangles!: GlitchingTriangles;

  loadMenu: (() => void) | null = null;

  constructor(private readonly logo: OsuLogo, private readonly showBackgroundAction: () => void) {
    super();
  }

  private game!: OsuGameBase;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.game = dependencies.resolve(OsuGameBase);

    this.internalChildren = [
      this.triangles = new GlitchingTriangles().with({
        alpha: 0,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        size: new Vector2(Math.fround(0.4), Math.fround(0.16)),
      }),
      this.welcomeText = new OsuSpriteText().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        padding: MarginPadding.of({ bottom: 10 }),
        font: OsuFont.getFont({ weight: FontWeight.Light, size: 42 }),
        alpha: 1,
        spacing: new Vector2(5),
      }),
      this.rulesetsScale = new Container().with({
        relativeSizeAxes: Axes.Both,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        children: [
          this.rulesets = new RulesetFlow(),
        ],
      }),
      this.logoContainerSecondary = new Container().with({
        relativeSizeAxes: Axes.Both,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        child: this.lazerLogo = new LazerLogo().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
        }),
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    const scale_start = Math.fround(1.2);
    const scale_adjust = Math.fround(0.8);

    this.rulesets.hide();
    this.lazerLogo.hide();

    // `using (BeginDelayedSequence(delay)) { ... }`
    const delayed = (delay: number, transforms: () => void) => {
      const sequence = this.beginDelayedSequence(delay);
      try {
        transforms();
      } finally {
        sequence.dispose();
      }
    };

    const absolute = this.beginAbsoluteSequence(0);

    try {
      delayed(text_1, () => this.welcomeText.fadeIn().onComplete(t => t.text = 'wel'));

      delayed(text_2, () => this.welcomeText.fadeIn().onComplete(t => t.text = 'welcome'));

      delayed(text_3, () => this.welcomeText.fadeIn().onComplete(t => t.text = 'welcome to'));

      delayed(text_4, () => {
        this.welcomeText.fadeIn().onComplete(t => t.text = 'welcome to osu!');
        this.welcomeText.transformTo('spacing', new Vector2(50, 0), 5000);
      });

      delayed(text_glitch, () => this.triangles.fadeIn());

      delayed(rulesets_1, () => {
        this.rulesetsScale.scaleTo(Math.fround(0.8), 1000);
        this.rulesets.fadeIn().scaleTo(1);
        this.rulesets.transformSpacingTo(new Vector2(200, 0));
        this.welcomeText.fadeOut().expire();
        this.triangles.fadeOut().expire();
      });

      delayed(rulesets_2, () => {
        this.rulesets.scaleTo(2);
        this.rulesets.transformSpacingTo(new Vector2(30, 0));
      });

      delayed(rulesets_3, () => {
        this.rulesets.scaleTo(4);
        this.rulesets.transformSpacingTo(new Vector2(10, 0));
        this.rulesetsScale.scaleTo(Math.fround(1.3), 1000);
      });

      delayed(logo_1, () => {
        this.rulesets.fadeOut();

        // matching flyte curve y = 0.25x^2 + (max(0, x - 0.7) / 0.3) ^ 5
        this.lazerLogo.fadeIn().scaleTo(scale_start).then().delay(Math.fround(logo_scale_duration * Math.fround(0.7)))
          .scaleTo(Math.fround(scale_start - scale_adjust), Math.fround(logo_scale_duration * Math.fround(0.3)), Easing.InQuint);

        this.lazerLogo.transformTo('progress', 1, logo_scale_duration);

        this.logoContainerSecondary.scaleTo(scale_start).then().scaleTo(Math.fround(scale_start - Math.fround(scale_adjust * Math.fround(0.25))), logo_scale_duration, Easing.InQuad);
      });

      delayed(logo_2, () => {
        this.lazerLogo.fadeOut().onComplete(() => {
          this.logoContainerSecondary.remove(this.lazerLogo, true);

          this.logo.fadeIn();

          this.showBackgroundAction();

          this.game.add(new GameWideFlash());

          this.loadMenu?.();
        });
      });
    } finally {
      absolute.dispose();
    }
  }
}

export class IntroTriangles extends IntroScreen {
  protected override get beatmapHash(): string {
    return 'a1556d0801b3a6b175dda32ef546f0ec812b400499f575c44fccbe9c67f9b1e5';
  }

  protected override get beatmapFile(): string {
    return 'triangles.osz';
  }

  private welcome: Sample | null = null;

  private intro!: TrianglesIntroSequence;

  constructor(createNextScreen: (() => MainMenu) | null = null) {
    super(createNextScreen);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    if (this.menuVoice.value)
      this.welcome = await dependencies.resolve(AudioManager).samples.get('Intro/welcome');
  }

  protected override logoArriving(logo: OsuLogo, resuming: boolean): void {
    super.logoArriving(logo, resuming);

    if (!resuming) {
      this.prepareMenuLoad();

      const decouplingClock = new DecouplingFramedClock(this.usingThemedIntro ? this.introTrack : null);

      void this.loadComponentAsync(this.intro = new TrianglesIntroSequence(logo, () => this.fadeInBackground()).with({
        relativeSizeAxes: Axes.Both,
        clock: new InterpolatingFramedClock(decouplingClock),
        loadMenu: () => this.loadMenu(),
      }), () => {
        this.addInternal(this.intro);

        // There is a chance that the intro timed out before being displayed, and this scheduled callback could
        // happen during the outro rather than intro.
        // In such a scenario, we don't want to play the intro sample, nor attempt to start the intro track
        // (that may have already been since disposed by MusicController).
        if (this.didLoadMenu)
          return;

        if (!this.usingThemedIntro) {
          // If the user has requested no theme, fallback to the same intro voice and delay as IntroCircles.
          // The triangles intro voice and theme are combined which makes it impossible to use.
          this.welcome?.play();
          this.scheduler.addDelayed(() => this.startTrack(), intro_circles_track_start_delay);
        } else
          this.startTrack();

        // no-op for the case of themed intro, no harm in calling for both scenarios as a safety measure.
        decouplingClock.start();
      });
    }
  }

  override onSuspending(e: ScreenTransitionEvent): void {
    super.onSuspending(e);

    // important as there is a clock attached to a track which will likely be disposed before returning to this screen.
    this.intro.expire();
  }
}
