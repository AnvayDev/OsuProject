// Ported from osu.Game/Overlays/Music/PlaylistOverlay.cs
// Web: beatmap sets are detached objects rather than Live<BeatmapSetInfo>.

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { BindableList } from '@fw/bindables/BindableList';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { type ChangeSet, RealmAccess } from '../../database/RealmAccess';
import { OsuColour } from '../../graphics/OsuColour';
import { Playlist } from './Playlist';

const transition_duration = 600;

export class PlaylistOverlay extends VisibilityContainer {
  readonly selectedSet = new Bindable<BeatmapSetInfo | null>(null);

  static readonly PLAYLIST_HEIGHT = 510;

  private readonly beatmapSets = new BindableList<BeatmapSetInfo>();

  private readonly beatmap = new Bindable<WorkingBeatmap>(null!);

  private beatmaps!: BeatmapManager;

  private realm!: RealmAccess;

  private beatmapSubscription: { dispose(): void } | null = null;

  private list!: Playlist;

  // [Cached]
  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cache(this);
    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    this.beatmaps = dependencies.resolve(BeatmapManager);
    this.realm = dependencies.resolve(RealmAccess);

    this.beatmap.bindTo(dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap'));

    this.children = [
      new Container().with({
        relativeSizeAxes: Axes.Both,
        cornerRadius: 5,
        masking: true,
        edgeEffect: new EdgeEffectParameters({
          type: EdgeEffectType.Shadow,
          colour: Colour4.Black.opacityByte(40),
          radius: 5,
        }),
        children: [
          new Box().with({
            colour: colours.gray3,
            relativeSizeAxes: Axes.Both,
          }),
          this.list = new Playlist().with({
            relativeSizeAxes: Axes.Both,
            padding: MarginPadding.of({ vertical: 10, right: 10 }),
          }),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.beatmapSubscription = this.realm.registerForNotifications(all => all.filter(s => !s.deletePending && !s.isProtected), (sender, changes) => this.beatmapsChanged(sender, changes));

    this.list.rowData.bindTo(this.beatmapSets);
    this.beatmap.bindValueChanged((working: ValueChangedEvent<WorkingBeatmap>) => this.selectedSet.value = working.newValue.beatmapSetInfo, true);
  }

  private beatmapsChanged(sender: readonly BeatmapSetInfo[], changes: ChangeSet | null): void {
    if (changes === null) {
      this.beatmapSets.clear();
      // must use AddRange to avoid RearrangeableList sort overhead per add op.
      this.beatmapSets.addRange(sender);
      return;
    }

    for (const i of changes.insertedIndices)
      this.beatmapSets.insert(i, sender[i]);

    for (const i of [...changes.deletedIndices].sort((a, b) => b - a))
      this.beatmapSets.removeAt(i);
  }

  protected override popIn(): void {
    this.resizeTo(new Vector2(1, (this.relativeSizeAxes & Axes.Y) !== 0 ? 1 : PlaylistOverlay.PLAYLIST_HEIGHT), transition_duration, Easing.OutQuint);
    this.fadeIn(transition_duration, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.resizeTo(new Vector2(1, 0), transition_duration, Easing.OutQuint);
    this.fadeOut(transition_duration);
  }

  itemSelected(beatmapSet: BeatmapSetInfo): void {
    if (beatmapSet.equals(this.beatmap.value?.beatmapSetInfo ?? null)) {
      this.beatmap.value?.track.seek(0);
      return;
    }

    this.beatmap.value = this.beatmaps.getWorkingBeatmap(beatmapSet.beatmaps[0]);
    this.beatmap.value.track.restart();
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.beatmapSubscription?.dispose();
  }
}
