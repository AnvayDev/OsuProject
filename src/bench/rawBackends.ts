// Bench: the same number of animated, alpha-blended quads drawn straight through each candidate API, with no scene graph. These are
// lower bounds: they show what the API and the GPU cost for a playfield's worth of quads, to set against the scene-graph variants.
// Everything here also runs in a worker (no DOM access), for the OffscreenCanvas variant.

/** Quads per density unit: about what the scene-graph variant draws for 16 hit circles, 4 sliders and a HUD. */
export const QUADS_PER_DENSITY = 400;

/** Floats per quad instance: x, y, size, alpha. */
const INSTANCE_FLOATS = 4;

export interface RawBackend {
  draw(time: number): void;
  dispose(): void;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function makeSprite(): OffscreenCanvas {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext('2d')!;
  const gradient = g.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#ff66aa');
  gradient.addColorStop(1, '#aa2266');
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.stroke();
  return canvas;
}

/** Fills `out` with this frame's instances: positions fixed per quad, size and alpha cycling like approaching and fading hit objects. */
function animate(out: Float32Array, count: number, time: number, width: number, height: number): void {
  for (let i = 0; i < count; i++) {
    // (a cheap deterministic hash per quad)
    const h1 = (i * 2654435761 >>> 0) / 4294967296;
    const h2 = (i * 40503 % 65536) / 65536;
    const phase = (time / 1400 + h1) % 1;

    const o = i * INSTANCE_FLOATS;
    out[o] = h1 * width;
    out[o + 1] = h2 * height;
    out[o + 2] = 40 + 60 * (1 - phase);
    out[o + 3] = phase < 0.3 ? phase / 0.3 : phase > 0.85 ? (1 - phase) / 0.15 : 1;
  }
}

export function createCanvas2D(canvas: AnyCanvas, count: number): RawBackend {
  const g = canvas.getContext('2d', { alpha: true, desynchronized: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const sprite = makeSprite();
  const instances = new Float32Array(count * INSTANCE_FLOATS);

  return {
    draw(time) {
      animate(instances, count, time, canvas.width, canvas.height);
      g.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < count; i++) {
        const o = i * INSTANCE_FLOATS;
        const size = instances[o + 2];
        g.globalAlpha = instances[o + 3];
        g.drawImage(sprite, instances[o] - size / 2, instances[o + 1] - size / 2, size, size);
      }
    },
    dispose() {},
  };
}

export function createWebGL2(canvas: AnyCanvas, count: number): RawBackend {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, desynchronized: true, powerPreference: 'high-performance' }) as WebGL2RenderingContext;

  const compile = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
    layout(location = 0) in vec2 corner;
    layout(location = 1) in vec4 instance;
    uniform vec2 viewport;
    out vec2 uv;
    out float alpha;
    void main() {
      uv = corner;
      alpha = instance.w;
      vec2 p = instance.xy + (corner - 0.5) * instance.z;
      gl_Position = vec4(p / viewport * 2.0 - 1.0, 0.0, 1.0) * vec4(1.0, -1.0, 1.0, 1.0);
    }`));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform sampler2D tex;
    in vec2 uv;
    in float alpha;
    out vec4 colour;
    void main() { colour = texture(tex, uv) * vec4(1.0, 1.0, 1.0, alpha); }`));
  gl.linkProgram(program);
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const instances = new Float32Array(count * INSTANCE_FLOATS);
  const instanceBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, instances.byteLength, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeSprite());
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const viewport = gl.getUniformLocation(program, 'viewport');

  return {
    draw(time) {
      animate(instances, count, time, canvas.width, canvas.height);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(viewport, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

export async function createWebGPU(canvas: AnyCanvas, count: number): Promise<RawBackend | null> {
  const gpu = (navigator as Navigator & { gpu?: any }).gpu;
  const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;

  const device = await adapter.requestDevice();
  const context = (canvas as HTMLCanvasElement).getContext('webgpu') as any;
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const sprite = makeSprite();
  const texture = device.createTexture({ size: [sprite.width, sprite.height], format: 'rgba8unorm', usage: 0x04 | 0x02 | 0x10 /* TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT */ });
  device.queue.copyExternalImageToTexture({ source: sprite }, { texture }, [sprite.width, sprite.height]);

  const module = device.createShaderModule({
    code: `
      struct Uniforms { viewport: vec2f };
      @group(0) @binding(0) var<uniform> u: Uniforms;
      @group(0) @binding(1) var tex: texture_2d<f32>;
      @group(0) @binding(2) var samp: sampler;
      struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) alpha: f32 };
      @vertex fn vs(@builtin(vertex_index) index: u32, @location(0) instance: vec4f) -> Out {
        let corner = vec2f(f32(index & 1u), f32(index >> 1u));
        let p = instance.xy + (corner - 0.5) * instance.z;
        var out: Out;
        out.position = vec4f(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
        out.uv = corner;
        out.alpha = instance.w;
        return out;
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let c = textureSample(tex, samp, in.uv);
        let a = c.a * in.alpha;
        return vec4f(c.rgb * a, a);
      }`,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] },
    fragment: {
      module, entryPoint: 'fs',
      targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }],
    },
    primitive: { topology: 'triangle-strip' },
  });

  const uniforms = device.createBuffer({ size: 16, usage: 0x40 | 0x08 /* UNIFORM | COPY_DST */ });
  const instances = new Float32Array(count * INSTANCE_FLOATS);
  const instanceBuffer = device.createBuffer({ size: instances.byteLength, usage: 0x20 | 0x08 /* VERTEX | COPY_DST */ });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniforms } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
    ],
  });

  return {
    draw(time) {
      animate(instances, count, time, canvas.width, canvas.height);

      device.queue.writeBuffer(uniforms, 0, new Float32Array([canvas.width, canvas.height, 0, 0]));
      device.queue.writeBuffer(instanceBuffer, 0, instances);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, instanceBuffer);
      pass.draw(4, count);
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    dispose() {
      device.destroy();
    },
  };
}
