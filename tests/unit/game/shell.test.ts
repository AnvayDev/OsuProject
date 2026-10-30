// The game shell against the osu! source: OsuConfigManager/IniConfigManager persistence (IniConfigManager.cs), BackgroundScreenStack and
// OsuScreen background ownership (BackgroundScreenStack.cs, OsuScreen.cs), BackgroundScreen's scale (BackgroundScreen.cs:52), MusicController
// track changes (MusicController.cs), DrawableTrack volume transforms, ScalingContainer's draw size and OsuColour's star spectrum.

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { TrackVirtual } from '@fw/audio/track/TrackVirtual';
import { Bindable } from '@fw/bindables/Bindable';
import { NonNullableBindable } from '@fw/bindables/NonNullableBindable';
import { Game } from '@fw/Game';
import { DrawableTrack } from '@fw/graphics/audio/DrawableTrack';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { UserInputManager } from '@fw/input/InputManager';
import { ResourceStore } from '@fw/io/ResourceStore';
import { Vector2 } from '@fw/layout/Vector2';
import { AudioThread } from '@fw/platform/AudioThread';
import { BeatmapManager } from '@game/beatmaps/BeatmapManager';
import { BeatmapUpdater } from '@game/beatmaps/BeatmapUpdater';
import { BeatmapUpdaterMetadataLookup } from '@game/beatmaps/BeatmapUpdaterMetadataLookup';
import { DummyWorkingBeatmap } from '@game/beatmaps/DummyWorkingBeatmap';
import '@game/beatmaps/formats/LegacyBeatmapDecoder';
import type { WorkingBeatmap } from '@game/beatmaps/WorkingBeatmap';
import { IntroSequence } from '@game/configuration/IntroSequence';
import { ToolbarClockDisplayMode } from '@game/configuration/ToolbarClockDisplayMode';
import { OsuConfigManager, OsuSetting } from '@game/configuration/OsuConfigManager';
import { ImportTask } from '@game/database/ImportTask';
import { RealmAccess } from '@game/database/RealmAccess';
import { ScalingContainer } from '@game/graphics/containers/ScalingContainer';
import { OsuColour } from '@game/graphics/OsuColour';
import { MusicController, TrackChangeDirection } from '@game/overlays/MusicController';
import type { RulesetInfo } from '@game/rulesets/RulesetInfo';
import { RulesetStore } from '@game/rulesets/RulesetInfo';
import { BackgroundScreen } from '@game/screens/BackgroundScreen';
import { BackgroundScreenStack } from '@game/screens/BackgroundScreenStack';
import { OsuScreen } from '@game/screens/OsuScreen';
import { OsuScreenStack } from '@game/screens/OsuScreenStack';
import { TestClock } from '../framework/testHost';

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, value); }
}

function fakeNode(): AudioNode {
  const node = { connect: () => node, disconnect: () => {}, gain: { value: 1 }, pan: { value: 0 } };
  return node as unknown as AudioNode;
}

const context = { destination: fakeNode(), createGain: fakeNode, createStereoPanner: fakeNode, createMediaElementSource: fakeNode } as unknown as BaseAudioContext;

const resource = (file: string) => new Uint8Array(fs.readFileSync(path.resolve(file)));

let dbCounter = 0;

/** A root container standing in for OsuGameBase's dependencies, stepped manually. */
async function setup() {
  const realm = await RealmAccess.open(`shell-test-${dbCounter++}`);
  const audio = new AudioManager(new AudioThread(), new ResourceStore(), new ResourceStore(), null, context);
  const defaultBeatmap = new DummyWorkingBeatmap(audio, null);
  const manager = new BeatmapManager(realm, audio, defaultBeatmap);
  const updater = new BeatmapUpdater(manager, new BeatmapUpdaterMetadataLookup({ tryLookup: async () => null }));
  manager.processBeatmap = (set, scope) => updater.process(set, scope);

  const config = new OsuConfigManager(new MemoryStorage());
  const beatmap = new NonNullableBindable<WorkingBeatmap>(defaultBeatmap);
  const ruleset = new Bindable<RulesetInfo>(RulesetStore.availableRulesets[0]);
  const music = new MusicController();

  const deps = new DependencyContainer();
  deps.cacheAs(Game, Object.create(Game.prototype) as Game);
  deps.cache(realm);
  deps.cache(audio);
  deps.cache(manager);
  deps.cache(config);
  deps.cacheAs(Bindable<WorkingBeatmap>, beatmap, 'WorkingBeatmap');
  deps.cacheAs(Bindable<RulesetInfo>, ruleset, 'RulesetInfo');
  deps.cache(music);

  const clock = new TestClock();
  // ParallaxContainer reads the mouse position from its containing InputManager.
  const root = new UserInputManager(() => [], () => true).with({ size: new Vector2(1389, 868) });
  root.clock = clock;
  root.loadDrawable(clock, deps);
  root.add(music);

  const frame = (ms = 16) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    root.updateSubTree();
  };

  // loadComponentAsync loads in a microtask and reports back on the scheduler.
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r));
      frame();
    }
  };

  frame();

  return { realm, audio, manager, config, beatmap, music, root, frame, settle };
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  // jsdom has no Web Audio; AudioManager only checks the context's type.
  vi.stubGlobal('AudioContext', class {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OsuConfigManager', () => {
  it.each([
    ToolbarClockDisplayMode.Full,
    ToolbarClockDisplayMode.DigitalWithRuntime,
    ToolbarClockDisplayMode.Digital,
    ToolbarClockDisplayMode.Analog,
  ])('keeps clock mode %s numeric after saving and reloading', mode => {
    const storage = new MemoryStorage();
    const config = new OsuConfigManager(storage);
    config.setValue(OsuSetting.ToolbarClockDisplayMode, mode);
    config.save();

    const reloaded = new OsuConfigManager(storage);
    expect(reloaded.get(OsuSetting.ToolbarClockDisplayMode)).toBe(mode);
  });

  it('writes "key = value" lines on save and reads them back', () => {
    const storage = new MemoryStorage();
    const config = new OsuConfigManager(storage);

    expect(config.get<number>(OsuSetting.DimLevel)).toBe(0.7);
    expect(config.get<IntroSequence>(OsuSetting.IntroSequence)).toBe(IntroSequence.Triangles);

    config.setValue(OsuSetting.DimLevel, 0.5);
    config.setValue(OsuSetting.IntroSequence, IntroSequence.Circles);
    config.setValue(OsuSetting.MenuVoice, false);
    expect(config.save()).toBe(true);

    const text = storage.getItem('game.ini')!;
    expect(text).toContain('DimLevel = 0.5\n');
    expect(text).toContain('IntroSequence = Circles\n');
    expect(text).toContain('MenuVoice = false\n');

    const reloaded = new OsuConfigManager(storage);
    expect(reloaded.get<number>(OsuSetting.DimLevel)).toBe(0.5);
    expect(reloaded.get<IntroSequence>(OsuSetting.IntroSequence)).toBe(IntroSequence.Circles);
    expect(reloaded.get<boolean>(OsuSetting.MenuVoice)).toBe(false);
  });

  it('clamps parsed values, ignores unknown keys and logs unparsable ones (C# writes True/False)', () => {
    const storage = new MemoryStorage();
    storage.setItem('game.ini', 'DimLevel = 3\n# comment\nNotASetting = 1\nBlurLevel = abc\nMenuMusic = False\nUIScale = 1.2\n');

    const config = new OsuConfigManager(storage);

    expect(config.get<number>(OsuSetting.DimLevel)).toBe(1);
    expect(config.get<number>(OsuSetting.BlurLevel)).toBe(0);
    expect(config.get<boolean>(OsuSetting.MenuMusic)).toBe(false);
    expect(config.get<number>(OsuSetting.UIScale)).toBeCloseTo(1.2, 5);
  });

  it('getBindable returns a bound copy', () => {
    const config = new OsuConfigManager(new MemoryStorage());
    const dim = config.getBindable<number>(OsuSetting.DimLevel);

    config.setValue(OsuSetting.DimLevel, 0.25);
    expect(dim.value).toBe(0.25);

    dim.value = 0.4;
    expect(config.get<number>(OsuSetting.DimLevel)).toBe(0.4);
  });
});

describe('NonNullableBindable', () => {
  it('rejects null and keeps its type for bound copies', () => {
    const b = new NonNullableBindable<object>({});

    expect(() => b.value = null as unknown as object).toThrow();
    expect(b.getBoundCopy()).toBeInstanceOf(NonNullableBindable);
  });
});

class TestBackground extends BackgroundScreen {
  constructor() {
    super();
  }
}

class OtherBackground extends BackgroundScreen {
  constructor() {
    super();
  }
}

class TestScreen extends OsuScreen {
  constructor(private readonly backgroundFactory: (() => BackgroundScreen) | null = null, private readonly parallax = 1) {
    super();
  }

  override get backgroundParallaxAmount() {
    return this.parallax;
  }

  protected override createBackground() {
    return this.backgroundFactory?.() ?? null;
  }
}

describe('BackgroundScreenStack', () => {
  it('skips the entry animation for the first screen and refuses an equal screen', async () => {
    const { root, settle } = await setup();
    const stack = new BackgroundScreenStack();
    root.add(stack);

    expect(stack.push(null)).toBe(false);

    const first = new TestBackground();
    expect(stack.push(first)).toBe(true);
    expect(first.animateEntry).toBe(false);
    await settle();

    const equal = new TestBackground();
    expect(stack.push(equal)).toBe(false);
    expect(stack.currentScreen).toBe(first);

    const other = new OtherBackground();
    expect(stack.push(other)).toBe(true);
    expect(other.animateEntry).toBe(true);
  });

  it('scales backgrounds to hide the 50 unit horizontal movement', async () => {
    const { root, settle, frame } = await setup();
    const stack = new BackgroundScreenStack();
    root.add(stack);

    const bg = new TestBackground();
    stack.push(bg);
    await settle();
    frame();

    expect(bg.scale.x).toBeCloseTo(1 + 50 / 1389 * 2, 6);
  });
});

describe('OsuScreen', () => {
  it('pushes the background it creates, reuses an equal one, and exits only the one it owns', async () => {
    const { root, settle } = await setup();
    const stack = new OsuScreenStack();
    root.add(stack);
    await settle();

    const backgrounds = (stack as unknown as { backgroundScreenStack: BackgroundScreenStack }).backgroundScreenStack;

    const a = new TestScreen(() => new TestBackground());
    stack.push(a);
    await settle();
    const aBackground = backgrounds.currentScreen;
    expect(aBackground).toBeInstanceOf(TestBackground);

    // Same background type: the new instance is not pushed (and is disposed), the existing one stays.
    let bBackground: BackgroundScreen | null = null;
    const b = new TestScreen(() => bBackground = new TestBackground());
    a.push(b);
    await settle();
    expect(backgrounds.currentScreen).toBe(aBackground);
    expect(bBackground!.isDisposed).toBe(true);

    const c = new TestScreen(() => new OtherBackground());
    b.push(c);
    await settle();
    expect(backgrounds.currentScreen).toBeInstanceOf(OtherBackground);

    c.exit();
    expect(backgrounds.currentScreen).toBe(aBackground);

    b.exit();
    expect(backgrounds.currentScreen).toBe(aBackground);
  });

  it('sets the parallax from the current screen', async () => {
    const { root, settle } = await setup();
    const stack = new OsuScreenStack();
    root.add(stack);
    await settle();

    const parallax = () => (stack as unknown as { parallaxAmount: number }).parallaxAmount;

    const a = new TestScreen(null, 0.5);
    stack.push(a);
    await settle();
    expect(parallax()).toBeCloseTo(0.02 * 0.5, 6);

    const b = new TestScreen(null, 2);
    a.push(b);
    await settle();
    expect(parallax()).toBeCloseTo(0.02 * 2, 6);

    b.exit();
    expect(parallax()).toBeCloseTo(0.02 * 0.5, 6);
  });

  it('shares the global beatmap through its dependencies', async () => {
    const { root, settle, beatmap } = await setup();
    const stack = new OsuScreenStack();
    root.add(stack);
    await settle();

    const a = new TestScreen();
    stack.push(a);
    await settle();

    expect(a.beatmap.value).toBe(beatmap.value);
    expect(a.beatmap).not.toBe(beatmap);
  });
});

describe('MusicController', () => {
  const importSets = async (manager: BeatmapManager) => {
    for (const file of ['circles.osz', 'triangles.osz'])
      await manager.importTask(new ImportTask(resource(`_reference/osu-resources/osu.Game.Resources/Tracks/${file}`), file));
  };

  it('wraps the global beatmap\'s track and follows beatmap changes', async () => {
    const { music, beatmap, manager, frame } = await setup();

    expect(music.currentTrack).toBeInstanceOf(DrawableTrack);
    expect(music.currentTrack.length).toBe(1000);
    expect(music.currentTrack.isDummyDevice).toBe(true);

    await importSets(manager);

    const changes: TrackChangeDirection[] = [];
    music.trackChanged.add(([, direction]) => changes.push(direction));

    const circles = manager.queryBeatmapSet(s => s.beatmaps[0].metadata.title === 'circles!')!;
    beatmap.value = manager.getWorkingBeatmap(circles.beatmaps[0]);
    frame();

    // The dummy's set is not in the playlist, so it counts as after the last set (MusicController.cs, TakeWhile(...).Count()).
    expect(changes).toEqual([TrackChangeDirection.Prev]);
    expect(music.currentTrack.isDummyDevice).toBe(false);
  });

  it('steps through the playlist in order when shuffle is off', async () => {
    const { music, beatmap, manager, frame } = await setup();
    await importSets(manager);
    music.shuffle.value = false;

    const titles = () => beatmap.value.metadata.title;
    const changes: TrackChangeDirection[] = [];
    music.trackChanged.add(([, direction]) => changes.push(direction));

    // The dummy is not in the playlist, so "next" starts from the first set.
    music.nextTrack();
    frame();
    expect(titles()).toBe('circles!');

    music.nextTrack();
    frame();
    expect(titles()).toBe('triangles');

    // Wraps around.
    music.nextTrack();
    frame();
    expect(titles()).toBe('circles!');

    // Before restart_cutoff_point, "previous" goes to the previous set (wrapping to the last).
    music.previousTrack();
    frame();
    expect(titles()).toBe('triangles');

    expect(changes).toEqual([TrackChangeDirection.Next, TrackChangeDirection.Next, TrackChangeDirection.Next, TrackChangeDirection.Prev]);
  });

  it('does not change track while the global beatmap is leased', async () => {
    const { music, beatmap, manager, frame } = await setup();
    await importSets(manager);

    const lease = beatmap.beginLease(false);
    music.nextTrack();
    frame();
    expect(beatmap.value).toBe(manager.defaultBeatmap);

    lease.return();
    music.nextTrack();
    frame();
    expect(beatmap.value).not.toBe(manager.defaultBeatmap);
  });

  it('resolves a bound copy of the global beatmap, so disposing it leaves the global bindable bound', async () => {
    const { music, beatmap, manager } = await setup();
    await importSets(manager);

    const observer = beatmap.getBoundCopy();
    music.dispose();

    const working = manager.getWorkingBeatmap(manager.queryBeatmapSet(() => true)!.beatmaps[0]);
    beatmap.value = working;
    expect(observer.value).toBe(working);
  });

  it('fades the old track out over 150 ms and the new one in over 220 ms after 30 ms', async () => {
    const { music, beatmap, manager, frame } = await setup();
    await importSets(manager);

    const first = music.currentTrack;
    beatmap.value = manager.getWorkingBeatmap(manager.queryBeatmapSet(() => true)!.beatmaps[0]);
    frame(0);

    const second = music.currentTrack;
    expect(second).not.toBe(first);
    expect(second.volume.value).toBe(0);

    frame(30 + 110);
    expect(second.volume.value).toBeCloseTo(0.5, 2);
    expect(first.volume.value).toBe(0);

    frame(200);
    expect(second.volume.value).toBe(1);
    expect(first.parent).toBeNull();
  });
});

describe('DrawableTrack', () => {
  it('volumeTo transforms the wrapper volume, which aggregates onto the track', async () => {
    const { root, frame } = await setup();

    const track = new TrackVirtual(1000);
    const drawable = new DrawableTrack(track);
    root.add(drawable);

    drawable.volumeTo(0.5, 100);
    frame(50);
    expect(drawable.volume.value).toBeCloseTo(0.75, 6);
    expect(track.aggregateVolume.value).toBeCloseTo(0.75, 6);

    frame(100);
    expect(track.aggregateVolume.value).toBe(0.5);
  });
});

describe('ScalingContainer', () => {
  it('preserves a 1024x768 draw size (UIScale 1)', async () => {
    const { root, settle, frame } = await setup();
    const content = new Container().with({ relativeSizeAxes: 3 });
    const scaling = new ScalingContainer().with({ child: content });
    root.add(scaling);
    await settle();
    frame();

    // Minimum strategy: 868 / 768 is the smaller ratio.
    expect(content.drawSize.y).toBeCloseTo(768, 3);
    expect(content.drawSize.x).toBeCloseTo(1389 / (868 / 768), 3);
  });
});

describe('OsuColour', () => {
  it('samples the star difficulty spectrum', () => {
    const colours = new OsuColour();
    const hex = (c: Colour4) => c.toHex();

    expect(hex(colours.forStarDifficulty(0))).toBe(hex(Colour4.fromHex('aaaaaa')));
    expect(hex(colours.forStarDifficulty(2))).toBe(hex(Colour4.fromHex('4fffd5')));
    expect(hex(colours.forStarDifficulty(9.5))).toBe(hex(Colour4.Black));
    expect(colours.forStarDifficultyText(5).a).toBeCloseTo(0.75, 6);
    expect(hex(colours.forStarDifficultyText(7))).toBe(hex(colours.orange1));
  });
});
