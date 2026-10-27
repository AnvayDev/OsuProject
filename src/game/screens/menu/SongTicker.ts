// Ported from osu.Game/Screens/Menu/SongTicker.cs
// RomanisableString: the framework's ShowUnicode setting defaults to false, so the romanised metadata is preferred, falling back to the
// unicode metadata when it is empty (there is no settings overlay to change it yet).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';

const fade_duration = 800;

const romanisable = (original: string, romanised: string): string => romanised !== '' ? romanised : original;

export class SongTicker extends Container {
  private beatmap!: Bindable<WorkingBeatmap>;

  private readonly title: OsuSpriteText;
  private readonly artist: OsuSpriteText;

  override get isPresent(): boolean {
    return super.isPresent || this.scheduler.hasPendingTasks;
  }

  constructor() {
    super();

    let title!: OsuSpriteText;
    let artist!: OsuSpriteText;

    this.autoSizeAxes = Axes.Both;
    this.internalChildren = [
      new Container().with({
        anchor: Anchor.TopRight,
        origin: Anchor.TopRight,
        position: new Vector2(5, -5),
        padding: new MarginPadding(-5),
        relativeSizeAxes: Axes.Both,
        children: [
          new CircularContainer().with({
            relativeSizeAxes: Axes.Both,
            masking: true,
            edgeEffect: new EdgeEffectParameters({
              radius: 75,
              type: EdgeEffectType.Shadow,
              colour: OsuColour.gray(Math.fround(0.04)).opacity(Math.fround(0.3)),
            }),
            children: [
              new Box().with({
                relativeSizeAxes: Axes.Both,
                alwaysPresent: true,
                alpha: 0,
              }),
            ],
          }),
        ],
      }),
      new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Vertical,
        spacing: new Vector2(0, 3),
        children: [
          title = new OsuSpriteText().with({
            anchor: Anchor.TopRight,
            origin: Anchor.TopRight,
            font: OsuFont.getFont({ size: 24, weight: FontWeight.Light, italics: true }),
          }),
          artist = new OsuSpriteText().with({
            anchor: Anchor.TopRight,
            origin: Anchor.TopRight,
            font: OsuFont.getFont({ size: 16 }),
          }),
        ],
      }),
    ];

    this.title = title;
    this.artist = artist;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.beatmap.bindValueChanged(() => this.scheduler.addOnce(this.showMetadata), true);
  }

  // C#'s private show() (renamed: Drawable.show() is Show()); a field so that Scheduler.AddOnce sees the same delegate each time.
  private readonly showMetadata = (): void => {
    const metadata = this.beatmap.value.metadata;

    this.title.text = romanisable(metadata.titleUnicode, metadata.title);
    this.artist.text = romanisable(metadata.artistUnicode, metadata.artist);

    this.fadeInFromZero(fade_duration / 2)
      .delay(4000)
      .then().fadeOut(fade_duration);
  };
}
