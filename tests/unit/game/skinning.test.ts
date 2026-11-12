// The skin lookup chain (osu.Game/Skinning/SkinProvidingContainer.cs, SkinnableDrawable.cs): nearest source first, fallback to the parent
// source, lookup allowances, and reloading when a source changes. The scenarios follow osu.Game.Tests' TestSceneSkinProvidingContainer and
// TestSceneSkinnableDrawable, without their visuals.

import { describe, expect, it } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { Texture } from '@fw/graphics/textures/Texture';
import { FramedClock, ManualClock } from '@fw/timing/FramedClock';
import { type ISkin, type ISkinComponentLookup, SkinComponentLookup } from '@game/skinning/ISkin';
import { GlobalSkinColours, GlobalSkinColoursLookup } from '@game/skinning/SkinConfigLookup';
import { SkinnableDrawable } from '@game/skinning/SkinnableDrawable';
import { SkinProvidingContainer } from '@game/skinning/SkinProvidingContainer';

enum TestComponents { A, B }

class TestLookup extends SkinComponentLookup<TestComponents> {}

class NamedBox extends Box {
  constructor(readonly source: string) {
    super();
  }
}

/** A skin that provides the listed components (as boxes named after it), one config value and nothing else. */
class TestSkin implements ISkin {
  constructor(readonly name: string, private readonly components: TestComponents[], private readonly colours: string | null = null) {}

  getDrawableComponent(lookup: ISkinComponentLookup): Drawable | null {
    return lookup instanceof TestLookup && this.components.includes(lookup.component) ? new NamedBox(this.name) : null;
  }

  getTexture(): Texture | null { return null; }
  getSample(): Sample | null { return null; }

  getConfig<TValue>(lookup: unknown): Bindable<TValue> | null {
    if (lookup instanceof GlobalSkinColoursLookup && lookup.colours === GlobalSkinColours.ComboColours && this.colours !== null)
      return new Bindable(this.colours) as unknown as Bindable<TValue>;

    return lookup === 'setting' ? new Bindable(this.name) as unknown as Bindable<TValue> : null;
  }
}

class SwitchableProvider extends SkinProvidingContainer {
  fallBack = true;
  drawables = true;
  colours = true;
  configuration = true;

  protected override get allowFallingBackToParent(): boolean { return this.fallBack; }
  protected override allowDrawableLookup(): boolean { return this.drawables; }
  protected override get allowColourLookup(): boolean { return this.colours; }
  protected override get allowConfigurationLookup(): boolean { return this.configuration; }

  set sources(skins: ISkin[]) {
    this.setSources(skins);
    this.triggerSourceChanged();
  }
}

function load(root: Drawable): () => void {
  const manual = new ManualClock();
  const clock = new FramedClock(manual);
  const container = new Container().with({ child: root });
  container.loadDrawable(clock, new DependencyContainer());

  return () => {
    manual.currentTime += 16;
    clock.processFrame();
    container.updateSubTree();
  };
}

const sourceOf = (skinnable: SkinnableDrawable) => skinnable.drawable instanceof NamedBox ? skinnable.drawable.source : 'default';

describe('SkinProvidingContainer', () => {
  it('asks the nearest source first and falls back to the parent source', () => {
    const inner = new SwitchableProvider(new TestSkin('inner', [TestComponents.A]));
    const outer = new SkinProvidingContainer(new TestSkin('outer', [TestComponents.A, TestComponents.B])).with({ child: inner });
    load(outer)();

    expect((inner.getDrawableComponent(new TestLookup(TestComponents.A)) as NamedBox).source).toBe('inner');
    expect((inner.getDrawableComponent(new TestLookup(TestComponents.B)) as NamedBox).source).toBe('outer');
    expect([...inner.allSources].map(s => (s as TestSkin).name)).toEqual(['inner', 'outer']);
    expect((inner.findProvider(s => s.getDrawableComponent(new TestLookup(TestComponents.B)) !== null) as TestSkin).name).toBe('outer');

    inner.fallBack = false;

    expect(inner.getDrawableComponent(new TestLookup(TestComponents.B))).toBeNull();
    expect([...inner.allSources].map(s => (s as TestSkin).name)).toEqual(['inner']);
    expect(inner.findProvider(s => s.getDrawableComponent(new TestLookup(TestComponents.B)) !== null)).toBeNull();
  });

  it('skips its own sources for lookups it disallows, per kind', () => {
    const inner = new SwitchableProvider(new TestSkin('inner', [TestComponents.A], 'inner colours'));
    const outer = new SkinProvidingContainer(new TestSkin('outer', [TestComponents.A], 'outer colours')).with({ child: inner });
    load(outer)();

    const colours = new GlobalSkinColoursLookup(GlobalSkinColours.ComboColours);

    expect(inner.getConfig<string>(colours)!.value).toBe('inner colours');
    expect(inner.getConfig<string>('setting')!.value).toBe('inner');

    inner.colours = false;
    expect(inner.getConfig<string>(colours)!.value).toBe('outer colours');
    expect(inner.getConfig<string>('setting')!.value).toBe('inner');

    inner.configuration = false;
    expect(inner.getConfig<string>('setting')!.value).toBe('outer');

    inner.drawables = false;
    expect((inner.getDrawableComponent(new TestLookup(TestComponents.A)) as NamedBox).source).toBe('outer');
  });
});

describe('SkinnableDrawable', () => {
  it('shows the skin component, the default when no source provides one, and reloads when a source changes', () => {
    const skinnable = new SkinnableDrawable(new TestLookup(TestComponents.A), () => new Box());
    const inner = new SwitchableProvider();
    const outer = new SwitchableProvider().with({ child: inner.with({ child: skinnable }) });
    const frame = load(outer);
    frame();

    expect(sourceOf(skinnable)).toBe('default');

    // A change of a parent source reaches the skinnable through the nested provider, on its next update.
    outer.sources = [new TestSkin('outer', [TestComponents.A])];
    expect(sourceOf(skinnable)).toBe('default');
    frame();
    expect(sourceOf(skinnable)).toBe('outer');

    inner.sources = [new TestSkin('inner', [TestComponents.A])];
    frame();
    expect(sourceOf(skinnable)).toBe('inner');

    inner.sources = [];
    outer.sources = [];
    frame();
    expect(sourceOf(skinnable)).toBe('default');
  });
});
