// Ported from osu.Game/Overlays/DialogOverlay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { KeyBindingPressEvent } from '@fw/input/bindings/KeyBindings';
import type { MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { Logger } from '@fw/logging/Logger';
import { OsuFocusedOverlayContainer } from '../graphics/containers/OsuFocusedOverlayContainer';
import { GlobalAction } from '../input/bindings/GlobalAction';
import { PopupDialog } from './dialog/PopupDialog';
import { PopupDialogOkButton } from './dialog/PopupDialogOkButton';
import type { IDialogOverlay } from './IDialogOverlay';
import { DuckParameters, MusicController } from './MusicController';
import { OverlayActivation } from './OverlayActivation';

export class DialogOverlay extends OsuFocusedOverlayContainer implements IDialogOverlay {
  readonly isDialogOverlay = true;

  private readonly dimLayer: Box;
  private readonly dialogContainer: Container;

  protected override get popInSampleName(): string | null {
    return 'UI/dialog-pop-in';
  }

  protected override get popOutSampleName(): string | null {
    return 'UI/dialog-pop-out';
  }

  // Dialog overlay creates its own dim layer as it may be displayed over the top of other global overlays.
  protected override get dimMainContent(): boolean {
    return false;
  }

  private musicController: MusicController | null = null;

  private _currentDialog: PopupDialog | null = null;

  get currentDialog(): PopupDialog | null {
    return this._currentDialog;
  }

  override get isPresent(): boolean {
    return (this.scheduler.hasPendingTasks || this.dialogContainer.children.length > 0)
      // The following line ensures that dialogs are not presented while the dialog overlay
      // cannot be displayed. This is due to the `Schedule` usage inside `Push()`.
      //
      // Without this, a dialog pushed during disabled overlay activation mode would be presented,
      // but immediately dismissed without ever being seen by the user (see
      // https://github.com/ppy/osu/blob/ce5e54c9d27b17d460d99e774de502f9480fb710/osu.Game/Graphics/Containers/OsuFocusedOverlayContainer.cs#L131-L136).
      && this.overlayActivationMode.value !== OverlayActivation.Disabled;
  }

  private duckOperation: { dispose(): void } | null = null;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;

    let dimLayer!: Box, dialogContainer!: Container;

    this.child = new Container().with({
      relativeSizeAxes: Axes.Both,
      children: [
        dimLayer = new Box().with({
          relativeSizeAxes: Axes.Both,
          colour: Colour4.Black,
          alpha: Math.fround(0.5),
        }),
        dialogContainer = new Container().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          autoSizeAxes: Axes.Y,
          width: 500,
        }),
      ],
    });

    this.dimLayer = dimLayer;
    this.dialogContainer = dialogContainer;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);
    this.musicController = dependencies.get(MusicController);
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.duckOperation?.dispose();
  }

  push(dialog: PopupDialog): void {
    if (dialog === this._currentDialog || dialog.state.value === Visibility.Hidden) return;

    // Immediately update the externally accessible property as this may be used for checks even before
    // a DialogOverlay instance has finished loading.
    const lastDialog = this._currentDialog;
    this._currentDialog = dialog;

    const dismiss = (): void => {
      if (dialog !== this._currentDialog) return;

      // Handle the case where the dialog is the currently displayed dialog.
      // In this scenario, the overlay itself should also be hidden.
      this.hide();
      Logger.log(`DialogOverlay: Dismissing dialog ${dialog}`);
      this._currentDialog = null;
    };

    this.schedule(() => {
      // if any existing dialog is being displayed, dismiss it before showing a new one.
      lastDialog?.hide();

      // if the new dialog is hidden before added to the dialogContainer, bypass any further operations.
      if (dialog.state.value === Visibility.Hidden) {
        dismiss();
        return;
      }

      Logger.log(`DialogOverlay: Showing dialog ${dialog}`);
      this.dialogContainer.add(dialog);
      this.show();

      dialog.state.bindValueChanged(state => {
        if (state.newValue !== Visibility.Hidden) return;

        // Trigger the demise of the dialog as soon as it hides.
        dialog.delay(PopupDialog.EXIT_DURATION).expire();

        dismiss();
      });
    });
  }

  protected override get blockNonPositionalInput(): boolean {
    return true;
  }

  // Matches `OsuFocusedOverlayContainer` implementation but redirects checks to the meaningful part of the dialog display.
  // Required because of the custom dim layer logic used in this class. (C#'s private closeOnMouseUp; the base class has one too.)
  private dialogCloseOnMouseUp = false;

  protected override onMouseDown(e: MouseDownEvent): boolean {
    this.dialogCloseOnMouseUp = !this.dialogContainer.receivePositionalInputAt(e.screenSpaceMousePosition);

    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (this.dialogCloseOnMouseUp && !this.dialogContainer.receivePositionalInputAt(e.screenSpaceMousePosition))
      this.hide();

    super.onMouseUp(e);
  }

  protected override popIn(): void {
    this.duckOperation = this.musicController?.duck(Object.assign(new DuckParameters(), {
      duckVolumeTo: 1,
      duckDuration: 100,
      restoreDuration: 100,
    })) ?? null;

    this.dimLayer.fadeTo(Math.fround(0.5), PopupDialog.ENTER_DURATION, Easing.OutQuint);
  }

  protected override popOut(): void {
    super.popOut();
    this.duckOperation?.dispose();

    // PopOut gets called initially, but we only want to hide dialog when we have been loaded and are present.
    if (this.isLoaded && this._currentDialog?.state.value === Visibility.Visible)
      this._currentDialog.hide();

    this.dimLayer.fadeOut(PopupDialog.EXIT_DURATION, Easing.OutQuint);
  }

  override onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat)
      return false;

    switch (e.action) {
      case GlobalAction.Select: {
        const clickableButton =
          this._currentDialog?.buttons.find(b => b instanceof PopupDialogOkButton) ??
          this._currentDialog?.buttons[0];

        clickableButton?.triggerClick();
        return true;
      }
    }

    return super.onPressed(e);
  }
}
