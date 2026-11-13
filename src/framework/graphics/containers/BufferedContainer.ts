// Ported from osu.Framework/Graphics/Containers/BufferedContainer.cs, BufferedContainer.DrawNode.cs and Graphics/BufferedDrawNode.cs
//
// DOM: there is no framebuffer. The element is an isolated group (children blend into it, not the screen, like the framebuffer),
// clipped to the framebuffer rectangle (ScreenSpaceDrawQuad.AABBFloat), filled with BackgroundColour and drawn with the frame buffer
// colour (opacity + brightness()/feColorMatrix tint) and DrawEffectBlending. Blur is CSS blur() with the second-moment-equivalent sigma
// of sh_Blur.fs, converted from frame-buffer texels to local units: texels / FrameBufferScale = osu! screen pixels (device pixels,
// osu! renders at full pixel density) / devicePixelRatio = CSS pixels / (local → screen scale).
// A cached frame buffer keeps showing its last rendering: children's elements are only re-validated when the draw version changes.
// DrawOriginal (the original drawn again with the effect) is an SVG filter: the effect is the blurred original times the effect colour (its
// alpha may exceed 1, as GlowEffect's strength makes it, and is clamped per pixel as the GL output is), drawn behind the original, in front of
// it, or added to it (additive effect blending in front).
// Not ported (throws): GrayscaleStrength. CSS blur is isotropic and clamps to transparent at the edges (osu! clamps to the edge texel), and
// anisotropic sigma / BlurRotation use max(sigma.X, sigma.Y).

import { Invalidation } from '../../layout/Enums';
import { InvalidationSource, LayoutValue } from '../../layout/Layout';
import { Matrix3 } from '../../layout/Matrix3';
import { Precision, Quad, RectangleF } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { effectiveKernelSigma, kernelSize } from '../../utils/Blur';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { BlendingParameters, DrawColourInfo } from '../DrawInfo';
import type { Drawable } from '../Drawable';
import { NO_EDGE_OFFSET } from '../rendering/MaskingInfo';
import { FrameBuffer, type Renderer } from '../rendering/Renderer';
import { BLUR_FS } from '../rendering/shaders';
import { Container } from './Container';

const white = ColourInfo.singleColour(Colour4.White);

export enum EffectPlacement {
  Behind,
  InFront,
}

let nextFilterId = 0;

/**
 * A container that renders its children to an internal framebuffer, and then blits the framebuffer to the screen, instead of directly
 * rendering the children to the screen. This allows otherwise impossible effects to be applied to the appearance of the container at the
 * cost of performance. Such effects include uniform fading of children, blur, and other post-processing effects.
 */
export class BufferedContainer<T extends Drawable = Drawable> extends Container<T> {
  private _drawOriginal = false;

  /** If true the original buffered children will be drawn a second time on top of any effect (e.g. blur). */
  get drawOriginal(): boolean {
    return this._drawOriginal;
  }

  set drawOriginal(value: boolean) {
    if (this._drawOriginal === value)
      return;

    this._drawOriginal = value;
    this.forceRedraw();
  }

  private _blurSigma = Vector2.Zero;

  /**
   * Controls the amount of blurring in two orthogonal directions (X and Y if blurRotation is zero).
   * Blur is parametrized by a gaussian image filter. This property controls the standard deviation (sigma) of the gaussian kernel.
   */
  get blurSigma(): Vector2 {
    return this._blurSigma;
  }

  set blurSigma(value: Vector2) {
    if (this._blurSigma.equals(value))
      return;

    this._blurSigma = value;
    this.forceRedraw();
  }

  private _blurRotation = 0;

  /** Rotates the blur kernel clockwise. In degrees. Has no effect if blurSigma has the same magnitude in both directions. */
  get blurRotation(): number {
    return this._blurRotation;
  }

  set blurRotation(value: number) {
    if (this._blurRotation === value)
      return;

    this._blurRotation = value;
    this.forceRedraw();
  }

  private _effectColour = ColourInfo.singleColour(Colour4.White);

  /**
   * The multiplicative colour of drawn buffered object after applying all effects (e.g. blur). Default is White.
   * Does not affect the original which is drawn when drawOriginal is true.
   */
  get effectColour(): ColourInfo {
    return this._effectColour;
  }

  set effectColour(value: ColourInfo | Colour4) {
    const colour = ColourInfo.from(value);

    if (this._effectColour.equals(colour))
      return;

    this._effectColour = colour;
    this.invalidate(Invalidation.DrawNode);
  }

  private _effectBlending = BlendingParameters.Inherit;

  /**
   * The BlendingParameters to use after applying all effects. Default is Inherit, which inherits the blending mode of the original,
   * i.e. blending is used. Does not affect the original which is drawn when drawOriginal is true.
   */
  get effectBlending(): BlendingParameters {
    return this._effectBlending;
  }

  set effectBlending(value: BlendingParameters) {
    if (this._effectBlending === value)
      return;

    this._effectBlending = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _effectPlacement = EffectPlacement.Behind;

  /** Whether the buffered effect should be drawn behind or in front of the original. Behind by default. Does not have any effect if drawOriginal is false. */
  get effectPlacement(): EffectPlacement {
    return this._effectPlacement;
  }

  set effectPlacement(value: EffectPlacement) {
    if (this._effectPlacement === value)
      return;

    this._effectPlacement = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _backgroundColour = new Colour4(0, 0, 0, 0);

  /** The background colour of the framebuffer. Transparent black by default. */
  get backgroundColour(): Colour4 {
    return this._backgroundColour;
  }

  set backgroundColour(value: Colour4) {
    if (this._backgroundColour.equals(value))
      return;

    this._backgroundColour = value;
    this.forceRedraw();
  }

  private _frameBufferScale = Vector2.One;

  get frameBufferScale(): Vector2 {
    return this._frameBufferScale;
  }

  set frameBufferScale(value: Vector2) {
    if (this._frameBufferScale.equals(value))
      return;

    this._frameBufferScale = value;
    this.forceRedraw();
  }

  private _grayscaleStrength = 0;

  get grayscaleStrength(): number {
    return this._grayscaleStrength;
  }

  set grayscaleStrength(value: number) {
    if (this._grayscaleStrength === value)
      return;

    this._grayscaleStrength = value;
    this.forceRedraw();
  }

  /**
   * Whether the rendered framebuffer is being cached until forceRedraw is called or the size of the container (i.e. framebuffer) changes.
   * If false, then the framebuffer is re-rendered before it is blitted to the screen; equivalent to calling forceRedraw every frame.
   */
  readonly usingCachedFrameBuffer: boolean;

  private _redrawOnScale = true;

  /** Whether to redraw this BufferedContainer when the draw scale changes. */
  get redrawOnScale(): boolean {
    return this._redrawOnScale;
  }

  set redrawOnScale(value: boolean) {
    if (this._redrawOnScale === value)
      return;

    this._redrawOnScale = value;
    this.screenSpaceSizeBacking.invalidate();
  }

  /** Forces a redraw of the framebuffer before it is blitted the next time. Only relevant if usingCachedFrameBuffer is true. */
  forceRedraw(): void {
    this.invalidate(Invalidation.DrawNode);
  }

  /**
   * In order to signal the draw thread to re-draw the buffered container we version it.
   * Our own version (update) keeps track of which version we are on, whereas the
   * drawVersion keeps track of the version the draw thread is on.
   * When forcing a redraw we increment updateVersion, pass it into each new drawnode
   * and the draw thread will realize its drawVersion is lagging behind, thus redrawing.
   */
  private updateVersion = 0;

  /**
   * pixelSnapping: whether the frame buffer position should be snapped to the nearest pixel when blitting (no DOM effect).
   * cachedFrameBuffer: whether the rendered frame buffer should be cached until forceRedraw is called or the size of the container
   * (i.e. frame buffer) changes.
   */
  constructor({ cachedFrameBuffer = false }: { pixelSnapping?: boolean; cachedFrameBuffer?: boolean } = {}) {
    super();

    this.usingCachedFrameBuffer = cachedFrameBuffer;

    this.addLayout(this.screenSpaceSizeBacking);

    this.element.style.isolation = 'isolate';
  }

  override updateSubTreeMasking(): boolean {
    const result = super.updateSubTreeMasking();

    this.childrenUpdateVersion = this.updateVersion;

    return result;
  }

  // Make sure children never get masked away
  protected override computeChildMaskingBounds(): RectangleF {
    return this.screenSpaceDrawQuad.aabbFloat;
  }

  private lastScreenSpaceSize = Vector2.Zero;

  // We actually only care about Invalidation.MiscGeometry | Invalidation.DrawInfo
  private readonly screenSpaceSizeBacking = new LayoutValue(Invalidation.Presence | Invalidation.RequiredParentSizeToFit | Invalidation.DrawInfo);

  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    let result = super.onInvalidate(invalidation, source);

    if ((invalidation & Invalidation.DrawNode) > 0) {
      ++this.updateVersion;
      result = true;
    }

    return result;
  }

  private childrenUpdateVersion = -1;

  protected override get requiresChildrenUpdate(): boolean {
    return super.requiresChildrenUpdate && this.childrenUpdateVersion !== this.updateVersion;
  }

  protected override update(): void {
    super.update();

    // Invalidate drawn frame buffer every frame.
    if (!this.usingCachedFrameBuffer)
      this.forceRedraw();
    else if (!this.screenSpaceSizeBacking.isValid) {
      let drawSize = this.screenSpaceDrawQuad.aabbFloat.size;

      if (!this._redrawOnScale) {
        // Matrix3.CreateScale(DrawInfo.MatrixInverse.ExtractScale()): row lengths of the inverse matrix
        const inv = this.drawInfo.matrixInverse;
        drawSize = new Vector2(drawSize.x * Math.hypot(inv.m11, inv.m12, inv.m13), drawSize.y * Math.hypot(inv.m21, inv.m22, inv.m23));
      }

      if (!Precision.almostEqualsVector(this.lastScreenSpaceSize, drawSize)) {
        ++this.updateVersion;
        this.lastScreenSpaceSize = drawSize;
      }

      this.screenSpaceSizeBacking.validate();
    }
  }

  /** The blending which the draw node uses for the effect. */
  get drawEffectBlending(): BlendingParameters {
    let blending = this._effectBlending;

    // CopyFromParent(Blending), ApplyDefaultToInherited()
    if (blending === BlendingParameters.Inherit)
      blending = this.blending;
    if (blending === BlendingParameters.Inherit)
      blending = BlendingParameters.Mixture;

    return blending;
  }

  get frameBufferDrawColour(): DrawColourInfo {
    return super.drawColourInfo;
  }

  // Children should not receive the true colour to avoid colour doubling when the frame-buffers are rendered to the back-buffer.
  override get drawColourInfo(): DrawColourInfo {
    // Todo: This is incorrect.
    let blending = this.blending;
    if (blending === BlendingParameters.Inherit)
      blending = BlendingParameters.Mixture;

    return new DrawColourInfo(ColourInfo.singleColour(Colour4.White), blending);
  }

  // #region DrawNode (Renderer): BufferedDrawNode.cs, BufferedContainer.DrawNode.cs, BufferedDrawNodeSharedData.cs

  /** BufferedContainerDrawNodeSharedData: the main buffer and two effect buffers, of the renderer that last drew this container. */
  private sharedData: {
    renderer: Renderer; mainBuffer: FrameBuffer; effectBuffers: (FrameBuffer | null)[]; currentEffectBuffer: number; drawVersion: number;
    /** The underlay sprites drawn into the buffer when it was last redrawn (Renderer, Underlays). */
    underlays: ((blur: number) => void)[];
  } | null = null;

  /** RequiresRedraw: GetDrawVersion() > SharedData.DrawVersion */
  private get requiresRedraw(): boolean {
    return this.sharedData === null || this.updateVersion > this.sharedData.drawVersion;
  }

  /** ICompositeDrawNode.AddChildDrawNodes */
  protected override get addChildDrawNodes(): boolean {
    return this.requiresRedraw;
  }

  private rootNodeCached: Drawable | null = null;

  /** BufferedDrawNode.Draw */
  override draw(renderer: Renderer): void {
    if (this.sharedData !== null && this.sharedData.renderer !== renderer)
      this.disposeSharedData();

    const sharedData = this.sharedData ??= { renderer, mainBuffer: new FrameBuffer(renderer), effectBuffers: [null, null], currentEffectBuffer: -1, drawVersion: -1, underlays: [] };

    // ApplyState
    let screenSpaceDrawRectangle = this.screenSpaceDrawQuad.aabbFloat;
    const drawColourInfo = this.frameBufferDrawColour;

    // clipDrawRectangle (SharedData.ClipToRootNode is !usingCachedFrameBuffer)
    if (!this.usingCachedFrameBuffer) {
      if (this.rootNodeCached === null) {
        let rootNode: Drawable = this;
        while (rootNode.parent !== null) rootNode = rootNode.parent;
        this.rootNodeCached = rootNode;
      }

      const rootQuad = this.rootNodeCached.screenSpaceDrawQuad;
      screenSpaceDrawRectangle = RectangleF.intersect(screenSpaceDrawRectangle, new RectangleF(rootQuad.topLeft.x, rootQuad.topLeft.y, rootQuad.width, rootQuad.height));
    }

    // (the client's screen space is device pixels; a frame buffer has pixelRatio texels per screen-space unit at FrameBufferScale 1)
    const frameBufferWidth = Math.ceil(screenSpaceDrawRectangle.width * this._frameBufferScale.x * renderer.pixelRatio);
    const frameBufferHeight = Math.ceil(screenSpaceDrawRectangle.height * this._frameBufferScale.y * renderer.pixelRatio);

    if (frameBufferWidth <= 0 || frameBufferHeight <= 0)
      return;

    if (this.updateVersion > sharedData.drawVersion) {
      sharedData.currentEffectBuffer = -1;

      // establishFrameBufferViewport
      renderer.pushMaskingInfo({
        screenSpaceAABB: screenSpaceDrawRectangle,
        maskingRect: screenSpaceDrawRectangle,
        toMaskingSpace: Matrix3.identity(),
        cornerRadius: 0,
        cornerExponent: 2.5,
        borderThickness: 0,
        borderColour: null,
        blendRange: 1,
        alphaExponent: 1,
        edgeOffset: NO_EDGE_OFFSET,
        hollow: false,
        hollowCornerRadius: 0,
      }, true);

      renderer.pushViewport(new RectangleF(0, 0, frameBufferWidth, frameBufferHeight), frameBufferWidth, frameBufferHeight);
      renderer.pushScissor(new RectangleF(0, 0, frameBufferWidth, frameBufferHeight));

      sharedData.mainBuffer.setSize(frameBufferWidth, frameBufferHeight);
      sharedData.mainBuffer.bind();

      renderer.pushOrtho(screenSpaceDrawRectangle);

      const background = this._backgroundColour;
      renderer.clear(background.r, background.g, background.b, background.a);

      // DrawOther(Child): the CompositeDrawableDrawNode of this container.
      const capture = renderer.beginUnderlayCapture();
      super.draw(renderer);
      sharedData.underlays = renderer.endUnderlayCapture(capture);

      renderer.popProjectionMatrix();

      sharedData.mainBuffer.unbind();

      this.populateContents(renderer, frameBufferWidth, frameBufferHeight);

      // returnViewport
      renderer.popViewport();
      renderer.popScissor();
      renderer.popMaskingInfo();

      sharedData.drawVersion = this.updateVersion;
    }

    renderer.bindShader(renderer.textureShader);

    // base.Draw
    renderer.setBlend(drawColourInfo.blending);

    // DrawContents
    const quad = Quad.fromRectangle(screenSpaceDrawRectangle);

    if (sharedData.underlays.length > 0) {
      // Web: the buffer holds the coverage of sprites whose images only the page can show. The images go behind the canvas, blurred by CSS
      // as much as the buffer was (in CSS pixels: buffer texels / FrameBufferScale / pixelRatio), and the buffer is drawn as their hole.
      if (renderer.canShowUnderlays) {
        const sigmaX = effectiveKernelSigma(kernelSize(this._blurSigma.x), this._blurSigma.x) / this._frameBufferScale.x;
        const sigmaY = effectiveKernelSigma(kernelSize(this._blurSigma.y), this._blurSigma.y) / this._frameBufferScale.y;
        const blur = Math.max(sigmaX, sigmaY) / renderer.pixelRatio;

        for (const place of sharedData.underlays)
          place(blur);

        const buffer = sharedData.currentEffectBuffer === -1 ? sharedData.mainBuffer : sharedData.effectBuffers[sharedData.currentEffectBuffer]!;
        const colour = drawColourInfo.colour.applyChild(this._effectColour);
        const average = colour.averageColour;

        renderer.punchHole(colour, (average.r + average.g + average.b) / 3, c => renderer.drawFrameBuffer(buffer, quad, c));
      }

      return;
    }

    if (this._drawOriginal && this._effectPlacement === EffectPlacement.InFront)
      renderer.drawFrameBuffer(sharedData.mainBuffer, quad, drawColourInfo.colour);

    renderer.setBlend(this.drawEffectBlending);

    const currentEffectBuffer = sharedData.currentEffectBuffer === -1 ? sharedData.mainBuffer : sharedData.effectBuffers[sharedData.currentEffectBuffer]!;
    renderer.drawFrameBuffer(currentEffectBuffer, quad, drawColourInfo.colour.applyChild(this._effectColour));

    if (this._drawOriginal && this._effectPlacement === EffectPlacement.Behind) {
      // (base.DrawContents draws with the blending of base.Draw)
      renderer.setBlend(drawColourInfo.blending);
      renderer.drawFrameBuffer(sharedData.mainBuffer, quad, drawColourInfo.colour);
    }
  }

  /** PopulateContents */
  private populateContents(renderer: Renderer, frameBufferWidth: number, frameBufferHeight: number): void {
    const radiusX = kernelSize(this._blurSigma.x);
    const radiusY = kernelSize(this._blurSigma.y);

    if (this._grayscaleStrength > 0)
      throw new Error('GrayscaleStrength is not ported.');

    if (radiusX > 0 || radiusY > 0) {
      renderer.pushScissorState(false);

      if (radiusX > 0) this.drawBlurredFrameBuffer(renderer, radiusX, this._blurSigma.x, this._blurRotation, frameBufferWidth, frameBufferHeight);
      if (radiusY > 0) this.drawBlurredFrameBuffer(renderer, radiusY, this._blurSigma.y, this._blurRotation + 90, frameBufferWidth, frameBufferHeight);

      renderer.popScissorState();
    }
  }

  private drawBlurredFrameBuffer(renderer: Renderer, kernelRadius: number, sigma: number, blurRotation: number, frameBufferWidth: number, frameBufferHeight: number): void {
    const sharedData = this.sharedData!;

    const current = sharedData.currentEffectBuffer === -1 ? sharedData.mainBuffer : sharedData.effectBuffers[sharedData.currentEffectBuffer]!;

    // GetNextEffectBuffer
    if (++sharedData.currentEffectBuffer >= sharedData.effectBuffers.length)
      sharedData.currentEffectBuffer = 0;

    const target = sharedData.effectBuffers[sharedData.currentEffectBuffer] ??= new FrameBuffer(renderer);

    renderer.setBlend(BlendingParameters.None);

    target.setSize(frameBufferWidth, frameBufferHeight);
    target.bind();

    const radians = blurRotation * Math.PI / 180;

    renderer.bindShader(renderer.loadShader('Blur', BLUR_FS));
    renderer.setShaderUniforms([
      { name: 'g_TexSize', x: current.width, y: current.height },
      { name: 'g_Radius', x: kernelRadius, integer: true },
      { name: 'g_Sigma', x: sigma },
      { name: 'g_BlurDirection', x: Math.cos(radians), y: Math.sin(radians) },
    ]);

    renderer.drawFrameBuffer(current, Quad.fromRectangle(new RectangleF(0, 0, current.width, current.height)), white);

    renderer.bindShader(renderer.textureShader);

    target.unbind();
  }

  private disposeSharedData(): void {
    const sharedData = this.sharedData;
    if (sharedData === null) return;

    sharedData.mainBuffer.dispose();
    for (const buffer of sharedData.effectBuffers) buffer?.dispose();

    this.sharedData = null;
  }

  // #endregion

  // #region DOM (BufferedDrawNode)

  /** SharedData.DrawVersion: the version the element subtree was last rendered at. */
  private drawVersion = -1;

  /** AddChildDrawNodes => RequiresRedraw: children are only re-rendered when the draw version moved on. */
  override validateElementSubTree(): void {
    if (this.updateVersion > this.drawVersion) {
      super.validateElementSubTree();
      this.drawVersion = this.updateVersion;
    } else
      this.validateElement();
  }

  private filterSvg: SVGSVGElement | null = null;
  private filterMatrix: SVGFEColorMatrixElement | null = null;

  // (the canvas resolution / blur scale follows the on-screen scale)
  protected override get elementStateUsesScreenSpace(): boolean {
    return true;
  }

  protected override applyElementState(): void {
    super.applyElementState();

    if (this._grayscaleStrength > 0)
      throw new Error('BufferedContainer.grayscaleStrength is not supported by the DOM port.');

    const style = this.element.style;

    // finalEffectColour = DrawColourInfo.Colour.ApplyChild(effectColour); gradients are drawn with their average colour.
    const colour = this.frameBufferDrawColour.colour.applyChild(this._effectColour).averageColour;
    // (the original is drawn with the frame buffer's colour, without the effect colour)
    const opacity = this._drawOriginal ? this.frameBufferDrawColour.colour.averageColour.a : colour.a;
    style.opacity = opacity >= 1 ? '' : `${Math.max(0, opacity)}`;

    const filters: string[] = [];

    const sigma = Math.max(this._blurSigma.x, this._blurSigma.y);
    const radius = kernelSize(sigma);
    let cssSigma = 0;

    if (radius > 0) {
      const scale = this._blurSigma.x >= this._blurSigma.y ? this._frameBufferScale.x : this._frameBufferScale.y;
      const m = this.drawInfo.matrix;
      const localToScreen = Math.sqrt(Math.abs(m.m11 * m.m22 - m.m12 * m.m21)) || 1;
      cssSigma = effectiveKernelSigma(radius, sigma) / scale / devicePixelRatioOf(this.element) / localToScreen;
    }

    const r = Math.min(1, Math.max(0, colour.r)), g = Math.min(1, Math.max(0, colour.g)), b = Math.min(1, Math.max(0, colour.b));

    if (this._drawOriginal) {
      if (colour.a > 0)
        filters.push(`url(#${this.ensureEffectFilter(cssSigma, r, g, b, colour.a)})`);
    } else if (cssSigma > 0)
      filters.push(`blur(${cssSigma}px)`);

    if (!this._drawOriginal && (r !== 1 || g !== 1 || b !== 1)) {
      if (r === g && g === b)
        filters.push(`brightness(${r})`);
      else
        filters.push(`url(#${this.ensureColourMatrix(r, g, b)})`);
    }

    style.filter = filters.join(' ');

    // The frame buffer covers the screen-space AABB of the draw quad; nothing outside it (blur included) is drawn.
    const local = this.framebufferRectangleInLocalSpace();
    const size = this.drawSize;
    style.clipPath = `inset(${local.y}px ${size.x - local.right}px ${size.y - local.bottom}px ${local.x}px)`;

    style.backgroundColor = this._backgroundColour.a > 0 ? this._backgroundColour.toCss() : '';
    // (with drawOriginal, the effect blending only applies to the effect: the element is the original, drawn with the frame buffer's blending)
    const blending = this._drawOriginal ? this.frameBufferDrawColour.blending : this.drawEffectBlending;
    style.mixBlendMode = blending === BlendingParameters.Additive ? 'plus-lighter' : '';
  }

  private framebufferRectangleInLocalSpace(): RectangleF {
    const aabb = this.screenSpaceDrawQuad.aabbFloat;
    const corners = [
      this.toLocalSpace(new Vector2(aabb.x, aabb.y)), this.toLocalSpace(new Vector2(aabb.right, aabb.y)),
      this.toLocalSpace(new Vector2(aabb.x, aabb.bottom)), this.toLocalSpace(new Vector2(aabb.right, aabb.bottom)),
    ];

    const min = corners.reduce((a, c) => Vector2.componentMin(a, c));
    const max = corners.reduce((a, c) => Vector2.componentMax(a, c));
    return new RectangleF(min.x, min.y, max.x - min.x, max.y - min.y);
  }

  private ensureColourMatrix(r: number, g: number, b: number): string {
    if (this.filterSvg === null) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';

      const filter = document.createElementNS(ns, 'filter');
      filter.id = `buffered-tint-${nextFilterId++}`;
      filter.setAttribute('color-interpolation-filters', 'sRGB');

      const matrix = document.createElementNS(ns, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');

      filter.appendChild(matrix);
      svg.appendChild(filter);
      document.body.appendChild(svg);

      this.filterSvg = svg;
      this.filterMatrix = matrix;
    }

    this.filterMatrix!.setAttribute('values', `${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0`);
    return (this.filterMatrix!.parentNode as SVGFilterElement).id;
  }

  private effectSvg: SVGSVGElement | null = null;
  private effectFilterKey = '';

  /** The drawOriginal filter: the original, and its blur (standard deviation sigma, local units) times the effect colour. */
  private ensureEffectFilter(sigma: number, r: number, g: number, b: number, a: number): string {
    const ns = 'http://www.w3.org/2000/svg';

    if (this.effectSvg === null) {
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';

      const filter = document.createElementNS(ns, 'filter');
      filter.id = `buffered-effect-${nextFilterId++}`;
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      // (the padded frame buffer already bounds the effect; the clip path cuts it to the frame buffer rectangle)
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');

      svg.appendChild(filter);
      document.body.appendChild(svg);
      this.effectSvg = svg;
    }

    const filter = this.effectSvg.firstChild as SVGFilterElement;
    const additive = this.drawEffectBlending === BlendingParameters.Additive;
    const key = `${sigma}|${r},${g},${b},${a}|${this._effectPlacement}|${additive}`;

    if (key !== this.effectFilterKey) {
      this.effectFilterKey = key;
      filter.replaceChildren();

      const blur = document.createElementNS(ns, 'feGaussianBlur');
      blur.setAttribute('in', 'SourceGraphic');
      blur.setAttribute('stdDeviation', `${sigma}`);
      blur.setAttribute('result', 'blurred');

      const tint = document.createElementNS(ns, 'feColorMatrix');
      tint.setAttribute('in', 'blurred');
      tint.setAttribute('type', 'matrix');
      tint.setAttribute('values', `${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 ${a} 0`);
      tint.setAttribute('result', 'effect');

      filter.append(blur, tint);

      if (this._effectPlacement === EffectPlacement.InFront && additive) {
        const add = document.createElementNS(ns, 'feComposite');
        add.setAttribute('in', 'SourceGraphic');
        add.setAttribute('in2', 'effect');
        add.setAttribute('operator', 'arithmetic');
        add.setAttribute('k2', '1');
        add.setAttribute('k3', '1');
        filter.appendChild(add);
      } else {
        const merge = document.createElementNS(ns, 'feMerge');
        const layers = this._effectPlacement === EffectPlacement.InFront ? ['SourceGraphic', 'effect'] : ['effect', 'SourceGraphic'];

        for (const layer of layers) {
          const node = document.createElementNS(ns, 'feMergeNode');
          node.setAttribute('in', layer);
          merge.appendChild(node);
        }

        filter.appendChild(merge);
      }
    }

    return filter.id;
  }

  override dispose(): void {
    this.disposeSharedData();
    this.filterSvg?.remove();
    this.filterSvg = null;
    this.effectSvg?.remove();
    this.effectSvg = null;
    super.dispose();
  }

  // #endregion
}

function devicePixelRatioOf(element: HTMLElement): number {
  return element.ownerDocument.defaultView?.devicePixelRatio || 1;
}
