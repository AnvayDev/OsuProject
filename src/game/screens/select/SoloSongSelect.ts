// Ported from osu.Game/Screens/Select/SoloSongSelect.cs
// Gameplay isn't ported (by decision), so starting a beatmap only plays the confirm sample where C# pushes the PlayerLoader. The editor isn't
// ported (Edit does nothing), scores aren't (there are no local scores to clear), and neither are mods or the touch input detector.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { getOnlineURL } from '../../beatmaps/BeatmapInfoExtensions';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import { MenuItemType } from '../../graphics/userInterface/MenuItemType';
import { OsuMenuItem } from '../../graphics/userInterface/OsuMenuItem';
import { OsuMenuItemSpacer } from '../../graphics/userInterface/OsuMenuItemSpacer';
import { OsuGame } from '../../OsuGame';
import { SongSelect } from './SongSelect';

export class SoloSongSelect extends SongSelect {
  private sampleConfirmSelection: Sample | null = null;

  private beatmapManager!: BeatmapManager;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmapManager = dependencies.resolve(BeatmapManager);

    void dependencies.resolve(AudioManager).samples.get('SongSelect/confirm-selection').then(s => this.sampleConfirmSelection = s);

    return r;
  }

  override getForwardActions(beatmap: BeatmapInfo): OsuMenuItem[] {
    const items: OsuMenuItem[] = [];

    items.push(Object.assign(new OsuMenuItem('Play', MenuItemType.Highlighted, () => this.selectAndRun(beatmap, () => this.onStart())), { icon: FontAwesome.Solid.Check }));
    items.push(Object.assign(new OsuMenuItem('Edit', MenuItemType.Standard, () => this.edit(beatmap)), { icon: FontAwesome.Solid.PencilAlt }));

    items.push(new OsuMenuItemSpacer());

    if (beatmap.onlineID > 0) {
      // (the beatmap set overlay isn't ported: beatmapOverlay?.FetchAndShowBeatmap is a no-op)
      items.push(new OsuMenuItem('Details...', MenuItemType.Standard, () => {}));

      const url = getOnlineURL(beatmap, this.ruleset.value);
      if (url !== null)
        items.push(new OsuMenuItem('Copy link', MenuItemType.Standard, () => (this.game instanceof OsuGame ? this.game : null)?.copyToClipboard(url)));

      items.push(new OsuMenuItemSpacer());
    }

    items.push(...this.createCollectionMenuActions(beatmap));

    if (beatmap.lastPlayed === null)
      items.push(Object.assign(new OsuMenuItem('Mark as played', MenuItemType.Standard, () => void this.beatmapManager.markPlayed(beatmap)), { icon: FontAwesome.Solid.TimesCircle }));
    else
      items.push(Object.assign(new OsuMenuItem('Remove from played', MenuItemType.Standard, () => void this.beatmapManager.markNotPlayed(beatmap)), { icon: FontAwesome.Solid.TimesCircle }));

    // (dialogOverlay?.Push(new BeatmapClearScoresDialog(beatmap)): there are no local scores)
    items.push(Object.assign(new OsuMenuItem('Clear all local scores...', MenuItemType.Destructive, () => {}), { icon: FontAwesome.Solid.Eraser }));

    if (this.beatmapManager.canHide(beatmap))
      items.push(new OsuMenuItem('Hide', MenuItemType.Standard, () => void this.beatmapManager.hide(beatmap)));

    return items;
  }

  protected override onStart(): void {
    this.sampleConfirmSelection?.play();
  }

  /** (The editor isn't ported: C# selects the beatmap and pushes an EditorLoader.) */
  edit(_beatmap: BeatmapInfo): void {
  }
}

