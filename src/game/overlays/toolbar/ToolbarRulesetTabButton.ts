// Ported from osu.Game/Overlays/Toolbar/ToolbarRulesetTabButton.cs
// Rulesets other than osu! aren't instantiable here: Ruleset.Description is the ruleset's name and CreateIcon() its OsuIcon.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { ClickEvent } from '@fw/input/events/UIEvents';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { OsuColour } from '../../graphics/OsuColour';
import type { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { createRulesetIcon } from '../../screens/select/PanelBeatmapSet.SpreadDisplay';
import { ToolbarButton } from './ToolbarButton';

export class ToolbarRulesetTabButton extends TabItem<RulesetInfo> {
  private readonly ruleset: RulesetButton;

  constructor(value: RulesetInfo) {
    super(value);

    this.autoSizeAxes = Axes.X;
    this.relativeSizeAxes = Axes.Y;
    this.child = this.ruleset = new RulesetButton();
    this.ruleset.active = false;

    this.ruleset.tooltipMain = value.name;
    this.ruleset.tooltipSub = `play some ${value.name}`;
    this.ruleset.setIcon(createRulesetIcon(value));
  }

  protected override onActivated(): void {
    this.ruleset.active = true;
  }

  protected override onDeactivated(): void {
    this.ruleset.active = false;
  }
}

/** (ToolbarRulesetTabButton.RulesetButton) */
class RulesetButton extends ToolbarButton {
  protected override createHoverSounds(_sampleSet: HoverSampleSet): HoverSounds {
    return new HoverSounds();
  }

  private colours!: OsuColour;

  constructor() {
    super();

    this.buttonContent.padding = MarginPadding.of({ left: ToolbarButton.PADDING, right: ToolbarButton.PADDING, top: ToolbarButton.PADDING, bottom: 5 });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);

    return r;
  }

  set active(value: boolean) {
    this.scheduler.addOnce(() => {
      this.iconContainer.colour = value ? Colour4.fromHex('#00FFAA') : this.colours.grayF;
    });
  }

  protected override onClick(e: ClickEvent): boolean {
    this.parent!.triggerClick();
    return super.onClick(e);
  }
}
