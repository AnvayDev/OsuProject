// Ported from osu.Game/Beatmaps/DummyWorkingBeatmap.cs

import type { AudioManager } from '@fw/audio/AudioManager';
import type { Track } from '@fw/audio/track/Track';
import type { Texture } from '@fw/graphics/textures/Texture';
import type { TextureStore } from '@fw/graphics/textures/TextureStore';
import { RulesetInfo } from '../rulesets/RulesetInfo';
import { Beatmap, type IBeatmap } from './Beatmap';
import { BeatmapDifficulty } from './BeatmapDifficulty';
import { BeatmapInfo } from './BeatmapInfo';
import { BeatmapMetadata } from './BeatmapMetadata';
import { BeatmapSetInfo } from './BeatmapSetInfo';
import { WorkingBeatmap } from './WorkingBeatmap';

export class DummyWorkingBeatmap extends WorkingBeatmap {
  constructor(audio: AudioManager, private readonly textures: TextureStore | null) {
    super(createBeatmapInfo(), audio);

    // We are guaranteed to have a virtual track.
    // To ease usability, ensure the track is available from point of construction.
    this.loadTrack();
  }

  protected override getBeatmap(): Promise<IBeatmap | null> {
    return Promise.resolve(new Beatmap());
  }

  override getBackground(): Promise<Texture | null> {
    return this.textures?.get('Backgrounds/bg2') ?? Promise.resolve(null);
  }

  protected override getBeatmapTrack(): Track | null {
    return this.getVirtualTrack();
  }

  override getStream(_storagePath: string): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
}

function createBeatmapInfo(): BeatmapInfo {
  const difficulty = new BeatmapDifficulty();
  difficulty.circleSize = 0;
  difficulty.drainRate = 0;
  difficulty.overallDifficulty = 0;
  difficulty.approachRate = 0;

  const info = new BeatmapInfo(createDummyRulesetInfo(), difficulty, BeatmapMetadata.from({
    artist: 'please select or load a beatmap!',
    title: 'no beatmap selected!',
  }));
  info.beatmapSet = new BeatmapSetInfo();

  return info;
}

/** DummyRuleset.RulesetInfo (Ruleset.RulesetInfo: Name = Description = "dummy", ShortName = "dummy", no legacy ID). */
function createDummyRulesetInfo(): RulesetInfo {
  const ruleset = new RulesetInfo('dummy', 'dummy', 'osu.Game.Beatmaps.DummyWorkingBeatmap+DummyRuleset, osu.Game', -1);
  ruleset.available = true;
  return ruleset;
}
