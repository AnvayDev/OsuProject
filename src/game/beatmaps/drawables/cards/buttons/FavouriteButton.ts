// Ported from osu.Game/Beatmaps/Drawables/Cards/Buttons/FavouriteButton.cs
// Web: there is no login, so the favourite request (PostBeatmapFavouriteRequest) always fails, as an API request does for a logged out user;
// the failure notification isn't ported (there is no notification overlay).

import { BindableWithCurrent, type Bindable } from '@fw/bindables/Bindable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import type { BeatmapSetFavouriteState } from '../BeatmapSetFavouriteState';
import { BeatmapCardIconButton } from './BeatmapCardIconButton';

export class FavouriteButton extends BeatmapCardIconButton {
  private readonly _current: BindableWithCurrent<BeatmapSetFavouriteState>;

  get current(): Bindable<BeatmapSetFavouriteState> {
    return this._current.current;
  }

  set current(value: Bindable<BeatmapSetFavouriteState>) {
    this._current.current = value;
  }

  constructor(beatmapSet: APIBeatmapSet) {
    super();

    this._current = new BindableWithCurrent<BeatmapSetFavouriteState>({ favourited: beatmapSet.hasFavourited, favouriteCount: beatmapSet.favouriteCount });
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.action = () => this.toggleFavouriteStatus();
    this._current.bindValueChanged(() => this.updateFavouriteState(), true);
  }

  private toggleFavouriteStatus(): void {
    this.setLoading(true);

    // (favouriteRequest.Failure: not logged in)
    this.schedule(() => this.setLoading(false));
  }

  /** (C#'s private updateState) */
  private updateFavouriteState(): void {
    if (this._current.value.favourited) {
      this.icon.icon = FontAwesome.Solid.Heart;
      this.tooltipText = 'unfavourite this beatmap';
    } else {
      this.icon.icon = FontAwesome.Regular.Heart;
      this.tooltipText = 'favourite this beatmap';
    }
  }
}
