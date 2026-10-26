// Ported from osu.Game/Beatmaps/Drawables/Cards/Buttons/PlayButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool, type Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { PreviewTrack } from '../../../../audio/PreviewTrack';
import { PreviewTrackManager } from '../../../../audio/PreviewTrackManager';
import { OsuHoverContainer } from '../../../../graphics/containers/OsuHoverContainer';
import { OsuColour } from '../../../../graphics/OsuColour';
import { LoadingSpinner } from '../../../../graphics/userInterface/LoadingSpinner';
import type { IBeatmapSetInfo } from '../../../IBeatmapSetInfo';
import { BeatmapCardConstants } from '../BeatmapCardConstants';

/** BeatmapCardNormal.HEIGHT (not imported: the card imports this button). */
const card_normal_height = 80;

export class PlayButton extends OsuHoverContainer {
  get progress(): Bindable<number> {
    return this._progress;
  }

  private readonly _progress = new BindableDouble();

  readonly playing = new BindableBool();

  private readonly beatmapSetInfo: IBeatmapSetInfo;

  protected override get effectTargets(): Iterable<Drawable> {
    return [this.icon];
  }

  private readonly icon: SpriteIcon;
  private readonly loadingSpinner: LoadingSpinner;

  private previewTrackManager!: PreviewTrackManager;

  private previewTrack: PreviewTrack | null = null;

  constructor(beatmapSetInfo: IBeatmapSetInfo) {
    super();

    this.beatmapSetInfo = beatmapSetInfo;

    this.anchor = this.origin = Anchor.Centre;

    // needed for touch input to work when card is not hovered/expanded
    this.alwaysPresent = true;

    let icon!: SpriteIcon;
    let loadingSpinner!: LoadingSpinner;

    this.children = [
      icon = new SpriteIcon().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        icon: FontAwesome.Solid.Play,
        size: new Vector2(14),
      }),
      loadingSpinner = new LoadingSpinner().with({
        size: new Vector2(14),
      }),
    ];

    this.icon = icon;
    this.loadingSpinner = loadingSpinner;

    this.action = () => this.playing.toggle();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.previewTrackManager = dependencies.resolve(PreviewTrackManager);
    this.hoverColour = dependencies.resolve(OsuColour).yellow;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.playing.bindValueChanged(e => this.updateState(e), true);
  }

  protected override update(): void {
    super.update();

    this.icon.scale = new Vector2(this.drawWidth / (card_normal_height - BeatmapCardConstants.CORNER_RADIUS));

    if (this.playing.value && this.previewTrack !== null && this.previewTrack.trackLoaded)
      this._progress.value = this.previewTrack.currentTime / this.previewTrack.length;
    else
      this._progress.value = 0;
  }

  private updateState(playing: ValueChangedEvent<boolean>): void {
    this.icon.icon = playing.newValue ? FontAwesome.Solid.Stop : FontAwesome.Solid.Play;

    if (!playing.newValue) {
      this.stopPreview();
      return;
    }

    if (this.previewTrack === null) {
      this.toggleLoading(true);

      void this.loadComponentAsync(this.previewTrack = this.previewTrackManager.get(this.beatmapSetInfo), p => this.onPreviewLoaded(p));
    } else {
      this.tryStartPreview();
    }
  }

  private stopPreview(): void {
    this.toggleLoading(false);
    this.playing.value = false;
    this.previewTrack?.stop();
  }

  private onPreviewLoaded(loadedPreview: PreviewTrack): void {
    // Make sure that we schedule to after the next audio frame to fix crashes in single-threaded execution.
    // See: https://github.com/ppy/osu-framework/issues/4692
    this.schedule(() => {
      // another async load might have completed before this one.
      // if so, do not make any changes.
      if (loadedPreview !== this.previewTrack) {
        loadedPreview.dispose();
        return;
      }

      this.addInternal(loadedPreview);
      this.toggleLoading(false);

      loadedPreview.stopped.add(() => this.schedule(() => this.playing.value = false));

      if (this.playing.value)
        this.tryStartPreview();
    });
  }

  private tryStartPreview(): void {
    if (this.previewTrack?.start() === false)
      this.playing.value = false;
  }

  private toggleLoading(loading: boolean): void {
    this.enabled.value = !loading;
    this.icon.fadeTo(loading ? 0 : 1, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
    this.loadingSpinner.state.value = loading ? Visibility.Visible : Visibility.Hidden;
  }
}
