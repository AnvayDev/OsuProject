// Ported from osu.Game/OsuGameBase.cs
// The core of the game minus its UI: resources, config, the beatmap data layer, the global Beatmap/Ruleset bindables and the music controller.
// Not ported (online, gameplay, skinning or not needed yet): API access and spectator/multiplayer/metadata clients, scores, skins, the
// difficulty cache, the ruleset config cache, key binding store, GlobalActionContainer, GlobalCursorDisplay, OsuTooltipContainer, the safe area
// container and the beatmap clock. The content chain is CreateScalingContainer() → content.
// Storage is window.localStorage (config) and IndexedDB (RealmAccess).

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AdjustableProperty } from '@fw/audio/AudioComponent';
import { Bindable } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { NonNullableBindable } from '@fw/bindables/NonNullableBindable';
import { ASSET_ROOT, Game } from '@fw/Game';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import { NamespacedResourceStore, OnlineStore, UrlResourceStore } from '@fw/io/ResourceStore';
import { Axes } from '@fw/layout/Enums';
import { Logger } from '@fw/logging/Logger';
import type { GameHost } from '@fw/platform/GameHost';
import type { ValueChangedEvent } from '@fw/bindables/Bindable';
import { BeatmapManager } from './beatmaps/BeatmapManager';
import { BeatmapUpdater } from './beatmaps/BeatmapUpdater';
import { DummyWorkingBeatmap } from './beatmaps/DummyWorkingBeatmap';
import type { WorkingBeatmap } from './beatmaps/WorkingBeatmap';
import { OsuConfigManager } from './configuration/OsuConfigManager';
import { SessionStatics } from './configuration/SessionStatics';
import { RealmAccess } from './database/RealmAccess';
import { OsuColour } from './graphics/OsuColour';
import { MusicController } from './overlays/MusicController';
import { type RulesetInfo, RulesetStore } from './rulesets/RulesetInfo';

/** The most basic Game that can be used to host osu! components and systems. Unlike OsuGame, this class will not load any kind of UI. */
export class OsuGameBase extends Game {
  static readonly GAME_NAME = 'osu!';

  /** The maximum volume at which audio tracks should play back at. This can be set lower than 1 to create some head-room for sound effects. */
  private static readonly global_track_volume_adjust = 0.8;

  static readonly SAMPLE_CONCURRENCY = 6;

  protected localConfig!: OsuConfigManager;

  protected beatmapManager!: BeatmapManager;

  protected beatmapUpdater!: BeatmapUpdater;

  protected musicController!: MusicController;

  protected colours!: OsuColour;

  protected sessionStatics!: SessionStatics;

  protected realm!: RealmAccess;

  /** The global working beatmap (NonNullableBindable: it falls back to the dummy beatmap). Cached as Bindable 'WorkingBeatmap'. */
  beatmap!: Bindable<WorkingBeatmap>;

  /** The current ruleset selection for the local user. Cached as Bindable 'RulesetInfo'. */
  readonly ruleset = new Bindable<RulesetInfo>();

  private osuContent: Container | null = null;

  protected override get content(): Container<Drawable> {
    return this.osuContent ?? super.content;
  }

  /** The dependencies OsuGameBase and its subclasses cache into (C#'s private `dependencies`, shared with OsuGame). */
  protected osuDependencies!: DependencyContainer;

  private readonly globalTrackVolumeAdjust = new BindableDouble(OsuGameBase.global_track_volume_adjust);

  constructor() {
    super();

    this.name = OsuGameBase.GAME_NAME;
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    this.osuDependencies = new DependencyContainer(super.createChildDependencies(parent));

    // [Cached(typeof(OsuGameBase))]
    this.osuDependencies.cacheAs(OsuGameBase, this);

    return this.osuDependencies;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.resources.addStore(await UrlResourceStore.fromManifest(`${ASSET_ROOT}/osu.Game.Resources`));

    this.osuDependencies.cache(this.realm = await RealmAccess.open());

    const largeStore = new LargeTextureStore(new NamespacedResourceStore(this.resources, 'Textures'));
    largeStore.addTextureSource(new OnlineStore());
    this.osuDependencies.cache(largeStore);

    this.osuDependencies.cacheAs(OsuConfigManager, this.localConfig);

    this.audio.samples.playbackConcurrency = OsuGameBase.SAMPLE_CONCURRENCY;

    const defaultBeatmap = new DummyWorkingBeatmap(this.audio, this.textures);

    this.osuDependencies.cache(this.beatmapManager = new BeatmapManager(this.realm, this.audio, defaultBeatmap));

    this.osuDependencies.cacheAs(BeatmapUpdater, this.beatmapUpdater = this.createBeatmapUpdater());

    this.beatmapManager.processBeatmap = (beatmapSet, scope) => this.beatmapUpdater.process(beatmapSet, scope);

    this.osuDependencies.cache(this.sessionStatics = new SessionStatics());
    this.osuDependencies.cache(this.colours = new OsuColour());

    // Add after all the above cache operations as it depends on them.
    this.audio.tracks.addAdjustment(AdjustableProperty.Volume, this.globalTrackVolumeAdjust);

    this.beatmap = new NonNullableBindable<WorkingBeatmap>(defaultBeatmap);

    this.osuDependencies.cacheAs(Bindable<WorkingBeatmap>, this.beatmap, 'WorkingBeatmap');
    this.osuDependencies.cacheAs(Bindable<RulesetInfo>, this.ruleset, 'RulesetInfo');

    super.content.add(this.musicController = new MusicController());
    this.osuDependencies.cacheAs(MusicController, this.musicController);

    const scalingContainer = this.createScalingContainer();
    scalingContainer.add(this.osuContent = new Container().with({ relativeSizeAxes: Axes.Both }));
    super.content.add(scalingContainer);

    this.ruleset.bindValueChanged(r => this.onRulesetChanged(r));
    this.beatmap.bindValueChanged(b => this.onBeatmapChanged(b));
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // (OsuGame.LoadComplete selects the configured ruleset, falling back to the first available one; there is no ruleset setting yet.)
    this.ruleset.value = RulesetStore.availableRulesets[0];
  }

  protected createScalingContainer(): Container {
    return new Container().with({ relativeSizeAxes: Axes.Both });
  }

  protected createBeatmapUpdater(): BeatmapUpdater {
    return new BeatmapUpdater(this.beatmapManager);
  }

  override setHost(host: GameHost): void {
    super.setHost(host);

    this.localConfig ??= new OsuConfigManager(window.localStorage);
  }

  private onBeatmapChanged(beatmap: ValueChangedEvent<WorkingBeatmap>): void {
    Logger.log(`Game-wide working beatmap updated to ${beatmap.newValue}`);
  }

  /** Rejects a change to an unavailable ruleset (the available mods, which C# rebuilds here, are not ported). */
  private onRulesetChanged(r: ValueChangedEvent<RulesetInfo>): void {
    if (r.newValue?.available !== true) {
      // reject the change if the ruleset is not available.
      this.ruleset.value = r.oldValue?.available === true ? r.oldValue : RulesetStore.availableRulesets[0];
    }
  }
}
