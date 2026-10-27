// Ported from osu.Framework/Graphics/Component.cs

import { Drawable } from './Drawable';

/**
 * An updateable component that can be inserted into the draw hierarchy.
 * This is currently used as a marker for cases where nothing more than load, update, lifetime support and hierarchy presence are required.
 * Eventually this will be fleshed out (and the inheritance will be reversed to Drawable : Component).
 */
export abstract class Component extends Drawable {
}
