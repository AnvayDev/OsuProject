// Ported from osu.Game/Screens/Backgrounds/BackgroundScreenDefault.cs
// There is no online API, so the user is never a supporter and the skin is always a default one: the MenuBackgroundSource branches and
// SkinBackground never apply. Storyboard backgrounds are not ported. Seasonal backgrounds come first, as in C# (SeasonalBackgroundLoader, with a
// bundled list), then the default rotation.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Logger } from '@fw/logging/Logger';
import { Easing } from '@fw/transforms/Easing';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { IntroSequence } from '../../configuration/IntroSequence';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { Background } from '../../graphics/backgrounds/Background';
import { SeasonalBackgroundLoader } from '../../graphics/backgrounds/SeasonalBackgroundLoader';
import { RNG } from '@fw/utils/RNG';
import { BackgroundScreen } from '../BackgroundScreen';

export class BackgroundScreenDefault extends BackgroundScreen {
  private background: Background | null = null;

  private currentDisplay = 0;
  private static readonly background_count = 8;

  private introSequence!: Bindable<IntroSequence>;

  private readonly seasonalBackgroundLoader = new SeasonalBackgroundLoader();

  private beatmap!: Bindable<WorkingBeatmap>;

  protected get allowStoryboardBackground(): boolean {
    return true;
  }

  constructor() {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    // [Resolved] bindables are bound copies (SourceGeneratorUtils.GetDependency, rebindBindables).
    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.introSequence = dependencies.resolve(OsuConfigManager).getBindable<IntroSequence>(OsuSetting.IntroSequence);

    this.addInternal(this.seasonalBackgroundLoader);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // helper function required for AddOnce usage.
    const next = () => { this.next(); };

    this.beatmap.valueChanged.add(() => this.scheduler.addOnce(next));
    this.introSequence.valueChanged.add(() => this.scheduler.addOnce(next));
    this.seasonalBackgroundLoader.seasonalBackgroundChanged.add(() => this.scheduler.addOnce(next));

    this.currentDisplay = RNG.next(0, BackgroundScreenDefault.background_count);

    this.next();
  }

  private nextTask: ScheduledDelegate | null = null;
  private cancellationTokenSource: AbortController | null = null;

  /** Request loading the next background. Returns whether a new background was queued for load. May return false if the current background is still valid. */
  next(): boolean {
    const nextBackground = this.createBackground();

    // in the case that the background hasn't changed, we want to avoid cancelling any tasks that could still be loading.
    if (nextBackground === this.background)
      return false;

    Logger.log('🌅 Global background change queued');

    this.cancellationTokenSource?.abort();
    const source = this.cancellationTokenSource = new AbortController();

    this.nextTask?.cancel();
    this.nextTask = this.scheduler.addDelayed(() => {
      Logger.log('🌅 Global background loading');
      void this.loadComponentAsync(nextBackground, b => {
        if (!source.signal.aborted)
          this.displayNext(b);
      });
    }, 500);

    return true;
  }

  private displayNext(newBackground: Background): void {
    this.background?.fadeOut(800, Easing.OutQuint);
    this.background?.expire();

    this.addInternal(this.background = newBackground);
    this.currentDisplay++;
  }

  private createBackground(): Background {
    // seasonal background loading gets highest priority.
    let newBackground: Background | null = this.seasonalBackgroundLoader.loadNextBackground();

    // (the supporter-only MenuBackgroundSource branches would go here; the user is never a supporter.)

    // this method is called in many cases where the background might not necessarily need to change.
    // if an equivalent background is currently being shown, we don't want to load it again.
    if (newBackground?.equals(this.background) === true)
      return this.background!;

    newBackground ??= new Background(this.getBackgroundTextureName());
    newBackground.depth = this.currentDisplay;

    return newBackground;
  }

  private getBackgroundTextureName(): string {
    switch (this.introSequence.value) {
      case IntroSequence.Welcome:
        return 'Intro/Welcome/menu-background';

      default:
        return `Menu/menu-background-${this.currentDisplay % BackgroundScreenDefault.background_count + 1}`;
    }
  }
}
