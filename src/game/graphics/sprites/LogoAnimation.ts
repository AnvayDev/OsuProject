// Ported from osu.Game/Graphics/Sprites/LogoAnimation.cs (+ osu-resources Shaders/sh_LogoAnimation.fs)
// The DrawNode is a WebGL canvas at the texture's resolution, stretched over the draw rectangle, running the same fragment shader: a texel is
// shown once its red channel (the reveal threshold) is below the progress, with its green channel as alpha. (The shader's LOD bias of -0.9
// only matters with mipmaps, which aren't used here.)

import { Drawable } from '@fw/graphics/Drawable';
import type { Renderer } from '@fw/graphics/rendering/Renderer';
import { fragmentShader } from '@fw/graphics/rendering/shaders';
import type { Texture } from '@fw/graphics/textures/Texture';
import { Invalidation } from '@fw/layout/Enums';

const vertex_shader = `
attribute vec2 a_Position;
varying vec2 v_TexCoord;
void main() {
  v_TexCoord = vec2(a_Position.x, 1.0 - a_Position.y);
  gl_Position = vec4(a_Position * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragment_shader = `
precision mediump float;
uniform sampler2D m_Texture;
uniform float progress;
uniform vec4 v_Colour;
varying vec2 v_TexCoord;
void main() {
  vec4 texel = texture2D(m_Texture, v_TexCoord);

  // progress information is stored in the red channel,
  // and alpha information is stored in the green channel.
  float current = texel.r;
  float alpha = texel.g;

  vec4 colour = current < progress ? vec4(v_Colour.rgb, v_Colour.a * alpha) : vec4(0.0);
  gl_FragColor = vec4(colour.rgb * colour.a, colour.a);
}`;

/** osu-resources Shaders/sh_LogoAnimation.fs (with the framework's Texture2D vertex shader) */
const logo_animation_fs = fragmentShader(/* glsl */ `
in vec4 v_Colour;
in vec2 v_TexCoord;

uniform sampler2D m_Sampler;
uniform float progress;

out vec4 o_Colour;

void main(void)
{
    // todo: workaround for a SPIR-V bug (https://github.com/ppy/osu-framework/issues/5719)
    float one = g_BackbufferDraw ? 1.0 : 0.0;

    vec4 texel = texture(m_Sampler, v_TexCoord, -0.9) * one;

    // progress information is stored in the red channel,
    // and alpha information is stored in the green channel.
    float current = texel.r;
    float alpha = texel.g;

    o_Colour = current < progress ? vec4(v_Colour.rgb, v_Colour.a * alpha) : vec4(0);
}
`);

interface GlState {
  gl: WebGLRenderingContext;
  progress: WebGLUniformLocation;
  colour: WebGLUniformLocation;
}

export class LogoAnimation extends Drawable {
  private _texture: Texture | null = null;

  get texture(): Texture | null {
    return this._texture;
  }

  set texture(value: Texture | null) {
    if (this._texture === value) return;

    this._texture = value;
    this.glState = null;

    if (value?.url)
      void this.upload(value);
  }

  private _animationProgress = 0;

  get animationProgress(): number {
    return this._animationProgress;
  }

  set animationProgress(value: number) {
    if (this._animationProgress === value) return;

    this._animationProgress = value;
    this.invalidate(Invalidation.DrawNode);
  }

  override get isPresent(): boolean {
    return true;
  }

  private glState: GlState | null = null;

  // #region DrawNode (Renderer): LogoAnimationDrawNode

  override draw(renderer: Renderer): void {
    super.draw(renderer);

    const texture = this._texture;

    if (texture === null)
      return;

    const shader = renderer.loadShader('LogoAnimation', logo_animation_fs);

    renderer.bindShader(shader);
    // (the uniform belongs to this quad)
    renderer.flushCurrentBatch();
    renderer.gl.uniform1f(shader.getUniformLocation('progress'), this._animationProgress);

    if (renderer.bindTexture(texture))
      renderer.drawQuadUV(this.screenSpaceDrawQuad, this.drawColourInfo.colour, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0);

    renderer.flushCurrentBatch();
    renderer.bindShader(renderer.textureShader);
  }

  // #endregion

  // (createElement runs inside the Drawable constructor, before this class's fields are defined, so the canvas is read from the element.)
  private get canvas(): HTMLCanvasElement {
    return this.element.firstChild as HTMLCanvasElement;
  }

  protected override createElement(): HTMLElement {
    const el = super.createElement();

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    el.appendChild(canvas);

    return el;
  }

  private async upload(texture: Texture): Promise<void> {
    const img = new Image();
    img.src = texture.url!;
    await img.decode();

    if (this._texture !== texture)
      return;

    const canvas = this.canvas;
    canvas.width = texture.width;
    canvas.height = texture.height;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (gl === null)
      return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex_shader));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment_shader));
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_Position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    this.glState = { gl, progress: gl.getUniformLocation(program, 'progress')!, colour: gl.getUniformLocation(program, 'v_Colour')! };
    this.invalidate(Invalidation.DrawNode);
  }

  private lastDraw = '';

  protected override applyElementState(): void {
    super.applyElementState();

    const state = this.glState;
    if (state === null)
      return;

    const colour = this.drawColourInfo.colour.averageColour;
    const key = `${this._animationProgress}|${colour}`;
    if (key === this.lastDraw)
      return;

    this.lastDraw = key;

    const { gl } = state;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(state.progress, this._animationProgress);
    gl.uniform4f(state.colour, colour.r, colour.g, colour.b, colour.a);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
