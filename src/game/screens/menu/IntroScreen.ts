// Ported from osu.Game/Screens/Menu/IntroScreen.cs
// Not ported yet: GlobalScrollAdjustsVolume (no volume overlay), the supporter-only skinnable "seeya" sample (the user is never a supporter),
// and the notification the watchdog posts (no notification overlay).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { Bindable, LeasedBindable } from '@fw/bindables/Bindable';
import type { Track } from '@fw/audio/track/Track';
import { Colour4 } from '@fw/graphics/Colour4';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Easing } from '@fw/transforms/Easing';
import { RNG } from '@fw/utils/RNG';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ImportTask } from '../../database/ImportTask';
import { MusicController } from '../../overlays/MusicController';
import { RulesetStore } from '../../rulesets/RulesetInfo';
import type { BackgroundScreen } from '../BackgroundScreen';
import { BackgroundScreenDefault } from '../backgrounds/BackgroundScreenDefault';
import { StartupScreen } from '../StartupScreen';
import type { MainMenu } from './MainMenu';
import type { OsuLogo } from './OsuLogo';

const exit_delay = 3000;

export abstract class IntroScreen extends StartupScreen {
  private _didLoadMenu = false;

  /** Whether we have loaded the menu previously. */
  get didLoadMenu(): boolean {
    return this._didLoadMenu;
  }

  /** A hash used to find the associated beatmap if already imported. */
  protected abstract get beatmapHash(): string;

  /** A source file to use as an import source if the intro beatmap is not yet present. Should be within the "Tracks" namespace of game resources. */
  protected abstract get beatmapFile(): string;

  protected menuVoice!: Bindable<boolean>;

  protected menuMusic!: Bindable<boolean>;

  private initialBeatmap: WorkingBeatmap | null = null;

  /** C#'s Track (renamed: the intro's track, not a drawable property). */
  protected introTrack: Track | null = null;

  private seeya: Sample | null = null;

  protected get seeyaSampleName(): string {
    return 'Intro/seeya';
  }

  protected override get playExitSound(): boolean {
    return false;
  }

  private beatmapLease!: LeasedBindable<WorkingBeatmap>;

  private nextScreen: MainMenu | null = null;

  private audio!: AudioManager;

  /** C#'s [Resolved] musicController (OsuScreen has its own private one). */
  private introMusicController!: MusicController;

  private readonly createNextScreen: (() => MainMenu) | null;

  private _usingThemedIntro = false;

  /** Whether the track is provided by osu! resources, rather than a user beatmap. Only valid during or after logoArriving. */
  protected get usingThemedIntro(): boolean {
    return this._usingThemedIntro;
  }

  protected override createBackground(): BackgroundScreen {
    return new BackgroundScreenDefault().with({
      colour: Colour4.Black,
    });
  }

  override get allowGlobalTrackControl(): boolean | null {
    return false;
  }

  protected constructor(createNextScreen: (() => MainMenu) | null = null) {
    super();

    this.createNextScreen = createNextScreen;
  }

  private beatmaps!: BeatmapManager;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.audio = dependencies.resolve(AudioManager);
    this.introMusicController = dependencies.resolve(MusicController);
    this.beatmaps = dependencies.resolve(BeatmapManager);

    const config = dependencies.resolve(OsuConfigManager);

    // prevent user from changing beatmap while the intro is still running.
    this.beatmapLease = this.beatmap.beginLease(false);

    this.menuVoice = config.getBindable<boolean>(OsuSetting.MenuVoice);
    this.menuMusic = config.getBindable<boolean>(OsuSetting.MenuMusic);

    this.seeya = await this.audio.samples.get(this.seeyaSampleName);

    // if the user has requested not to play theme music, we should attempt to find a random beatmap from their collection.
    if (!this.menuMusic.value) {
      const usableBeatmapSets = this.beatmaps.getAllUsableBeatmapSets().filter(s => !s.isProtected);

      const setCount = usableBeatmapSets.length;

      if (setCount > 0) {
        const found = usableBeatmapSets[RNG.next(0, setCount - 1)].beatmaps[0];

        if (found !== undefined)
          this.initialBeatmap = this.beatmaps.getWorkingBeatmap(found);
      }
    }

    // we generally want a song to be playing on startup, so use the intro music even if a user has specified not to if no other track is available.
    if (this.initialBeatmap === null) {
      // Intro beatmaps are generally made using the osu! ruleset.
      // It might not be present in test projects for other rulesets.
      const osuRulesetPresent = RulesetStore.getRuleset(0) !== null;

      if (!await this.loadThemedIntro() && osuRulesetPresent) {
        // if we detect that the theme track or beatmap is unavailable this is either first startup or things are in a bad state.
        // this could happen if a user has nuked their files store. for now, reimport to repair this.
        const archive = await this.game.resources.get(`Tracks/${this.beatmapFile}`);

        if (archive !== null) {
          const [imported] = await this.beatmaps.import([new ImportTask(new Uint8Array(await archive.arrayBuffer()), this.beatmapFile)]);

          if (imported !== undefined)
            await this.beatmaps.performWrite(imported, b => b.isProtected = true);
        }

        await this.loadThemedIntro();
      }
    }
  }

  private async loadThemedIntro(): Promise<boolean> {
    const setInfo = this.beatmaps.queryBeatmapSet(b => b.isProtected && b.hash === this.beatmapHash);

    if (setInfo !== null && setInfo.beatmaps.length > 0) {
      const working = this.beatmaps.getWorkingBeatmap(setInfo.beatmaps[0]);

      // Ensure files area actually present on disk.
      // This is to handle edge cases like users deleting files outside the game and breaking the world.
      if (await this.hasAllFiles(working))
        this.initialBeatmap = working;
    }

    return this._usingThemedIntro = this.initialBeatmap !== null;
  }

  override onEntering(e: ScreenTransitionEvent): void {
    super.onEntering(e);
    this.ensureEventuallyArrivingAtMenu();
  }

  private async hasAllFiles(working: WorkingBeatmap): Promise<boolean> {
    for (const f of working.beatmapSetInfo.files) {
      if (await working.getStream(f.file.hash) === null)
        return false;
    }

    return true;
  }

  private ensureEventuallyArrivingAtMenu(): void {
    // This intends to handle the case where an intro may get stuck.
    // Historically, this could happen if the host system's audio device is in a state it can't
    // play audio, causing a clock to never elapse time and the intro to never end.
    //
    // This safety measure gives the user a chance to fix the problem from the settings menu.
    this.scheduler.addDelayed(() => {
      if (this.didLoadMenu)
        return;

      this.prepareMenuLoad();
      this.loadMenu();

      // (C# also posts a SimpleErrorNotification: NotificationsStrings.AudioPlaybackIssue.)
    }, 8000);
  }

  override onResuming(e: ScreenTransitionEvent): void {
    this.fadeIn(300);

    this.applyToBackground(b => b.fadeColour(Colour4.Black, 100));

    let fadeOutTime = exit_delay;

    const track = this.introMusicController.currentTrack;

    // ensure the track doesn't change or loop as we are exiting.
    track.looping = false;
    this.beatmap.disabled = true;

    // we also handle the exit transition.
    if (this.menuVoice.value) {
      this.seeya?.play();

      // if playing the outro voice, we have more time to have fun with the background track.
      // initially fade to almost silent then ramp out over the remaining time.
      const initial_fade = 200;
      track
        .volumeTo(Math.fround(0.03), initial_fade).then()
        .volumeTo(0, fadeOutTime - initial_fade, Easing.In);
    } else {
      fadeOutTime = 500;

      // if outro voice is turned off, just do a simple fade out.
      track.volumeTo(0, fadeOutTime, Easing.Out);
    }

    //don't want to fade out completely else we will stop running updates.
    this.game.fadeTo(Math.fround(0.01), fadeOutTime).onComplete(() => this.exit());

    super.onResuming(e);
  }

  private backgroundFaded = false;

  protected fadeInBackground(duration = 0): void {
    this.applyToBackground(b => b.fadeColour(Colour4.White, duration));
    this.backgroundFaded = true;
  }

  override onSuspending(e: ScreenTransitionEvent): void {
    super.onSuspending(e);
    this.initialBeatmap = null;

    if (!this.backgroundFaded)
      this.fadeInBackground(200);
  }

  protected startTrack(): void {
    const drawableTrack = this.introMusicController.currentTrack;

    if (!this.usingThemedIntro) {
      this.initialBeatmap?.prepareTrackForPreview(false, -2600);

      drawableTrack.volumeTo(0);
      drawableTrack.restart();
      drawableTrack.volumeTo(1, 2600, Easing.InCubic);
    } else {
      drawableTrack.restart();
    }
  }

  protected override logoArriving(logo: OsuLogo, resuming: boolean): void {
    super.logoArriving(logo, resuming);

    logo.colour = Colour4.White;
    logo.triangles = false;
    logo.ripple = false;

    if (!resuming) {
      // generally this can never be null
      // an exception is running ruleset tests, where the osu! ruleset may not be present (causing importing the intro to fail).
      if (this.initialBeatmap !== null)
        this.beatmapLease.value = this.initialBeatmap;
      this.introTrack = this.beatmapLease.value.track;

      // ensure the track starts at maximum volume
      this.introMusicController.currentTrack.finishTransforms();

      logo.moveTo(new Vector2(0.5));
      logo.scaleTo(Vector2.One);
      logo.hide();
    } else {
      const quick_appear = 350;
      const initialMovementTime = logo.alpha > Math.fround(0.2) ? quick_appear : 0;

      logo.moveTo(new Vector2(0.5), initialMovementTime, Easing.OutQuint);

      logo
        .scaleTo(1, initialMovementTime, Easing.OutQuint)
        .fadeIn(quick_appear, Easing.OutQuint)
        .then()
        .rotateTo(20, exit_delay * 1.5)
        .fadeOut(exit_delay);
    }
  }

  protected prepareMenuLoad(): void {
    if (this.nextScreen !== null)
      return;

    this.nextScreen = this.createNextScreen?.() ?? null;

    if (this.nextScreen !== null)
      void this.loadComponentAsync(this.nextScreen);
  }

  protected loadMenu(): void {
    if (this.didLoadMenu)
      return;

    this.beatmapLease.return();

    this._didLoadMenu = true;
    if (this.nextScreen !== null)
      this.push(this.nextScreen);
  }
}
