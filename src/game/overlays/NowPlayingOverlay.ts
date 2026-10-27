// Ported from osu.Game/Overlays/NowPlayingOverlay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { BufferedContainer } from '@fw/graphics/containers/BufferedContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import type { DragEndEvent, DragEvent, DragStartEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection, FillMode } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { romanisable } from '@fw/localisation/RomanisableString';
import { Easing } from '@fw/transforms/Easing';
import type { WorkingBeatmap } from '../beatmaps/WorkingBeatmap';
import { OsuFocusedOverlayContainer } from '../graphics/containers/OsuFocusedOverlayContainer';
import { OsuColour } from '../graphics/OsuColour';
import { FontWeight, OsuFont } from '../graphics/OsuFont';
import { OsuIcon } from '../graphics/OsuIcon';
import { OsuSpriteText } from '../graphics/sprites/OsuSpriteText';
import { IconButton } from '../graphics/userInterface/IconButton';
import { ProgressBar } from '../graphics/userInterface/ProgressBar';
import { OsuGameBase } from '../OsuGameBase';
import type { INamedOverlayComponent } from './INamedOverlayComponent';
import { MarqueeContainer } from './MarqueeContainer';
import { MusicController, TrackChangeDirection } from './MusicController';
import { PlaylistOverlay } from './music/PlaylistOverlay';

const player_width = 400;
const player_height = 130;
const transition_length = 500;
const progress_height = 10;
const bottom_black_area_height = 55;
const margin = 10;

// C# float.MaxValue
const float_max_value = 3.4028234663852886e38;

const title_font = OsuFont.getFont({ size: 25, italics: true });
const artist_font = OsuFont.getFont({ size: 15, weight: FontWeight.Bold, italics: true });

export class NowPlayingOverlay extends OsuFocusedOverlayContainer implements INamedOverlayComponent {
  static readonly TRACK_DRAG_SEEK_DEBOUNCE = 40;

  get icon(): IconUsage {
    return OsuIcon.Music;
  }

  get title(): string {
    return 'now playing';
  }

  get description(): string {
    return 'manage the currently playing track';
  }

  private background!: Drawable;
  private progressBar!: ProgressBar;

  private prevButton!: IconButton;
  private playButton!: IconButton;
  private nextButton!: IconButton;
  private shuffleButton!: MusicIconButton;
  private playlistButton!: IconButton;

  private titleMarquee!: MarqueeContainer;
  private artistMarquee!: MarqueeContainer;

  private playlist: PlaylistOverlay | null = null;

  private dragContainer!: Container;
  private playerContainer!: Container;
  private playlistContainer!: Container;

  protected override get popInOutSampleBalance(): number {
    return OsuGameBase.SFX_STEREO_STRENGTH * Math.fround(0.75);
  }

  private musicController!: MusicController;

  private beatmap!: Bindable<WorkingBeatmap>;

  private colours!: OsuColour;

  private allowTrackControl!: Bindable<boolean>;
  private readonly shuffle = new BindableBool(true);

  constructor() {
    super();

    this.width = player_width;
    this.margin = new MarginPadding(margin);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.musicController = dependencies.resolve(MusicController);
    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.colours = dependencies.resolve(OsuColour);

    this.children = [
      this.dragContainer = new DragContainer().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        relativeSizeAxes: Axes.X,
        children: [
          this.playerContainer = new Container().with({
            relativeSizeAxes: Axes.X,
            height: player_height,
            masking: true,
            cornerRadius: 5,
            edgeEffect: new EdgeEffectParameters({
              type: EdgeEffectType.Shadow,
              colour: Colour4.Black.opacityByte(40),
              radius: 5,
            }),
            children: [
              this.background = emptyDrawable(),
              this.titleMarquee = new MarqueeContainer().with({
                origin: Anchor.BottomCentre,
                anchor: Anchor.TopCentre,
                position: new Vector2(0, 40),
                colour: Colour4.White,
                createContent: () => new OsuSpriteText().with({
                  font: title_font,
                  text: 'Nothing to play',
                  anchor: Anchor.Centre,
                  origin: Anchor.Centre,
                }),
                nonOverflowingContentAnchor: Anchor.Centre,
                padding: MarginPadding.of({ horizontal: 15 }),
              }),
              this.artistMarquee = new MarqueeContainer().with({
                origin: Anchor.TopCentre,
                anchor: Anchor.TopCentre,
                position: new Vector2(0, 45),
                colour: Colour4.White,
                createContent: () => new OsuSpriteText().with({
                  font: artist_font,
                  text: 'Nothing to play',
                  anchor: Anchor.Centre,
                  origin: Anchor.Centre,
                }),
                nonOverflowingContentAnchor: Anchor.Centre,
                padding: MarginPadding.of({ horizontal: 15 }),
              }),
              new Container().with({
                padding: MarginPadding.of({ bottom: progress_height }),
                height: bottom_black_area_height,
                relativeSizeAxes: Axes.X,
                origin: Anchor.BottomCentre,
                anchor: Anchor.BottomCentre,
                children: [
                  new FillFlowContainer<IconButton>().with({
                    autoSizeAxes: Axes.Both,
                    direction: FillDirection.Horizontal,
                    spacing: new Vector2(5),
                    origin: Anchor.Centre,
                    anchor: Anchor.Centre,
                    children: [
                      this.prevButton = new MusicIconButton().with({
                        anchor: Anchor.Centre,
                        origin: Anchor.Centre,
                        action: () => this.musicController.previousTrack(),
                        icon: FontAwesome.Solid.StepBackward,
                      }),
                      this.playButton = new MusicIconButton().with({
                        anchor: Anchor.Centre,
                        origin: Anchor.Centre,
                        scale: new Vector2(Math.fround(1.4)),
                        iconScale: new Vector2(Math.fround(1.4)),
                        action: () => this.musicController.togglePause(),
                        icon: FontAwesome.Regular.PlayCircle,
                      }),
                      this.nextButton = new MusicIconButton().with({
                        anchor: Anchor.Centre,
                        origin: Anchor.Centre,
                        action: () => this.musicController.nextTrack(),
                        icon: FontAwesome.Solid.StepForward,
                      }),
                    ],
                  }),
                  this.shuffleButton = new MusicIconButton().with({
                    anchor: Anchor.CentreLeft,
                    origin: Anchor.Centre,
                    position: new Vector2(bottom_black_area_height / 2, 0),
                    action: () => this.shuffle.toggle(),
                    icon: FontAwesome.Solid.Random,
                  }),
                  this.playlistButton = new MusicIconButton().with({
                    origin: Anchor.Centre,
                    anchor: Anchor.CentreRight,
                    position: new Vector2(-bottom_black_area_height / 2, 0),
                    icon: FontAwesome.Solid.Bars,
                    action: () => this.togglePlaylist(),
                  }),
                ],
              }),
              this.progressBar = new HoverableProgressBar().with({
                origin: Anchor.BottomCentre,
                anchor: Anchor.BottomCentre,
                height: progress_height / 2,
                fillColour: this.colours.yellow,
                backgroundColour: this.colours.yellowDarker.opacity(0.5),
                onSeek: (progress: number) => this.onSeek(progress),
                onCommit: (progress: number) => this.onCommit(progress),
              }),
            ],
          }),
          this.playlistContainer = new Container().with({
            relativeSizeAxes: Axes.X,
            y: player_height + margin,
          }),
        ],
      }),
    ];
  }

  private lastSeekGameTime: number | null = null;
  private lastSeekAudioTargetTime: number | null = null;

  private onSeek(progress: number): void {
    if (!this.musicController.isPlaying || this.lastSeekGameTime === null || this.time.current - this.lastSeekGameTime > NowPlayingOverlay.TRACK_DRAG_SEEK_DEBOUNCE) {
      this.musicController.seekTo(progress);
      this.lastSeekGameTime = this.time.current;
      this.lastSeekAudioTargetTime = progress;
    }
  }

  private onCommit(progress: number): void {
    // Avoid a second seek to the same location, which could occur when using keyboard navigation from `OnSeek` and subsequent `OnCommit` calls.
    if (progress !== this.lastSeekAudioTargetTime)
      this.musicController.seekTo(progress);

    this.lastSeekGameTime = null;
    this.lastSeekAudioTargetTime = null;
  }

  private togglePlaylist(): void {
    if (this.playlist === null) {
      void this.loadComponentAsync(this.playlist = new PlaylistOverlay().with({
        relativeSizeAxes: Axes.Both,
      }), () => {
        const playlist = this.playlist!;

        this.playlistContainer.add(playlist);

        playlist.state.bindValueChanged(s => this.playlistButton.fadeColour(s.newValue === Visibility.Visible ? this.colours.yellow : Colour4.White, 200, Easing.OutQuint), true);

        this.togglePlaylist();
      });

      return;
    }

    if (!this.beatmap.disabled)
      this.playlist.toggleVisibility();
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.beatmap.bindDisabledChanged(() => this.scheduler.addOnce(this.updateEnabledStates));

    this.allowTrackControl = this.musicController.allowTrackControl.getBoundCopy();
    this.allowTrackControl.bindValueChanged(() => this.scheduler.addOnce(this.updateEnabledStates), true);

    this.shuffle.bindTo(this.musicController.shuffle);
    this.shuffle.bindValueChanged(s => this.shuffleButton.fadeColour(s.newValue ? this.colours.yellow : Colour4.White, 200, Easing.OutQuint), true);

    this.musicController.trackChanged.add(this.onTrackChanged);
    this.trackChanged(this.beatmap.value);
  }

  protected override popIn(): void {
    this.fadeIn(transition_length, Easing.OutQuint);
    this.dragContainer.scaleTo(1, transition_length, Easing.OutElasticHalf);
  }

  protected override popOut(): void {
    super.popOut();

    this.fadeOut(transition_length, Easing.OutQuint);
    this.dragContainer.scaleTo(Math.fround(0.9), transition_length, Easing.OutQuint);
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    this.playlistContainer.height = Math.min(this.parent!.drawHeight - margin * 3 - player_height, PlaylistOverlay.PLAYLIST_HEIGHT);

    let height = player_height;

    if (this.playlist !== null) {
      height += this.playlist.drawHeight;
      if (this.playlist.state.value === Visibility.Visible)
        height += margin;
    }

    this.height = this.dragContainer.height = height;
  }

  protected override update(): void {
    super.update();

    if (this.pendingBeatmapSwitch !== null) {
      this.pendingBeatmapSwitch();
      this.pendingBeatmapSwitch = null;
    }

    const track = this.musicController.currentTrack;

    if (!this.progressBar.seeking) {
      if (!track.isDummyDevice) {
        this.progressBar.endTime = track.length;
        this.progressBar.currentTime = track.currentTime;

        this.playButton.icon = track.isRunning ? FontAwesome.Regular.PauseCircle : FontAwesome.Regular.PlayCircle;
      } else {
        this.progressBar.currentTime = 0;
        this.progressBar.endTime = 1;
        this.playButton.icon = FontAwesome.Regular.PlayCircle;
      }
    }
  }

  private pendingBeatmapSwitch: (() => void) | null = null;

  private currentBeatmap: WorkingBeatmap | null = null;

  private readonly onTrackChanged = ([beatmap, direction]: [WorkingBeatmap, TrackChangeDirection]): void => this.trackChanged(beatmap, direction);

  private trackChanged(beatmap: WorkingBeatmap, direction = TrackChangeDirection.None): void {
    this.currentBeatmap = beatmap;

    // avoid using scheduler as our scheduler may not be run for a long time, holding references to beatmaps.
    this.pendingBeatmapSwitch = () => {
      const metadata = beatmap.metadata;

      this.titleMarquee.createContent = () => new OsuSpriteText().with({
        text: romanisable(metadata.titleUnicode, metadata.title),
        font: title_font,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
      });
      this.artistMarquee.createContent = () => new OsuSpriteText().with({
        text: romanisable(metadata.artistUnicode, metadata.artist),
        font: artist_font,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
      });

      // (backgroundLoadCancellation: a superseded load is disposed when it completes, by the check below)
      void this.loadComponentAsync(new Background(beatmap).with({ depth: float_max_value }), newBackground => {
        if (beatmap !== this.currentBeatmap) {
          newBackground.dispose();
          return;
        }

        switch (direction) {
          case TrackChangeDirection.Next:
            newBackground.position = new Vector2(player_width, 0);
            newBackground.moveToX(0, 500, Easing.OutCubic);
            this.background.moveToX(-player_width, 500, Easing.OutCubic);
            break;

          case TrackChangeDirection.Prev:
            newBackground.position = new Vector2(-player_width, 0);
            newBackground.moveToX(0, 500, Easing.OutCubic);
            this.background.moveToX(player_width, 500, Easing.OutCubic);
            break;
        }

        this.background.expire();
        this.background = newBackground;

        this.playerContainer.add(newBackground);
      });
    };
  }

  private readonly updateEnabledStates = (): void => {
    const beatmapDisabled = this.beatmap.disabled;
    const trackControlDisabled = !this.musicController.allowTrackControl.value;

    if (beatmapDisabled || trackControlDisabled)
      this.playlist?.hide();

    this.prevButton.enabled.value = !beatmapDisabled && !trackControlDisabled;
    this.nextButton.enabled.value = !beatmapDisabled && !trackControlDisabled;
    this.playlistButton.enabled.value = !beatmapDisabled && !trackControlDisabled;
    this.playButton.enabled.value = !trackControlDisabled;
  };

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    this.musicController?.trackChanged.remove(this.onTrackChanged);
  }
}

/** (NowPlayingOverlay.MusicIconButton) */
class MusicIconButton extends IconButton {
  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.hoverColour = colours.yellowDark.opacity(0.6);
    this.clickFlashColour = colours.yellow;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // works with AutoSizeAxes above to make buttons autosize with the scale animation.
    this.content.autoSizeAxes = Axes.None;
    this.content.size = new Vector2(IconButton.DEFAULT_BUTTON_SIZE);
  }
}

/** (NowPlayingOverlay.Background) */
class Background extends BufferedContainer {
  private readonly sprite: Sprite;
  private readonly beatmap: WorkingBeatmap;

  constructor(beatmap: WorkingBeatmap) {
    super({ cachedFrameBuffer: true });

    this.beatmap = beatmap;

    this.depth = float_max_value;
    this.relativeSizeAxes = Axes.Both;

    this.children = [
      this.sprite = new Sprite().with({
        relativeSizeAxes: Axes.Both,
        colour: OsuColour.grayByte(150),
        fillMode: FillMode.Fill,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
      }),
      new Box().with({
        relativeSizeAxes: Axes.X,
        height: bottom_black_area_height,
        origin: Anchor.BottomCentre,
        anchor: Anchor.BottomCentre,
        colour: Colour4.Black.opacity(0.5),
      }),
    ];
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const textures = dependencies.resolve(LargeTextureStore);

    this.sprite.texture = await this.beatmap.getBackground() ?? await textures.get('Backgrounds/bg2');
  }
}

/** (NowPlayingOverlay.DragContainer) */
class DragContainer extends Container {
  protected override onDragStart(_e: DragStartEvent): boolean {
    return true;
  }

  protected override onDrag(e: DragEvent): void {
    let change = e.mousePosition.sub(e.mouseDownPosition);

    // Diminish the drag distance as we go further to simulate "rubber band" feeling.
    const length = change.length;
    change = change.mul(length <= 0 ? 0 : Math.fround(Math.pow(length, 0.7)) / length);

    this.moveTo(change);
  }

  protected override onDragEnd(e: DragEndEvent): void {
    this.moveTo(Vector2.Zero, 800, Easing.OutElastic);
    super.onDragEnd(e);
  }
}

/** (NowPlayingOverlay.HoverableProgressBar) */
class HoverableProgressBar extends ProgressBar {
  override get handleNonPositionalInput(): boolean {
    return this.isHovered;
  }

  constructor() {
    super(true);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.resizeHeightTo(progress_height, 500, Easing.OutQuint);
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.resizeHeightTo(progress_height / 2, 500, Easing.OutQuint);
    super.onHoverLost(e);
  }
}
