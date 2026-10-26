// Ported from osu.Framework/Graphics/UserInterface/DropdownSearchBar.cs
// (GameHost.OnScreenKeyboardOverlapsGameWindow is false on desktop hosts, which the web build follows.)

import { DependencyContainer, type IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Bindable } from '../../bindables/Bindable';
import { TextInputSource, type TextInputProperties } from '../../input/TextInputSource';
import { Axes } from '../../layout/Enums';
import { RectangleF } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { Visibility, VisibilityContainer } from '../containers/VisibilityContainer';
import type { Drawable } from '../Drawable';
import { IDropdown } from './IDropdown';
import { MenuState } from './Menu';
import type { TextBox } from './TextBox';

/** (DropdownSearchBar.DropdownTextInputSource) */
class DropdownTextInputSource extends TextInputSource {
  private imeRectangle: RectangleF | null = null;

  constructor(private readonly platformSource: TextInputSource) {
    super();

    platformSource.onTextInput.add(t => this.triggerTextInput(t));
    platformSource.onImeComposition.add((t, s, l) => this.triggerImeComposition(t, s, l));
    platformSource.onImeResult.add(t => this.triggerImeResult(t));
  }

  protected override activateTextInput(properties: TextInputProperties): void {
    super.activateTextInput(properties);
    this.platformSource.activate(properties, this.imeRectangle ?? RectangleF.Empty);
  }

  protected override ensureTextInputActivated(properties: TextInputProperties): void {
    super.ensureTextInputActivated(properties);
    this.platformSource.ensureActivated(properties, this.imeRectangle);
  }

  protected override deactivateTextInput(): void {
    super.deactivateTextInput();

    this.imeRectangle = null;

    this.platformSource.deactivate();
  }

  override setImeRectangle(rectangle: RectangleF): void {
    super.setImeRectangle(rectangle);

    this.imeRectangle = rectangle;

    this.platformSource.setImeRectangle(rectangle);
  }

  override resetIme(): void {
    super.resetIme();

    this.platformSource.resetIme();
  }
}

export abstract class DropdownSearchBar extends VisibilityContainer {
  readonly isFocusManager = true;

  readonly searchTerm = new Bindable<string>('');

  private dropdown!: IDropdown;

  private textBox!: TextBox;

  private _alwaysDisplayOnFocus = false;

  get alwaysDisplayOnFocus(): boolean {
    return this._alwaysDisplayOnFocus;
  }

  set alwaysDisplayOnFocus(value: boolean) {
    this._alwaysDisplayOnFocus = value;

    if (this.isLoaded)
      this.updateTextBoxVisibility();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.dropdown = dependencies.resolve(IDropdown);

    this.relativeSizeAxes = Axes.Both;
    this.alwaysPresent = true;

    const textBox = this.textBox = this.createTextBox();
    textBox.relativeSizeAxes = Axes.Both;
    textBox.size = new Vector2(1);
    textBox.current = this.searchTerm;
    textBox.releaseFocusOnCommit = true;
    textBox.commitOnFocusLost = false;
    textBox.onCommit.add(this.onTextBoxCommit);

    this.internalChildren = [textBox];

    this.dropdown.menuStateChanged.add(this.onMenuStateChanged);

    return r;
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const inputSource = new DropdownTextInputSource(parent.resolve(TextInputSource));

    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cacheAs(TextInputSource, inputSource);
    return dependencies;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.searchTerm.bindValueChanged(() => this.updateTextBoxVisibility(), true);
  }

  override get propagateNonPositionalInputSubTree(): boolean {
    return this.dropdown.enabled.value && super.propagateNonPositionalInputSubTree;
  }

  // Importantly, this also removes the visibility condition of the base implementation - this element is always present even though it may not be physically visible on the screen.
  override get propagatePositionalInputSubTree(): boolean {
    return this.dropdown.enabled.value && this.requestsPositionalInputSubTree && !this.isMaskedAway;
  }

  protected override update(): void {
    super.update();

    this.updateMenuState();
    this.updateTextBoxVisibility();
  }

  /** Clears the search term. Returns whether it was cleared (true if it had text). */
  back(): boolean {
    if (!this.searchTerm.value)
      return false;

    this.searchTerm.value = '';
    return true;
  }

  private updateMenuState(): void {
    if (this.textBox.hasFocus)
      this.dropdown.openMenu();
    else
      this.dropdown.closeMenu();
  }

  private updateTextBoxVisibility(): void {
    const showTextBox = this.alwaysDisplayOnFocus || !!this.searchTerm.value;
    this.state.value = this.textBox.hasFocus && showTextBox ? Visibility.Visible : Visibility.Hidden;
  }

  private readonly onTextBoxCommit = (): void => {
    this.dropdown.commitPreselection();
    this.dropdown.closeMenu();
  };

  private readonly onMenuStateChanged = (state: MenuState): void => {
    if (state === MenuState.Closed) {
      // Reset states when the menu is closed by any means.
      this.searchTerm.value = '';

      if (this.textBox.hasFocus)
        this.dropdown.dropdownChangeFocus(null);

      this.dropdown.closeMenu();
    } else
      this.dropdown.dropdownChangeFocus(this.textBox);

    this.updateTextBoxVisibility();
  };

  protected abstract createTextBox(): TextBox;

  // #region IFocusManager

  triggerFocusContention(triggerSource: Drawable | null): void {
    // Clear search text first without releasing focus.
    if (this.back())
      return;

    this.dropdown.dropdownTriggerFocusContention(triggerSource);
  }

  changeFocus(potentialFocusTarget: Drawable | null): boolean {
    // Clear search text first without releasing focus.
    if (this.back())
      return false;

    return this.dropdown.dropdownChangeFocus(potentialFocusTarget);
  }

  // #endregion
}
