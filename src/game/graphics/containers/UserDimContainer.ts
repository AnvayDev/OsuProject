// Ported from osu.Game/Graphics/Containers/UserDimContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { OsuColour } from '../OsuColour';

/** A container that applies user-configured visual settings to its contents. */
export abstract class UserDimContainer extends Container {
  /** Amount of lightening to apply to current dim level during break times. */
  static readonly BREAK_LIGHTEN_AMOUNT = Math.fround(0.3);

  static readonly BACKGROUND_FADE_DURATION = 800;

  /** Whether or not user-configured settings relating to brightness of elements should be ignored. */
  readonly ignoreUserSettings = new Bindable<boolean>(false);

  /** Whether or not the storyboard loaded should completely hide the background behind it. */
  readonly isBreakTime = new Bindable<boolean>(false);

  /** Whether the content of this container is currently being displayed. */
  contentDisplayed = false;

  protected userDimLevel!: Bindable<number>;

  /** The amount of dim to be used when ignoreUserSettings is true. */
  readonly dimWhenUserSettingsIgnored = new Bindable<number>(0);

  protected lightenDuringBreaks!: Bindable<boolean>;

  protected showStoryboard!: Bindable<boolean>;

  private get breakLightening(): number {
    return this.lightenDuringBreaks.value && this.isBreakTime.value ? UserDimContainer.BREAK_LIGHTEN_AMOUNT : 0;
  }

  protected get dimLevel(): number {
    return Math.max(!this.ignoreUserSettings.value ? Math.fround(this.userDimLevel.value) - this.breakLightening : this.dimWhenUserSettingsIgnored.value, 0);
  }

  protected override get content(): Container<Drawable> {
    return this.dimContent;
  }

  private readonly dimContent: Container;

  protected constructor() {
    super();

    this.addInternal(this.dimContent = new Container().with({ relativeSizeAxes: Axes.Both }));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const config = dependencies.resolve(OsuConfigManager);

    this.userDimLevel = config.getBindable<number>(OsuSetting.DimLevel);
    this.lightenDuringBreaks = config.getBindable<boolean>(OsuSetting.LightenDuringBreaks);
    this.showStoryboard = config.getBindable<boolean>(OsuSetting.ShowStoryboard);

    this.userDimLevel.valueChanged.add(() => this.updateVisuals());
    this.dimWhenUserSettingsIgnored.valueChanged.add(() => this.updateVisuals());
    this.lightenDuringBreaks.valueChanged.add(() => this.updateVisuals());
    this.isBreakTime.valueChanged.add(() => this.updateVisuals());
    this.showStoryboard.valueChanged.add(() => this.updateVisuals());
    this.ignoreUserSettings.valueChanged.add(() => this.updateVisuals());

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.updateVisuals();
  }

  /** Whether the content of this container should currently be visible. */
  protected get showDimContent(): boolean {
    return true;
  }

  /** Should be invoked when any dependent dim level or user setting is changed and bring the visual state up-to-date. */
  protected updateVisuals(): void {
    this.contentDisplayed = this.showDimContent;

    this.dimContent.fadeTo(this.contentDisplayed ? 1 : 0, UserDimContainer.BACKGROUND_FADE_DURATION, Easing.OutQuint);
    this.dimContent.fadeColour(OsuColour.gray(1 - this.dimLevel), UserDimContainer.BACKGROUND_FADE_DURATION, Easing.OutQuint);
  }
}
