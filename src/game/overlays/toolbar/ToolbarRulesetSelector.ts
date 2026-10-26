// Ported from osu.Game/Overlays/Toolbar/ToolbarRulesetSelector.cs
// The ruleset selection samples (UI/ruleset-select-{shortName}) are in osu-resources' samples, so the game's sample store has them (C#
// adds each ruleset's resource store to find them).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import type { ValueChangedEvent } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Circle } from '@fw/graphics/shapes/Circle';
import { TabFillFlowContainer } from '@fw/graphics/userInterface/TabControl';
import type { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { KeyDownEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { DuckParameters, MusicController } from '../MusicController';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { RulesetSelector } from '../../rulesets/RulesetSelector';
import { OpaqueBackground, TOOLBAR_HEIGHT } from './ToolbarButton';
import { ToolbarRulesetTabButton } from './ToolbarRulesetTabButton';

export class ToolbarRulesetSelector extends RulesetSelector {
  private _modeButtonLine!: Drawable;

  protected get modeButtonLine(): Drawable {
    return this._modeButtonLine;
  }

  private musicController!: MusicController;

  private readonly rulesetSelectionSample = new Map<RulesetInfo, Sample | null>();
  private readonly rulesetSelectionChannel = new Map<RulesetInfo, SampleChannel | null>();
  private defaultSelectSample: Sample | null = null;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Y;
    this.autoSizeAxes = Axes.X;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.musicController = dependencies.resolve(MusicController);
    const audio = dependencies.resolve(AudioManager);

    this.addRangeInternal([
      new OpaqueBackground().with({
        depth: 1,
        masking: true,
      }),
      this._modeButtonLine = new Container().with({
        size: new Vector2(TOOLBAR_HEIGHT, 3),
        anchor: Anchor.BottomLeft,
        origin: Anchor.BottomLeft,
        y: -1,
        children: [
          new Circle().with({
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            size: new Vector2(18, 3),
          }),
        ],
      }),
    ]);

    for (const r of this.rulesets.availableRulesets)
      this.rulesetSelectionSample.set(r, await audio.samples.get(`UI/ruleset-select-${r.shortName}`));

    this.defaultSelectSample = await audio.samples.get('UI/default-select');

    this.current.valueChanged.add(r => this.playRulesetSelectionSample(r));
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.current.bindDisabledChanged(() => this.scheduler.addOnce(this.currentDisabledChanged));
    this.currentDisabledChanged();

    this.current.bindValueChanged(() => this.moveLineToCurrent());
    // Scheduled to allow the button flow layout to be computed before the line position is updated
    this.scheduleAfterChildren(() => this.moveLineToCurrent());
  }

  private readonly currentDisabledChanged = (): void => {
    this.fadeColour(this.current.disabled ? Colour4.Gray : Colour4.White, 300);
  };

  private hasInitialPosition = false;

  private moveLineToCurrent(): void {
    if (this.selectedTab !== null) {
      this._modeButtonLine.moveToX(this.selectedTab.drawPosition.x, !this.hasInitialPosition ? 0 : 500, Easing.OutElasticQuarter);
      this.hasInitialPosition = true;
    }
  }

  private playRulesetSelectionSample(r: ValueChangedEvent<RulesetInfo>): void {
    // Don't play sample on first setting of value
    if (r.oldValue == null)
      return;

    const channel = this.rulesetSelectionSample.get(r.newValue)?.getChannel() ?? null;

    // Skip sample choking and ducking for the default/fallback sample
    if (channel === null) {
      this.defaultSelectSample?.play();
      return;
    }

    for (const c of this.rulesetSelectionChannel.values())
      c?.stop();

    this.rulesetSelectionChannel.set(r.newValue, channel);
    channel.play();

    // Longer unduck delay for Mania sample
    const unduckDelay = r.newValue.onlineID === 3 ? 750 : 500;
    this.musicController?.duckMomentarily(unduckDelay, Object.assign(new DuckParameters(), { duckDuration: 0 }));
  }

  override get handleNonPositionalInput(): boolean {
    return !this.current.disabled && super.handleNonPositionalInput;
  }

  override get handlePositionalInput(): boolean {
    return !this.current.disabled && super.handlePositionalInput;
  }

  override get propagatePositionalInputSubTree(): boolean {
    return !this.current.disabled && super.propagatePositionalInputSubTree;
  }

  protected override createTabItem(value: RulesetInfo): TabItem<RulesetInfo> {
    return new ToolbarRulesetTabButton(value);
  }

  protected override createTabFlow(): TabFillFlowContainer<RulesetInfo> {
    return new TabFillFlowContainer<RulesetInfo>().with({
      relativeSizeAxes: Axes.Y,
      autoSizeAxes: Axes.X,
      direction: FillDirection.Horizontal,
    });
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    super.onKeyDown(e);

    if (e.controlPressed && !e.repeat && e.key >= Key.Number1 && e.key <= Key.Number9) {
      const requested = e.key - Key.Number1;

      const found = this.rulesets.availableRulesets[requested];
      if (found !== undefined)
        this.selectItem(found);
      return true;
    }

    return false;
  }
}
