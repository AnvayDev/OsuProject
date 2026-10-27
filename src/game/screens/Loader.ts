// Ported from osu.Game/Screens/Loader.cs
// There is no shader precompiler (the DOM has no shaders to compile). IntroCircles and IntroWelcome are not ported yet, so every sequence
// (including a random pick) plays IntroTriangles, as C# does for any value other than Circles and Welcome. Seasonal (IntroChristmas) is
// disabled in this build (SeasonalUIConfig.ENABLED is false).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Anchor, LoadState } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { ScreenTransitionEvent } from '@fw/screens/IScreen';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { RNG } from '@fw/utils/RNG';
import { IntroSequence } from '../configuration/IntroSequence';
import { OsuConfigManager, OsuSetting } from '../configuration/OsuConfigManager';
import { LoadingSpinner } from '../graphics/userInterface/LoadingSpinner';
import { IntroTriangles } from './menu/IntroTriangles';
import { MainMenu } from './menu/MainMenu';
import type { IntroScreen } from './menu/IntroScreen';
import type { OsuScreen } from './OsuScreen';
import { StartupScreen } from './StartupScreen';

const intro_sequences = [IntroSequence.Circles, IntroSequence.Welcome, IntroSequence.Triangles];

export class Loader extends StartupScreen {
  constructor() {
    super();

    this.validForResume = false;
  }

  private loadableScreen: OsuScreen | null = null;

  private introSequence = IntroSequence.Triangles;
  private spinner!: LoadingSpinner;
  private spinnerShow: ScheduledDelegate | null = null;

  protected createLoadableScreen(): OsuScreen {
    return this.getIntroSequence();
  }

  private getIntroSequence(): IntroScreen {
    if (this.introSequence === IntroSequence.Random)
      this.introSequence = intro_sequences[RNG.next(0, intro_sequences.length)];

    const createMainMenu = (): MainMenu => new MainMenu();

    // (Circles → IntroCircles, Welcome → IntroWelcome once they are ported.)
    return new IntroTriangles(createMainMenu);
  }

  override onEntering(e: ScreenTransitionEvent): void {
    super.onEntering(e);

    void this.loadComponentAsync(this.loadableScreen = this.createLoadableScreen());

    void this.loadComponentAsync(this.spinner = new LoadingSpinner(true, true).with({
      anchor: Anchor.BottomRight,
      origin: Anchor.BottomRight,
      margin: new MarginPadding(40),
    }), () => {
      this.addInternal(this.spinner);
      this.spinnerShow = this.scheduler.addDelayed(() => this.spinner.show(), 200);
    });

    this.checkIfLoaded();
  }

  private readonly checkIfLoaded = (): void => {
    if (this.loadableScreen?.loadState !== LoadState.Ready) {
      this.schedule(this.checkIfLoaded);
      return;
    }

    this.spinnerShow?.cancel();

    const loadableScreen = this.loadableScreen;

    if (this.spinner.state.value === Visibility.Visible) {
      this.spinner.hide();
      this.scheduler.addDelayed(() => this.push(loadableScreen), LoadingSpinner.TRANSITION_DURATION);
    } else
      this.push(loadableScreen);
  };

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.introSequence = dependencies.resolve(OsuConfigManager).get<IntroSequence>(OsuSetting.IntroSequence);
    return r;
  }
}
