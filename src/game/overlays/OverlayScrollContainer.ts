// Ported from osu.Game/Overlays/OverlayScrollContainer.cs
// Tooltips aren't ported yet: TooltipText is stored only.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import type { Container } from '@fw/graphics/containers/Container';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { CircularProgress } from '@fw/graphics/userInterface/CircularProgress';
import type { ClickEvent, HoverEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuHoverContainer } from '../graphics/containers/OsuHoverContainer';
import { UserTrackingScrollContainer } from '../graphics/containers/UserTrackingScrollContainer';
import type { HoverSampleSet } from '../graphics/userInterface/HoverSampleSet';
import { HoverSounds } from '../graphics/userInterface/HoverSounds';
import { OverlayColourProvider } from './OverlayColourProvider';

const button_scroll_position = 200;

/** UserTrackingScrollContainer which provides ScrollBackButton. Mostly used in FullscreenOverlay. */
export class OverlayScrollContainer extends UserTrackingScrollContainer {
  button!: ScrollBackButton;

  private readonly lastScrollTarget = new Bindable<number | null>(null);
  private readonly progress = new Bindable<number>(0);

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.addInternal(this.button = new ScrollBackButton().with({
      anchor: Anchor.BottomRight,
      origin: Anchor.BottomRight,
      margin: new MarginPadding(20),
      action: () => this.scrollBack(),
    }));

    this.button.lastScrollTarget.bindTarget = this.lastScrollTarget;
    this.button.progress.bindTarget = this.progress;

    return r;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // Map current position to standardized progress
    const height = Math.fround(this.availableContent - this.drawHeight);
    this.progress.value = height === 0 ? 1 : Math.round(Math.min(Math.max(this.current / height, 0), 1) * 1000) / 1000;

    if (this.scrollContent.drawHeight + button_scroll_position < this.drawHeight) {
      this.button.state = Visibility.Hidden;
      return;
    }

    this.button.state = this.target > button_scroll_position || this.lastScrollTarget.value !== null ? Visibility.Visible : Visibility.Hidden;
  }

  protected override onUserScroll(value: number, animated = true, distanceDecay: number | null = null): void {
    super.onUserScroll(value, animated, distanceDecay);

    this.lastScrollTarget.value = null;
  }

  private scrollBack(): void {
    if (this.lastScrollTarget.value === null) {
      this.lastScrollTarget.value = this.target;
      this.scrollToStart();
    } else {
      this.scrollTo(this.lastScrollTarget.value);
      this.lastScrollTarget.value = null;
    }
  }
}

const fade_duration = 500;

/** (OverlayScrollContainer.ScrollBackButton) */
export class ScrollBackButton extends OsuHoverContainer {
  private _state = Visibility.Hidden;

  get state(): Visibility {
    return this._state;
  }

  set state(value: Visibility) {
    if (value === this._state)
      return;

    this._state = value;
    this.enabled.value = this._state === Visibility.Visible;
    this.fadeTo(this._state === Visibility.Visible ? 1 : 0, fade_duration, Easing.OutQuint);
  }

  protected override get effectTargets(): Iterable<Drawable> {
    return [this.background];
  }

  /** (C#'s flashColour; renamed: Drawable.flashColour is a transform) */
  private flashColourValue = Colour4.White;

  private readonly buttonContent: Container;
  private readonly background: Box;
  private readonly currentCircularProgress: CircularProgress;
  private readonly spriteIcon: SpriteIcon;

  readonly lastScrollTarget = new Bindable<number | null>(null);

  readonly progress = new Bindable<number>(0);

  protected override createHoverSounds(_sampleSet: HoverSampleSet): HoverSounds {
    return new HoverSounds();
  }

  private scrollToTopSample: Sample | null = null;
  private scrollToPreviousSample: Sample | null = null;

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.buttonContent.receivePositionalInputAt(screenSpacePos);
  }

  constructor() {
    super();

    this.size = new Vector2(50);
    this.alpha = 0;

    this.add(this.buttonContent = new CircularContainer().with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      masking: true,
      edgeEffect: new EdgeEffectParameters({
        type: EdgeEffectType.Shadow,
        offset: new Vector2(0, 1),
        radius: 3,
        colour: Colour4.Black.opacity(0.25),
      }),
      children: [
        this.background = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
        this.currentCircularProgress = new CircularProgress().with({
          relativeSizeAxes: Axes.Both,
          innerRadius: 0.1,
        }),
        this.spriteIcon = new SpriteIcon().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          size: new Vector2(15),
          icon: FontAwesome.Solid.ChevronUp,
        }),
      ],
    }));

    this.tooltipText = 'Back to top';
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);
    const audio = dependencies.resolve(AudioManager);

    this.idleColour = colourProvider.background6;
    this.hoverColour = colourProvider.background5;
    this.flashColourValue = colourProvider.light1;
    this.currentCircularProgress.colour = colourProvider.highlight1;

    this.scrollToTopSample = await audio.samples.get('UI/scroll-to-top');
    this.scrollToPreviousSample = await audio.samples.get('UI/scroll-to-previous');
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.progress.bindValueChanged(p => this.currentCircularProgress.progress = p.newValue, true);

    this.lastScrollTarget.bindValueChanged(target => {
      this.spriteIcon.scaleTo(target.newValue !== null ? new Vector2(1, -1) : Vector2.One, fade_duration, Easing.OutQuint);
      this.tooltipText = target.newValue !== null ? 'Return to previous position' : 'Back to top';
    }, true);
  }

  protected override onClick(e: ClickEvent): boolean {
    this.background.flashColour(this.flashColourValue, 800, Easing.OutQuint);

    if (this.lastScrollTarget.value === null)
      this.scrollToTopSample?.play();
    else
      this.scrollToPreviousSample?.play();

    return super.onClick(e);
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    this.buttonContent.scaleTo(0.75, 2000, Easing.OutQuint);
    return true;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.buttonContent.scaleTo(1, 1000, Easing.OutElastic);
    super.onMouseUp(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    super.onHover(e);
    return true;
  }
}
