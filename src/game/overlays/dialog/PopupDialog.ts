// Ported from osu.Game/Overlays/Dialog/PopupDialog.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { TextFlowContainer } from '@fw/graphics/containers/TextFlowContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { KeyDownEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { Triangles } from '../../graphics/backgrounds/Triangles';
import { OsuTextFlowContainer } from '../../graphics/containers/OsuTextFlowContainer';
import { withFont } from '../../graphics/OsuFont';
import type { PopupDialogButton } from './PopupDialogButton';
import { PopupDialogOkButton } from './PopupDialogOkButton';

export abstract class PopupDialog extends VisibilityContainer {
  static readonly ENTER_DURATION = 500;
  static readonly EXIT_DURATION = 500;

  private readonly ringSize = new Vector2(100);
  private readonly ringMinifiedSize = new Vector2(20);

  private readonly flashLayer: Box;
  private flashSample: Sample | null = null;

  private readonly dialogContent: Container;
  private readonly ring: Container;
  private readonly buttonsContainer: FillFlowContainer<PopupDialogButton>;
  private readonly iconSprite: SpriteIcon;
  private readonly header: TextFlowContainer;
  private readonly body: TextFlowContainer;

  protected override get content(): Container {
    return this.dialogContent;
  }

  readonly mainContent: Container;

  private actionInvoked = false;

  get icon(): IconUsage {
    return this.iconSprite.icon;
  }

  set icon(value: IconUsage) {
    this.iconSprite.icon = value;
  }

  private _headerText = '';

  get headerText(): string {
    return this._headerText;
  }

  set headerText(value: string) {
    if (this._headerText === value)
      return;

    this._headerText = value;
    this.header.text = value;
  }

  private _bodyText = '';

  get bodyText(): string {
    return this._bodyText;
  }

  set bodyText(value: string) {
    if (this._bodyText === value)
      return;

    this._bodyText = value;

    this.body.text = value;
    this.body.textAnchor = this._bodyText.includes('\n') ? Anchor.TopLeft : Anchor.TopCentre;
  }

  get buttons(): readonly PopupDialogButton[] {
    return this.buttonsContainer.children;
  }

  set buttons(value: readonly PopupDialogButton[]) {
    this.buttonsContainer.children = value;

    // Hide the container if it is empty, so that it doesn't unnecessarily
    // insert its padding into the parent container.
    if (this.buttonsContainer.children.length > 0)
      this.buttonsContainer.show();
    else
      this.buttonsContainer.hide();

    for (const b of value) {
      const action = b.action;
      b.action = () => {
        // Hide the dialog before running the action.
        // This is important as the code which is performed may check for a dialog being present (ie. `OsuGame.PerformFromScreen`)
        // and we don't want it to see the already dismissed dialog.
        //
        // Can be overriden using `PopupDialogButton.HideDialogOnAction` if a dialog needs to remain
        // open after invoking an action (eg. report forms).
        if (b.hideDialogOnAction) {
          this.actionInvoked = true;
          this.hide();
        }

        action?.();

        // Delay setting `actionInvoke` for buttons requesting not to hide the dialog before invoke
        // until after the action has been invoked, so that the popup hide logic in `PopOut` can fire properly.
        //
        // This is done assuming the invoked action will handle hiding the dialog itself.
        if (!b.hideDialogOnAction)
          this.actionInvoked = true;
      };
    }
  }

  protected constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    let dialogContent!: Container, flashLayer!: Box, ring!: Container, iconSprite!: SpriteIcon, header!: TextFlowContainer, body!: TextFlowContainer;
    let mainContent!: Container, buttonsContainer!: FillFlowContainer<PopupDialogButton>;

    this.internalChildren = [
      dialogContent = new Container().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        masking: true,
        cornerRadius: 20,
        cornerExponent: Math.fround(2.5),
        edgeEffect: new EdgeEffectParameters({
          type: EdgeEffectType.Shadow,
          colour: Colour4.Black.opacity(Math.fround(0.2)),
          radius: 14,
        }),
        alpha: 0,
        children: [
          new Container().with({
            relativeSizeAxes: Axes.Both,
            children: [
              new Box().with({
                relativeSizeAxes: Axes.Both,
                colour: Colour4.fromHex('221a21'),
              }),
              new Triangles().with({
                relativeSizeAxes: Axes.Both,
                colourLight: Colour4.fromHex('271e26'),
                colourDark: Colour4.fromHex('1e171e'),
                triangleScale: 4,
              }),
              flashLayer = new Box().with({
                alpha: 0,
                relativeSizeAxes: Axes.Both,
                blending: BlendingParameters.Additive,
                colour: Colour4.fromHex('221a21'),
              }),
            ],
          }),
          new FillFlowContainer().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            direction: FillDirection.Vertical,
            spacing: new Vector2(0, 10),
            padding: MarginPadding.of({ top: 60, bottom: 30 }),
            children: [
              new Container().with({
                origin: Anchor.TopCentre,
                anchor: Anchor.TopCentre,
                padding: MarginPadding.of({ bottom: 30 }),
                size: this.ringSize,
                children: [
                  ring = new CircularContainer().with({
                    origin: Anchor.Centre,
                    anchor: Anchor.Centre,
                    masking: true,
                    borderColour: Colour4.White,
                    borderThickness: 5,
                    children: [
                      new Box().with({
                        relativeSizeAxes: Axes.Both,
                        colour: Colour4.Black.opacity(0),
                      }),
                      iconSprite = new SpriteIcon().with({
                        origin: Anchor.Centre,
                        anchor: Anchor.Centre,
                        icon: FontAwesome.Solid.TimesCircle,
                        y: -2,
                        size: new Vector2(50),
                      }),
                    ],
                  }),
                ],
              }),
              header = new OsuTextFlowContainer(t => t.font = withFont(t.font, { size: 25 })).with({
                origin: Anchor.TopCentre,
                anchor: Anchor.TopCentre,
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                textAnchor: Anchor.TopCentre,
                padding: MarginPadding.of({ horizontal: 15, bottom: 10 }),
              }),
              body = new OsuTextFlowContainer(t => t.font = withFont(t.font, { size: 18 })).with({
                origin: Anchor.TopCentre,
                anchor: Anchor.TopCentre,
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                padding: MarginPadding.of({ horizontal: 15 }),
              }),
              mainContent = new Container().with({
                origin: Anchor.TopCentre,
                anchor: Anchor.TopCentre,
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
              }),
              buttonsContainer = new FillFlowContainer<PopupDialogButton>().with({
                anchor: Anchor.TopCentre,
                origin: Anchor.TopCentre,
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                direction: FillDirection.Vertical,
                spacing: new Vector2(5),
                padding: MarginPadding.of({ top: 30 }),
              }),
            ],
          }),
        ],
      }),
    ];

    this.dialogContent = dialogContent;
    this.flashLayer = flashLayer;
    this.ring = ring;
    this.iconSprite = iconSprite;
    this.header = header;
    this.body = body;
    this.mainContent = mainContent;
    this.buttonsContainer = buttonsContainer;

    // It's important we start in a visible state so our state fires on hide, even before load.
    // This is used by the dialog overlay to know when the dialog was dismissed.
    this.show();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    void dependencies.resolve(AudioManager).samples.get('UI/default-select-disabled').then(s => this.flashSample = s);
    return r;
  }

  /** Programmatically clicks the first PopupDialogOkButton. */
  performOkAction(): void {
    this.performAction(PopupDialogOkButton);
  }

  /** Programmatically clicks the first button of the provided type. */
  performAction(type: abstract new (...args: never[]) => PopupDialogButton): void {
    // Buttons are regularly added in BDL or LoadComplete, so let's schedule to ensure
    // they are ready to be pressed.
    this.scheduler.addOnce(() => this.buttons.find(b => b instanceof type)?.triggerClick());
  }

  flash(): void {
    this.flashLayer.fadeInFromZero(80, Easing.OutQuint)
      .then()
      .fadeOutFromOne(1500, Easing.OutQuint);
    this.flashSample?.play();
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (e.repeat) return false;

    // press button at number if 1-9 on number row or keypad are pressed
    const k = e.key;

    if (k >= Key.Number1 && k <= Key.Number9) {
      this.pressButtonAtIndex(k - Key.Number1);
      return true;
    }

    if (k >= Key.Keypad1 && k <= Key.Keypad9) {
      this.pressButtonAtIndex(k - Key.Keypad1);
      return true;
    }

    return super.onKeyDown(e);
  }

  protected override popIn(): void {
    this.actionInvoked = false;

    // Reset various animations but only if the dialog animation fully completed
    if (this.dialogContent.alpha === 0) {
      this.dialogContent.scaleTo(Math.fround(0.7));
      this.ring.resizeTo(this.ringMinifiedSize);
      this.iconSprite.scaleTo(0);
    }

    this.dialogContent
      .scaleTo(1, 750, Easing.OutElasticHalf)
      .fadeIn(PopupDialog.ENTER_DURATION, Easing.OutQuint);

    this.ring.resizeTo(this.ringSize, PopupDialog.ENTER_DURATION * 1.5, Easing.OutQuint);
    this.iconSprite.delay(100).scaleTo(1, PopupDialog.ENTER_DURATION * 1.5, Easing.OutQuint);
  }

  protected override popOut(): void {
    if (!this.actionInvoked)
      // In the case a user did not choose an action before a hide was triggered, press the last button.
      // This is presumed to always be a sane default "cancel" action.
      this.buttonsContainer.children[this.buttonsContainer.children.length - 1].triggerClick();

    this.dialogContent
      .scaleTo(Math.fround(0.7), PopupDialog.EXIT_DURATION, Easing.Out)
      .fadeOut(PopupDialog.EXIT_DURATION, Easing.OutQuint);
  }

  private pressButtonAtIndex(index: number): void {
    if (index < this.buttons.length)
      this.buttons[index].triggerClick();
  }
}
