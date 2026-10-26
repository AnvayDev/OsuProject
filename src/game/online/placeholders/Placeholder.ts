// Ported from osu.Game/Online/Placeholders/Placeholder.cs, MessagePlaceholder.cs, ClickablePlaceholder.cs and LoginPlaceholder.cs
// The login overlay isn't ported (offline), so LoginPlaceholder's action does nothing.

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { OsuTextFlowContainer } from '../../graphics/containers/OsuTextFlowContainer';
import { OsuAnimatedButton } from '../../graphics/userInterface/OsuAnimatedButton';

const TEXT_SIZE = 22;

export abstract class Placeholder extends OsuTextFlowContainer {
  protected static readonly TEXT_SIZE = TEXT_SIZE;

  protected constructor() {
    super(cp => cp.font = cp.font.with({ size: TEXT_SIZE }));

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;
    this.textAnchor = Anchor.TopCentre;

    this.padding = new MarginPadding(20);

    this.autoSizeAxes = Axes.Y;
    this.relativeSizeAxes = Axes.X;
  }

  equals(other: Placeholder | null): boolean {
    return this.constructor === other?.constructor;
  }
}

export class MessagePlaceholder extends Placeholder {
  private readonly message: string;

  constructor(message: string) {
    super();

    this.addIcon(FontAwesome.Solid.ExclamationCircle, cp => {
      cp.font = cp.font.with({ size: TEXT_SIZE });
      cp.padding = MarginPadding.of({ right: 10 });
    });

    this.addText(this.message = message);
  }

  override equals(other: Placeholder | null): boolean {
    return (other instanceof MessagePlaceholder ? other.message : undefined) === this.message;
  }
}

export class ClickablePlaceholder extends Placeholder {
  action: (() => void) | null = null;

  constructor(actionMessage: string, icon: IconUsage) {
    super();

    let button: OsuAnimatedButton;

    this.addArbitraryDrawable(button = new OsuAnimatedButton().with({
      autoSizeAxes: Axes.Both,
      action: () => this.action?.(),
    }));

    const textFlow = new OsuTextFlowContainer(cp => cp.font = cp.font.with({ size: TEXT_SIZE })).with({
      autoSizeAxes: Axes.Both,
      margin: new MarginPadding(5),
    });

    button.add(textFlow);

    textFlow.addIcon(icon, i => {
      i.padding = MarginPadding.of({ right: 10 });
    });

    textFlow.addText(actionMessage);
  }
}

export class LoginPlaceholder extends ClickablePlaceholder {
  constructor(actionMessage: string) {
    super(actionMessage, FontAwesome.Solid.UserLock);

    // (login?.Show(): no login overlay offline.)
    this.action = () => {};
  }
}
