// Ported from osu.Game/Screens/Menu/SupporterDisplay.cs
// There is no API: the local user is always the guest user, who is not a supporter. MessageFormatter isn't ported, so the localised string's
// single markdown link (SupporterDisplayStrings.ConsiderBecomingASupporter) is split by hand into the parts AddLinks creates for it.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { RNG } from '@fw/utils/RNG';
import { LinkFlowContainer } from '../../graphics/containers/LinkFlowContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';

const support_url = 'https://osu.ppy.sh/home/support';

export class SupporterDisplay extends CompositeDrawable {
  private supportFlow!: LinkFlowContainer;

  private heart: Drawable | null = null;

  private backgroundBox!: Box;

  private colours!: OsuColour;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);

    this.height = 40;

    this.autoSizeAxes = Axes.X;
    this.autoSizeDuration = 1000;
    this.autoSizeEasing = Easing.OutQuint;

    this.masking = true;
    this.cornerExponent = Math.fround(2.5);
    this.cornerRadius = 15;

    this.internalChildren = [
      this.backgroundBox = new Box().with({
        relativeSizeAxes: Axes.Both,
        alpha: Math.fround(0.6),
      }),
      this.supportFlow = new LinkFlowContainer().with({
        autoSizeAxes: Axes.Both,
        padding: new MarginPadding(10),
        spacing: new Vector2(0, 2),
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    for (const d of this.supportFlow.children)
      d.fadeOut().expire();

    this.updateDisplay();

    this
      .fadeOut()
      .delay(RNG.next(800, 4000))
      .fadeInFromZero(800, Easing.OutQuint);

    this.scheduleDismissal();
  }

  private updateDisplay(): void {
    const font_size = 14;

    const formatSemiBold = (t: SpriteText): void => {
      t.font = OsuFont.getFont({ size: font_size, weight: FontWeight.SemiBold });
    };

    this.supportFlow.clear();

    // (user.IsSupporter is always false: the "thank you" text and pink background never show.)
    this.supportFlow.addText('Consider becoming an ', formatSemiBold);
    this.supportFlow.addLink('osu!supporter', support_url, formatSemiBold);
    this.supportFlow.addText(' to help support osu!\'s development', formatSemiBold);

    this.backgroundBox.fadeColour(this.colours.pink4, 250);

    this.supportFlow.addIcon(FontAwesome.Solid.Heart, t => {
      this.heart = t;

      t.padding = MarginPadding.of({ left: 5, top: 1 });
      t.font = t.font.with({ size: font_size });
      t.colour = this.colours.pink;

      this.schedule(() => {
        this.heart!.flashColour(Colour4.White, 750, Easing.OutQuint).loop();
      });
    });
  }

  protected override onClick(e: ClickEvent): boolean {
    this.dismissalDelegate?.cancel();

    this.supportFlow.bypassAutoSizeAxes = Axes.X;
    this.fadeOut(500, Easing.OutQuint);
    return super.onClick(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.backgroundBox.fadeTo(Math.fround(0.8), 500, Easing.OutQuint);
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.backgroundBox.fadeTo(Math.fround(0.6), 500, Easing.OutQuint);
    super.onHoverLost(e);
  }

  private dismissalDelegate: ScheduledDelegate | null = null;

  private scheduleDismissal(): void {
    this.dismissalDelegate?.cancel();
    this.dismissalDelegate = this.scheduler.addDelayed(() => {
      // If the user is hovering they may want to interact with the link.
      // Give them more time.
      if (this.isHovered) {
        this.scheduleDismissal();
        return;
      }

      this.dismissalDelegate?.cancel();

      this.autoSizeEasing = Easing.In;
      this.supportFlow.bypassAutoSizeAxes = Axes.X;
      this
        .delay(200)
        .fadeOut(750, Easing.Out);
    }, 8000);
  }
}
