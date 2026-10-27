// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.MetadataDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuHoverContainer } from '../../graphics/containers/OsuHoverContainer';
import { DrawableDate } from '../../graphics/DrawableDate';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { TruncatingSpriteText } from '../../graphics/sprites/TruncatingSpriteText';
import { LoadingSpinner } from '../../graphics/userInterface/LoadingSpinner';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { TagsLine } from './BeatmapMetadataWedge.TagsLine';

export interface MetadataDisplayData {
  value: string;
  linkAction: (() => void) | null;
}

export class MetadataDisplay extends FillFlowContainer {
  private readonly labelText: OsuSpriteText;
  private readonly contentText: OsuSpriteText;
  private readonly contentLinkText: OsuSpriteText;
  private readonly contentLink: OsuHoverContainer;
  private readonly contentDate: DrawableDate;
  private readonly contentTags: TagsLine;
  private readonly contentLoading: LoadingSpinner;

  private _data: MetadataDisplayData | null = null;

  get data(): MetadataDisplayData | null {
    return this._data;
  }

  set data(value: MetadataDisplayData | null) {
    this._data = value;

    if (value?.linkAction != null)
      this.setLink(value.value, value.linkAction);
    else if (value !== null)
      this.setText(value.value);
    else
      this.setLoading();
  }

  set date(value: Date | null) {
    if (value != null)
      this.setDate(value);
    else
      this.setText('-');
  }

  set tags(value: { tags: string[]; searchAction: (tag: string) => void } | null) {
    if (value != null)
      this.setTags(value.tags, value.searchAction);
    else
      this.setLoading();
  }

  constructor(label: string) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.padding = MarginPadding.of({ right: 10 });

    this.internalChildren = [
      this.labelText = new OsuSpriteText().with({
        text: label,
        font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
      }),
      new Container().with({
        relativeSizeAxes: Axes.X,
        height: OsuFont.Style.Caption1.size,
        children: [
          this.contentText = new TruncatingSpriteText().with({
            relativeSizeAxes: Axes.X,
            font: OsuFont.Style.Caption1,
          }),
          this.contentLink = new OsuHoverContainer().with({
            autoSizeAxes: Axes.Both,
            child: this.contentLinkText = new TruncatingSpriteText().with({
              font: OsuFont.Style.Caption1,
            }),
          }),
          this.contentDate = new DrawableDate(new Date(0), OsuFont.Style.Caption1.size, false),
          this.contentTags = new TagsLine(),
          this.contentLoading = new LoadingSpinner().with({
            anchor: Anchor.TopLeft,
            origin: Anchor.TopLeft,
            size: new Vector2(10),
            margin: MarginPadding.of({ top: 3 }),
          }),
        ],
      }),
    ];

    this.contentLoading.state.value = Visibility.Visible;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.labelText.colour = colourProvider.content1;
    this.contentText.colour = colourProvider.content2;
    this.contentLink.idleColour = colourProvider.light2;

    return r;
  }

  protected override update(): void {
    super.update();
    this.contentLinkText.maxWidth = this.childSize.x;
  }

  /** (clear) */
  private clearContent(): void {
    this.contentText.text = '';
    this.contentLinkText.text = '';
    this.contentDate.hide();
    this.contentTags.tags = [];
    this.contentLoading.hide();
  }

  private setText(text: string): void {
    this.clearContent();

    this.contentText.text = text;
  }

  private setLink(text: string, action: () => void): void {
    this.clearContent();

    this.contentLinkText.text = text;
    this.contentLink.action = action;
  }

  private setDate(date: Date): void {
    this.clearContent();

    this.contentDate.show();
    this.contentDate.date = date;
  }

  private setTags(tags: string[], searchAction: (tag: string) => void): void {
    this.clearContent();

    this.contentTags.performSearch = searchAction;
    this.contentTags.tags = tags;
  }

  private setLoading(): void {
    this.clearContent();

    this.contentLoading.show();
  }
}
