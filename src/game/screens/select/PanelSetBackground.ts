// Ported from osu.Game/Screens/Select/PanelSetBackground.cs
// The carousel is resolved as the generic Carousel (see Panel.ts). WorkingBeatmap.getPanelBackground() is asynchronous here, so
// PanelBeatmapBackground loads it in its (asynchronous) load. LoadComponentAsync has no cancellation token: a cancelled load is dropped on arrival.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { Anchor, Axes, FillDirection, FillMode } from '@fw/layout/Enums';
import { intersects } from '@fw/layout/Primitives';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { Carousel } from '../../graphics/carousel/Carousel';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { Panel } from './Panel';

export class PanelBeatmapBackground extends Sprite {
  private readonly working: WorkingBeatmap;

  constructor(working: WorkingBeatmap) {
    super();

    this.working = working;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.texture = await this.working.getPanelBackground();
  }
}

export class PanelSetBackground extends Container {
  private beatmapCarousel: Carousel<unknown> | null = null;

  private sprite: Sprite | null = null;

  private working: WorkingBeatmap | null = null;

  private loadCancellation: { cancelled: boolean } | null = null;

  private timeSinceUnpool = 0;

  get beatmap(): WorkingBeatmap | null {
    return this.working;
  }

  set beatmap(value: WorkingBeatmap | null) {
    if (this.working === null && value === null)
      return;

    // this guard papers over excessive refreshes of the background asset which occur if `working == value` type guards are used.
    // the root cause of why `working == value` type guards fail here is that `SongSelect` will invalidate working beatmaps very often,
    // due to a variety of causes, ranging from "someone typed a letter in the search box" (which triggers a refilter -> presentation of new items -> `ensureGlobalBeatmapValid()`),
    // to "someone just went into the editor and replaced every single file in the set, including the background".
    // the following guard approximates the most appropriate debounce criterion, which is the contents of the actual asset that is supposed to be displayed in the background,
    // i.e. if the hash of the new background file matches the old, then we do not bother updating the working beatmap here.
    //
    // note that this is basically a reimplementation of the caching scheme in `WorkingBeatmapCache.getBackgroundFromStore()`,
    // which cannot be used directly by retrieving the texture and checking texture reference equality,
    // because missing the cache would incur a synchronous texture load on the update thread.
    if (PanelSetBackground.getBackgroundFileHash(this.working) === PanelSetBackground.getBackgroundFileHash(value))
      return;

    this.working = value;

    if (this.loadCancellation !== null)
      this.loadCancellation.cancelled = true;
    this.loadCancellation = null;

    this.sprite?.expire();
    this.sprite = null;

    this.timeSinceUnpool = 0;
  }

  private static getBackgroundFileHash(working: WorkingBeatmap | null): string | null {
    return working?.beatmapSetInfo.getFile(working.metadata.backgroundFile)?.file.hash ?? null;
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;
    this.cornerRadius = Panel.CORNER_RADIUS;
    this.masking = true;

    // Add some level of smoothness around the rounded edges to give more visual polish (make it anti-aliased).
    this.maskingSmoothness = 2;
  }

  protected override update(): void {
    super.update();

    this.loadContentIfRequired();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmapCarousel = dependencies.get(Carousel);
    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.internalChildren = [
      new Box().with({
        depth: 1,
        relativeSizeAxes: Axes.Both,
        colour: ColourInfo.gradientHorizontal(colourProvider.background3, colourProvider.background4),
      }),
      new FillFlowContainer().with({
        depth: -1,
        relativeSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
        // This makes the gradient not be perfectly horizontal, but diagonal at a ~40° angle
        shear: new Vector2(0.8, 0),
        children: [
          // The left half with no gradient applied
          new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: Colour4.Black.opacity(0.5),
            width: 0.4,
          }),
          new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: ColourInfo.gradientHorizontal(Colour4.Black.opacity(0.5), Colour4.Black.opacity(0.3)),
            width: 0.2,
          }),
          new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: ColourInfo.gradientHorizontal(Colour4.Black.opacity(0.3), Colour4.Black.opacity(0.2)),
            // Slightly more than 1.0 in total to account for shear.
            width: 0.45,
          }),
        ],
      }),
    ];

    return r;
  }

  private loadContentIfRequired(): void {
    // A load is already in progress if the cancellation token is non-null.
    if (this.loadCancellation !== null || this.working === null)
      return;

    if (this.beatmapCarousel !== null) {
      const containingSsdq = this.beatmapCarousel.screenSpaceDrawQuad;

      // One may ask why we are not using `DelayedLoadWrapper` for this delayed load logic.
      //
      // - Using `DelayedLoadWrapper` would only allow us to load content when on screen, but we want to preload while panels are off-screen.
      //   This allows a more seamless experience when a user is scrolling at a moderate speed, as we are loading in backgrounds before they
      //   enter the visible viewport.
      // - By using a slightly customised formula to decide when to start the load, we can coerce the loading of backgrounds into an order that
      //   prioritises panels which are closest to the centre of the screen. Basically, we want to load backgrounds "outwards" from the visual
      //   centre to give the user the best experience possible.
      const timeUpdatingBeforeLoad = Math.fround(Math.abs(containingSsdq.centre.y - this.screenSpaceDrawQuad.centre.y) / containingSsdq.height * 100);

      this.timeSinceUnpool += this.time.elapsed;

      // We only trigger a load after this set has been in an updating state for a set amount of time.
      if (this.timeSinceUnpool <= timeUpdatingBeforeLoad)
        return;
    }

    const cancellation = this.loadCancellation = { cancelled: false };

    void this.loadComponentAsync(new PanelBeatmapBackground(this.working).with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      fillMode: FillMode.Fill,
    }), s => {
      if (cancellation.cancelled) {
        s.dispose();
        return;
      }

      this.addInternal(this.sprite = s);
      const spriteOnScreen = this.beatmapCarousel === null || intersects(this.beatmapCarousel.screenSpaceDrawQuad, s.screenSpaceDrawQuad);
      s.fadeInFromZero(spriteOnScreen ? 400 : 0, Easing.OutQuint);
    });
  }
}
