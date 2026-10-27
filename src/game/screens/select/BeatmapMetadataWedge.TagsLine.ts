// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.TagsLine.cs
// Popovers aren't ported yet, so the overflow button doesn't open the TagsOverflowPopover listing the hidden tags.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection, Invalidation } from '@fw/layout/Enums';
import { LayoutValue } from '@fw/layout/Layout';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuHoverContainer } from '../../graphics/containers/OsuHoverContainer';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { HoverClickSounds } from '../../graphics/userInterface/HoverClickSounds';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

export class TagsLine extends FillFlowContainer {
  private readonly drawSizeLayout = new LayoutValue(Invalidation.DrawSize);

  private _tags: string[] = [];

  private overflowButton: TagsOverflowButton | null = null;
  private readonly tagsShownCount = new Bindable<number>(0);

  get tags(): string[] {
    return this._tags;
  }

  set tags(value: string[]) {
    this._tags = value;
    this.updateTags();
  }

  performSearch: ((tag: string) => void) | null = null;

  private colourProvider!: OverlayColourProvider;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
    this.direction = FillDirection.Horizontal;
    this.spacing = new Vector2(4, 0);

    this.addLayout(this.drawSizeLayout);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    return r;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (!this.drawSizeLayout.isValid) {
      this.updateLayout();
      this.drawSizeLayout.validate();
    }
  }

  private updateLayout(): void {
    if (this._tags.length === 0)
      return;

    const overflowButton = this.overflowButton!;

    const limit = this.drawWidth - overflowButton.drawWidth - 5;
    let totalTagsShown = 0;

    for (const child of this.children) {
      if (child instanceof TagsOverflowButton) continue;

      if (child.x + child.drawWidth < limit) {
        child.alwaysPresent = true;
        child.show();
        totalTagsShown += 1;
      } else {
        child.alwaysPresent = false;
        child.hide();
      }
    }

    this.tagsShownCount.value = totalTagsShown;

    if (totalTagsShown < this._tags.length)
      overflowButton.show();
    else
      overflowButton.hide();
  }

  private updateTags(): void {
    this.children = this._tags.map(t => new OsuHoverContainer().with({
      autoSizeAxes: Axes.Both,
      action: () => this.performSearch?.(t),
      idleColour: this.colourProvider.light2,
      alwaysPresent: true,
      alpha: 0,
      child: new OsuSpriteText().with({
        text: t,
        font: OsuFont.Style.Caption1,
      }),
    }));

    this.add(this.overflowButton = new TagsOverflowButton(this._tags).with({
      alpha: 0,
    }));
    this.overflowButton.tagsShownCount.bindTarget = this.tagsShownCount;

    this.drawSizeLayout.invalidate();
  }
}

class TagsOverflowButton extends CompositeDrawable {
  private box!: Box;
  private text!: OsuSpriteText;

  private colourProvider!: OverlayColourProvider;

  get lineBaseHeight(): number {
    return this.text.lineBaseHeight;
  }

  readonly tagsShownCount = new Bindable<number>(0);

  constructor(readonly tags: string[]) {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    this.size = new Vector2(OsuFont.Style.Caption1.size);
    this.cornerRadius = 1.5;
    this.masking = true;

    this.internalChildren = [
      this.box = new Box().with({
        colour: this.colourProvider.light1,
        relativeSizeAxes: Axes.Both,
      }),
      this.text = new OsuSpriteText().with({
        y: -2,
        anchor: Anchor.TopCentre,
        origin: Anchor.TopCentre,
        text: '...',
        colour: this.colourProvider.background4,
        font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.Bold }),
      }),
      new HoverClickSounds(),
    ];

    return r;
  }

  protected override onHover(e: HoverEvent): boolean {
    this.box.fadeColour(this.colourProvider.content2, 300, Easing.OutQuint);
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.box.fadeColour(this.colourProvider.light1, 300, Easing.OutQuint);
    super.onHoverLost(e);
  }

  protected override onClick(_e: ClickEvent): boolean {
    this.box.flashColour(this.colourProvider.content1, 300, Easing.OutQuint);
    // (this.ShowPopover(): popovers aren't ported yet.)
    return true;
  }
}
