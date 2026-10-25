// Ported from osu.Framework/Graphics/Sprites/SpriteIcon.cs
// DOM: the glyph is a masked div inside the element, like SpriteText's glyphs (the atlas page is the mask, the draw colour the background),
// placed at SpriteIconDrawNode's fitted and centred rectangle. The shadow is a second div drawn right before (below) it.

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Invalidation, LoadState } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import { FontStore, loadPage, type GlyphTexture } from '../../text/FontStore';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { Drawable } from '../Drawable';
import { IconUsage } from './IconUsage';
import { colourInfoToCss } from './Sprite';

/** A drawable representing an icon. Uses FontStore to perform character lookups. */
export class SpriteIcon extends Drawable {
  private store: FontStore = null!;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    super.load(dependencies);

    this.store = dependencies.resolve(FontStore);
    this.updateTexture();

    // DOM: wait for the glyph's atlas page so the icon shows on its first frame (osu! gets the glyph texture synchronously).
    if (this.texture !== null)
      return loadPage(this.texture.pageUrl);
  }

  // default(IconUsage)
  private loadedIcon = new IconUsage('\0');
  private texture: GlyphTexture | null = null;

  private updateTexture(): void {
    const loadableIcon = this._icon;

    if (loadableIcon.equals(this.loadedIcon)) return;

    const glyph = this.store.get(loadableIcon.fontName, this._icon.icon);

    if (glyph !== null) {
      this.texture = glyph.texture;

      if (this.size.equals(Vector2.Zero))
        this.size = new Vector2(glyph.width, glyph.height);
    }

    this.loadedIcon = loadableIcon;
    this.invalidate(Invalidation.DrawNode);
  }

  private _shadow = false;

  get shadow(): boolean {
    return this._shadow;
  }

  set shadow(value: boolean) {
    if (this._shadow === value)
      return;

    this._shadow = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _shadowColour = new Colour4(0, 0, 0, 0.2);

  /** The colour of the shadow displayed around the icon. A shadow will only be displayed if the shadow property is set to true. */
  get shadowColour(): Colour4 {
    return this._shadowColour;
  }

  set shadowColour(value: Colour4) {
    if (this._shadowColour.equals(value))
      return;

    this._shadowColour = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _shadowOffset = new Vector2(0, 2);

  /** The offset of the shadow displayed around the icon. A shadow will only be displayed if the shadow property is set to true. */
  get shadowOffset(): Vector2 {
    return this._shadowOffset;
  }

  set shadowOffset(value: Vector2) {
    if (this._shadowOffset.equals(value))
      return;

    this._shadowOffset = value;
    this.invalidate(Invalidation.DrawNode);
  }

  // default(IconUsage)
  private _icon = new IconUsage('\0');

  get icon(): IconUsage {
    return this._icon;
  }

  set icon(value: IconUsage) {
    if (this._icon.equals(value)) return;

    this._icon = value;
    if (this.loadState > LoadState.NotLoaded)
      this.updateTexture();
  }

  // #region DrawNode (DOM)

  private shadowElement: HTMLElement | null = null;
  private glyphElement: HTMLElement | null = null;
  private lastGlyphKey = '';

  protected override applyElementState(): void {
    super.applyElementState();

    const texture = this.texture;

    if (texture === null) {
      if (this.glyphElement !== null) this.glyphElement.style.display = 'none';
      if (this.shadowElement !== null) this.shadowElement.style.display = 'none';
      this.lastGlyphKey = '';
      return;
    }

    const colour = this.drawColourInfo.colour;
    const drawRect = this.drawRectangle;

    // scale texture to fit into drawable
    const scale = Math.min(drawRect.width / texture.width, drawRect.height / texture.height);
    const size = new Vector2(texture.width * scale, texture.height * scale);

    // move draw rectangle to make texture centered
    const location = drawRect.topLeft.add(drawRect.size.sub(size).mul(0.5));

    let shadowDrawColour: ColourInfo | null = null;

    if (this._shadow) {
      let shadowCol = ColourInfo.singleColour(this._shadowColour);

      //adjust shadow alpha based on highest component intensity to avoid muddy display of darker text.
      //squared result for quadratic fall-off seems to give the best result.
      const avgColour = colour.averageColour;
      const alpha = Math.pow(Math.max(Math.max(avgColour.r, avgColour.g), avgColour.b), 2);

      shadowCol = shadowCol.multiplyAlpha(alpha);

      shadowDrawColour = colour.applyChild(shadowCol);
    }

    const key = `${texture.pageUrl}|${texture.x},${texture.y}|${location}|${size}|${colour}|${shadowDrawColour !== null ? `${shadowDrawColour}|${this._shadowOffset}` : ''}`;
    if (key === this.lastGlyphKey)
      return;

    this.lastGlyphKey = key;

    if (shadowDrawColour !== null)
      this.place(this.shadowElement ??= this.createGlyphElement(), texture, location.add(this._shadowOffset), size, shadowDrawColour);
    else if (this.shadowElement !== null)
      this.shadowElement.style.display = 'none';

    this.place(this.glyphElement ??= this.createGlyphElement(), texture, location, size, colour);
  }

  private createGlyphElement(): HTMLElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.setProperty('mask-repeat', 'no-repeat');
    el.style.setProperty('-webkit-mask-repeat', 'no-repeat');

    // The shadow is drawn before (below) the glyph, even when it is enabled after the glyph element exists.
    if (this.glyphElement !== null)
      this.element.insertBefore(el, this.glyphElement);
    else
      this.element.appendChild(el);

    return el;
  }

  private place(el: HTMLElement, tex: GlyphTexture, location: Vector2, size: Vector2, colour: ColourInfo): void {
    const sx = size.x / tex.width;
    const sy = size.y / tex.height;
    const mask = `url("${tex.pageUrl}")`;
    const maskSize = `${tex.pageWidth * sx}px ${tex.pageHeight * sy}px`;
    const maskPos = `${-tex.x * sx}px ${-tex.y * sy}px`;

    el.style.transform = `translate(${location.x}px, ${location.y}px)`;
    el.style.width = `${size.x}px`;
    el.style.height = `${size.y}px`;
    el.style.background = colourInfoToCss(colour, true);
    el.style.setProperty('mask-image', mask);
    el.style.setProperty('-webkit-mask-image', mask);
    el.style.setProperty('mask-size', maskSize);
    el.style.setProperty('-webkit-mask-size', maskSize);
    el.style.setProperty('mask-position', maskPos);
    el.style.setProperty('-webkit-mask-position', maskPos);
    el.style.display = '';
  }

  // #endregion
}
