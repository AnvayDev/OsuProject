// Ported from osu.Game/Screens/Select/FilterControl.ScopedBeatmapSetDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { getDisplayTitleRomanisable } from '../../beatmaps/BeatmapMetadataInfoExtensions';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import { OsuClickableContainer } from '../../graphics/containers/OsuClickableContainer';
import { OsuTextFlowContainer } from '../../graphics/containers/OsuTextFlowContainer';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { ShearedButton } from '../../graphics/userInterface/ShearedButton';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { ISongSelect } from './ISongSelect';

const transition_duration = 300;

export class ScopedBeatmapSetDisplay extends OsuClickableContainer implements IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  readonly scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);

  private flashLayer!: Box;
  // (C#'s private content; Container.content is OsuClickableContainer's)
  private displayContent!: Container;
  private text!: OsuTextFlowContainer;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
    this.cornerRadius = 8;
    this.masking = true;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const songSelect = dependencies.get(ISongSelect);
    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.content.autoSizeEasing = Easing.OutQuint;
    this.content.autoSizeDuration = transition_duration;

    this.addRange([
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: colourProvider.highlight1,
      }),
      this.displayContent = new Container().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        bypassAutoSizeAxes: Axes.Y,
        shear: OsuGame.SHEAR.neg(),
        padding: MarginPadding.of({
          horizontal: 6,
          vertical: 2,
        }),
        children: [
          this.text = new OsuTextFlowContainer(t => t.font = OsuFont.Style.Body).with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            colour: colourProvider.background6,
            padding: MarginPadding.of({ right: 80, vertical: 5 }),
          }),
          new ShearedButton().with({
            anchor: Anchor.CentreRight,
            origin: Anchor.CentreRight,
            width: 80,
            text: 'Back',
            relativeSizeAxes: Axes.Y,
            height: 1,
            action: () => this.action?.(),
          }),
        ],
      }),
      this.flashLayer = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.White,
        blending: BlendingParameters.Additive,
        alpha: 0,
      }),
    ]);
    this.action = () => songSelect?.unscopeBeatmapSet();

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.scopedBeatmapSet.bindValueChanged(() => this.updateState(), true);
  }

  private updateState(): void {
    const scopedBeatmapSet = this.scopedBeatmapSet.value;

    if (scopedBeatmapSet !== null) {
      this.transformTo('margin', MarginPadding.of({ top: 5 }), transition_duration, Easing.OutQuint);
      this.displayContent.bypassAutoSizeAxes = Axes.None;

      this.text.clear();
      this.text.addText('Temporarily showing all beatmaps in');
      this.text.addText(' ');
      this.text.addText(getDisplayTitleRomanisable(scopedBeatmapSet.metadata), t => t.font = withFont(OsuFont.Style.Body, { weight: FontWeight.Bold }));
    } else {
      this.transformTo('margin', new MarginPadding(0), transition_duration, Easing.OutQuint);
      this.flashLayer.fadeOutFromOne(transition_duration, Easing.OutQuint);
      this.displayContent.bypassAutoSizeAxes = Axes.Y;
    }
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (this.scopedBeatmapSet.value !== null && e.action === GlobalAction.Back && !e.repeat) {
      this.triggerClick();
      return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}
