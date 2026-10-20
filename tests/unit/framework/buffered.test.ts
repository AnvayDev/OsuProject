import { describe, expect, it } from 'vitest';
import { createHost } from './testHost';
import { BufferedContainer } from '@fw/graphics/containers/BufferedContainer';
import { Container } from '@fw/graphics/containers/Container';
import { Box } from '@fw/graphics/shapes/Box';
import { Colour4 } from '@fw/graphics/Colour4';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { effectiveKernelSigma, kernelSize } from '@fw/utils/Blur';

describe('Blur', () => {
  it('KernelSize cuts off at 10% of the centre weight', () => {
    expect(kernelSize(0)).toBe(0);
    expect(kernelSize(10)).toBe(21);
    expect(kernelSize(20)).toBe(42);
  });

  it('the shader kernel is ~0.9x as wide as the nominal gaussian', () => {
    expect(effectiveKernelSigma(kernelSize(20), 20) / 20).toBeCloseTo(0.904, 3);
  });
});

describe('BufferedContainer', () => {
  it('children draw white; the frame buffer carries the colour as group opacity/tint', () => {
    const { root, frame } = createHost();
    const box = new Box().with({ relativeSizeAxes: Axes.Both });
    const buffered = new BufferedContainer().with({ size: new Vector2(100, 50), alpha: 0.5, child: box });
    root.add(new Container().with({ autoSizeAxes: Axes.Both, colour: Colour4.fromHex('#808080'), child: buffered }));
    frame();

    expect(box.drawColourInfo.colour.averageColour.a).toBe(1);
    expect(buffered.frameBufferDrawColour.colour.averageColour.a).toBeCloseTo(0.5);
    expect(buffered.element.style.opacity).toBe('0.5');
    expect(buffered.element.style.filter).toMatch(/^brightness\(0\.50/);
    expect(buffered.element.style.clipPath).toBe('inset(0px 0px 0px 0px)');
  });

  it('converts blur sigma from frame-buffer texels to local units', () => {
    const { root, frame } = createHost();
    const buffered = new BufferedContainer().with({ size: new Vector2(100, 100), blurSigma: new Vector2(20), frameBufferScale: new Vector2(0.5) });
    root.add(new Container().with({ scale: new Vector2(2), autoSizeAxes: Axes.Both, child: buffered }));
    frame();

    // effective 18.081 texels / 0.5 scale / dpr 1 / local→screen 2
    const sigma = Number(/blur\(([\d.]+)px\)/.exec(buffered.element.style.filter)![1]);
    expect(sigma).toBeCloseTo(effectiveKernelSigma(42, 20) / 0.5 / 2, 5);
  });

  it('a cached frame buffer stops updating children until a redraw is forced', () => {
    const { root, frame } = createHost();
    const box = new Box().with({ relativeSizeAxes: Axes.Both });
    const buffered = new BufferedContainer({ cachedFrameBuffer: true }).with({ size: new Vector2(100, 100), child: box });
    root.add(buffered);
    frame();

    box.fadeTo(0, 1000);
    frame(100);
    frame(100);
    const frozen = box.alpha;
    frame(100);
    expect(box.alpha).toBe(frozen);
    expect(frozen).toBeGreaterThan(0);

    buffered.forceRedraw();
    frame(100);
    expect(box.alpha).toBeLessThan(frozen);
  });

  it('a non-cached frame buffer updates children every frame', () => {
    const { root, frame } = createHost();
    const box = new Box().with({ relativeSizeAxes: Axes.Both });
    root.add(new BufferedContainer().with({ size: new Vector2(100, 100), child: box }));
    frame();

    box.fadeTo(0, 1000);
    frame(250);
    frame(250);
    expect(box.alpha).toBeCloseTo(0.5);
  });

  it('applies effect blending and the background colour', () => {
    const { root, frame } = createHost();
    const buffered = new BufferedContainer().with({ size: new Vector2(10, 10), backgroundColour: Colour4.Red, blending: BlendingParameters.Additive });
    root.add(buffered);
    frame();
    expect(buffered.element.style.backgroundColor).not.toBe('');
    expect(buffered.element.style.mixBlendMode).toBe('plus-lighter');

    buffered.effectBlending = BlendingParameters.Mixture;
    frame();
    expect(buffered.element.style.mixBlendMode).toBe('');
  });
});
