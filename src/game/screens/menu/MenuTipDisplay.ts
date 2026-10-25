// Ported from osu.Game/Screens/Menu/MenuTipDisplay.cs (tip texts from osu.Game/Localisation/MenuTipStrings.cs)
// There is no RealmKeyBindingStore (key bindings can't be changed yet), so key bindings are read from the default global bindings, in
// the order they would be stored.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { ReadableKeyCombinationProvider } from '@fw/input/ReadableKeyCombinationProvider';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { RNG } from '@fw/utils/RNG';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { LinkFlowContainer } from '../../graphics/containers/LinkFlowContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, Typeface } from '../../graphics/OsuFont';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { GlobalActionContainer } from '../../input/bindings/GlobalActionContainer';

/** InputSettingsStrings.ActionHasNoKeyBinding */
const action_has_no_key_binding = '(none)';

/** MenuTipStrings.MenuTipTitle.ToSentence() */
const menu_tip_title = 'A tip for you:';

const format = (template: string, ...args: string[]): string => template.replace(/\{(\d+)\}/g, (_, i: string) => args[Number(i)]);

const available_tips = 30;

export class MenuTipDisplay extends CompositeDrawable {
  private config!: OsuConfigManager;

  private colours!: OsuColour;

  private textFlow!: LinkFlowContainer;

  private showMenuTips!: Bindable<boolean>;

  private readonly keyCombinationProvider = new ReadableKeyCombinationProvider();

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.config = dependencies.resolve(OsuConfigManager);
    this.colours = dependencies.resolve(OsuColour);

    this.autoSizeAxes = Axes.Both;

    this.internalChildren = [
      new Container().with({
        relativeSizeAxes: Axes.Both,
        masking: true,
        cornerExponent: Math.fround(2.5),
        cornerRadius: 10,
        children: [
          new Box().with({
            colour: Colour4.fromHex('#171A1C'),
            relativeSizeAxes: Axes.Both,
            alpha: Math.fround(0.75),
          }),
        ],
      }),
      this.textFlow = new LinkFlowContainer().with({
        width: 600,
        autoSizeAxes: Axes.Y,
        textAnchor: Anchor.TopCentre,
        spacing: new Vector2(0, 2),
        margin: new MarginPadding(10),
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.showMenuTips = this.config.getBindable<boolean>(OsuSetting.MenuTips);
    this.showMenuTips.bindValueChanged(() => this.showNextTip(), true);
  }

  showNextTip(): void {
    if (!this.showMenuTips.value) {
      this.fadeOut(100, Easing.OutQuint);
      return;
    }

    const formatRegular = (t: SpriteText): void => {
      t.font = OsuFont.getFont({ size: 16, weight: FontWeight.Regular });
    };

    const formatSemiBold = (t: SpriteText): void => {
      t.font = OsuFont.getFont({ typeface: Typeface.TorusAlternate, size: 16, weight: FontWeight.SemiBold });
      t.colour = this.colours.pink0;
    };

    const tip = this.getRandomTip();

    this.textFlow.clear();
    this.textFlow.addIcon(FontAwesome.Solid.Lightbulb, icon => {
      icon.colour = this.colours.pink0;
      icon.size = new Vector2(16);
    });
    this.textFlow.addText(' ');
    this.textFlow.addText(menu_tip_title, formatSemiBold);
    this.textFlow.addParagraph(tip, formatRegular);

    this
      .fadeOut()
      .scaleTo(Math.fround(0.9))
      .delay(600)
      .fadeInFromZero(800, Easing.OutQuint)
      .scaleTo(1, 800, Easing.OutElasticHalf)
      .delay(1000 + 80 * tip.length)
      .then()
      .fadeOutFromOne(2000, Easing.OutQuint);
  }

  /** RealmKeyBindingStore.GetReadableKeyCombinationsFor(action).FirstOrDefault() ?? ActionHasNoKeyBinding, from the default bindings. */
  private keyBindingFor(action: GlobalAction): string {
    for (const binding of new GlobalActionContainer(null).defaultKeyBindings) {
      if (binding.action !== action)
        continue;

      const str = this.keyCombinationProvider.getReadableString(binding.keyCombination);

      // even if found, the readable string may be empty for an unbound action.
      if (str.length > 0)
        return str;
    }

    return action_has_no_key_binding;
  }

  private getRandomTip(): string {
    const tipIndex = RNG.next(0, available_tips);

    switch (tipIndex) {
      case 0:
        return format('Press {0} anywhere in the game to toggle the toolbar!', this.keyBindingFor(GlobalAction.ToggleToolbar));

      case 1:
        return format('Press {0} anywhere in the game to access settings!', this.keyBindingFor(GlobalAction.ToggleSettings));

      case 2:
        return 'All settings are dynamic and take effect in real-time. Try changing the skin while watching autoplay!';

      case 3:
        return 'New features are coming online every update. Make sure to stay up-to-date!';

      case 4:
        return 'If you find the UI too large or small, try adjusting UI scale in settings!';

      case 5:
        return 'Try adjusting the "Screen Scaling" mode to change your gameplay or UI area, even in fullscreen!';

      case 6:
        return format('What used to be "osu!direct" is available to all users just like on the website. You can access it anywhere using {0}!',
          this.keyBindingFor(GlobalAction.ToggleBeatmapListing));

      case 7:
        return 'Seeking in replays is available by dragging on the progress bar at the bottom of the screen or by using the left and right arrow keys!';

      case 8:
        return 'Multithreading support means that even with low "FPS" your input and judgements will be accurate!';

      case 9:
        return 'Try scrolling right in mod select to find a bunch of new fun mods!';

      case 10:
        return 'Most of the web content (profiles, rankings, etc.) are available natively in-game from the icons on the toolbar!';

      case 11:
        return 'Get more details, hide or delete a beatmap by right-clicking on its panel at song select!';

      case 12:
        return 'All delete operations are temporary until exiting. Restore accidentally deleted content from the maintenance settings!';

      case 13:
        return 'Check out the "playlists" system, which lets users create their own custom and permanent leaderboards!';

      case 14:
        return 'Toggle advanced frame / thread statistics with Ctrl-F11!';

      case 15:
        return 'Take a look under the hood at performance counters and enable verbose performance logging with Ctrl-F2!';

      case 16:
        return format('You can pause during a replay by pressing {0}!', this.keyBindingFor(GlobalAction.TogglePauseReplay));

      case 17:
        return 'Most of the hotkeys in the game are configurable and can be changed to anything you want. Check the bindings panel under input settings!';

      case 18:
        return format('When your gameplay HUD is hidden, you can press and hold {0} to view it temporarily!', this.keyBindingFor(GlobalAction.HoldForHUD));

      case 19:
        return format('Your gameplay HUD can be customised by using the skin layout editor. Open it at any time via {0}!', this.keyBindingFor(GlobalAction.ToggleSkinEditor));

      case 20:
        return 'Drag and drop any image into the skin editor to load it in quickly!';

      case 21:
        return 'You can create mod presets to make toggling your favourite mod combinations easier!';

      case 22:
        return 'Many mods have customisation settings that drastically change how they function. Click the Customise button in mod select to view settings!';

      case 23:
        return format('Press {0} to switch to a random skin! You can also use {1} and {2} to cycle through skins.',
          this.keyBindingFor(GlobalAction.RandomSkin),
          this.keyBindingFor(GlobalAction.PreviousSkin),
          this.keyBindingFor(GlobalAction.NextSkin));

      case 24:
        return format('While watching a replay, press {0} to toggle replay settings!', this.keyBindingFor(GlobalAction.ToggleReplaySettings));

      case 25:
        return 'You can easily copy the mods from scores on a leaderboard by right-clicking on them!';

      case 26:
        return 'Ctrl-Enter at song select will start a beatmap in autoplay mode!';

      case 27:
        return '"Lazer" is not an English word. The correct spelling for the bright light is "laser".';

      case 28:
        return 'Try holding your right mouse button near the beatmap carousel to quickly scroll to an absolute position!';

      case 29:
        return 'Shift-click on a beatmap panel in the beatmap listing overlay to quickly download or view the beatmap in song select!';
    }

    return '';
  }
}
