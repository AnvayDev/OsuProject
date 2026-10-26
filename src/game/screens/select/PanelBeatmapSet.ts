// Ported from osu.Game/Screens/Select/PanelBeatmapSet.cs
// Collections aren't ported, so the collections submenu is empty. PanelUpdateBeatmapButton is left out: it only shows when a set doesn't
// match its online version, which needs the online metadata lookup (until then every set reads as up to date, so the button is never present
// in the flow).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { romanisable } from '@fw/localisation/RomanisableString';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import { getOnlineURL } from '../../beatmaps/BeatmapSetInfoExtensions';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { MenuItemType } from '../../graphics/userInterface/MenuItemType';
import { OsuMenuItem } from '../../graphics/userInterface/OsuMenuItem';
import { OsuMenuItemSpacer } from '../../graphics/userInterface/OsuMenuItemSpacer';
import { OsuGame } from '../../OsuGame';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { ISongSelect } from './ISongSelect';
import type { SoloSongSelect } from './SoloSongSelect';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { BeatmapSetOnlineStatusPill } from '../../beatmaps/drawables/BeatmapSetOnlineStatusPill';
import { CarouselItem } from '../../graphics/carousel/CarouselItem';
import { FontWeight, OsuFont, Typeface, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { GroupedBeatmapSet } from './GroupDefinition';
import { Panel } from './Panel';
import { SpreadDisplay } from './PanelBeatmapSet.SpreadDisplay';
import { PanelSetBackground } from './PanelSetBackground';

export class PanelBeatmapSet extends Panel {
  static readonly HEIGHT = Math.fround(CarouselItem.DEFAULT_HEIGHT * Math.fround(1.6));

  readonly visibleBeatmaps = new Bindable<Set<BeatmapInfo> | null>(null);

  private chevronBackground!: Box;
  private setBackground!: PanelSetBackground;
  private scheduledBackgroundRetrieval: ScheduledDelegate | null = null;

  private titleText!: OsuSpriteText;
  private artistText!: OsuSpriteText;
  private chevronIcon!: Drawable;
  private statusPill!: BeatmapSetOnlineStatusPill;
  private spreadDisplay!: SpreadDisplay;

  private colourProvider!: OverlayColourProvider;

  private beatmaps!: BeatmapManager;

  private songSelect: ISongSelect | null = null;

  private ruleset!: Bindable<RulesetInfo>;

  private globalBeatmap!: Bindable<WorkingBeatmap>;

  private game: OsuGame | null = null;

  private get groupedBeatmapSet(): GroupedBeatmapSet {
    return this.item!.model as GroupedBeatmapSet;
  }

  constructor() {
    super();

    this.panelXOffset = 20;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    this.beatmaps = dependencies.resolve(BeatmapManager);
    this.songSelect = dependencies.get(ISongSelect);
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo');
    this.globalBeatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap');
    this.game = dependencies.get(OsuGame);

    this.height = PanelBeatmapSet.HEIGHT;

    this.icon = this.chevronIcon = new Container().with({
      size: new Vector2(0, 22),
      child: new SpriteIcon().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        icon: FontAwesome.Solid.ChevronRight,
        size: new Vector2(8),
        x: 1,
        colour: this.colourProvider.background5,
      }),
    });

    this.background = this.chevronBackground = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: Colour4.White,
      alpha: 0,
    });

    this.content.children = [
      this.setBackground = new PanelSetBackground(),
      new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Vertical,
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        padding: MarginPadding.of({ top: 7.5, left: 15, bottom: 13 }),
        children: [
          this.titleText = new OsuSpriteText().with({
            font: withFont(OsuFont.Style.Heading1, { typeface: Typeface.TorusAlternate }),
          }),
          this.artistText = new OsuSpriteText().with({
            font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
          }),
          new FillFlowContainer().with({
            direction: FillDirection.Horizontal,
            autoSizeAxes: Axes.Both,
            margin: MarginPadding.of({ top: 4 }),
            children: [
              this.statusPill = new BeatmapSetOnlineStatusPill().with({
                origin: Anchor.CentreLeft,
                anchor: Anchor.CentreLeft,
                textSize: OsuFont.Style.Caption2.size,
                margin: MarginPadding.of({ right: 5 }),
                animated: false,
              }),
              this.spreadDisplay = new SpreadDisplay().with({
                origin: Anchor.CentreLeft,
                anchor: Anchor.CentreLeft,
              }),
            ],
          }),
        ],
      }),
    ];

    this.spreadDisplay.visibleBeatmaps.bindTarget = this.visibleBeatmaps;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.expanded.bindValueChanged(() => this.onExpanded(), true);
    this.keyboardSelected.bindValueChanged(k => this.keyboardSelected.value = k.newValue, true);
  }

  private onExpanded(): void {
    if (this.expanded.value) {
      this.chevronBackground.fadeIn(Panel.DURATION / 2, Easing.OutQuint);
      this.chevronIcon.resizeWidthTo(18, Panel.DURATION * 1.5, Easing.OutElasticQuarter);
      this.chevronIcon.fadeTo(1, Panel.DURATION, Easing.OutQuint);
    } else {
      this.chevronBackground.fadeOut(Panel.DURATION, Easing.OutQuint);
      this.chevronIcon.resizeWidthTo(0, Panel.DURATION, Easing.OutQuint);
      this.chevronIcon.fadeTo(0, Panel.DURATION, Easing.OutQuint);
    }

    this.spreadDisplay.expanded.value = this.expanded.value;
  }

  protected override prepareForUse(): void {
    super.prepareForUse();

    const beatmapSet = this.groupedBeatmapSet.beatmapSet;

    // Choice of background image matches BSS implementation (always uses the lowest `beatmap_id` from the set).
    const lowestOnlineID = beatmapSet.beatmaps.reduce((a, b) => (b.onlineID < a.onlineID ? b : a));
    this.scheduledBackgroundRetrieval = this.scheduler.addDelayed(() => this.setBackground.beatmap = this.beatmaps.getWorkingBeatmap(lowestOnlineID), 50);

    this.titleText.text = romanisable(beatmapSet.metadata.titleUnicode, beatmapSet.metadata.title);
    this.artistText.text = romanisable(beatmapSet.metadata.artistUnicode, beatmapSet.metadata.artist);
    this.statusPill.status = beatmapSet.status;
    this.spreadDisplay.beatmapSet.value = beatmapSet;
  }

  protected override freeAfterUse(): void {
    super.freeAfterUse();

    this.scheduledBackgroundRetrieval?.cancel();
    this.scheduledBackgroundRetrieval = null;
    this.setBackground.beatmap = null;
    this.spreadDisplay.beatmapSet.value = null;
  }

  override get contextMenuItems(): readonly MenuItem[] {
    if (this.item === null)
      return [];

    const beatmapSet = this.groupedBeatmapSet.beatmapSet;

    const items: MenuItem[] = [];

    if (this.expanded.value) {
      // (`songSelect is SoloSongSelect`: duck-typed, as importing SoloSongSelect here would be circular)
      const soloSongSelect = this.songSelect as (ISongSelect & Partial<Pick<SoloSongSelect, 'edit'>>) | null;

      if (typeof soloSongSelect?.edit === 'function') {
        // Assume the current set has one of its beatmaps selected since it is expanded.
        items.push(Object.assign(new OsuMenuItem('Edit', MenuItemType.Standard, () => soloSongSelect.edit!(this.globalBeatmap.value.beatmapInfo)), {
          icon: FontAwesome.Solid.PencilAlt,
        }));
        items.push(new OsuMenuItemSpacer());
      }
    } else {
      items.push(new OsuMenuItem('Expand', MenuItemType.Highlighted, () => this.triggerClick()));
      items.push(new OsuMenuItemSpacer());
    }

    if (beatmapSet.onlineID > 0) {
      // (the beatmap set overlay isn't ported: beatmapOverlay?.FetchAndShowBeatmapSet is a no-op)
      items.push(new OsuMenuItem('Details...', MenuItemType.Standard, () => {}));

      const url = getOnlineURL(beatmapSet, this.ruleset.value);
      if (url !== null)
        items.push(new OsuMenuItem('Copy link', MenuItemType.Standard, () => this.game?.copyToClipboard(url)));

      items.push(new OsuMenuItemSpacer());
    }

    items.push(new OsuMenuItem('Collections'));

    if (beatmapSet.beatmaps.some(b => b.hidden))
      items.push(new OsuMenuItem('Restore all hidden', MenuItemType.Standard, () => this.songSelect?.restoreAllHidden(beatmapSet)));

    items.push(new OsuMenuItem('Delete...', MenuItemType.Destructive, () => this.songSelect?.delete(beatmapSet)));
    return items;
  }
}
