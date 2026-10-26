// Ported from osu.Game/Screens/Footer/ScreenStackFooter.cs
// Not ported yet: the legacy BackButton (for screens without the footer that allow user exit; none of the ported ones do), and subscreen
// stacks (IHasSubScreenStack: online play), so the tracker follows the root stack only.

import { Bindable } from '@fw/bindables/Bindable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { IScreen } from '@fw/screens/IScreen';
import type { ScreenStack } from '@fw/screens/ScreenStack';
import { Axes } from '@fw/layout/Enums';
import { OsuScreen } from '../OsuScreen';
import { type BackReceptor, ScreenFooter } from './ScreenFooter';

export class ScreenStackFooter extends CompositeDrawable {
  /** The footer. */
  readonly footer: ScreenFooter;

  /** Whether the legacy back button is currently displayed. */
  private readonly backButtonVisibility = new Bindable<boolean>(false);

  constructor(screenStack: ScreenStack, backReceptor: BackReceptor | null, init: { requestLogoInFront: (inFront: boolean) => void; backButtonPressed: () => void }) {
    super();

    this.relativeSizeAxes = Axes.Both;

    this.internalChildren = [
      this.footer = new ScreenFooter(backReceptor).with({
        requestLogoInFront: v => init.requestLogoInFront(v),
        backButtonPressed: () => init.backButtonPressed(),
      }),
    ];

    screenStack.screenPushed.add(([lastScreen, newScreen]) => this.onScreenChanged(lastScreen, newScreen));
    screenStack.screenExited.add(([lastScreen, newScreen]) => this.onScreenChanged(lastScreen, newScreen));
  }

  private onScreenChanged(lastScreen: IScreen | null, newScreen: IScreen | null): void {
    this.unbindScreen(lastScreen);
    this.bindScreen(newScreen);
  }

  private unbindScreen(screen: IScreen | null): void {
    if (!(screen instanceof OsuScreen))
      return;

    this.backButtonVisibility.unbindFrom(screen.backButtonVisibility);
  }

  private bindScreen(screen: IScreen | null): void {
    if (!(screen instanceof OsuScreen)) {
      this.backButtonVisibility.value = true;

      this.footer.setButtons([]);
      this.footer.hide();
      return;
    }

    const osuScreen = screen;

    if (osuScreen.showFooter) {
      // the legacy back button should never display while the new footer is in use, as it
      // contains its own local back button.
      this.backButtonVisibility.value = false;

      this.footer.show();

      const updateFooterButtons = () => {
        const buttons = osuScreen.createFooterButtons();

        osuScreen.loadComponentsAgainstScreenDependencies(buttons);

        this.footer.setButtons(buttons);
        this.footer.show();
      };

      if (osuScreen.isLoaded)
        updateFooterButtons();
      else {
        // ensure the current buttons are immediately disabled on screen change (so they can't be pressed).
        this.footer.setButtons([]);

        osuScreen.onLoadComplete.add(() => updateFooterButtons());
      }
    } else {
      this.backButtonVisibility.bindTo(osuScreen.backButtonVisibility);

      this.footer.setButtons([]);
      this.footer.hide();
    }
  }
}
