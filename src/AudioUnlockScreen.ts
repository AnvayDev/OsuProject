// Not a port: browsers keep an AudioContext suspended until the first user gesture, and osu! has no screen for that. The intro is clocked by
// its track, so this first screen (black, like the start of the intro) waits for the AudioManager to resume the context (on the first
// pointer/key input), then pushes the real first screen. When audio is already allowed it continues immediately.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { Anchor } from '@fw/layout/Enums';
import type { ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont } from '@game/graphics/OsuFont';
import { OsuSpriteText } from '@game/graphics/sprites/OsuSpriteText';
import type { OsuScreen } from '@game/screens/OsuScreen';
import { StartupScreen } from '@game/screens/StartupScreen';

export class AudioUnlockScreen extends StartupScreen {
  private context!: BaseAudioContext;

  private readonly hint = new OsuSpriteText().with({
    anchor: Anchor.Centre,
    origin: Anchor.Centre,
    font: OsuFont.getFont({ size: 20, weight: FontWeight.Light }),
    text: 'click anywhere to start',
    alpha: 0,
  });

  constructor(private readonly createNextScreen: () => OsuScreen) {
    super();

    this.validForResume = false;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.context = dependencies.resolve(AudioManager).context;
    this.addInternal(this.hint);

    return r;
  }

  override onEntering(e: ScreenTransitionEvent): void {
    super.onEntering(e);

    if (this.context.state === 'running') {
      this.continue();
      return;
    }

    this.hint.delay(500).fadeIn(1000, Easing.OutQuint);

    const onStateChange = () => {
      if (this.context.state !== 'running')
        return;

      this.context.removeEventListener('statechange', onStateChange);
      this.schedule(() => this.continue());
    };

    this.context.addEventListener('statechange', onStateChange);
  }

  private continue(): void {
    this.hint.fadeOut(200, Easing.OutQuint);
    this.push(this.createNextScreen());
  }
}
