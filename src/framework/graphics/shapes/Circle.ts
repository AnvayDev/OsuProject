// Ported from osu.Framework/Graphics/Shapes/Circle.cs

import { Axes } from '../../layout/Enums';
import { CircularContainer } from '../containers/CircularContainer';
import { Box } from './Box';

/** A simple CircularContainer with a fill using a Box. Can be coloured using the colour property. */
export class Circle extends CircularContainer {
  constructor() {
    super();

    this.masking = true;

    this.addInternal(new Box().with({ relativeSizeAxes: Axes.Both }));
  }
}
