import { describe, expect, it } from 'vitest';
import { Colour4 } from '@fw/graphics/Colour4';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { Texture } from '@fw/graphics/textures/Texture';
import { createHost } from './testHost';

describe('Sprite dimming', () => {
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
