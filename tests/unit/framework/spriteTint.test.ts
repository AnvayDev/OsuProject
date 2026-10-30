import { describe, expect, it, vi } from 'vitest';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Container } from '@fw/graphics/containers/Container';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { Texture } from '@fw/graphics/textures/Texture';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { createHost } from './testHost';

describe('Sprite dimming', () => {
  it('keeps a cover gradient and its image styles unchanged while its ancestors scroll', () => {
    const { root, frame } = createHost();
    const sprite = new Sprite().with({
      texture: new Texture('https://example.com/cover.jpg', 600, 200),
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      fillMode: FillMode.Fill,
    });
    const gradient = new Container().with({
      size: new Vector2(265, 80),
      colour: ColourInfo.gradientHorizontal(Colour4.White.opacity(0), Colour4.White.opacity(0.2)),
      child: sprite,
    });
    const moving = new Container().with({ size: new Vector2(400), scale: new Vector2(0.913), child: gradient });
    root.add(moving);
    frame();
    const mask = sprite.element.style.mask;
    expect(mask).toContain('to right');
    expect(mask).not.toContain('cover.jpg');
    const writes = vi.spyOn(sprite.element.style, 'setProperty');

    for (let i = 0; i < 100; i++) {
      moving.y = 50 + Math.sin(i / 7) * 10;
      frame(16);
      expect(sprite.element.style.mask).toBe(mask);
      expect(sprite.element.style.backgroundBlendMode).toBe('');
    }
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it('fades an image without rewriting its background or mask', () => {
    const { root, frame } = createHost();
    const sprite = new Sprite().with({ texture: new Texture('https://example.com/cover.jpg', 100, 100) });
    root.add(sprite);
    frame();
    const writes = vi.spyOn(sprite.element.style, 'setProperty');
    sprite.fadeOut(400);
    frame(100);
    expect(Number(sprite.element.style.opacity)).toBeLessThan(1);
    expect(writes.mock.calls.every(([property]) => property === 'opacity')).toBe(true);
    writes.mockRestore();
  });
  it('dims a remote image without using it as a CORS-restricted mask, then restores it', () => {
    const { root, frame } = createHost();
    const sprite = new Sprite().with({ texture: new Texture('https://example.com/background.png', 100, 100) });
    root.add(sprite);

    // The main menu changes the background's tint from white to grey when its logo is clicked.
    root.colour = new Colour4(0.8, 0.8, 0.8, 1);
    frame();
    expect(sprite.element.style.background).toContain('https://example.com/background.png');
    expect(sprite.element.style.mask).not.toContain('background.png');
    expect(sprite.element.style.filter).toBe('brightness(0.8)');

    root.colour = Colour4.White;
    frame();
    expect(sprite.element.style.filter).toBe('');
    expect(sprite.element.style.mask).toBe('');
  });

  it('clears the dimming filter when the texture is removed or a coloured tint is applied', () => {
    const { root, frame } = createHost();
    const texture = new Texture('blob:test-image', 100, 100);
    const sprite = new Sprite().with({ texture, colour: new Colour4(0.5, 0.5, 0.5, 0.4) });
    root.add(sprite);
    frame();
    expect(sprite.element.style.opacity).toBe('0.4');

    sprite.colour = Colour4.Red;
    frame();
    expect(sprite.element.style.filter).toBe('');
    expect(sprite.element.style.backgroundBlendMode).toBe('multiply');

    sprite.colour = new Colour4(0.5, 0.5, 0.5, 1);
    frame();
    sprite.texture = null;
    frame();
    expect(sprite.element.style.filter).toBe('');
    expect(sprite.element.style.background).toBe('');
  });
});
