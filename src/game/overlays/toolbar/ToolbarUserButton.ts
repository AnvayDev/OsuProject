// Ported from osu.Game/Overlays/Toolbar/ToolbarUserButton.cs
// Web: there is no API (IAPIProvider): the local user is always APIAccess's GuestUser and the API state is always Offline, so the
// connecting spinner, the failing icon and TransientUserStatisticsUpdateDisplay (which only show while online) are left out. LoginOverlay
// isn't ported, so the button has no state container.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { APIUser } from '../../online/api/requests/responses/APIUser';
import { UpdateableAvatar } from '../../users/drawables/UpdateableAvatar';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

/** (APIAccess.GuestUser) */
function createGuestUser(): APIUser {
  const user = new APIUser();
  user.username = 'Guest';
  user.id = 0; // APIUser.SYSTEM_USER_ID
  return user;
}

export class ToolbarUserButton extends ToolbarOverlayToggleButton {
  private avatar!: UpdateableAvatar;

  private usernameText!: OsuSpriteText;

  constructor() {
    super();

    this.buttonContent.autoSizeAxes = Axes.X;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.flow.addRange([
      this.usernameText = new OsuSpriteText().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        margin: MarginPadding.of({ right: 5 }),
      }),
      new Container().with({
        masking: true,
        cornerRadius: 4,
        size: new Vector2(32),
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        edgeEffect: new EdgeEffectParameters({
          type: EdgeEffectType.Shadow,
          radius: 4,
          colour: Colour4.Black.opacity(Math.fround(0.1)),
        }),
        children: [
          this.avatar = new UpdateableAvatar().with({
            relativeSizeAxes: Axes.Both,
          }),
        ],
      }),
    ]);

    const user = createGuestUser();
    this.schedule(() => this.userChanged(user));

    return r;
  }

  private userChanged(user: APIUser): void {
    this.usernameText.text = user.username;
    this.avatar.user = user;
  }
}
