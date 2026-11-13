// Ported from osu.Framework/Graphics/Rendering/Renderer.cs, RendererExtensions.cs (DrawQuad, PushOrtho) and the GL backend
// (Graphics/OpenGL/GLRenderer.cs, Buffers/GLVertexBatch.cs, Textures/GLTexture.cs), onto WebGL2.
//
// Web differences:
//  - Single-threaded: there are no DrawNodes carrying state to a draw thread. Drawables draw straight from their own state (Drawable.draw).
//  - Screen space is CSS pixels (the scene graph's root space). The canvas has pixelRatio device pixels per screen-space unit; the viewport
//    is in device pixels and the projection in screen-space units. Draw code that means "one pixel" (masking smoothness, edge smoothness)
//    divides by pixelRatio, as the client's screen space is device pixels.
//  - The backbuffer is a transparent canvas composited over the DOM (premultiplied alpha), so on the backbuffer the alpha channel uses
//    "over" factors instead of the client's (One, One): see setBlendImplementation.
//  - The front-to-back opaque interior pass (an overdraw optimisation that doesn't change the image) is not ported.
//  - Vertices of a frame go into one streaming buffer; each flush uploads and draws only its own range.

import { Matrix3 } from '../../layout/Matrix3';
import { type Quad, RectangleF } from '../../layout/Primitives';
import type { Vector2 } from '../../layout/Vector2';
import type { Colour4 } from '../Colour4';
import type { ColourInfo } from '../ColourInfo';
import { BlendingParameters } from '../DrawInfo';
import { Texture } from '../textures/Texture';
import { type MaskingInfo, maskingInfoEquals, NO_EDGE_OFFSET } from './MaskingInfo';
import { ATLAS_BLIT_FS, ATLAS_BLIT_VS, GLOBAL_UNIFORMS_SIZE, TEXTURE_2D_VS, TEXTURE_FS, TEXTURED_VERTEX_2D_ATTRIBUTES } from './shaders';

/** Graphics/Textures/WrapMode.cs */
export enum WrapMode {
  None = 0,
  ClampToEdge = 1,
  ClampToBorder = 2,
  Repeat = 3,
}

/** IRenderer.MAX_MIPMAP_LEVELS */
export const MAX_MIPMAP_LEVELS = 3;

/** Floats per TexturedVertex2D: Position(2) Colour(4) TexturePosition(2) TextureRect(4) BlendRange(2). */
const VERTEX_FLOATS = 14;
const QUAD_FLOATS = VERTEX_FLOATS * 4;

/** Quads per streaming buffer: the most a 16-bit index buffer addresses. */
const MAX_QUADS = 16384;

export class Shader {
  readonly program: WebGLProgram;

  private readonly uniformLocations = new Map<string, WebGLUniformLocation | null>();

  constructor(private readonly gl: WebGL2RenderingContext, readonly name: string, vertexSource: string, fragmentSource: string, attributes: readonly string[]) {
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`Shader ${name} failed to compile: ${gl.getShaderInfoLog(shader)}`);

      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));

    attributes.forEach((a, i) => gl.bindAttribLocation(program, i, a));

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Shader ${name} failed to link: ${gl.getProgramInfoLog(program)}`);

    const block = gl.getUniformBlockIndex(program, 'g_GlobalUniforms');
    if (block !== gl.INVALID_INDEX)
      gl.uniformBlockBinding(program, block, 0);

    this.program = program;
  }

  getUniformLocation(name: string): WebGLUniformLocation | null {
    let location = this.uniformLocations.get(name);

    if (location === undefined)
      this.uniformLocations.set(name, location = this.gl.getUniformLocation(this.program, name));

    return location;
  }
}

export interface NativeTexture {
  readonly texture: WebGLTexture;
  wrapS: WrapMode;
  wrapT: WrapMode;
  width: number;
  height: number;
  /** Whether level 0 changed since the mipmaps were generated (they are regenerated when the texture is next bound). */
  mipmapsDirty: boolean;
}

/** A rectangle of an atlas texture (TextureRegion). */
export interface AtlasRegion {
  readonly native: NativeTexture;
  /** The texture rectangle, in UV. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** TextureAtlas.PADDING: (1 << MAX_MIPMAP_LEVELS) * Sprite.MAX_EDGE_SMOOTHNESS */
const ATLAS_PADDING = (1 << 3) * 3;
const ATLAS_SIZE = 2048;

/**
 * Graphics/Textures/TextureAtlas.cs + TextureAtlas.BackingAtlasTexture.cs. Sub-textures are placed left to right in rows, PADDING apart,
 * and half of the padding around each is filled with its edge pixels' colour at zero alpha, so that neither linear filtering nor the
 * mipmaps blend a sub-texture with black or with its neighbours.
 * Web: the client composes the padding on the CPU and uploads it; here the source is already a texture (an image the browser decoded),
 * so the sub-texture and its padding are drawn into the atlas by a shader, and the mipmaps are generated when the atlas is next bound.
 */
class TextureAtlas {
  native: NativeTexture;

  private readonly bounds: { right: number; bottom: number }[] = [];
  private x = ATLAS_PADDING;
  private y = ATLAS_PADDING;

  constructor(private readonly renderer: Renderer) {
    this.native = renderer.createEmptyTexture(ATLAS_SIZE, ATLAS_SIZE, true);
  }

  static canFit(width: number, height: number): boolean {
    return width <= ATLAS_SIZE - ATLAS_PADDING * 2 && height <= ATLAS_SIZE - ATLAS_PADDING * 2;
  }

  /** findPosition. Returns null when the atlas is full (the caller starts a new one, as Reset does). */
  findPosition(width: number, height: number): { x: number; y: number } | null {
    if (this.y + height + ATLAS_PADDING > ATLAS_SIZE)
      return null;

    if (this.x + width + ATLAS_PADDING > ATLAS_SIZE) {
      let maxY = 0;
      for (const b of this.bounds) maxY = Math.max(maxY, b.bottom + ATLAS_PADDING);

      this.bounds.length = 0;
      this.x = ATLAS_PADDING;
      this.y = maxY;

      return this.findPosition(width, height);
    }

    const result = { x: this.x, y: this.y };
    this.bounds.push({ right: result.x + width, bottom: result.y + height });
    this.x += width + ATLAS_PADDING;

    return result;
  }
}

/**
 * Graphics/OpenGL/Buffers/GLFrameBuffer.cs: a texture that can be drawn to. Its size is in device pixels.
 * Bound with Renderer.bindFrameBuffer and drawn with Renderer.drawFrameBuffer.
 */
export class FrameBuffer {
  readonly native: NativeTexture;
  readonly framebuffer: WebGLFramebuffer;

  constructor(private readonly renderer: Renderer, nearest = false) {
    const gl = renderer.gl;

    this.native = renderer.createEmptyTexture(1, 1, false, nearest);
    this.framebuffer = gl.createFramebuffer()!;

    renderer.attach(this);
  }

  get width(): number {
    return this.native.width;
  }

  get height(): number {
    return this.native.height;
  }

  /** IFrameBuffer.Size: (re)allocates the texture when the size changes (its contents are then undefined). */
  setSize(width: number, height: number): void {
    const max = this.renderer.maxTextureSize;
    width = Math.min(Math.max(Math.ceil(width), 1), max);
    height = Math.min(Math.max(Math.ceil(height), 1), max);

    if (width === this.native.width && height === this.native.height)
      return;

    this.renderer.resizeTexture(this.native, width, height);
  }

  bind(): void {
    this.renderer.bindFrameBuffer(this);
  }

  unbind(): void {
    this.renderer.unbindFrameBuffer(this);
  }

  dispose(): void {
    const gl = this.renderer.gl;
    gl.deleteFramebuffer(this.framebuffer);
    this.renderer.deleteNativeTexture(this.native);
  }
}

/** Statistics of the last completed frame. */
export interface RendererStatistics {
  drawCalls: number;
  quads: number;
  maskingChanges: number;
  textureBinds: number;
  /** Frame buffers bound (a buffered container's redraw binds its main buffer once, and one more per blur pass). */
  frameBufferBinds: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;

  /** Device pixels per screen-space unit. */
  pixelRatio = 1;

  frameIndex = 0;

  readonly statistics: RendererStatistics = { drawCalls: 0, quads: 0, maskingChanges: 0, textureBinds: 0, frameBufferBinds: 0 };
  private readonly frameStatistics: RendererStatistics = { drawCalls: 0, quads: 0, maskingChanges: 0, textureBinds: 0, frameBufferBinds: 0 };

  /** The shader of sprites, boxes and text (the "Texture2D"/"Texture" pair of the ShaderManager). */
  readonly textureShader: Shader;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      // Edges are anti-aliased by the shaders (blend ranges), as in the client, which doesn't use MSAA.
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      // A hint: only honoured where the platform can skip the compositor (not macOS as of 2026).
      desynchronized: true,
    }) as WebGL2RenderingContext | null;

    if (gl === null)
      throw new Error('WebGL2 is not available.');

    this.gl = gl;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    this.textureShader = this.createShader('Texture', TEXTURE_2D_VS, TEXTURE_FS, TEXTURED_VERTEX_2D_ATTRIBUTES);

    this.uniformBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, GLOBAL_UNIFORMS_SIZE, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuffer);

    // Quad batch: one vertex buffer for the frame's quads and a static index buffer (GLQuadBuffer's indices: 0 1 3, 2 3 1 per quad).
    this.vertexArray = gl.createVertexArray()!;
    gl.bindVertexArray(this.vertexArray);

    this.vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.STREAM_DRAW);

    const stride = VERTEX_FLOATS * 4;
    let offset = 0;
    [2, 4, 2, 4, 2].forEach((size, location) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      offset += size * 4;
    });

    const indices = new Uint16Array(MAX_QUADS * 6);

    for (let i = 0, j = 0; j < MAX_QUADS * 4; i += 6, j += 4) {
      indices[i] = j;
      indices[i + 1] = j + 1;
      indices[i + 2] = j + 3;
      indices[i + 3] = j + 2;
      indices[i + 4] = j + 3;
      indices[i + 5] = j + 1;
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    this.whitePixel = this.createNativeTexture(new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1), false);
  }

  createShader(name: string, vertexSource: string, fragmentSource: string, attributes: readonly string[]): Shader {
    return new Shader(this.gl, name, vertexSource, fragmentSource, attributes);
  }

  private readonly shaders = new Map<string, Shader>();

  /** ShaderManager.Load(VertexShaderDescriptor.TEXTURE_2, name): a fragment shader for TexturedVertex2D, compiled on first use. */
  loadShader(name: string, fragmentSource: string): Shader {
    let shader = this.shaders.get(name);

    if (shader === undefined)
      this.shaders.set(name, shader = this.createShader(name, TEXTURE_2D_VS, fragmentSource, TEXTURED_VERTEX_2D_ATTRIBUTES));

    return shader;
  }

  // #region Frame

  /**
   * Resets any states to prepare for drawing a new frame.
   * @param window The screen-space rectangle the canvas shows (the client's window is (0, 0, windowSize)); the canvas' size is the viewport.
   */
  beginFrame(window: RectangleF): void {
    const gl = this.gl;
    const viewportWidth = gl.drawingBufferWidth;
    const viewportHeight = gl.drawingBufferHeight;

    this.frameIndex++;

    const fs = this.frameStatistics;
    fs.drawCalls = fs.quads = fs.maskingChanges = fs.textureBinds = fs.frameBufferBinds = 0;

    this.globalUniformsChanged = true;
    this.currentBlending = null;
    this.currentMaskingInfo = null;

    this.shader = null;
    this.boundTexture = null;

    this.viewportStack.length = 0;
    this.projectionStack.length = 0;
    this.maskingStack.length = 0;
    this.scissorStack.length = 0;
    this.scissorStateStack.length = 0;

    this.quadStart = this.quadCount = 0;

    // Orphan last frame's vertices, so this frame's uploads never wait for draws still reading them.
    gl.bindVertexArray(this.vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.STREAM_DRAW);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.usingBackbuffer = true;

    this.scissor = null;
    this.scissorState = null;
    this.viewport = null;

    this.pushScissorState(true);
    this.pushViewport(window, viewportWidth, viewportHeight);
    this.pushScissor(new RectangleF(0, 0, viewportWidth, viewportHeight));
    this.pushMaskingInfo({
      screenSpaceAABB: window,
      maskingRect: window,
      toMaskingSpace: Matrix3.identity(),
      cornerRadius: 0,
      borderThickness: 0,
      borderColour: null,
      blendRange: 1,
      alphaExponent: 1,
      cornerExponent: 2.5,
      edgeOffset: NO_EDGE_OFFSET,
      hollow: false,
      hollowCornerRadius: 0,
    }, true);

    // The client clears to opaque black. A backbuffer that is a layer over other DOM content starts transparent instead.
    this.clear(0, 0, 0, this.opaque ? 1 : 0);

    this.window = window;
    this.underlayIndex = 0;
  }

  /** Whether the backbuffer is the whole picture (cleared to opaque black, as the client's) or a transparent layer over the page. */
  opaque = false;

  private window: RectangleF = RectangleF.Empty;

  finishFrame(): void {
    this.flushCurrentBatch();
    this.finishUnderlays();

    const fs = this.frameStatistics;
    const s = this.statistics;
    s.drawCalls = fs.drawCalls;
    s.quads = fs.quads;
    s.maskingChanges = fs.maskingChanges;
    s.textureBinds = fs.textureBinds;
    s.frameBufferBinds = fs.frameBufferBinds;
  }

  clear(r: number, g: number, b: number, a: number): void {
    const gl = this.gl;

    this.pushScissorState(false);

    gl.clearColor(r, g, b, a);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.popScissorState();
  }

  // #endregion

  // #region Blending

  /** (null: not set this frame) */
  private currentBlending: BlendingParameters | null = null;

  setBlend(blending: BlendingParameters): void {
    if (this.currentBlending === blending)
      return;

    this.flushCurrentBatch();
    this.setBlendImplementation(blending);

    this.currentBlending = blending;
  }

  private setBlendImplementation(blending: BlendingParameters): void {
    const gl = this.gl;

    // The client's presets (BlendingParameters.cs) all write alpha as (One, One): its backbuffer is opaque, so the result's alpha never
    // shows. This backbuffer is composited over the page as a premultiplied layer, so its alpha has to be the true coverage: "over" for
    // Mixture, and unchanged for Additive (which adds light to whatever is below without covering it). The colour factors are the client's.
    const backbuffer = this.usingBackbuffer;

    switch (blending) {
      case BlendingParameters.None:
        gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
        break;

      case BlendingParameters.Additive:
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, backbuffer ? gl.ZERO : gl.ONE, gl.ONE);
        break;

      // (Inherit resolves to Mixture at the root: DrawColourInfo never carries Inherit.)
      default:
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, backbuffer ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
        break;
    }
  }

  // #endregion

  // #region Viewport

  private usingBackbuffer = true;

  /** [viewport in device pixels, ortho in screen-space units] */
  private readonly viewportStack: RectangleF[] = [];
  private viewport: RectangleF | null = null;

  /** Applies a new viewport of the given size in device pixels, showing the screen-space rectangle `ortho` (PushViewport + PushOrtho). */
  pushViewport(ortho: RectangleF, width: number, height: number): void {
    const viewport = new RectangleF(0, 0, width, height);

    this.pushOrtho(ortho);

    this.viewportStack.push(viewport);
    this.setViewport(viewport);
  }

  popViewport(): void {
    this.popProjectionMatrix();

    this.viewportStack.pop();
    this.setViewport(this.viewportStack[this.viewportStack.length - 1]);
  }

  private setViewport(viewport: RectangleF): void {
    if (this.viewport !== null && this.viewport.equals(viewport))
      return;

    this.gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    this.viewport = viewport;
  }

  // #endregion

  // #region Scissor

  private readonly scissorStack: RectangleF[] = [];
  private readonly scissorStateStack: boolean[] = [];
  private scissor: RectangleF | null = null;
  private scissorState: boolean | null = null;

  /** Applies a new scissor rectangle, in viewport (device) pixels with the origin at the top-left. */
  pushScissor(scissor: RectangleF): void {
    this.scissorStack.push(scissor);
    this.setScissor(scissor);
  }

  popScissor(): void {
    this.scissorStack.pop();
    this.setScissor(this.scissorStack[this.scissorStack.length - 1]);
  }

  pushScissorState(enabled: boolean): void {
    this.scissorStateStack.push(enabled);
    this.setScissorState(enabled);
  }

  popScissorState(): void {
    this.scissorStateStack.pop();
    this.setScissorState(this.scissorStateStack[this.scissorStateStack.length - 1]);
  }

  private setScissor(scissor: RectangleF): void {
    if (scissor.width < 0 || scissor.height < 0) {
      scissor = new RectangleF(
        scissor.width < 0 ? scissor.x + scissor.width : scissor.x, scissor.height < 0 ? scissor.y + scissor.height : scissor.y,
        Math.abs(scissor.width), Math.abs(scissor.height));
    }

    if (this.scissor !== null && this.scissor.equals(scissor))
      return;

    this.flushCurrentBatch();

    // GL's scissor box has its origin at the bottom-left. On the backbuffer that means flipping the top-left based rectangle; in a frame
    // buffer the image itself is drawn flipped (sh_Vertex_Output.h), so the rectangle is used as it is.
    const y = this.usingBackbuffer ? this.viewport!.height - scissor.bottom : scissor.y;
    this.gl.scissor(scissor.x, y, scissor.width, scissor.height);

    this.scissor = scissor;
  }

  private setScissorState(enabled: boolean): void {
    if (enabled === this.scissorState)
      return;

    this.flushCurrentBatch();

    if (enabled)
      this.gl.enable(this.gl.SCISSOR_TEST);
    else
      this.gl.disable(this.gl.SCISSOR_TEST);

    this.scissorState = enabled;
  }

  // #endregion

  // #region Projection Matrix

  /** Orthographic projections as the screen-space rectangle they show (Matrix4.CreateOrthographicOffCenter(l, r, b, t, -1, 1)). */
  private readonly projectionStack: RectangleF[] = [];
  private projection: RectangleF = RectangleF.Empty;

  pushOrtho(ortho: RectangleF): void {
    this.projectionStack.push(ortho);
    this.setProjection(ortho);
  }

  popProjectionMatrix(): void {
    this.projectionStack.pop();
    this.setProjection(this.projectionStack[this.projectionStack.length - 1]);
  }

  private setProjection(ortho: RectangleF): void {
    if (this.projection.equals(ortho))
      return;

    this.flushCurrentBatch();

    this.globalUniformsChanged = true;
    this.projection = ortho;
  }

  // #endregion

  // #region Masking

  private readonly maskingStack: MaskingInfo[] = [];
  private currentMaskingInfo: MaskingInfo | null = null;

  /** Whether any masking info is active that's not the default. */
  isMaskingActive = false;

  pushMaskingInfo(maskingInfo: MaskingInfo, overwritePreviousScissor = false): void {
    this.maskingStack.push(maskingInfo);
    this.setMaskingInfo(maskingInfo, true, overwritePreviousScissor);
  }

  popMaskingInfo(): void {
    this.maskingStack.pop();
    this.setMaskingInfo(this.maskingStack[this.maskingStack.length - 1], false, true);
  }

  private setMaskingInfo(maskingInfo: MaskingInfo, isPushing: boolean, overwritePreviousScissor: boolean): void {
    if (this.currentMaskingInfo !== null && maskingInfoEquals(this.currentMaskingInfo, maskingInfo))
      return;

    this.flushCurrentBatch();
    this.frameStatistics.maskingChanges++;

    if (isPushing) {
      // When drawing to a viewport that doesn't match the projection size (e.g. via framebuffers), the resultant image will be scaled
      const viewportScaleX = this.viewport!.width / this.projection.width;
      const viewportScaleY = this.viewport!.height / this.projection.height;

      // (ScreenSpaceAABB is Quad.AABB in C#: a RectangleI enclosing the quad, floor and ceiling in screen pixels. Screen pixels are device
      // pixels there, so the enclosing rectangle is taken in device pixels here.)
      const aabb = maskingInfo.screenSpaceAABB;
      const left = Math.floor((aabb.left - this.projection.x) * viewportScaleX);
      const top = Math.floor((aabb.top - this.projection.y) * viewportScaleY);
      const right = Math.ceil((aabb.right - this.projection.x) * viewportScaleX);
      const bottom = Math.ceil((aabb.bottom - this.projection.y) * viewportScaleY);

      const actualRect = new RectangleF(left, top, right - left, bottom - top);

      this.pushScissor(overwritePreviousScissor ? actualRect : intersectI(this.scissorStack[this.scissorStack.length - 1], actualRect));
    } else
      this.popScissor();

    this.currentMaskingInfo = maskingInfo;

    // Masking is enabled for as long as any masking info is active that's not the default.
    this.isMaskingActive = this.maskingStack.length > 1;
    this.globalUniformsChanged = true;
  }

  // #endregion

  // #region Textures

  private readonly whitePixel: NativeTexture;
  private readonly nativeTextures = new Map<string, NativeTexture>();

  private boundTexture: NativeTexture | null = null;

  currentWrapModeS = WrapMode.None;
  currentWrapModeT = WrapMode.None;

  private createNativeTexture(source: TexImageSource, mipmaps: boolean): NativeTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (mipmaps) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, MAX_MIPMAP_LEVELS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.hint(gl.GENERATE_MIPMAP_HINT, gl.NICEST);
      gl.generateMipmap(gl.TEXTURE_2D);
    } else
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    this.boundTexture = null;

    const size = sourceSize(source);
    return { texture, wrapS: WrapMode.ClampToEdge, wrapT: WrapMode.ClampToEdge, width: size.width, height: size.height, mipmapsDirty: false };
  }

  /** @internal Creates a texture of the given size with undefined contents (a frame buffer's) or transparent black (an atlas's, with mipmaps). */
  createEmptyTexture(width: number, height: number, mipmaps: boolean, nearest = false): NativeTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;

    this.flushCurrentBatch();

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, mipmaps ? new Uint8Array(width * height * 4) : null);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (mipmaps) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, MAX_MIPMAP_LEVELS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    } else
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);

    this.boundTexture = null;

    return { texture, wrapS: WrapMode.ClampToEdge, wrapT: WrapMode.ClampToEdge, width, height, mipmapsDirty: false };
  }

  /** @internal */
  resizeTexture(native: NativeTexture, width: number, height: number): void {
    const gl = this.gl;

    this.flushCurrentBatch();

    gl.bindTexture(gl.TEXTURE_2D, native.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.boundTexture = null;

    native.width = width;
    native.height = height;
  }

  /** @internal */
  deleteNativeTexture(native: NativeTexture): void {
    this.flushCurrentBatch();
    this.gl.deleteTexture(native.texture);

    if (this.boundTexture === native)
      this.boundTexture = null;
  }

  get maxTextureSize(): number {
    return this.maxTextureSizeBacking ??= this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  private maxTextureSizeBacking: number | null = null;

  /**
   * Uploads the current contents of a changing image (a canvas that was redrawn, a video frame) to its texture, creating it on first use.
   * Such textures have no mipmaps.
   */
  updateImage(key: string, source: TexImageSource, premultiplied = false): void {
    const gl = this.gl;
    const native = this.nativeTextures.get(key);

    this.flushCurrentBatch();

    // (premultiplied: the source's colours are stored multiplied by alpha and are uploaded as they are; draw with drawPremultiplied)
    if (premultiplied)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    if (native === undefined)
      this.nativeTextures.set(key, this.createNativeTexture(source, false));
    else {
      const size = sourceSize(source);

      gl.bindTexture(gl.TEXTURE_2D, native.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.boundTexture = null;

      native.width = size.width;
      native.height = size.height;
    }

    if (premultiplied)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** Whether updateImage or bindImage has created a texture for the key. */
  hasImage(key: string): boolean {
    return this.nativeTextures.has(key);
  }

  /**
   * Binds a texture (unit 0). Returns false if the texture isn't available (its image hasn't been provided).
   * `key` identifies the image (its URL); `source` is uploaded on first use.
   */
  bindImage(key: string, source: TexImageSource | null, wrapModeS = WrapMode.None, wrapModeT = WrapMode.None): boolean {
    let native = this.nativeTextures.get(key);

    if (native === undefined) {
      if (source === null)
        return false;

      this.flushCurrentBatch();
      this.nativeTextures.set(key, native = this.createNativeTexture(source, true));
    }

    this.bindNativeTexture(native, wrapModeS, wrapModeT);
    return true;
  }

  bindTexture(texture: Texture, wrapModeS = WrapMode.None, wrapModeT = WrapMode.None): boolean {
    if (texture.isWhitePixel) {
      this.bindNativeTexture(this.whitePixel, wrapModeS, wrapModeT);
      return true;
    }

    return this.bindImage(texture.url!, texture.image, wrapModeS, wrapModeT);
  }

  bindNativeTexture(native: NativeTexture, wrapModeS = WrapMode.None, wrapModeT = WrapMode.None): void {
    if (this.boundTexture === native && this.currentWrapModeS === wrapModeS && this.currentWrapModeT === wrapModeT && !native.mipmapsDirty)
      return;

    this.flushCurrentBatch();

    const gl = this.gl;

    if (this.boundTexture !== native) {
      gl.bindTexture(gl.TEXTURE_2D, native.texture);
      this.boundTexture = native;
      this.frameStatistics.textureBinds++;
    }

    if (native.mipmapsDirty) {
      gl.generateMipmap(gl.TEXTURE_2D);
      native.mipmapsDirty = false;
    }

    // (GLTexture.Bind: the wrap mode of the native texture follows the one it is bound with; None is clamped by the shader's texRect.)
    if (native.wrapS !== wrapModeS) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapModeS === WrapMode.Repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      native.wrapS = wrapModeS;
    }

    if (native.wrapT !== wrapModeT) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapModeT === WrapMode.Repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      native.wrapT = wrapModeT;
    }

    if (this.currentWrapModeS !== wrapModeS || this.currentWrapModeT !== wrapModeT) {
      this.currentWrapModeS = wrapModeS;
      this.currentWrapModeT = wrapModeT;
      this.globalUniformsChanged = true;
    }
  }

  /** Frees the native texture of an image (when its Texture is disposed). */
  deleteImage(key: string): void {
    const native = this.nativeTextures.get(key);
    if (native === undefined) return;

    this.gl.deleteTexture(native.texture);
    this.nativeTextures.delete(key);

    if (this.boundTexture === native)
      this.boundTexture = null;
  }

  // #endregion

  // #region Shaders

  private shader: Shader | null = null;

  bindShader(shader: Shader): void {
    if (this.shader === shader)
      return;

    this.flushCurrentBatch();

    this.gl.useProgram(shader.program);
    this.shader = shader;
  }

  // #endregion

  // #region Global uniforms

  private readonly uniformBuffer: WebGLBuffer;
  private readonly uniformData = new ArrayBuffer(GLOBAL_UNIFORMS_SIZE);
  private readonly uniformFloats = new Float32Array(this.uniformData);
  private readonly uniformInts = new Int32Array(this.uniformData);

  private globalUniformsChanged = true;

  /** Writes g_GlobalUniforms (std140 offsets in 4-byte words; see shaders.ts). */
  private uploadGlobalUniforms(): void {
    const f = this.uniformFloats;
    const i = this.uniformInts;
    const m = this.currentMaskingInfo!;

    i[0] = this.usingBackbuffer ? 1 : 0; // g_BackbufferDraw
    i[1] = 0; // g_IsDepthRangeZeroToOne
    i[2] = 0; // g_IsClipSpaceYInverted
    i[3] = 0; // g_IsUvOriginTopLeft

    // g_ProjMatrix: osuTK's row-major matrix is read by GLSL as its columns.
    const p = this.projection;
    f.fill(0, 4, 20);
    f[4] = 2 / (p.right - p.left);
    f[9] = 2 / (p.top - p.bottom);
    f[14] = -1;
    f[16] = -(p.right + p.left) / (p.right - p.left);
    f[17] = -(p.top + p.bottom) / (p.top - p.bottom);
    f[18] = 0;
    f[19] = 1;

    // g_ToMaskingSpace: three vec4-aligned columns.
    const t = m.toMaskingSpace;
    f[20] = t.m11; f[21] = t.m12; f[22] = t.m13;
    f[24] = t.m21; f[25] = t.m22; f[26] = t.m23;
    f[28] = t.m31; f[29] = t.m32; f[30] = t.m33;

    i[32] = this.isMaskingActive ? 1 : 0;
    f[33] = m.cornerRadius;
    f[34] = m.cornerExponent;

    const r = m.maskingRect;
    f[36] = r.left; f[37] = r.top; f[38] = r.right; f[39] = r.bottom;

    f[40] = m.borderThickness / m.blendRange;

    // g_BorderColour keeps its last value while there is no border.
    if (m.borderThickness > 0 && m.borderColour !== null) {
      const c = m.borderColour;
      writeColour(f, 44, c.topLeft);
      writeColour(f, 48, c.bottomLeft);
      writeColour(f, 52, c.topRight);
      writeColour(f, 56, c.bottomRight);
    }

    f[60] = m.blendRange;
    f[61] = m.alphaExponent;
    f[62] = m.edgeOffset.x;
    f[63] = m.edgeOffset.y;
    i[64] = m.hollow ? 1 : 0;

    // g_InnerCornerRadius keeps its last value while not hollow.
    if (m.hollow)
      f[65] = m.hollowCornerRadius;

    i[66] = this.currentWrapModeS;
    i[67] = this.currentWrapModeT;

    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uniformData);

    this.globalUniformsChanged = false;
  }

  // #endregion

  // #region Quad batch

  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertices = new Float32Array(MAX_QUADS * QUAD_FLOATS);

  /** The first quad of the current (unflushed) batch, and the number of quads written this frame into the buffer. */
  private quadStart = 0;
  private quadCount = 0;

  /** Draws the quads added since the last flush with the current state. */
  flushCurrentBatch(): void {
    const count = this.quadCount - this.quadStart;

    if (count === 0)
      return;

    const gl = this.gl;

    if (this.shader === null)
      throw new Error('No shader bound.');

    if (this.globalUniformsChanged)
      this.uploadGlobalUniforms();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.quadStart * QUAD_FLOATS * 4, this.vertices, this.quadStart * QUAD_FLOATS, count * QUAD_FLOATS);
    gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_SHORT, this.quadStart * 6 * 2);

    this.frameStatistics.drawCalls++;
    this.frameStatistics.quads += count;

    this.quadStart = this.quadCount;

    // A full buffer starts over; orphaning keeps the draws above valid.
    if (this.quadCount === MAX_QUADS) {
      gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.STREAM_DRAW);
      this.quadStart = this.quadCount = 0;
    }
  }

  /**
   * RendererExtensions.DrawQuad: adds a textured quad to the batch. The texture must be bound (bindTexture) and `texRect` and `coordRect`
   * are its UV rectangles (Texture.GetTextureRect of the texture rectangle and of the texture coordinates).
   */
  drawQuadUV(
    quad: Quad, colour: ColourInfo,
    texLeft: number, texTop: number, texRight: number, texBottom: number,
    coordLeft: number, coordTop: number, coordRight: number, coordBottom: number,
    blendRangeX: number, blendRangeY: number,
  ): void {
    if (this.quadCount === MAX_QUADS)
      this.flushCurrentBatch();

    const v = this.vertices;
    let o = this.quadCount++ * QUAD_FLOATS;

    // BottomLeft, BottomRight, TopRight, TopLeft
    o = writeVertex(v, o, quad.bottomLeft, colour.bottomLeft, coordLeft, coordBottom, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
    o = writeVertex(v, o, quad.bottomRight, colour.bottomRight, coordRight, coordBottom, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
    o = writeVertex(v, o, quad.topRight, colour.topRight, coordRight, coordTop, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
    writeVertex(v, o, quad.topLeft, colour.topLeft, coordLeft, coordTop, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
  }

  /**
   * RendererExtensions.DrawQuad for a whole Texture.
   * @param textureRect The texture rectangle, in the texture's display space (null: all of it).
   * @param inflationPercentage The percentage amount that the texture rectangle should be inflated.
   * @param blendRangeOverride The range over which the edges of the texture rectangle should be blended.
   * @param textureCoords The texture coordinates of the quad's corners (null: textureRect).
   */
  drawQuad(
    texture: Texture, quad: Quad, colour: ColourInfo, textureRect: RectangleF | null = null,
    inflationPercentage: Vector2 | null = null, blendRangeOverride: Vector2 | null = null, textureCoords: RectangleF | null = null,
  ): void {
    if (!this.bindTexture(texture))
      return;

    const scaleX = texture.scaleAdjust / texture.width;
    const scaleY = texture.scaleAdjust / texture.height;

    // Texture.GetTextureRect
    let texLeft = 0, texTop = 0, texRight = 1, texBottom = 1;

    if (textureRect !== null) {
      texLeft = textureRect.x * scaleX;
      texTop = textureRect.y * scaleY;
      texRight = textureRect.right * scaleX;
      texBottom = textureRect.bottom * scaleY;
    }

    const inflationX = inflationPercentage !== null ? inflationPercentage.x * (texRight - texLeft) : 0;
    const inflationY = inflationPercentage !== null ? inflationPercentage.y * (texBottom - texTop) : 0;

    // If clamp to edge is active, allow the texture coordinates to penetrate by half the repeated atlas margin width
    if (this.currentWrapModeS === WrapMode.ClampToEdge || this.currentWrapModeT === WrapMode.ClampToEdge) {
      const mipmap_padding_requirement = (1 << MAX_MIPMAP_LEVELS) / 2;

      if (this.currentWrapModeS === WrapMode.ClampToEdge) {
        texLeft -= mipmap_padding_requirement / texture.width;
        texRight += mipmap_padding_requirement / texture.width;
      }

      if (this.currentWrapModeT === WrapMode.ClampToEdge) {
        texTop -= mipmap_padding_requirement / texture.height;
        texBottom += mipmap_padding_requirement / texture.height;
      }
    }

    const coords = textureCoords ?? textureRect;
    let coordLeft = 0, coordTop = 0, coordRight = 1, coordBottom = 1;

    if (coords !== null) {
      coordLeft = coords.x * scaleX;
      coordTop = coords.y * scaleY;
      coordRight = coords.right * scaleX;
      coordBottom = coords.bottom * scaleY;
    }

    this.drawQuadUV(
      quad, colour, texLeft, texTop, texRight, texBottom,
      coordLeft - inflationX, coordTop - inflationY, coordRight + inflationX, coordBottom + inflationY,
      blendRangeOverride !== null ? blendRangeOverride.x : inflationX, blendRangeOverride !== null ? blendRangeOverride.y : inflationY);
  }

  /** Adds a quad showing an atlas region (a glyph); as drawQuad with the region as the texture rectangle. */
  drawRegion(region: AtlasRegion, quad: Quad, colour: ColourInfo, inflationPercentageX: number, inflationPercentageY: number): void {
    this.bindNativeTexture(region.native);

    const inflationX = inflationPercentageX * (region.right - region.left);
    const inflationY = inflationPercentageY * (region.bottom - region.top);

    this.drawQuadUV(
      quad, colour, region.left, region.top, region.right, region.bottom,
      region.left - inflationX, region.top - inflationY, region.right + inflationX, region.bottom + inflationY,
      inflationX, inflationY);
  }

  /** IRenderer.WhitePixel, as a region for drawRegionAt. */
  get whiteRegion(): AtlasRegion {
    return this.whiteRegionBacking ??= { native: this.whitePixel, left: 0, top: 0, right: 1, bottom: 1 };
  }

  private whiteRegionBacking: AtlasRegion | null = null;

  /**
   * Adds a quad given as eight numbers at `offset` of `quads` (top-left, top-right, bottom-left, bottom-right; x then y), with a colour per
   * corner and its texture rectangle and coordinates in UV. The texture must be bound.
   */
  drawQuadAt(
    quads: Float32Array, offset: number, topLeft: Colour4, topRight: Colour4, bottomLeft: Colour4, bottomRight: Colour4,
    texLeft: number, texTop: number, texRight: number, texBottom: number,
    coordLeft: number, coordTop: number, coordRight: number, coordBottom: number,
    blendRangeX: number, blendRangeY: number,
  ): void {
    if (this.quadCount === MAX_QUADS)
      this.flushCurrentBatch();

    const v = this.vertices;
    let o = this.quadCount++ * QUAD_FLOATS;

    // BottomLeft, BottomRight, TopRight, TopLeft
    o = writeVertexXY(v, o, quads[offset + 4], quads[offset + 5], bottomLeft, coordLeft, coordBottom, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
    o = writeVertexXY(v, o, quads[offset + 6], quads[offset + 7], bottomRight, coordRight, coordBottom, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
    o = writeVertexXY(v, o, quads[offset + 2], quads[offset + 3], topRight, coordRight, coordTop, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
    writeVertexXY(v, o, quads[offset], quads[offset + 1], topLeft, coordLeft, coordTop, texLeft, texTop, texRight, texBottom, blendRangeX, blendRangeY);
  }

  /**
   * Draws a texture whose colours are premultiplied by their alpha (a 2D canvas's): `draw` runs with the current blending's factors for
   * such a source. A canvas is uploaded as it is stored (see updateImage), since dividing its colours by a small alpha and multiplying
   * again loses most of their bits.
   */
  drawPremultiplied(draw: () => void): void {
    const gl = this.gl;

    this.flushCurrentBatch();

    if (this.currentBlending === BlendingParameters.Additive)
      gl.blendFuncSeparate(gl.ONE, gl.ONE, this.usingBackbuffer ? gl.ZERO : gl.ONE, gl.ONE);
    else
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, this.usingBackbuffer ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);

    draw();
    this.flushCurrentBatch();

    if (this.currentBlending !== null)
      this.setBlendImplementation(this.currentBlending);
  }

  /**
   * As drawRegion, for a quad given as eight numbers at `offset` of `quads` (top-left, top-right, bottom-left, bottom-right; x then y),
   * moved by (dx, dy). Text draws thousands of these per frame, so nothing is allocated.
   */
  drawRegionAt(
    region: AtlasRegion, quads: Float32Array, offset: number, dx: number, dy: number, colour: ColourInfo,
    inflationPercentageX: number, inflationPercentageY: number,
  ): void {
    this.bindNativeTexture(region.native);

    if (this.quadCount === MAX_QUADS)
      this.flushCurrentBatch();

    const left = region.left, top = region.top, right = region.right, bottom = region.bottom;
    const inflationX = inflationPercentageX * (right - left);
    const inflationY = inflationPercentageY * (bottom - top);
    const coordLeft = left - inflationX, coordTop = top - inflationY, coordRight = right + inflationX, coordBottom = bottom + inflationY;

    const v = this.vertices;
    let o = this.quadCount++ * QUAD_FLOATS;

    // BottomLeft, BottomRight, TopRight, TopLeft
    o = writeVertexXY(v, o, quads[offset + 4] + dx, quads[offset + 5] + dy, colour.bottomLeft, coordLeft, coordBottom, left, top, right, bottom, inflationX, inflationY);
    o = writeVertexXY(v, o, quads[offset + 6] + dx, quads[offset + 7] + dy, colour.bottomRight, coordRight, coordBottom, left, top, right, bottom, inflationX, inflationY);
    o = writeVertexXY(v, o, quads[offset + 2] + dx, quads[offset + 3] + dy, colour.topRight, coordRight, coordTop, left, top, right, bottom, inflationX, inflationY);
    writeVertexXY(v, o, quads[offset] + dx, quads[offset + 1] + dy, colour.topLeft, coordLeft, coordTop, left, top, right, bottom, inflationX, inflationY);
  }

  // #endregion

  // #region Underlays
  // Not in the client. An image from an origin that doesn't allow cross-origin use (no CORS headers) can be shown by the page but never
  // uploaded to a texture. Such a texture is shown by an <img> element behind the canvas, and the sprite's quad is drawn as a hole: it
  // multiplies what is already there by (1 - alpha), colour and coverage alike, so the image shows through exactly where and as strongly as
  // the sprite would have covered. Everything drawn later blends over the hole as usual. Limits: the picture's own transparency is ignored
  // and a tint is reduced to its brightness. In a frame buffer the sprite only leaves its coverage: the buffered container then draws its
  // buffer as the hole and the image is blurred by CSS, so anything else drawn into that buffer is lost.

  /** The element behind the canvas that underlay images are put into (set by the canvas's owner; null: underlays are not drawn). */
  underlayHost: HTMLElement | null = null;

  private readonly underlays = new Map<object, { wrapper: HTMLElement; image: HTMLImageElement; frame: number; url: string; clip: string; transform: string; filter: string; index: number }>();
  private underlayIndex = 0;

  /** The underlays drawn while a frame buffer is bound are collected here by the buffered container being drawn (null: not collecting). */
  private capturedUnderlays: ((blur: number) => void)[] | null = null;

  /** Starts collecting the underlays drawn into the frame buffer about to be bound. Returns the collection in progress, for endUnderlayCapture. */
  beginUnderlayCapture(): ((blur: number) => void)[] | null {
    const previous = this.capturedUnderlays;
    this.capturedUnderlays = [];
    return previous;
  }

  /** Returns the underlays drawn since beginUnderlayCapture: functions which place their image, blurred by the given sigma in CSS pixels. */
  endUnderlayCapture(previous: ((blur: number) => void)[] | null): ((blur: number) => void)[] {
    const captured = this.capturedUnderlays!;
    this.capturedUnderlays = previous;
    return captured;
  }

  /** Whether underlay images can be shown where drawing currently goes (the canvas itself, with an element to hold them). */
  get canShowUnderlays(): boolean {
    return this.underlayHost !== null && this.usingBackbuffer && this.scissor !== null;
  }

  /**
   * Draws a sprite whose texture is shown by an underlay.
   * @param place Puts the image where the sprite is now (calls placeUnderlay), blurred by the given sigma in CSS pixels.
   * @param tint The brightness the image is shown at (the average of a grey tint's components).
   * @param drawHole Draws the sprite's quad with a white texture and the given colour.
   */
  drawUnderlay(place: (blur: number) => void, colour: ColourInfo, tint: number, drawHole: (colour: ColourInfo) => void): void {
    if (!this.usingBackbuffer) {
      // In a frame buffer, the sprite leaves its coverage, and the buffered container that owns the buffer shows the image when it draws
      // the buffer to the screen (BufferedContainer.draw).
      if (this.capturedUnderlays !== null) {
        this.capturedUnderlays.push(place);
        drawHole(colour);
      }

      return;
    }

    if (!this.canShowUnderlays)
      return;

    place(0);
    this.punchHole(colour, tint, drawHole);
  }

  /**
   * Puts the image `url` behind the canvas so that its texture coordinates (left, top, right, bottom; 0 to 1) fall on the given
   * screen-space corners. To be followed by punchHole.
   * @param blur The standard deviation of a gaussian blur of the image, in CSS pixels.
   */
  placeUnderlay(
    owner: object, url: string, width: number, height: number,
    topLeft: Vector2, topRight: Vector2, bottomLeft: Vector2, left: number, top: number, right: number, bottom: number, blur: number,
  ): void {
    const host = this.underlayHost;

    if (host === null || this.scissor === null)
      return;

    let underlay = this.underlays.get(owner);

    if (underlay === undefined) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';

      const image = document.createElement('img');
      image.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;max-width:none';
      wrapper.appendChild(image);
      host.appendChild(wrapper);

      this.underlays.set(owner, underlay = { wrapper, image, frame: 0, url: '', clip: '', transform: '', filter: '', index: -1 });
    }

    if (underlay.url !== url)
      underlay.image.src = underlay.url = url;

    // The element is clipped to the scissor (the masking parents' bounds), so it can't show through another image's hole outside them.
    const ratio = this.pixelRatio;
    const scissor = this.scissor;
    const clipX = scissor.x / ratio, clipY = scissor.y / ratio;
    const clip = `${clipX},${clipY},${scissor.width},${scissor.height}`;

    if (underlay.clip !== clip) {
      const style = underlay.wrapper.style;
      style.left = `${clipX}px`;
      style.top = `${clipY}px`;
      style.width = `${scissor.width / ratio}px`;
      style.height = `${scissor.height / ratio}px`;
      underlay.clip = clip;
    }

    // Image pixels to screen space: (x, y) -> topLeft + (x / width - left) / (right - left) * (topRight - topLeft) + ...
    const a = (topRight.x - topLeft.x) / ((right - left) * width);
    const b = (topRight.y - topLeft.y) / ((right - left) * width);
    const c = (bottomLeft.x - topLeft.x) / ((bottom - top) * height);
    const d = (bottomLeft.y - topLeft.y) / ((bottom - top) * height);
    const e = topLeft.x - a * left * width - c * top * height - this.window.x - clipX;
    const f = topLeft.y - b * left * width - d * top * height - this.window.y - clipY;
    const transform = `matrix(${a},${b},${c},${d},${e},${f})`;

    if (underlay.transform !== transform)
      underlay.image.style.transform = underlay.transform = transform;

    // (a filter's lengths are in the element's own space, before its transform)
    const scale = Math.hypot(a, b);
    const filter = blur > 0 && scale > 0 ? `blur(${Math.round(blur / scale * 100) / 100}px)` : '';

    if (underlay.filter !== filter)
      underlay.image.style.filter = underlay.filter = filter;

    // Later sprites' images are above earlier ones.
    if (underlay.index !== this.underlayIndex)
      underlay.wrapper.style.zIndex = `${underlay.index = this.underlayIndex}`;

    this.underlayIndex++;

    if (underlay.frame !== this.frameIndex - 1)
      underlay.wrapper.style.display = '';

    underlay.frame = this.frameIndex;
  }

  /** Draws `drawHole` as a hole in the canvas for an underlay image shown at the brightness `tint`. */
  punchHole(colour: ColourInfo, tint: number, drawHole: (colour: ColourInfo) => void): void {
    const gl = this.gl;

    this.flushCurrentBatch();
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);

    if (tint >= 1)
      drawHole(colour);
    else {
      // The image shows through by the canvas's alpha, so a darker image is a hole that is less deep than what it removes of the colour.
      gl.colorMask(true, true, true, false);
      drawHole(colour);
      this.flushCurrentBatch();

      gl.colorMask(false, false, false, true);
      drawHole(colour.multiplyAlpha(Math.max(tint, 0)));
    }

    this.flushCurrentBatch();
    gl.colorMask(true, true, true, true);

    if (this.currentBlending !== null)
      this.setBlendImplementation(this.currentBlending);
  }

  private finishUnderlays(): void {
    for (const [owner, underlay] of this.underlays) {
      if (underlay.frame === this.frameIndex)
        continue;

      // Not drawn this frame: hidden at once, and removed if it stays that way.
      if (underlay.frame === this.frameIndex - 1)
        underlay.wrapper.style.display = 'none';
      else if (this.frameIndex - underlay.frame > 600) {
        underlay.wrapper.remove();
        this.underlays.delete(owner);
      }
    }
  }

  // #endregion

  // #region Frame buffers

  private readonly frameBufferStack: FrameBuffer[] = [];

  /** @internal Attaches a new frame buffer's texture. */
  attach(frameBuffer: FrameBuffer): void {
    const gl = this.gl;

    this.flushCurrentBatch();

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frameBuffer.native.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBufferStack.length > 0 ? this.frameBufferStack[this.frameBufferStack.length - 1].framebuffer : null);
  }

  /** Renderer.BindFrameBuffer */
  bindFrameBuffer(frameBuffer: FrameBuffer): void {
    this.frameStatistics.frameBufferBinds++;
    this.frameBufferStack.push(frameBuffer);
    this.setFrameBuffer(frameBuffer);
  }

  /** Renderer.UnbindFrameBuffer */
  unbindFrameBuffer(frameBuffer: FrameBuffer): void {
    if (this.frameBufferStack[this.frameBufferStack.length - 1] !== frameBuffer)
      return;

    this.frameBufferStack.pop();
    this.setFrameBuffer(this.frameBufferStack.length > 0 ? this.frameBufferStack[this.frameBufferStack.length - 1] : null);
  }

  private setFrameBuffer(frameBuffer: FrameBuffer | null): void {
    const gl = this.gl;

    this.flushCurrentBatch();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer?.framebuffer ?? null);

    this.usingBackbuffer = frameBuffer === null;
    this.globalUniformsChanged = true;

    // (the alpha factors and the scissor box's orientation depend on the target)
    if (this.currentBlending !== null)
      this.setBlendImplementation(this.currentBlending);

    if (this.scissorStack.length > 0) {
      this.scissor = null;
      this.setScissor(this.scissorStack[this.scissorStack.length - 1]);
    }
  }

  /** RendererExtensions.DrawFrameBuffer: draws the whole frame buffer texture to a quad. */
  drawFrameBuffer(frameBuffer: FrameBuffer, quad: Quad, colour: ColourInfo): void {
    this.bindNativeTexture(frameBuffer.native);
    this.drawQuadUV(quad, colour, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0);
  }

  // #endregion

  // #region Texture atlas

  private atlas: TextureAtlas | null = null;
  private atlasShader: Shader | null = null;
  private atlasFramebuffer: WebGLFramebuffer | null = null;
  private atlasVertexArray: WebGLVertexArrayObject | null = null;

  /**
   * Adds a rectangle of an image to the texture atlas (TextureAtlas.Add + TextureRegion.SetData). `key` identifies the image.
   * Returns null if the rectangle is too large for an atlas.
   */
  addToAtlas(key: string, source: TexImageSource, x: number, y: number, width: number, height: number): AtlasRegion | null {
    if (!TextureAtlas.canFit(width, height))
      return null;

    const gl = this.gl;

    this.flushCurrentBatch();

    let sourceTexture = this.atlasSources.get(key);

    if (sourceTexture === undefined) {
      sourceTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.atlasSources.set(key, sourceTexture);
    }

    let position = (this.atlas ??= new TextureAtlas(this)).findPosition(width, height);

    // (TextureAtlas size exceeded: generating new texture. Regions of the previous one keep it.)
    if (position === null)
      position = (this.atlas = new TextureAtlas(this)).findPosition(width, height)!;

    const atlas = this.atlas.native;

    this.atlasShader ??= this.createShader('AtlasBlit', ATLAS_BLIT_VS, ATLAS_BLIT_FS, []);
    this.atlasFramebuffer ??= gl.createFramebuffer()!;
    this.atlasVertexArray ??= gl.createVertexArray()!;

    const shader = this.atlasShader;
    const padding = ATLAS_PADDING / 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.atlasFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, atlas.texture, 0);

    gl.viewport(position.x - padding, position.y - padding, width + padding * 2, height + padding * 2);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);

    gl.useProgram(shader.program);
    gl.bindVertexArray(this.atlasVertexArray);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform2f(shader.getUniformLocation('u_Destination'), position.x, position.y);
    gl.uniform2f(shader.getUniformLocation('u_Source'), x, y);
    gl.uniform2f(shader.getUniformLocation('u_Size'), width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Back to the state the batch expects.
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBufferStack.length > 0 ? this.frameBufferStack[this.frameBufferStack.length - 1].framebuffer : null);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(this.vertexArray);

    if (this.shader !== null)
      gl.useProgram(this.shader.program);

    if (this.viewport !== null)
      gl.viewport(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height);

    if (this.scissorState === true)
      gl.enable(gl.SCISSOR_TEST);

    this.boundTexture = null;
    atlas.mipmapsDirty = true;

    return {
      native: atlas,
      left: position.x / atlas.width,
      top: position.y / atlas.height,
      right: (position.x + width) / atlas.width,
      bottom: (position.y + height) / atlas.height,
    };
  }

  /** The images sub-textures are taken from, as textures (kept: more of an image's rectangles are usually added later). */
  private readonly atlasSources = new Map<string, WebGLTexture>();

  private readonly atlasRegions = new Map<string, AtlasRegion | null>();

  /** The atlas region of a rectangle of an image, added on first use (the glyph texture of GlyphStore.LoadCharacter). */
  atlasRegion(key: string, source: TexImageSource, x: number, y: number, width: number, height: number): AtlasRegion | null {
    const regionKey = `${key}|${x},${y}`;
    let region = this.atlasRegions.get(regionKey);

    if (region === undefined)
      this.atlasRegions.set(regionKey, region = this.addToAtlas(key, source, x, y, width, height));

    return region;
  }

  // #endregion

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function sourceSize(source: TexImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement)
    return { width: source.naturalWidth, height: source.naturalHeight };

  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement)
    return { width: source.videoWidth, height: source.videoHeight };

  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame)
    return { width: source.displayWidth, height: source.displayHeight };

  const sized = source as { width: number; height: number };
  return { width: sized.width, height: sized.height };
}

function writeColour(f: Float32Array, o: number, c: Colour4): void {
  f[o] = c.r;
  f[o + 1] = c.g;
  f[o + 2] = c.b;
  f[o + 3] = c.a;
}

function writeVertex(
  v: Float32Array, o: number, position: Vector2, colour: Colour4, texX: number, texY: number,
  texLeft: number, texTop: number, texRight: number, texBottom: number, blendRangeX: number, blendRangeY: number,
): number {
  v[o] = position.x;
  v[o + 1] = position.y;
  v[o + 2] = colour.r;
  v[o + 3] = colour.g;
  v[o + 4] = colour.b;
  v[o + 5] = colour.a;
  v[o + 6] = texX;
  v[o + 7] = texY;
  v[o + 8] = texLeft;
  v[o + 9] = texTop;
  v[o + 10] = texRight;
  v[o + 11] = texBottom;
  v[o + 12] = blendRangeX;
  v[o + 13] = blendRangeY;
  return o + VERTEX_FLOATS;
}

function writeVertexXY(
  v: Float32Array, o: number, x: number, y: number, colour: Colour4, texX: number, texY: number,
  texLeft: number, texTop: number, texRight: number, texBottom: number, blendRangeX: number, blendRangeY: number,
): number {
  v[o] = x;
  v[o + 1] = y;
  v[o + 2] = colour.r;
  v[o + 3] = colour.g;
  v[o + 4] = colour.b;
  v[o + 5] = colour.a;
  v[o + 6] = texX;
  v[o + 7] = texY;
  v[o + 8] = texLeft;
  v[o + 9] = texTop;
  v[o + 10] = texRight;
  v[o + 11] = texBottom;
  v[o + 12] = blendRangeX;
  v[o + 13] = blendRangeY;
  return o + VERTEX_FLOATS;
}

/** RectangleI.Intersect */
function intersectI(a: RectangleF, b: RectangleF): RectangleF {
  const x = Math.max(a.x, b.x);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y = Math.max(a.y, b.y);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 >= x && y2 >= y)
    return new RectangleF(x, y, x2 - x, y2 - y);

  return RectangleF.Empty;
}
