// Ported from osu.Game/Graphics/Containers/LinkFlowContainer.cs
// Only external links are ported (there is no ILinkHandler / OsuGame link handling or chat link parsing yet), so a link either runs its
// custom action or opens its URL in a new tab, as C#'s fallback without a link handler does. A user link (OpenUserProfile, shown by the user
// profile overlay in C#) opens the user's osu-web profile.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { InnerFlow, type ITextPart, type TextFlowContainer, TextPart } from '@fw/graphics/containers/TextFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { Axes } from '@fw/layout/Enums';
import { GameHost } from '@fw/platform/GameHost';
import type { APIUser } from '../../online/api/requests/responses/APIUser';
import { DrawableLinkCompiler } from '../../online/chat/DrawableLinkCompiler';
import { OsuTextFlowContainer } from './OsuTextFlowContainer';

class TextLink extends TextPart {
  constructor(private readonly innerPart: ITextPart, private readonly tooltipText: string, private readonly action: () => void) {
    super();
  }

  protected override createDrawablesFor(textFlowContainer: TextFlowContainer): Iterable<Drawable> {
    const linkFlowContainer = textFlowContainer as LinkFlowContainer;

    this.innerPart.recreateDrawablesFor(linkFlowContainer);
    const drawables = [...this.innerPart.drawables];

    drawables.push(linkFlowContainer.createLinkCompiler(this.innerPart).with({
      relativeSizeAxes: Axes.Both,
      tooltipText: this.tooltipText,
      action: this.action,
    }));

    return drawables;
  }
}

class LinkFlow extends InnerFlow {
  // We want the compilers to always be visible no matter where they are, so RelativeSizeAxes is used.
  // However due to https://github.com/ppy/osu-framework/issues/2073, it's possible for the compilers to be relative size in the flow's auto-size axes - an unsupported operation.
  // Since the compilers don't display any content and don't affect the layout, it's simplest to exclude them from the flow.
  override get flowingChildren(): Drawable[] {
    return super.flowingChildren.filter(c => !(c instanceof DrawableLinkCompiler));
  }
}

export class LinkFlowContainer extends OsuTextFlowContainer {
  private host!: GameHost;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.host = dependencies.resolve(GameHost);
    return r;
  }

  /** AddLink(text, url, creationParameters), or AddLink(text, action, tooltipText, creationParameters) when given an action. */
  addLink(text: string, urlOrAction: string | (() => void), tooltipOrCreationParameters: string | ((t: SpriteText) => void) | null = null,
    actionCreationParameters: ((t: SpriteText) => void) | null = null): void {
    if (typeof urlOrAction === 'string') {
      const creationParameters = typeof tooltipOrCreationParameters === 'function' ? tooltipOrCreationParameters : null;
      this.createLink(this.createChunkFor(text, true, () => this.createSpriteText(), creationParameters), urlOrAction, urlOrAction);
      return;
    }

    const tooltipText = typeof tooltipOrCreationParameters === 'string' ? tooltipOrCreationParameters : '';
    this.createLink(this.createChunkFor(text, true, () => this.createSpriteText(), actionCreationParameters), '', tooltipText, urlOrAction);
  }

  addUserLink(user: APIUser, creationParameters: ((t: SpriteText) => void) | null = null): void {
    this.createLink(this.createChunkFor(user.username, true, () => this.createSpriteText(), creationParameters), `https://osu.ppy.sh/users/${user.id}`,
      'View profile');
  }

  private createLink(textPart: ITextPart, url: string, tooltipText: string, action: (() => void) | null = null): void {
    const onClickAction = (): void => {
      if (action !== null)
        action();
      // fallback to handle cases where OsuGame is not available, ie. tournament client.
      else
        this.host.openUrlExternally(url);
    };

    this.addPart(new TextLink(textPart, tooltipText, onClickAction));
  }

  /** @internal */
  createLinkCompiler(textPart: ITextPart): DrawableLinkCompiler {
    return new DrawableLinkCompiler(textPart);
  }

  protected override createFlow(): InnerFlow {
    return new LinkFlow();
  }
}
