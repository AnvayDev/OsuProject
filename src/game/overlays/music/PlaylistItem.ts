// Ported from osu.Game/Overlays/Music/PlaylistItem.cs
// Web: beatmap sets are detached objects rather than Live<BeatmapSetInfo>; they compare by ID as Live does.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableWithCurrent, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { PoolableDrawable } from '@fw/graphics/pooling/PoolableDrawable';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { romanisable } from '@fw/localisation/RomanisableString';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import { OsuTextFlowContainer } from '../../graphics/containers/OsuTextFlowContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { MarqueeContainer } from '../MarqueeContainer';
import { PlaylistOverlay } from './PlaylistOverlay';

export class PlaylistItem extends PoolableDrawable {
  get current(): Bindable<BeatmapSetInfo> {
    return this._current.current;
  }

  set current(value: Bindable<BeatmapSetInfo>) {
    this._current.current = value;
  }

  private readonly _current = new BindableWithCurrent<BeatmapSetInfo>();

  private readonly selectedSet = new Bindable<BeatmapSetInfo | null>(null);
  private requestSelection: ((set: BeatmapSetInfo) => void) | null = null;

  private text!: MarqueeContainer;

  private colours!: OsuColour;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);
    const playlistOverlay = dependencies.resolve(PlaylistOverlay);

    this.relativeSizeAxes = Axes.X;
    this.height = 20;

    this.internalChild = this.text = new MarqueeContainer().with({
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      relativeSizeAxes: Axes.X,
      initialMoveDelay: 0,
      allowScrolling: false,
      padding: MarginPadding.of({ horizontal: 15 }),
    });

    this.selectedSet.bindTo(playlistOverlay.selectedSet);
    this.requestSelection = set => playlistOverlay.itemSelected(set);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.current.bindValueChanged(() => this.onItemChanged(), true);
    this.selectedSet.bindValueChanged(s => this.updateSelectionState(s), true);
  }

  private onItemChanged(): void {
    const metadata = this.current.value.metadata;

    const title = romanisable(metadata.titleUnicode, metadata.title);
    const artist = romanisable(metadata.artistUnicode, metadata.artist);

    this.text.createContent = () => {
      const flow = new OsuTextFlowContainer().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
      });

      flow.addText(title, sprite => sprite.font = OsuFont.getFont({ weight: FontWeight.Regular }));
      flow.addText('  '); // to separate the title from the artist.
      flow.addText(artist, sprite => {
        sprite.font = OsuFont.getFont({ size: 14, weight: FontWeight.Bold });
        sprite.colour = this.colours.gray9;
      });
      return flow;
    };

    this.selectedSet.triggerChange();
    this.finishTransforms(true);
  }

  private selected: boolean | null = null;

  private updateSelectionState(selected: ValueChangedEvent<BeatmapSetInfo | null>): void {
    const wasSelected = this.selected;
    this.selected = selected.newValue?.equals(this.current.value) === true;

    if (wasSelected === this.selected)
      return;

    this.text.fadeColour(this.selected ? this.colours.yellow : Colour4.White, 100);
  }

  protected override onClick(_e: ClickEvent): boolean {
    this.requestSelection?.(this.current.value);
    return true;
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.text.allowScrolling = true;
    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.text.allowScrolling = false;
    super.onHoverLost(e);
  }
}
