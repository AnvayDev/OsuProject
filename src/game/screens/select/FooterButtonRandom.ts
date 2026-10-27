// Ported from osu.Game/Screens/Select/FooterButtonRandom.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { ClickEvent, KeyDownEvent, KeyUpEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { MouseButton } from '@fw/input/Key';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ScreenFooterButton } from '../footer/ScreenFooterButton';

export class FooterButtonRandom extends ScreenFooterButton {
  nextRandom: (() => void) | null = null;
  previousRandom: (() => void) | null = null;

  private persistentText!: Container;
  private randomSpriteText!: OsuSpriteText;
  private rewindSpriteText!: OsuSpriteText;
  private rewindSearch = false;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colour = dependencies.resolve(OsuColour);

    //TODO: use https://fontawesome.com/icons/shuffle?s=solid&f=classic when local Fontawesome is updated
    this.iconUsage = FontAwesome.Solid.Random;
    this.accentColour = colour.blue1;
    this.textContainer.add(this.persistentText = new Container().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      alwaysPresent: true,
      autoSizeAxes: Axes.Both,
      children: [
        this.randomSpriteText = new OsuSpriteText().with({
          font: withFont(OsuFont.TorusAlternate, { size: 16 }),
          alwaysPresent: true,
          anchor: Anchor.TopCentre,
          origin: Anchor.TopCentre,
          text: 'Random',
        }),
        this.rewindSpriteText = new OsuSpriteText().with({
          font: withFont(OsuFont.TorusAlternate, { size: 16 }),
          alwaysPresent: true,
          anchor: Anchor.TopCentre,
          origin: Anchor.TopCentre,
          text: 'Rewind',
          alpha: 0,
        }),
      ],
    }));

    this.action = () => {
      if (this.rewindSearch) {
        const fade_time = 500;

        let fallingRewind!: OsuSpriteText;

        this.textContainer.add(fallingRewind = new OsuSpriteText().with({
          alpha: 0,
          text: this.rewindSpriteText.text,
          alwaysPresent: true, // make sure the button is sized large enough to always show this
          anchor: Anchor.BottomCentre,
          origin: Anchor.BottomCentre,
          font: withFont(OsuFont.TorusAlternate, { size: 16 }),
        }));

        fallingRewind.fadeOutFromOne(fade_time, Easing.In);
        fallingRewind.moveTo(Vector2.Zero).moveTo(new Vector2(0, 10), fade_time, Easing.In);
        fallingRewind.expire();

        this.persistentText.fadeInFromZero(fade_time, Easing.In);

        this.previousRandom?.();
      } else {
        this.nextRandom?.();
      }
    };

    return r;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    this.updateText(e.shiftPressed);
    return super.onKeyDown(e);
  }

  protected override onKeyUp(e: KeyUpEvent): void {
    this.updateText(e.shiftPressed);
    super.onKeyUp(e);
  }

  protected override onClick(e: ClickEvent): boolean {
    try {
      // this uses OR to handle rewinding when clicks are triggered by other sources (i.e. right button in onMouseUp).
      this.rewindSearch ||= e.shiftPressed;
      return super.onClick(e);
    } finally {
      this.rewindSearch = false;
    }
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (e.button === MouseButton.Right && this.isHovered) {
      this.rewindSearch = true;
      this.triggerClick();
      return;
    }

    super.onMouseUp(e);
  }

  override onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    this.rewindSearch = e.action === GlobalAction.SelectPreviousRandom;

    if (e.action !== GlobalAction.SelectNextRandom && e.action !== GlobalAction.SelectPreviousRandom)
      return false;

    if (!e.repeat)
      this.triggerClick();
    return true;
  }

  override onReleased(e: KeyBindingReleaseEvent<GlobalAction>): void {
    if (e.action === GlobalAction.SelectPreviousRandom)
      this.rewindSearch = false;
  }

  private updateText(rewind = false): void {
    this.randomSpriteText.alpha = rewind ? 0 : 1;
    this.rewindSpriteText.alpha = rewind ? 1 : 0;
  }
}
