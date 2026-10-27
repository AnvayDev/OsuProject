// Ported from osu.Game/Screens/Select/FooterButtonOptions.cs
// Popovers aren't ported, so the options popover (FooterButtonOptions.Popover.cs) doesn't open yet: the button only tracks whether a beatmap
// is selected.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuColour } from '../../graphics/OsuColour';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ScreenFooterButton } from '../footer/ScreenFooterButton';

export class FooterButtonOptions extends ScreenFooterButton {
  private workingBeatmap!: Bindable<WorkingBeatmap>;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colour = dependencies.resolve(OsuColour);
    this.workingBeatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();

    this.text = 'Options';
    this.iconUsage = FontAwesome.Solid.Cog;
    this.accentColour = colour.purple1;
    this.hotkey = GlobalAction.ToggleBeatmapOptions;

    // (Action toggles the popover.)
    this.action = () => {};

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.workingBeatmap.bindValueChanged(() => this.beatmapChanged(), true);
  }

  private beatmapChanged(): void {
    this.enabled.value = !this.workingBeatmap.isDefault;
  }
}
