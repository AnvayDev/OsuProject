// Web addition (user request): gameplay isn't ported, so starting a beatmap pushes this screen in place of osu!'s PlayerLoader → Player.
// It is a Player without the ruleset: like Player it hides overlays and plays the song from the beginning (no looping), and only the beatmap's
// background and video remain, undimmed and unblurred (the user's dim/blur settings aren't ported, and the video is what's being watched).
// Back (escape) exits; so does the song ending.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { ScreenExitEvent, ScreenTransitionEvent } from '@fw/screens/IScreen';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { MusicController } from '../../overlays/MusicController';
import { ScreenWithBeatmapBackground } from './ScreenWithBeatmapBackground';

export class VideoPlayer extends ScreenWithBeatmapBackground implements IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  // (Player.AllowUserExit is false too: it exits through its own UI, here the back action below.)
  override get allowUserExit(): boolean {
    return false;
  }

  override get backgroundParallaxAmount(): number {
    return 0.1;
  }

  override get hideOverlaysOnEnter(): boolean {
    return true;
  }

  override get disallowExternalBeatmapRulesetChanges(): boolean {
    return true;
  }

  private music!: MusicController;

  private exited = false;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.music = dependencies.resolve(MusicController);
    return r;
  }

  override onEntering(e: ScreenTransitionEvent): void {
    super.onEntering(e);

    this.applyToBackground(b => {
      b.showVideo.value = true;
      b.ignoreUserSettings.value = true;
      b.dimWhenUserSettingsIgnored.value = 0;
      b.blurAmount.value = 0;
    });

    const track = this.music.currentTrack;
    track.looping = false;
    this.music.seekTo(0);

    if (!this.music.isPlaying)
      this.music.play();
  }

  protected override update(): void {
    super.update();

    // (Player shows results once the beatmap completes; there's nothing to show, so return to song select.)
    if (!this.exited && this.isCurrentScreen() && this.music.currentTrack.hasCompleted)
      this.exit();
  }

  override onExiting(e: ScreenExitEvent): boolean {
    this.exited = true;
    return super.onExiting(e);
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat || e.action !== GlobalAction.Back)
      return false;

    if (!this.exited)
      this.exit();

    return true;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}
