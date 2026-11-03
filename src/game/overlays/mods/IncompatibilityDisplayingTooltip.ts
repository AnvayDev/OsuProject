// Ported from osu.Game/Overlays/Mods/IncompatibilityDisplayingTooltip.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import type { Mod } from '../../rulesets/mods/Mod';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { ExpansionMode, ModDisplay } from '../../screens/play/hud/ModDisplay';
import type { OverlayColourProvider } from '../OverlayColourProvider';
import { ModButtonTooltip } from './ModButtonTooltip';

export class IncompatibilityDisplayingTooltip extends ModButtonTooltip {
  private readonly incompatibleText: OsuSpriteText;

  private readonly incompatibleMods = new Bindable<readonly Mod[]>([]);

  private ruleset!: Bindable<RulesetInfo>;

  constructor(colourProvider: OverlayColourProvider) {
    super(colourProvider);

    const modDisplay = new ModDisplay().with({
      expansionMode: ExpansionMode.AlwaysExpanded,
      scale: new Vector2(Math.fround(0.7)),
    });
    modDisplay.current = this.incompatibleMods;

    this.addRange([
      this.incompatibleText = new OsuSpriteText().with({
        margin: MarginPadding.of({ top: 5 }),
        colour: colourProvider.content2,
        font: OsuFont.getFont({ weight: FontWeight.Regular }),
        text: 'Incompatible with:',
      }),
      modDisplay,
    ]);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    return r;
  }

  protected override updateDisplay(mod: Mod): void {
    super.updateDisplay(mod);

    const incompatibleTypes = mod.incompatibleMods;

    const allMods = this.ruleset.value.createInstance()?.allMods ?? [];

    this.incompatibleMods.value = allMods.filter(m => m.constructor !== mod.constructor && incompatibleTypes.some(t => m instanceof t)).map(m => m.createInstance());
    this.incompatibleText.text = this.incompatibleMods.value.length > 0 ? 'Incompatible with:' : 'Compatible with all mods';
  }
}
