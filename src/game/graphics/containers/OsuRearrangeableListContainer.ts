// Ported from osu.Game/Graphics/Containers/OsuRearrangeableListContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { BindableBool } from '@fw/bindables/Bindable';
import { NotifyCollectionChangedAction } from '@fw/bindables/BindableList';
import { RearrangeableListContainer } from '@fw/graphics/containers/RearrangeableListContainer';
import type { RearrangeableListItem } from '@fw/graphics/containers/RearrangeableListItem';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { SamplePlaybackHelper } from '../../audio/SamplePlaybackHelper';
import { OsuScrollContainer } from './OsuScrollContainer';
import type { OsuRearrangeableListItem } from './OsuRearrangeableListItem';

export abstract class OsuRearrangeableListContainer<TModel> extends RearrangeableListContainer<TModel> {
  /** Whether any item is currently being dragged. Used to hide other items' drag handles. */
  protected readonly dragActive = new BindableBool();

  protected override createScrollContainer(): ScrollContainer<Drawable> {
    return new OsuScrollContainer();
  }

  private sampleSwap: Sample | null = null;
  private sampleLastPlaybackTime = 0;

  protected override createDrawable(item: TModel): RearrangeableListItem<TModel> {
    const d = this.createOsuDrawable(item);
    d.dragActive.bindTo(this.dragActive);
    return d;
  }

  protected abstract createOsuDrawable(item: TModel): OsuRearrangeableListItem<TModel>;

  protected override loadComplete(): void {
    super.loadComplete();

    this.items.collectionChanged.add((_, args) => {
      if (args.action === NotifyCollectionChangedAction.Move)
        this.playSwapSample();
    });
  }

  private playSwapSample(): void {
    if (!this.dragActive.value)
      return;

    if (this.time.current - this.sampleLastPlaybackTime <= 35)
      return;

    SamplePlaybackHelper.playWithRandomPitch(this.sampleSwap, 0.04);

    this.sampleLastPlaybackTime = this.time.current;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    void dependencies.resolve(AudioManager).samples.get('UI/item-swap').then(s => this.sampleSwap = s);
    this.sampleLastPlaybackTime = this.time.current;

    return r;
  }
}
