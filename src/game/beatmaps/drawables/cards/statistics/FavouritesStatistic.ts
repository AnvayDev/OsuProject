// Ported from osu.Game/Beatmaps/Drawables/Cards/Statistics/FavouritesStatistic.cs

import { BindableWithCurrent, type Bindable } from '@fw/bindables/Bindable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { toMetric } from '../../../../utils/HumanizerUtils';
import type { BeatmapSetFavouriteState } from '../BeatmapSetFavouriteState';
import { BeatmapCardStatistic } from './BeatmapCardStatistic';

/** Shows the number of favourites that a beatmap set has received. */
export class FavouritesStatistic extends BeatmapCardStatistic {
  private readonly _current: BindableWithCurrent<BeatmapSetFavouriteState>;

  get current(): Bindable<BeatmapSetFavouriteState> {
    return this._current.current;
  }

  set current(value: Bindable<BeatmapSetFavouriteState>) {
    this._current.current = value;
  }

  constructor(onlineInfo: APIBeatmapSet) {
    super();

    this._current = new BindableWithCurrent<BeatmapSetFavouriteState>({ favourited: onlineInfo.hasFavourited, favouriteCount: onlineInfo.favouriteCount });
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this._current.bindValueChanged(() => this.updateState(), true);
  }

  private updateState(): void {
    this.icon = this._current.value.favourited ? FontAwesome.Solid.Heart : FontAwesome.Regular.Heart;
    this.text = toMetric(this._current.value.favouriteCount, 1);
    this.tooltipText = `Favourites: ${this._current.value.favouriteCount.toLocaleString('en-US')}`;
  }
}
