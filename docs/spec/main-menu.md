# Main menu spec (osu!lazer → web port)

> **Version (2026-10-20 audit):** behaviour now targets the user's client, **osu! 2026.1005.0-lazer** (osu-framework 2026.921.1,
> osu-resources 2026.918.0), which is what `_reference/` is pinned to. This spec was first written from master (2026-10-19), so some
> `file:line` citations may be a few lines off. Where master behaved differently, the text below states the 2026.1005 behaviour.


This spec covers the main menu screen of osu!lazer (`MainMenu`) and everything drawn on it: the button system, the osu! logo, the logo
visualiser, side flashes, kiai fountains, song ticker, menu tips, supporter display, online banner, hold-to-exit and the exit sequence.
It also covers the beat sync model these components rely on. Implement against this file; every constant cites its source.

Citation prefixes (all relative to `/Users/anvay/OSUWebProj/_reference/`):

| Prefix in this doc | Repository |
|---|---|
| `osu/…` | osu!lazer game (`_reference/osu`) |
| `fw/…` | osu!framework (`_reference/osu-framework/osu.Framework`) |
| `res/…` | osu-resources (`_reference/osu-resources/osu.Game.Resources`) |

Units are osu! layout units (the root `ScalingContainer` converts to CSS px). `W`, `H` are the draw size of the screen container that holds
`MainMenu` (it is padded at the top by the toolbar, see §1.2). Colours are given as hex with alpha 0..1. "None" easing means `Easing.None` (linear).

---

## 0. Framework semantics the port must reproduce

The menu relies on osu!framework transform details. If the TS framework port gets these wrong, the menu will look wrong even with correct constants.

1. **A new transform on the same property removes later ones.** When a transform is added, every *later-starting* transform on the same
   target member is removed (its sequence gets `OnAbort`) — `fw/Graphics/Transforms/TargetGroupingTransformTracker.cs:242-252`.
   When a transform *starts* (first applied), earlier transforms on the same member are applied at the new start time and then removed —
   `fw/…/TargetGroupingTransformTracker.cs:120-150`. Result: the newest transform wins from its start time, and it starts from the current value.
2. **`Delay(d)` adds `d` to the sequence cursor; `Then()` moves the cursor to `max(cursor, end of the last transform)`.** —
   `fw/Graphics/Transforms/TransformSequence.cs:37,367-374,385-388`. Example: `FadeIn(400).Delay(4000).Then().FadeOut(800)` fades out at 4000..4800, not at 4400.
3. **`BeginDelayedSequence(d)` is recursive by default.** Transforms added to the drawable *and its children* inside the `using` scope start `d` ms later —
   `fw/Graphics/Transforms/Transformable.cs:35,276`. `ButtonSystem` uses this to delay the whole button area by 150 ms.
4. **`FinishTransforms(true)`** jumps every transform on the drawable and all descendants to its end value immediately. `ButtonSystem` calls this
   on every state change (§3.5), so a state change mid-animation snaps the old animation to its end first.
5. **`Interpolation.Damp(start, final, base, exponent)` = `lerp(start, final, 1 - base^exponent)`** — `fw/Utils/Interpolation.cs:27-33`. The menu passes
   `Time.Elapsed` (ms) as the exponent, so `base` is "fraction remaining after 1 ms".
6. **Child order and flow order.** Default draw order: depth descending, then `ChildID` ascending (later-added draws on top) —
   `fw/Graphics/Containers/CompositeDrawable.cs:395-403`. `CompareReverseChildID` inverts the `ChildID` part (earlier-added draws on top) —
   `fw/…/CompositeDrawable.cs:412-420`. Fill flow layout order is independent of draw order: layout position (default 0), then `ChildID` ascending,
   and **only present children (`IsPresent`, i.e. alpha > 0 or `AlwaysPresent`) take part** — `fw/Graphics/Containers/FlowContainer.cs:160`.
7. **Key input order.** `GlobalActionContainer` is `Prioritised` — `osu/osu.Game/Input/Bindings/GlobalActionContainer.cs:17`,
   `fw/Input/Bindings/KeyBindingContainer.cs:85-96`. Global actions (Back = Escape / Mouse4, Select = Enter / Space / KeypadEnter —
   `GlobalActionContainer.cs:92-97`) are dispatched before raw `OnKeyDown`. Inside one container, the non-positional queue is reversed, so later
   children receive input first. Proxies only draw; input stays at the original drawable's tree position.
8. **Textures load at 2× scale.** `TextureStore` has `scaleAdjust = 2` by default — `fw/Graphics/Textures/TextureStore.cs:51`. A 1024 px PNG has a display size of 512 units.
   A `Sprite` with zero size takes the texture's display size — `fw/Graphics/Sprites/Sprite.cs:184-185`.
9. **Shear.** `Shear = (sx, 0)` maps `x' = x − sx·y` around the drawable's origin (`ShearFromLeft(-shear)`) — `fw/Graphics/DrawInfo.cs:48`,
   `fw/Extensions/MatrixExtensions/MatrixExtensions.cs:86-91`. The top edge moves right and the bottom edge moves left, so buttons lean like `/`.
   CSS equivalent: `transform-origin: <origin>; transform: skewX(-atan(sx))`.
10. **Margin with non-TopLeft anchors.** The origin is computed on `size + margin.Total`, then `margin.TopLeft` is added. Example: `Origin=Centre`,
    `Size=32`, `Margin.Top=-4` → origin at (16,14), top edge at anchorY − 14 − 4, so the centre sits 2 units above the anchor.

---

## 1. Where the menu lives

### 1.1 Game-level layering (bottom → top)

From `osu/osu.Game/OsuGame.cs:1108-1160`:

```
ScreenOffsetContainer (Padding.Top = toolbarOffset, X = side-overlay nudge)
└ ScreenContainer (ScalingContainer ExcludeOverlays)
  ├ BackReceptor
  ├ ScreenStack (OsuScreenStack: ParallaxContainer(0.02) → BackgroundScreenStack, then screens)   ← MainMenu lives here
  ├ logoContainer  (RelativeSizeAxes.Both)                                                        ← the single OsuLogo instance + its default proxy
  ├ footerBasedOverlayContent (Depth -1)
  └ PopoverContainer → ScreenStackFooter (Depth -1)
overlayOffsetContainer → overlayContent / left / right floating overlays
topMostOverlayContent (Toolbar, FPS counter)
idleTracker (GameIdleTracker(6000))
```

- One global `OsuLogo` exists, cached and created with `Alpha = 0` — `osu/osu.Game/OsuGame.cs:424`. `SetupDefaultContainer(logoContainer)` adds the logo and
  a proxy of it to `logoContainer` — `OsuGame.cs:1182-1187`, `osu/osu.Game/Screens/Menu/OsuLogo.cs:489-495`.
- `MainMenu` moves the logo's **proxy** (draw position in z-order only) into its own `logoTarget` — `osu/osu.Game/Screens/Menu/MainMenu.cs:287`, `OsuLogo.cs:462-487`.
  The logo's *layout parent* stays `OsuGame.logoContainer`. `MainMenu`'s own alpha and position do **not** affect the logo.
  - DOM port: keep the logo's transform computed in `logoContainer` space (same size and origin as the screen). Move the logo's element in DOM order
    to `logoTarget`'s slot, and make sure `MainMenu`'s opacity/transform is not inherited (for example, render the logo in a sibling layer with an explicit z-index
    between the buttons layer and the side-flash layer).

### 1.2 Toolbar offset (affects vertical centring)

- `toolbarOffset = Toolbar.Position.Y + Toolbar.DrawHeight` — `osu/osu.Game/OsuGame.cs:190`, applied as `ScreenOffsetContainer.Padding.Top` every frame — `OsuGame.cs:1751`.
- `Toolbar.HEIGHT = 40` — `osu/osu.Game/Overlays/Toolbar/Toolbar.cs:26`. Show: `MoveToY(0, 500, OutQuint)` + `FadeIn(125, OutQuint)`. Hide: `MoveToY(-DrawHeight, 500, OutQuint)` + `FadeOut(500, InQuint)` — `Toolbar.cs:40,287-298`.
- Result: when the menu leaves Initial, the toolbar slides in and the whole screen area (background, buttons, logo) shrinks from the top by 40 over 500 ms OutQuint.
  Anything centred vertically moves down by up to 20 units. When the menu returns to Initial, the reverse happens.

### 1.3 MainMenu children, z-order (bottom → top)

`osu/osu.Game/Screens/Menu/MainMenu.cs:129-219`. All depths are 0; order = insertion order.

| # | Drawable | Placement | Notes |
|---|---|---|---|
| 0 | `HoldToExitGameOverlay` | full screen | Only when `host.CanExit`. Gets input here; it is **drawn** via its proxy at #11 — `MainMenu.cs:131-139,218` |
| 1 | `MainMenuSeasonalLighting` or `Empty()` | — | `SeasonalUIConfig.ENABLED = false` — `osu/osu.Game/Seasonal/SeasonalUIConfig.cs:14`. Skip. |
| 2 | `GlobalScrollAdjustsVolume` | full screen | Mouse wheel anywhere (delta.Y ≠ 0) → `VolumeOverlay.Adjust(IncreaseVolume, delta.Y, isPrecise)` — `osu/osu.Game/Overlays/Volume/GlobalScrollAdjustsVolume.cs` (2026.1005 has no global Alt-only `ScrollAdjustsVolume` in OsuGame; that was added later on master) |
| 3 | `buttonsContainer` = `ParallaxContainer { ParallaxAmount = 0.01 }` → `ButtonSystem` | full screen | `MainMenu.cs:145-180` |
| 4 | `logoTarget` (Container, RelativeSizeAxes.Both) | full screen | receives the logo proxy — `MainMenu.cs:181` |
| 5 | `MenuSideFlashes` | full screen | `MainMenu.cs:182` |
| 6 | `SongTicker` | Anchor/Origin TopRight, Margin {Right 15, Top 5} | `MainMenu.cs:183-188` |
| 7 | `KiaiMenuFountains` | full screen | `MainMenu.cs:190` |
| 8 | `bottomElementsFlow` (FillFlow vertical, AutoSize Both, Anchor/Origin BottomCentre, Spacing (5,5)) | bottom centre | children: `MenuTipDisplay` (TopCentre), `OnlineMenuBanner` (TopCentre) — `MainMenu.cs:191-211` |
| 9 | `SupporterDisplay` | Anchor/Origin TopLeft, Margin 5 | `MainMenu.cs:212-217` |
| 10 | hold-to-exit proxy | full screen | black dim drawn above everything on the menu |

Screen-level properties:
- `FADE_IN_DURATION = 300`, `FADE_OUT_DURATION = 400` — `MainMenu.cs:52-54`.
- `HideOverlaysOnEnter => Buttons == null || Buttons.State == Initial` — `MainMenu.cs:56`. On a screen change, `OsuGame` calls `CloseAllOverlays()` if true, else `Toolbar.Show()` — `osu/osu.Game/OsuGame.cs:1839-1844`.
- `AllowUserExit = false` (no footer back button), `AllowGlobalTrackControl = true`, `PlayExitSound = false` — `MainMenu.cs:58,62,95`.
- Background = `BackgroundScreenDefault` — `MainMenu.cs:93` (see §2.6).

---

## 2. MainMenu lifecycle

### 2.1 Background tint and banner per button state

`MainMenu.cs:221-238` (`baseDim = 1` because seasonal is off):

| `ButtonSystemState` | Background `FadeColour` | `OnlineMenuBanner.State` |
|---|---|---|
| Initial, Exit | `Gray(1.0)` = `#FFFFFF`, 500 ms, `OutSine` | Hidden |
| any other | `Gray(0.8)` = `#CCCCCC` (rgba(204,204,204,1)), 500 ms, `OutSine` | Visible |

`FadeColour` is a multiplicative tint on the background screen. `OsuColour.Gray(float)` — `osu/osu.Game/Graphics/OsuColour.cs:20`.

### 2.2 OnEntering (first arrival from the intro)

```ts
// MainMenu.cs:254-273, OsuScreen.cs:217-236
onEntering(e) {
  super.onEntering(e);              // OsuScreen: applyArrivingDefaults(false) → logo.appendAnimatingAction(() => logoArriving(logo,false), waitForPrevious=true)
                                    //            pushes BackgroundScreenDefault
  this.Buttons.fadeInFromZero(500); // ButtonSystem alpha 0 → 1, 500 ms, None
  if (e.last instanceof IntroScreen && music.trackLoaded && !track.isRunning) {
    beatmap.prepareTrackForPreview(false); track.restart();
  }
  // storage error dialog: skip for web
}
```

`ButtonSystem` starts in `Initial` (`ButtonSystem.cs:419`), so the button area is hidden and only the logo shows.

### 2.3 LogoArriving (entering and resuming)

`OsuLogo.AppendAnimatingAction(action, waitForPrevious=true)` runs `action` only after **all current logo transforms have finished**
(`DelayUntilTransformsFinished().Schedule(action)`) — `osu/osu.Game/Screens/Menu/OsuLogo.cs:258-275`, `osu/osu.Game/Screens/OsuScreen.cs:277-283`.

```ts
// OsuScreen.LogoArriving — OsuScreen.cs:263-275
logo.action = null;
logo.fadeOut(300, Easing.OutQuint);
logo.origin = Anchor.Centre;
logo.changeAnchor(Anchor.TopLeft);          // keeps the visual position: Position -= newAnchorPos - oldAnchorPos (OsuLogo.cs:497-502)
logo.relativePositionAxes = Axes.Both;
logo.triangles = true;                       // colourAndTriangles.FadeTo(1, 300, OutQuint) — OsuLogo.cs:84-87
logo.ripple = true;                          // rippleContainer.FadeTo(1, 300, OutQuint) — OsuLogo.cs:91-95

// MainMenu.LogoArriving — MainMenu.cs:278-308
Buttons.setOsuLogo(logo);                    // §3.6: sets logo.action = onOsuLogo, positions the flow, calls updateLogoState()
logo.fadeColour(White, 100, Easing.OutQuint);
logo.fadeIn(100, Easing.OutQuint);           // replaces the base FadeOut(300) (same property, newer transform wins)
logoProxy = logo.proxyToContainer(logoTarget);
if (resuming) {
  Buttons.State = TopLevel;
  this.fadeIn(300, Easing.OutQuint);                              // MainMenu alpha
  buttonsContainer.moveTo({x:0,y:0}, 300, Easing.OutQuint);
  sideFlashes.delay(300).fadeIn(64, Easing.InQuint);
} else {
  const previous = logo.action;              // = ButtonSystem.onOsuLogo
  logo.action = () => onLogoClick(previous);
}
```

`onLogoClick(original)` — `MainMenu.cs:310-339`: if `ShowMobileDisclaimer` (default = `RuntimeInfo.IsMobile` — `osu/osu.Game/Configuration/OsuConfigManager.cs:177`)
it shows a disclaimer dialog after 500 ms. Otherwise `displayLoginIfApplicable()`: **the first time** (session static `LoginOverlayDisplayed`), if not logged in,
it calls `Scheduler.AddDelayed(() => login.Show(), 500)`. Then it returns `original()` (so the logo sample decision is unchanged).
- Web: online-only. Either stub (do nothing), or slide in a visual-only login overlay 500 ms after the first logo click. See §17.

### 2.4 OnSuspending (a sub-screen such as song select is pushed)

```ts
// MainMenu.cs:361-380 (base first: OsuScreen.OnSuspending → logo.appendAnimatingAction(() => logoSuspending(logo), waitForPrevious=false)
//                       → logo.clearTransforms(); then logoSuspending runs immediately)
super.onSuspending(e);
Buttons.State = EnteringMode;                                     // §3.5: buttons contract style 1, area hides; logo tracking (§3.7)
this.fadeOut(400, Easing.InSine);                                 // MainMenu alpha
buttonsContainer.moveTo({x:-800,y:0}, 400, Easing.InSine);
sideFlashes.fadeOut(64, Easing.OutQuint);
bottomElementsFlow.scaleTo(0.9, 1000, Easing.OutQuint).fadeOut(500, Easing.OutQuint);   // both start at t=0 (same sequence, no Then)
supporterDisplay.fadeOut(500, Easing.OutQuint);
samplePlaybackDisabled = true;                                    // stops kiai fountain loop samples

// LogoSuspending — MainMenu.cs:341-351
const seq = logo.fadeOut(300, Easing.InSine).scaleTo(0.2, 300, Easing.InSine);
logoProxy.dispose(); logoProxy = null;                            // proxy returns to OsuGame.logoContainer
seq.onComplete(() => Buttons.setOsuLogo(null));                   // stop tracking
seq.onAbort(() => Buttons.setOsuLogo(null));
```

While the logo fades and shrinks, `ButtonSystem` keeps tracking it to the facade, which slides left 800 units with the buttons (§3.7).

### 2.5 OnResuming (returning from a sub-screen)

```ts
// MainMenu.cs:382-402; base = OsuScreen.OnResuming → applyArrivingDefaults(true) (LogoArriving(resuming=true) after logo transforms finish, §2.3)
super.onResuming(e);
Buttons.stopSamplePlayback();               // stops click samples of play/multi/top-level buttons + logo click sample
samples.get('Menu/reappear-swoosh').play();
background.next();                          // BackgroundScreenDefault.Next(): rotate to the next menu background (§2.6)
music.ensurePlayingSomething();
menuTipDisplay.showNextTip();               // §11
bottomElementsFlow.scaleTo(1, 1000, Easing.OutQuint).fadeIn(1000, Easing.OutQuint);
samplePlaybackDisabled = false;
```

Note: the `SupporterDisplay` is **not** faded back in on resume. It was faded out on suspend and stays hidden.

### 2.6 Background behaviour (only what the menu triggers)

`osu/osu.Game/Screens/Backgrounds/BackgroundScreenDefault.cs`:
- `background_count = 8`. Start index `currentDisplay = RNG.Next(0, 8)`, then `Next()` on load — `:29,66-67`.
- For a non-supporter (offline), the texture is `Menu/menu-background-{currentDisplay % 8 + 1}` → `res/Textures/Menu/menu-background-1.jpg … -8.jpg`
  (2732×1537). The `Welcome` intro uses `Intro/Welcome/menu-background` instead — `:186-196`.
- `Next()`: build a new `Background`. If it is a different instance (always true on the default path), cancel pending work, then after **500 ms** load it.
  `displayNext`: old `FadeOut(800, OutQuint)` + expire, add new with `Depth = currentDisplay`, then `currentDisplay++` — `:105-135`.
  The new background has a larger depth, so it is drawn *behind* the old one, which fades out on top of it.
- The background parallax (0.02) is applied by `OsuScreenStack` — `osu/osu.Game/Screens/OsuScreenStack.cs:28,66-67`. Same algorithm as §15.

### 2.7 OnExiting and the exit sequence

```ts
// MainMenu.cs:404-453
onExiting(e): boolean {
  const requiresConfirmation = dialogOverlay != null
    && !exitConfirmedViaDialog
    && (notifications.hasOngoingOperations || !exitConfirmedViaHoldOrClick);
  if (requiresConfirmation) {
    const cur = dialogOverlay.currentDialog;
    if (cur instanceof ConfirmExitDialog) {
      if (cur has an OK button) cur.performOkAction(); else cur.flash();   // second exit request = confirm
    } else {
      dialogOverlay.push(new ConfirmExitDialog(
        () => { exitConfirmedViaDialog = true; this.exit(); },
        () => { holdToExitGameOverlay.abort(); game.cancelRestartOnExit(); }));
    }
    return true;                      // block the exit
  }
  Buttons.State = Exit;               // buttons contract (style 0), area hides, logo returns to centre after 150 ms (§3.7), toolbar hides
  OverlayActivationMode = Disabled;
  songTicker.hide();                  // instant alpha 0
  this.fadeOut(3000);                 // None
  bottomElementsFlow.fadeOut(500, Easing.OutQuint);
  supporterDisplay.fadeOut(500, Easing.OutQuint);
  return super.onExiting(e);          // OsuScreen: logoExiting → proxy disposed (MainMenu.cs:353-359)
}
```

How `exitConfirmedViaHoldOrClick` is set:
- Exit button: `e is MouseEvent` — `MainMenu.cs:173-177`. A mouse click (or `TriggerClick`) exits with no dialog. The `Q` key sends a `KeyDownEvent`, so the dialog shows.
- Hold to exit (Escape held at Initial): `holdDelay > 0` — `MainMenu.cs:133-137`. With the default delay of 200 ms there is no dialog.
  With delay 0 the exit is instant and the dialog shows.

After `MainMenu` exits, the screen stack resumes the `IntroScreen` that pushed it (this is the "see ya" outro) — `osu/osu.Game/Screens/Menu/IntroScreen.cs:238-284`:

```ts
this.fadeIn(300);
background.fadeColour(Black, 100);
track.looping = false; Beatmap.disabled = true;
let fadeOutTime = 3000;                                   // exit_delay — IntroScreen.cs:64
if (config.MenuVoice /* default true, OsuConfigManager.cs:108 */) {
  samples.get('Intro/seeya').play();                      // res/Samples/Intro/seeya.mp3 ('Intro/Welcome/seeya' for the Welcome intro)
  track.volumeTo(0.03, 200).then().volumeTo(0, 3000 - 200, Easing.In);
} else {
  fadeOutTime = 500;
  track.volumeTo(0, 500, Easing.Out);
}
game.fadeTo(0.01, fadeOutTime).onComplete(() => this.exit());   // whole game fades to 1% alpha, then the app closes
// IntroScreen.LogoArriving(resuming=true) — IntroScreen.cs:321-358, after base LogoArriving; colour White, triangles=false, ripple=false
const t = logo.alpha > 0.2 ? 350 : 0;
logo.moveTo({x:0.5,y:0.5}, t, Easing.OutQuint);
logo.scaleTo(1, t, Easing.OutQuint).fadeIn(350, Easing.OutQuint).then().rotateTo(20, 4500).fadeOut(3000);
```

(For a supporter, `seeya` is a `SkinnableSound` played with `ScheduleAfterChildren`. Same asset.) For the web there is no process to end. See §17 Q1.

### 2.8 Input handled by MainMenu itself

- `GlobalAction.Back` in `MainMenu.OnPressed` only runs when `!host.CanExit` (mobile): `host.SuspendToBackground()` — `MainMenu.cs:465-480`.
  On desktop, Back at Initial goes to `HoldToExitGameOverlay` (§14).
- `PresentBeatmap(beatmap, ruleset)` sets the beatmap and ruleset, then `Schedule(loadSongSelect)` — `MainMenu.cs:455-463`.
- `ReturnToOsuLogo()` sets `Buttons.State = Initial` — `MainMenu.cs:252`. The toolbar's home button calls `menuScreen.MakeCurrent()` when a child screen exists — `OsuGame.cs:1197-1203`.

---

## 3. ButtonSystem

`osu/osu.Game/Screens/Menu/ButtonSystem.cs`

### 3.1 Constants

| Name | Value | Source |
|---|---|---|
| `BUTTON_WIDTH` | 140 | `ButtonSystem.cs:38` |
| `WEDGE_WIDTH` | 20 | `ButtonSystem.cs:39` |
| `BUTTON_AREA_HEIGHT` | 100 | `ButtonArea.cs:26` |
| Logo facade scale in flow | 0.74 | `ButtonSystem.cs:134` |
| Flow spacing | (−20, 0) | `ButtonArea.cs:45` |
| Delay when leaving Initial | 150 ms | `ButtonSystem.cs:441` |
| Idle timeout | 6000 ms (`GameIdleTracker(6000)`) | `osu/osu.Game/OsuGame.cs:1095` |

### 3.2 State enum (numeric order matters)

`ButtonSystem.cs:528-537`: `Exit=0, Initial=1, TopLevel=2, Play=3, Multi=4, Edit=5, EnteringMode=6`.
Button visibility uses `<`/`>` comparisons on these numbers (§4.5).

### 3.3 Buttons (in insertion / flow order)

The flow lays children out in insertion order, left to right, and skips children that are not present. Insertion order: constructor `ButtonSystem.cs:110-135`,
then `load` `ButtonSystem.cs:190-193` (multi, play, edit, top-level).

| # | Label (exact, lowercase) | Icon (texture) | Colour (Color4 bytes → hex) | Click sample | Trigger keys | Content padding | Visible in | Base width |
|---|---|---|---|---|---|---|---|---|
| 1 | `settings` | `OsuIcon.Settings` → `res/Textures/Icons/settings.png` | (85,85,85) `#555555` | `UI/button-select` (empty name) | O, S | Right 20 | TopLevel | 140 (+20) |
| 2 | `back` | `OsuIcon.PrevCircle` → `Icons/prev-circle.png` | (51,58,94) `#333A5E` | `Menu/back-to-top` | — | Right 20 | Play..Edit (Min Play, Max Edit) | 140 (+20) |
| 3 | *logo facade* | — | — | — | — | — | always | `SizeForFlow × logo.Scale.X × 0.74` |
| 4 | `lounge` | `FontAwesome.Solid.Couch` | (94,63,186) `#5E3FBA` | `Menu/button-default-select` | L, M | Left 20 | Multi | 140 (+20) |
| 5 | `ranked play` | `FontAwesome.Solid.Crown` | `#5E3FBA` | `Menu/button-daily-select` | R | — | Multi | 140 |
| 6 | `solo` | `OsuIcon.Player` → `Icons/player.png` | (102,68,204) `#6644CC` | `Menu/button-default-select` | P | Left 20 | Play | 140 (+20) |
| 7 | `multi` | `OsuIcon.Online` → `Icons/online.png` | `#5E3FBA` | `Menu/button-default-select` | M | — | Play | 140 |
| 8 | `playlists` | `OsuIcon.Tournament` → `Icons/tournament.png` | `#5E3FBA` | `Menu/button-default-select` | L | — | Play | 140 |
| 9 | `daily challenge` (`DailyChallengeButton`) | `OsuIcon.DailyChallenge` → `Icons/daily-challenge.png` | `#5E3FBA` | `Menu/button-daily-select` | D | — | Play (only with daily challenge info, §4.9) | 182 (140×1.3) |
| 10 | `beatmap editor` | `OsuIcon.Beatmap` → `Icons/beatmap.png` | (238,170,0) `#EEAA00` | `Menu/button-default-select` | B, E | Left 20 | Edit | 140 (+20) |
| 11 | `skin editor` | `OsuIcon.SkinB` → `Icons/skin-b.png` | (220,160,0) `#DCA000` | `Menu/button-default-select` | S | — | Edit | 140 |
| 12 | `play` | `OsuIcon.Logo` → `Icons/Logo.png` | `#6644CC` | `Menu/button-play-select` | P, M, L | Left 20 | TopLevel | 140 (+20) |
| 13 | `edit` | `OsuIcon.EditCircle` → `Icons/EditCircle.png` | `#EEAA00` | `Menu/button-play-select` | E | — | TopLevel | 140 |
| 14 | `browse` | `OsuIcon.Beatmap` → `Icons/beatmap.png` | (165,204,0) `#A5CC00` | `Menu/button-default-select` | B, D | — | TopLevel | 140 |
| 15 | `exit` (only if `host.CanExit`) | `OsuIcon.CrossCircle` → `Icons/cross-circle.png` | (238,51,153) `#EE3399` | `UI/button-select` | Q | — | TopLevel | 140 |

Sources: `ButtonSystem.cs:112-188`. Strings: `osu/osu.Game/Localisation/ButtonSystemStrings.cs:15-75`. Editor labels are `"Beatmap editor".ToLower()` and
`"Skin editor".ToLower()` — `EditorStrings.cs:15`, `SkinEditorStrings.cs:15`. OsuIcon glyphs are textures `Icons/{Description}` —
`osu/osu.Game/Graphics/OsuIcon.cs:208,743-746`. The PNGs are 100×100, so they display at 50×50 and are scaled into the 32×32 `SpriteIcon`.
These button colours are raw `Color4` values, not `OsuColour` palette names. FontAwesome icons (Couch, Crown) need FA5 Solid glyphs.

After load, every `MainMenuButton` gets `Anchor = Origin = CentreLeft` — `ButtonSystem.cs:195-202`. The facade keeps TopLeft, which is correct with the custom flow origin (§3.4).

**Click actions**:
- settings → `settings.ToggleVisibility()`; browse → `beatmapListing.ToggleVisibility()` — `MainMenu.cs:240-241`.
- play → `State = Play`; edit → `State = Edit`; multi → `State = Multi`.
- solo → push `SoloSongSelect`.
- playlists, lounge, ranked play, daily → if the API is not Online, `loginOverlay.Show()`; otherwise push the online screen — `ButtonSystem.cs:212-268`.
- beatmap editor → `Beatmap.SetDefault()` + push `EditorLoader`; skin editor → `skinEditor.Show()`.
- exit → `OnExit(e)`.
- back → `State = (State == Multi ? Play : TopLevel)` — `ButtonSystem.cs:116-128`.

### 3.4 ButtonArea and flow geometry

`osu/osu.Game/Screens/Menu/ButtonArea.cs:28-51`:

```
ButtonArea (RelativeSizeAxes.Both, Content => Flow)
└ InternalChild: Container { Anchor=Origin=Centre, RelativeSizeAxes.X, Size=(1, 100), Alpha=0, AlwaysPresent=true }
  ├ ButtonAreaBackground: Box { RelativeSizeAxes.Both, Size=(2,1), Colour=Gray(50)=#323232, Anchor=Origin=Centre }
  └ Flow: FlowContainerWithOrigin { Direction=Horizontal, Spacing=(-20,0), Anchor=Centre, AutoSizeAxes.Both, Position set by SetOsuLogo }
```

- The bar is a 100-high strip, centred vertically, colour `#323232` (`OsuColour.Gray(byte 50)` — `OsuColour.cs:21`). It is 2× screen width so it covers the screen under parallax.
- `FlowContainerWithOrigin`: `Origin = Custom`, `OriginPosition = CentreTarget.DrawPosition + CentreTarget.DrawSize / 2 * CentreTarget.Scale` (the facade's centre),
  draw order `CompareReverseChildID` (earlier buttons draw on top of later ones where they overlap) — `osu/osu.Game/Screens/Menu/FlowContainerWithOrigin.cs:23-36`.
  The facade's centre is pinned at `Flow.Position` relative to the bar centre, whatever the button widths are.
- `Flow.Position = (WEDGE_WIDTH*2 − (BUTTON_WIDTH + logo.SizeForFlow/4), 0)`, set in `SetOsuLogo` — `ButtonSystem.cs:72`.
  `SizeForFlow = 512 × logo.Scale(1) × bounce.Scale × hover.Scale` (§5.1). With the logo unhovered: **X = 40 − (140 + 128) = −228**.
  It is evaluated once, when the logo arrives. If the logo is hovered (×1.1) at that moment, X = 40 − (140 + 140.8) = −240.8.
- Facade size, updated every frame: `facade.Size = SizeForFlow × logo.Scale.X` — `osu/osu.Game/Graphics/Containers/LogoTrackingContainer.cs:94`.
  At TopLevel with logo scale 0.5 its flow footprint is `512×0.5×0.74 = 189.44`. **Logo hover (×1.1) and mouse-down (×0.9) resize the facade, so the
  buttons on both sides move outward/inward with the logo's elastic.**
- Buttons are CentreLeft-anchored inside the auto-sized flow, so the bar, the buttons and the facade centre share the same vertical centre.

Settled TopLevel layout, before the parallax scale of 1.01, logo unhovered, no hover expansion. X is relative to the screen centre; spans are each button's un-sheared background rect:

| Element | Width | X span |
|---|---|---|
| settings | 160 | −462.72 … −302.72 |
| facade (logo centre at −228) | 189.44 | −322.72 … −133.28 |
| play | 160 | −153.28 … 6.72 |
| edit | 140 | −13.28 … 126.72 |
| browse | 140 | 106.72 … 246.72 |
| exit | 140 | 226.72 … 366.72 |

Play state: back = settings slot; solo/multi/playlists = play/edit/browse slots; daily (182 wide, if present) at 226.72 … 408.72.
Formula: a button's left edge = the previous right edge − 20.

### 3.5 State setter (ordering and interruption)

```ts
// ButtonSystem.cs:424-451
set State(value) {
  if (state === value) return;
  const last = state; state = value;
  updateLogoState(last);                                  // §3.7 — runs BEFORE the button transforms
  buttonArea.finishTransforms(true);                      // snap ALL running area/button/background/icon transforms to their end
  using (buttonArea.beginDelayedSequence(last === Initial ? 150 : 0)) {   // recursive: buttons + bar too
    buttonArea.ButtonSystemState = state;                 // §3.4 bar visibility + flatness
    for (const b of buttonArea.children.filter(isMainMenuButton)) b.ButtonSystemState = state;   // §4.5
  }
  StateChanged?.(state);                                  // MainMenu: background tint + banner (§2.1)
}
```

`HandleNonPositionalInput`/`HandlePositionalInput` of the whole ButtonSystem are false while `state == Exit` — `ButtonSystem.cs:421-422`.

**ButtonArea visibility** — `ButtonArea.cs:53-90`:

| State | `ButtonArea` (inner container alpha) | `ButtonAreaBackground` |
|---|---|---|
| Exit, Initial, EnteringMode | Hide: `FadeTo(0, 300)` None | Flat: `ScaleTo((2, 0), 300, InSine)` |
| TopLevel, Play | Show: `FadeTo(1, 300)` None | Normal: `ScaleTo((1,1), 400, OutQuint)` |
| Multi, Edit | unchanged (stays shown) | Normal |

Both are guarded by `if (value == state) return`. Flat scale (2,0) collapses the bar vertically into a line about its centre and doubles its width.

### 3.6 SetOsuLogo

```ts
// ButtonSystem.cs:63-82
setOsuLogo(logo: OsuLogo | null) {
  this.logo = logo;
  if (logo) {
    logo.action = onOsuLogo;
    buttonArea.flow.position = { x: 20*2 - (140 + logo.sizeForFlow / 4), y: 0 };
    updateLogoState();            // NOTE: default argument lastState = Initial
  } else {
    logoTracking?.dispose(); logoTracking = null;
  }
}
```

### 3.7 Logo state machine (`updateLogoState(lastState)`)

`ButtonSystem.cs:456-525`. The logo's `Position` is relative (0..1 of `logoContainer`) and `Origin = Centre`.

```ts
switch (state) {
  case Exit: case Initial:
    logoDelayedAction?.cancel();
    logoDelayedAction = scheduler.addDelayed(() => {
      logoTracking?.dispose(); logoTracking = null;
      game.toolbar.hide();
      logo.clearTransforms(/*targetMember*/ 'Position');
      logo.moveTo({x:0.5, y:0.5}, 800, Easing.OutExpo);
      logo.scaleTo(1, 800, Easing.OutExpo);
    }, buttonArea.alpha * 150);              // ButtonArea's own alpha is always 1 here → 150 ms
    if (lastState === TopLevel) samples.get('Menu/osu-logo-swoosh').play();   // also on idle return!
    break;

  case TopLevel: case Play:
    if (lastState === TopLevel) break;       // TopLevel → Play: logo untouched
    if (lastState === Initial) {
      logo.clearTransforms('Position');
      const impact = logo.scale.x > 0.6;     // true when coming from the big centred logo
      logo.scaleTo(0.5, 200, Easing.In);
      logoTracking?.dispose();
      logoTracking = trackingContainer.startTracking(logo, 200, Easing.In);
      logoDelayedAction?.cancel();
      logoDelayedAction = scheduler.addDelayed(() => { if (impact) logo.impact(); game.toolbar.show(); }, 200);
    } else {                                  // from Play/Multi/Edit/EnteringMode
      logo.clearTransforms('Position');
      logoTracking?.dispose();
      logoTracking = trackingContainer.startTracking(logo, 0, Easing.In);
      logo.scaleTo(0.5, 200, Easing.OutQuint);
    }
    break;

  case EnteringMode:
    logoTracking?.dispose();
    logoTracking = trackingContainer.startTracking(logo, lastState === Initial ? 400 : 0, Easing.InSine);
    break;
  // Multi, Edit: nothing (tracking continues)
}
```

Interruption notes:
- `logoDelayedAction` is cancelled on every Initial/Exit and Initial→TopLevel entry. For example, a fast Initial→TopLevel→Initial within 200 ms cancels the impact/toolbar-show.
  Note that TopLevel→Play does **not** cancel a pending Initial→TopLevel action.
- `Scheduler.AddDelayed` runs on the ButtonSystem's clock and only while ButtonSystem is alive.

**Logo sizes per state** (logo `Scale`; the sprite is 512 units, visible circle ≈ 512×0.94 = 481.3 diameter at scale 1):

| State | Logo scale | Position |
|---|---|---|
| Initial / Exit | 1.0 (800 ms OutExpo) | (0.5, 0.5) of logoContainer (800 ms OutExpo, after 150 ms) |
| TopLevel / Play / Multi / Edit | 0.5 (200 ms In from Initial, else 200 ms OutQuint) | tracks facade centre |
| EnteringMode (suspend) | → 0.2 (300 ms InSine) while fading out (300 ms InSine) | tracks facade (slides −800) |
| Hover | `logoHoverContainer` ×1.1 (500 ms OutElastic) | — |
| Mouse down | `logoBounceContainer` ×0.9 (1000 ms Out) | — |

### 3.8 LogoTrackingContainer algorithm

`osu/osu.Game/Graphics/Containers/LogoTrackingContainer.cs:37-121`. It runs in `UpdateAfterChildren`, after the flow layout.

```ts
startTracking(logo, duration = 0, easing = None): Disposable {
  // throws if a different logo is tracked or logo.isTracking
  this.logo = logo; logo.isTracking = true;
  this.duration = duration; this.easing = easing;
  startTime = null; startPosition = null;
  return { dispose: () => { logo.isTracking = false; this.logo = null; } };
}
updateAfterChildren() {
  if (!logo) return;
  facade.setSize(logo.sizeForFlow * logo.scale.x);                 // drives flow layout next frame
  const abs = logo.parent.toLocalSpace(facade.screenSpaceDrawQuad.centre);
  const target = { x: abs.x / logo.parent.relativeToAbsoluteFactor.x, y: abs.y / logo.parent.relativeToAbsoluteFactor.y };
  if (facade.parent && !eq(logo.position, target)) {
    if (startTime == null) { startTime = now; startPosition = logo.position; }
    logo.position = duration !== 0
      ? lerp(startPosition, target, applyEasing(easing, Math.min((now - startTime) / duration, 1)))
      : target;                                                       // direct assignment every frame, not a transform
  }
}
```

The target is re-read every frame (it includes the parallax offset/scale and the `buttonsContainer` slide), so the logo follows those exactly.
`startTime` is captured on the first frame where the positions differ, not when `startTracking` is called.

### 3.9 Input handling

```ts
// ButtonSystem.cs:283-417
onKeyDown(e) {                                        // raw keys (global actions were already dispatched; §0.7)
  if (e.repeat || ctrl || shift || alt || super) return false;
  if (F1..F35) return false;  if (Mute..TrackNext media keys) return false;
  if (e.key === Escape) return false;
  if (triggerInitialOsuLogo()) return true;           // ANY other key at Initial "clicks" the logo
  return super.onKeyDown(e);
}
// joystick press / MIDI down → triggerInitialOsuLogo() too
triggerInitialOsuLogo() { if (state === Initial) { stopSamplePlayback(); logo?.triggerClick(); return true; } return false; }

onPressed(GlobalAction a) {
  if (repeat) return false;
  if (a === Back) return goBack();
  if (a === Select) { logo?.triggerClick(); return true; }   // Enter/Space in any state
  return false;
}
goBack() {
  switch (state) {
    case TopLevel: State = Initial; stopSamplePlayback(); samples.get('Menu/back-to-logo').play(); return true;
    case Edit: case Play: case Multi: stopSamplePlayback(); backButton.triggerClick(); return true;   // back plays Menu/back-to-top
    default: return false;                                           // Initial → falls through to HoldToExitGameOverlay
  }
}
onOsuLogo(): boolean {                   // logo.action; return value = "play the logo's own select sample?"
  switch (state) {
    case Initial:  State = TopLevel; return true;
    case TopLevel: buttonsTopLevel[0].triggerClick(); return false;   // play
    case Play:     buttonsPlay[0].triggerClick();     return false;   // solo
    case Multi:    buttonsMulti[0].triggerClick();    return false;   // lounge
    case Edit:     buttonsEdit[0].triggerClick();     return false;   // beatmap editor
    default:       return false;
  }
}
stopSamplePlayback() { play/multi/topLevel buttons .stopSamplePlayback(); logo.stopSamplePlayback(); }   // edit buttons are NOT included (ButtonSystem.cs:382-388)
```

Button trigger keys are handled by each `MainMenuButton.OnKeyDown` (§4.7). Only `Expanded` buttons handle non-positional input, so keys apply to the current state only.

### 3.10 Idle return

`ButtonSystem.cs:204-206,270-277`; `osu/osu.Game/Input/IdleTracker.cs`; `osu/osu.Game/Input/GameIdleTracker.cs:25`.
- `isIdle = (now − lastInteraction) > 6000 && focusedDrawable == null`, evaluated every frame.
- Interaction = KeyDown/KeyUp/MouseDown/MouseUp/MouseMove (only while the window is active) or any Global/Platform action press/release.
- On `isIdle → true`: if `ReturnToTopOnIdle` (default true) and the state is not Exit/EnteringMode → `State = Initial`.
  This runs from any sub-menu. No `back-to-logo` sample plays, but `osu-logo-swoosh` does if the previous state was TopLevel (§3.7).
- Web: a focused `<input>` (for example the settings search) should count as `FocusedDrawable` and block idle.

---

## 4. MainMenuButton

`osu/osu.Game/Screens/Menu/MainMenuButton.cs` (extends `BeatSyncedContainer`, EarlyActivation 0).

### 4.1 Constants

| Name | Value | Source |
|---|---|---|
| `BOUNCE_COMPRESSION` | 0.9 | `:33` |
| `HOVER_SCALE` | 1.2 | `:34` |
| `BOUNCE_ROTATION` | 8° | `:35` |
| `BaseSize` | (140, 100) | `:64` |
| `initialSize` | `BaseSize + Padding.Total` → (160,100) for padded buttons, (140,100) otherwise | `:73` |
| Expand | 500 ms | `:348` |
| Explode | 200 ms | `:354` |

### 4.2 Structure

```
MainMenuButton (AutoSizeAxes.Both, Alpha=0)  ← its size = background's current size
├ background: Container { AlwaysPresent, Masking, MaskingSmoothness=2, Anchor=Origin=Centre,
│     EdgeEffect Shadow { Colour=black α0.2, Roundness=5, Radius=8 },
│     Shear = (WEDGE_WIDTH / initialSize.Y, 0) = (0.2, 0) }           ← set in LoadComplete
│   ├ backgroundContent: Container { RelativeSizeAxes.Y, Anchor=Origin=Centre, Width = 2*initialSize.X, Shear = -background.Shear }
│   │   └ Box { RelativeSizeAxes.Both, EdgeSmoothness=(1.5,0), Colour = accent }
│   └ boxHoverLayer: Box { RelativeSizeAxes.Both, EdgeSmoothness=(1.5,0), Additive, White, Depth=float.MinValue, Alpha=0 }
└ content: Container { RelativeSizeAxes.Both, Anchor=Origin=Centre, Padding = the button's Padding }
    ├ OsuSpriteText { Shadow, single line, Anchor=Origin=BottomCentre, Margin {Left −3, Bottom 7}, Text }
    └ SpriteIcon { Shadow, Anchor=Origin=Centre, Size 32×32, Margin {Top −4}, Icon }
```

Sources: `MainMenuButton.cs:92-192`.

- **Shape**: a parallelogram, sheared around its centre by 0.2 (CSS `skewX(-11.3099°)`). Its top edge is shifted +10 and its bottom edge −10 relative to the rect.
  The fill box is un-sheared and 2× wide, so it always covers the masked area, including elastic overshoot (comment at `:182-187`).
- **Shadow**: `EdgeEffect` black α0.2, radius 8, roundness 5, following the sheared shape. CSS approximation: a `drop-shadow`/`box-shadow` of 8 px blur at rgba(0,0,0,0.2) on the skewed element.
- **Text**: Torus Regular 16. `OsuFont.Default` is Medium, and Torus has no Medium, so it falls back to Regular — `osu/osu.Game/Graphics/OsuFont.cs:16,62,136-142`, `Graphics/Sprites/OsuSpriteText.cs:19-20`.
  White, with shadow colour black α0.2 offset `(0, 0.06 × fontSize)` = (0, 0.96) — `fw/Graphics/Sprites/SpriteText.cs:191,210`.
  Position: its bottom is 7 above the content-area bottom (so 7 above the button bottom), and it is centred 1.5 units left of the content-area centre (§0.10).
- **Icon**: 32×32, white, shadow black α0.2 offset (0, 2) — `fw/Graphics/Sprites/SpriteIcon.cs:73,91`. Its centre is 2 units above the content-area centre.
- **Content area**: the padding shifts the text/icon centre. Padded buttons have a 140-wide area: left-padded buttons (play, solo, lounge, beatmap editor)
  centre at x = 90 of 160, right-padded buttons (settings, back) centre at x = 70 of 160. The padding hides the part of the wedge under the logo.
- **Content alpha** (every frame): `content.Alpha = clamp((background.Width / initialSize.X − 0.5) / 0.3, 0, 1)` — `:300-304`. Text and icon appear only once the
  background is more than 50% open, and are fully visible at 80%.

### 4.3 Presence and hit-testing

- `IsPresent = base.IsPresent || state == Expanded` — `:80-82`. A button joins the flow the moment it is set to Expanded, even while its alpha is still 0 (delayed by 150 ms).
- `ReceivePositionalInputAt` = the background's (sheared, masked) quad — `:84`.
- `HandlePositionalInput = state != Exploded && background.Width / initialSize.X >= 0.8` — `:296`.
- `HandleNonPositionalInput = state == Expanded` — `:295`.

### 4.4 Button state animations

```ts
// MainMenuButton.cs:327-359 — called on State change (and once in LoadComplete followed by finishTransforms(true) → starts Contracted, width 0, alpha 0)
animateState() {
  switch (state) {
    case Contracted:
      if (contractStyle === 1) { background.resizeTo({x:0, y:initialSize.y}, 400, Easing.InSine); this.fadeOut(800); }   // EnteringMode
      else                     { background.resizeTo({x:0, y:initialSize.y}, 500, Easing.OutExpo); this.fadeOut(500); }
      break;
    case Expanded:
      background.resizeTo(initialSize, 500, Easing.OutExpo);
      this.fadeIn(500 / 6);              // 83.33 ms, None
      break;
    case Exploded:
      background.resizeTo({x: initialSize.x * 2, y: initialSize.y}, 200, Easing.OutExpo);
      this.fadeOut(200 / 4 * 3);         // 150 ms, None
      break;
  }
}
```

The width animation changes the button's auto-size, so the flow moves its neighbours every frame (the flow itself has no layout easing).

### 4.5 Mapping ButtonSystemState → ButtonState

```ts
// MainMenuButton.cs:376-400
updateState() {
  contractStyle = 0;
  switch (buttonSystemState) {
    case Initial:      state = Contracted; break;
    case EnteringMode: contractStyle = 1; state = Contracted; break;
    default:
      if (bss >= visibleStateMin && bss <= visibleStateMax) state = Expanded;
      else if (bss < visibleStateMin)                        state = Contracted;
      else                                                   state = Exploded;
  }
}
```

Resulting table (E = Expanded, C = Contracted, X = Exploded):

| Button (visible range) | Exit | Initial | TopLevel | Play | Multi | Edit | EnteringMode |
|---|---|---|---|---|---|---|---|
| settings, play/edit/browse/exit (TopLevel) | C | C | **E** | X | X | X | C₁ |
| back (Play..Edit) | C | C | C | **E** | **E** | **E** | C₁ |
| solo/multi/playlists/daily (Play) | C | C | C | **E** | X | C | C₁ |
| lounge/ranked (Multi) | C | C | C | C | **E** | C | C₁ |
| beatmap/skin editor (Edit) | C | C | C | C | C | **E** | C₁ |

C₁ = contract style 1 (400 ms InSine, fade 800). So:
- TopLevel → Play: the top-level buttons and settings burst outward and fade (200 ms).
- Play → Multi: the play buttons burst.
- Back from Play/Edit: their buttons contract to 0 width (500 ms OutExpo).
- From Multi, back returns to Play: lounge/ranked contract and the play buttons expand.

### 4.6 Hover and beat animations

```ts
// MainMenuButton.cs:196-242
onNewBeat(beatIndex, timingPoint, effect, amps) {          // runs inside beginDelayedSequence(-timeSinceLastBeat) → aligned to the beat
  if (!isHovered) return;
  const d = timingPoint.beatLength / 2;
  icon.rotateTo(rightward ? 8 : -8, d * 2, Easing.InOutSine);
  icon.moveToY(-10, d, Easing.Out); icon.scaleTo(1.2, d, Easing.Out);                 // parallel (Animate)
  // .Then(): starts at +d
  icon.moveToY(0, d, Easing.In) @ +d; icon.scaleTo({x:1.2, y:1.2*0.9 /*1.08*/}, d, Easing.In) @ +d;
  rightward = !rightward;
}
onHover() {
  if (state !== Expanded) return true;                      // no sample/expansion while contracting/exploding
  const d = timeUntilNextBeat;                              // §7
  icon.clearTransforms();
  icon.rotateTo(rightward ? -8 : 8, d, Easing.InOutSine);
  icon.scaleTo({x:1.2, y:1.08}, d, Easing.Out);
  samples.get('Menu/button-hover').play();                  // res/Samples/Menu/button-hover.wav
  background.resizeTo({x: initialSize.x * 1.5, y: initialSize.y}, 500, Easing.OutElastic);   // 240 or 210 wide
  return true;
}
onHoverLost() {
  icon.clearTransforms();
  icon.rotateTo(0, 500, Easing.Out); icon.moveTo({x:0,y:0}, 500, Easing.Out); icon.scaleTo(1, 200, Easing.Out);
  if (state === Expanded) background.resizeTo(initialSize, 500, Easing.OutElastic);
}
```

So while hovered, the icon hops 10 units up and back each beat (squashed to y = 1.08 at the bottom) and rocks ±8° on alternate beats.
The hovered button widens 1.5× with an elastic overshoot, pushing the following buttons right (or the preceding ones left, for settings/back).

### 4.7 Mouse, click, keys and samples

```ts
// MainMenuButton.cs:244-293
load() { sampleHover = 'Menu/button-hover'; sampleClick = sampleName ? `Menu/${sampleName}` : 'UI/button-select'; }
onMouseDown() { boxHoverLayer.fadeTo(0.1, 1000, Easing.OutQuint); }
onMouseUp()   { boxHoverLayer.fadeTo(0,   1000, Easing.OutQuint); }
onClick(e)    { trigger(e); return true; }
onKeyDown(e)  { if (e.repeat || modifiers) return false; if (triggerKeys.includes(e.key)) { trigger(e); return true; } return false; }
trigger(e) {
  sampleChannel = sampleClick.getChannel(); sampleChannel.play();    // stoppable via stopSamplePlayback()
  clickAction?.(this, e);
  boxHoverLayer.clearTransforms(); boxHoverLayer.alpha = 0.9; boxHoverLayer.fadeOut(800, Easing.OutExpo);   // white additive flash
}
```

There is no separate "disabled" visual. A button is non-interactive while contracted, exploded or under 80% open. Online-only actions open the login overlay instead (§3.3).

### 4.8 Exact timeline: Initial → TopLevel (logo click)

Let t = 0 be the click.
- 0 ms: logo flash 0.4 → 0 over 1500 ms OutExpo. `osu-logo-select` plays (because `onOsuLogo` returned true). `State = TopLevel`.
- 0 ms: logo `ScaleTo(0.5, 200, In)`. Tracking lerps the position (0.5,0.5) → facade centre over 200 ms `In`.
- 0 ms: background tint → `#CCCCCC` (500 OutSine). The online banner shows.
- 150 ms: bar `FadeTo(1, 300)`; bar background `ScaleTo(1, 400, OutQuint)` from (2,0). The settings/play/edit/browse/exit backgrounds resize 0 → initial (500 OutExpo) and their alpha 0 → 1 (83 ms).
- 200 ms: `logo.Impact()` (white ring, §5.8). `Toolbar.Show()` (slides in 500 OutQuint; the screen content shifts down by up to 20, §1.2).

### 4.9 DailyChallengeButton (visual only)

`osu/osu.Game/Screens/Menu/DailyChallengeButton.cs`
- `BaseSize = (182, 100)` — `:57`.
- Extra countdown text: Torus 12 (Regular via the Medium fallback), Shadow, BottomCentre, Margin {Left −3, Bottom 22}, Alpha 0, format `hh:mm:ss` — `:59-72,194`.
  It fades in/out over 250 ms OutQuint. It updates every 1000 ms.
- Background = `BufferedContainer` containing:
  - the beatmap set cover (`UpdateableOnlineBeatmapSetCover`, RelativeSizeAxes.Y, centred, RelativePositionAxes.Both);
  - an additive gradient box, vertical accent α0.2 → accent α1;
  - a box, accent α0.7 — `:75-98`.
- Ken-Burns loop: whenever the cover's last transform ends, `scale = 1 + rand[0,1)`. Over 3000 ms InOutSine: `ScaleTo(scale)`, `RotateTo(rand(−4,4)·(scale−1))` degrees,
  `MoveTo(rand(−0.5,0.5)·(scale−1), rand(−0.5,0.5)·(scale−1))` (relative). The gradient does `FadeIn(1500).Then().FadeOut(1500)` — `:113-134`.
- **Visibility**: if there is no `DailyChallengeInfo` (offline / no metadata server), `UpdateState` forces `Contracted` — `:198-208`. Alpha stays 0, so the button
  is absent from the flow. **Offline, the Play sub-menu shows only solo / multi / playlists.**
- Notification on a new challenge and the tooltip: online-only, skip.

---

## 5. OsuLogo

`osu/osu.Game/Screens/Menu/OsuLogo.cs` (BeatSyncedContainer, `EarlyActivationMilliseconds = 60`).

### 5.1 Layer tree (bottom → top) and sizes

```
OsuLogo (Origin=Centre, AutoSizeAxes.Both)                                  → 512×512
├ intro: IntroSequence (RelativeSizeAxes.Both)                              intro-only (separate spec), hidden in menu
└ logoHoverContainer (AutoSize)                    hover scale 1 ↔ 1.1
  └ logoBounceContainer (AutoSize)                 mouse-down scale, drag offset
    ├ rippleContainer (Centre, RelativeSizeAxes.Both, alpha via Ripple flag)
    │   └ ripple: Sprite(Menu/logo) Centre, Additive, Alpha 0            per-beat ripple
    └ logoAmplitudeContainer (AutoSize)            continuous amplitude scale (≤1)
      └ logoBeatContainer (AutoSize)               per-beat pulse scale
        ├ visualizer: MenuLogoVisualisation  RelativeSizeAxes.Both, Size = 0.94 (SCALE_ADJUST), Centre, Alpha 0.5
        ├ LogoElements (AutoSize)
        │   ├ logoContainer: CircularContainer  Centre, RelativeSizeAxes.Both, Scale 0.94, Masking   (circle Ø 481.28)
        │   │   ├ colourAndTriangles (RelativeSizeAxes.Both, alpha via Triangles flag)
        │   │   │   ├ Box  GradientVertical(#ff66ab → #cc5289)
        │   │   │   └ TrianglesV2 { Thickness 0.009, ScaleAdjust 3, SpawnRatio 1.4, Colour GradientVertical(#ff66ab → #b6346f) }
        │   │   └ flashLayer: Box  Additive, White, Alpha 0
        │   └ logo: Sprite(Menu/logo)  Centre                              512×512 (1024² texture @2x); includes its own white ring and drop shadow
        └ impactContainer: CircularContainer  Centre, RelativeSizeAxes.Both, Alpha 0, BorderColour White, BorderThickness 10, Masking
            └ Box (AlwaysPresent, Alpha 0)
```

Sources: `OsuLogo.cs:109-249`. Texture: `res/Textures/Menu/logo.png` (1024×1024) — `:285-286`.
- `SCALE_ADJUST = 0.94` matches the visible circle edge inside the texture, which has its shadow baked in — `:42`.
- `SizeForFlow = logo.DrawSize.X(512) × logo.Scale.X(1) × logoBounceContainer.Scale.X × logoHoverContainer.Scale.X` — `:76`.
- `ReceivePositionalInputAt` = `logoContainer` (the masked circle of radius 0.94·256·scales) — `:89`.
- `HandlePositionalInput = base && Alpha > 0.2` — `:383`.
- `IsPresent = base || Scheduler.HasPendingTasks` — `:107`.

Colours: the pink fill gradient #ff66ab (rgba 255,102,171,1) → #cc5289 (204,82,137,1), top to bottom. The triangle outlines run #ff66ab → #b6346f (182,52,111,1),
interpolated over the triangles drawable's area (each triangle samples the gradient at its quad position). The `OsuColour` palette has Pink1 = #ff66ab,
but the logo hardcodes these hexes.

### 5.2 Beat pulse, ripple, kiai flash (`OnNewBeat`)

```ts
// OsuLogo.cs:291-348 — inside beginDelayedSequence(-timeSinceLastBeat), fired 60 ms BEFORE the musical beat
onNewBeat(beatIndex, tp, ep, amps) {
  lastBeatIndex = beatIndex;
  const beatLength = tp.beatLength;
  const adj = Math.min(1, 0.4 + amps.maximum);           // amplitudeAdjust ∈ [0.4, 1]
  if (beatIndex < 0) return;

  if (action != null && isHovered) {                     // heartbeat while hovering the clickable logo
    this.delay(60).schedule(() => {                     // = exactly on the beat
      if (beatIndex % tp.timeSignature.numerator === 0) samples.get('Menu/osu-logo-downbeat').play();
      else { const ch = samples.get('Menu/osu-logo-heartbeat').getChannel();
             ch.frequency = 1 - 0.1/2 + rng.nextDouble(0.1);   // playbackRate ∈ [0.95, 1.05)
             ch.play(); }
    });
  }

  logoBeatContainer.scaleTo(1 - 0.02*adj, 60, Easing.Out).then().scaleTo(1, beatLength*2, Easing.OutQuint);
  // (the 2×beatLength recovery is always interrupted by the next beat's ScaleTo)

  ripple.clearTransforms();
  ripple.scaleTo(logoAmplitudeContainer.scale)                                   // instant
        .scaleTo(logoAmplitudeContainer.scale * (1 + 0.04*adj), beatLength, Easing.OutQuint)
        .fadeTo(0.15*adj)                                                         // instant
        .fadeOut(beatLength, Easing.OutQuint);

  if (ep.kiaiMode && flashLayer.alpha < 0.4) {           // skip while a click flash is brighter than 0.4
    flashLayer.clearTransforms();
    flashLayer.fadeTo(0.2*adj, 60, Easing.Out).then().fadeOut(beatLength);          // None
    visualizer.clearTransforms();
    visualizer.fadeTo(0.5 * 1.8 * adj, 60, Easing.Out).then().fadeTo(0.5, beatLength); // None
  }

  this.delay(60).schedule(() => { triangles.velocity += adj * (ep.kiaiMode ? 6 : 3); });
}
```

`BeatSampleVariance = 0.1` — `:59`. Samples: `res/Samples/Menu/osu-logo-heartbeat.wav`, `res/Samples/Menu/osu-logo-downbeat.wav`
(`osu-logo-heartbeat-bell.mp3` exists but is used by the seasonal logo only; skip). The ripple is the logo texture itself, additive: a faint
white-pink copy that grows 4% and fades each beat.

### 5.3 Continuous amplitude scale and triangle speed (`Update`)

```ts
// OsuLogo.cs:364-381
update() {
  if (music.currentTrack.isRunning) {
    const maxAmp = lastBeatIndex >= 0 ? music.currentTrack.currentAmplitudes.maximum : 0;
    logoAmplitudeContainer.scale = damp(logoAmplitudeContainer.scale.x, 1 - Math.max(0, maxAmp - 0.4) * 0.04, 0.9, elapsed);   // shrinks up to 2.4% on loud peaks
    triangles.velocity = damp(triangles.velocity, 0.5 * (isKiaiTime ? 4 : 2), 0.995, elapsed);   // target 1 (2 in kiai)
  } else {
    triangles.velocity = damp(triangles.velocity, 0.5, 0.9, elapsed);                            // paused: 0.5
  }
}
```

`IsKiaiTime` is only updated on beat boundaries (§7). The per-beat `+3/+6` velocity kicks decay with base 0.995/ms (≈ 7.8% per 16.7 ms frame), so the triangles surge on each beat.

### 5.4 TrianglesV2 (logo triangles)

`osu/osu.Game/Graphics/Backgrounds/TrianglesV2.cs`:
- `triangle_size = 100`, `base_velocity = 50`, ratio 0.866. With `ScaleAdjust 3` a triangle is 300 wide × 259.8 tall (local units of a 512×512 drawable, before the 0.94 circle scale) — `:20-26,223`.
- Count `AimCount = clamp(DrawWidth × 0.02 × SpawnRatio, 1, …)` = `512 × 0.02 × 1.4 = 14` — `:141`. When a triangle dies, a new one spawns at the bottom (`y = 1`) — `:94-95,158-167`.
  Initial fill (`Reset` on load / SpawnRatio change) puts triangles at random `y ∈ [−259.8/512, 1]`.
- Each triangle: `Position` = top vertex (relative 0..1), `x = rand[0,1)`. `SpeedMultiplier = max(0.5 + 0.16·N(0,1), 0.1)` (Box–Muller) — `:176-187`.
- Per frame: `Position.Y −= (elapsed/1000) × velocity × 50 / DrawHeight × max(0.5, speedMultiplier)`. Remove when `y + 259.8/DrawHeight < 0` — `:97-116`.
  Triangles rise upward. At velocity 1 the fastest move about 50 units/s.
- Drawing: an upright equilateral outline (apex at top), drawn with `sh_TriangleBorder.fs` — `res/Shaders/sh_TriangleBorder.fs`.
  The border thickness is `0.009` of the triangle's texture space (≈ 2.3 units at height 259.8), with 1.5 px smoothing (`texelSize = 1.5 / screen-space quad height`).
  Clamped to the drawable bounds (`ClampAxes = Both`) and then masked by the circle. Canvas port: stroke each triangle path with
  `lineWidth ≈ 0.009 × 259.8 × scale`, inner side only, colour from the vertical gradient at that y.

### 5.5 Hover, press, drag

```ts
// OsuLogo.cs:385-454
onMouseDown(e) { if (e.button !== Left) return true; logoBounceContainer.scaleTo(0.9, 1000, Easing.Out); return true; }
onMouseUp(e)   { if (e.button !== Left) return;      logoBounceContainer.scaleTo(1, 500, Easing.OutElastic); }
onHover()      { if (action != null) logoHoverContainer.scaleTo(1.1, 500, Easing.OutElastic); return true; }
onHoverLost()  { logoHoverContainer.scaleTo(1, 500, Easing.OutElastic); }
dragBlocksClick = false;  onDragStart() { return true; }
onDrag(e) { let c = sub(e.mousePosition, e.mouseDownPosition); const L = len(c);
            c = L <= 0 ? {x:0,y:0} : mul(c, Math.pow(L, 0.6) / L);       // rubber band: distance^0.6
            logoBounceContainer.position = c; }
onDragEnd() { logoBounceContainer.moveTo({x:0,y:0}, 800, Easing.OutElastic); }
```

Because `DragBlocksClick = false`, releasing after a drag still counts as a click.

### 5.6 Click

```ts
// OsuLogo.cs:400-414
onClick() {
  flashLayer.clearTransforms(); flashLayer.alpha = 0.4; flashLayer.fadeOut(1500, Easing.OutExpo);
  if (action?.() === true) { stopSamplePlayback(); sampleClickChannel = samples.get('Menu/osu-logo-select').getChannel(); sampleClickChannel.play(); }
  return true;
}
```

`res/Samples/Menu/osu-logo-select.wav` plays only for Initial → TopLevel. Other states trigger a button, which plays its own sample (§3.9).

### 5.7 Triangles/Ripple flags

`Triangles = v` → `colourAndTriangles.FadeTo(v ? 1 : 0, 300, OutQuint)`; `Ripple = v` → `rippleContainer.FadeTo(v ? 1 : 0, 300, OutQuint)` — `OsuLogo.cs:84-95`.
The main menu turns both on (§2.3). With colourAndTriangles at 0 the logo shows only the white ring texture.

### 5.8 Impact

```ts
// OsuLogo.cs:429-434
impact() { impactContainer.fadeOutFromOne(250, Easing.In); impactContainer.scaleTo(0.94); impactContainer.scaleTo(1.12, 250); }   // scale: None
```

A 10-unit white ring starts on the logo edge and expands to 112% while fading over 250 ms.

### 5.9 Animation queueing helpers

- `AppendAnimatingAction(action, waitForPrevious)`: if `waitForPrevious`, wait until every logo transform has finished, then run. Otherwise `ClearTransforms()` (all logo
  properties) and run now. Before the logo has loaded, the call is scheduled — `OsuLogo.cs:258-275`.
- `ProxyToContainer(c)` throws if a proxy is already lent out. It returns a disposable that moves the proxy back — `:462-487`.
- `ChangeAnchor(a)`: `Position -= newAnchorPosition − oldAnchorPosition` — `:497-502`.

---

## 6. LogoVisualisation / MenuLogoVisualisation

`osu/osu.Game/Screens/Menu/LogoVisualisation.cs`, `MenuLogoVisualisation.cs`

### 6.1 Constants

| Name | Value | Source |
|---|---|---|
| `index_change` | 5 bars per update | `:31` |
| `bar_length` | 600 | `:36` |
| `bars_per_visualiser` | 200 | `:41` |
| `visualiser_rounds` | 5 (copies rotated 72°) | `:46` |
| `decay_per_millisecond` | 0.0024 | `:51` |
| `time_between_updates` | 50 ms (no catch-up) | `:56,126-127` |
| `amplitude_dead_zone` | 1/600 | `:61` |
| Bar colour | `White α0.2` × drawable colour; drawable Alpha 0.5 (`visualizer_default_alpha`, `OsuLogo.cs:97`); Additive | `:77,172,204-205` |
| Colour (MenuLogoVisualisation) | White; supporters: skin `MenuGlow`, else White | `MenuLogoVisualisation.cs:28-34` |

### 6.2 Data update (every 50 ms)

```ts
// LogoVisualisation.cs:99-120
updateAmplitudes() {
  temporal.fill(0);                                     // length 256
  add(beatSyncProvider.currentAmplitudes.frequencyAmplitudes);   // track FFT (256 bins); extra sources: none at the menu
  const kiai = beatSyncProvider.checkIsKiaiTime() ? 1 : 0.5;     // ControlPoints.EffectPointAt(clock.currentTime).kiaiMode
  for (let i = 0; i < 200; i++) {
    const target = temporal[(i + indexOffset) % 200] * kiai;     // only bins 0..199 are ever used
    if (target > freq[i]) freq[i] = target;                       // rise instantly, never lower here
  }
  indexOffset = (indexOffset + 5) % 200;
}
```

Bar `i` shows bin `i + offset`, so a given bin's peak lands 5 bars (9°) further *counter-clockwise* each update. That is 180°/s of apparent anticlockwise rotation
(screen y-down, angle increases clockwise).

### 6.3 Per-frame decay

```ts
// LogoVisualisation.cs:130-145
for (let i = 0; i < 200; i++) { freq[i] -= elapsed * 0.0024 * (freq[i] + 0.03); if (freq[i] < 0) freq[i] = 0; }
```

### 6.4 Drawing

```ts
// LogoVisualisation.cs:194-245; size = DrawSize.X (= 512 × 0.94 = 481.28 in the logo)
const barWidth = size * Math.sqrt(2 * (1 - Math.cos(rad(360/200)))) / 2;   // = size × 0.015707 ≈ 7.56 (half the chord of 1.8°)
for (let j = 0; j < 5; j++) for (let i = 0; i < 200; i++) {
  if (data[i] < 1/600) continue;
  const rot = rad(i / 200 * 360 + j * 360 / 5);
  const c = Math.cos(rot), s = Math.sin(rot);
  const base = { x: (c/2 + 0.5) * size, y: (s/2 + 0.5) * size };            // on the circle of radius size/2, local space
  const h = 600 * data[i];                                                    // bar length, outward
  const side = { x: -s * barWidth / 2, y: c * barWidth / 2 };
  const out  = { x:  c * h,            y: s * h };
  quad(base - side, base - side + out, base + side, base + side + out);       // white α0.2, additive, under the logo circle
}
```

Each bar starts on the circle of radius `size/2` (= the logo's visible edge) and extends outward radially. The five rounds draw the same 200 values
rotated by 0°, 72°, 144°, 216°, 288°. Overlapping additive bars brighten, which gives the familiar dense look. Bars sit **behind** `LogoElements`,
so only the parts outside the circle are visible. In kiai the visualiser alpha pulses to `0.9 × adj` (§5.2), and amplitudes count double (×1 instead of ×0.5).

---

## 7. Beat sync (BeatSyncedContainer) and the beat source

`osu/osu.Game/Graphics/Containers/BeatSyncedContainer.cs`

### 7.1 Provider

`OsuGameBase` implements `IBeatSyncProvider` — `osu/osu.Game/OsuGameBase.cs:806-808`:
- `ControlPoints` = `Beatmap.Value.Beatmap.ControlPointInfo` if loaded, else null.
- `Clock` = `beatmapClock` (FramedBeatmapClock over the current track, `applyOffsets: true` → user global offset + beatmap offset + platform offset (15 ms on Windows only)
  — `osu/osu.Game/Beatmaps/FramedBeatmapClock.cs:83-135`).
- `CurrentAmplitudes` = `Track.CurrentAmplitudes` if the track is loaded, else `Empty`.

### 7.2 Update algorithm (per frame, per container)

```ts
// BeatSyncedContainer.cs:96-160
update() {
  isBeatSyncedWithTrack = source.clock.isRunning;
  let t: number;
  if (isBeatSyncedWithTrack) {
    let early = earlyActivationMilliseconds;
    if (clock.rate > 0) early *= source.clock.rate / clock.rate;        // 1 at the menu
    t = source.clock.currentTime + early;
    timingPoint = source.controlPoints?.timingPointAt(t) ?? TimingControlPoint.DEFAULT;
    effectPoint = source.controlPoints?.effectPointAt(t) ?? EffectControlPoint.DEFAULT;
  } else {                                                               // track paused / stopped: keep an idle 60 BPM pulse
    t = clock.currentTime /* this drawable's (game) clock */ + earlyActivationMilliseconds;
    timingPoint = TimingControlPoint.DEFAULT; effectPoint = EffectControlPoint.DEFAULT;
  }
  let beatLength = timingPoint.beatLength / divisor;                     // divisor default 1
  while (beatLength < minimumBeatLength /* 50 */) beatLength *= 2;
  let beatIndex = Math.trunc((t - timingPoint.time) / beatLength) - (timingPoint.omitFirstBarLine ? 1 : 0);   // C# (int) cast truncates toward 0
  if (t < timingPoint.time) beatIndex--;
  timeUntilNextBeat = (timingPoint.time - t) % beatLength;               // JS % matches C# % (sign of dividend)
  if (timeUntilNextBeat <= 0) timeUntilNextBeat += beatLength;
  timeSinceLastBeat = beatLength - timeUntilNextBeat;
  if (timingPoint === lastTimingPoint && beatIndex === lastBeat) return;
  if (allowMistimedEventFiring /* true */ || Math.abs(timeSinceLastBeat) < 16) {
    using (beginDelayedSequence(-timeSinceLastBeat)) onNewBeat(beatIndex, timingPoint, effectPoint, source.currentAmplitudes);
  }
  lastBeat = beatIndex; lastTimingPoint = timingPoint;
  isKiaiTime = effectPoint.kiaiMode;                                     // only refreshed on a new beat
}
```

- Defaults: `TimingControlPoint.DEFAULT`: `BeatLength = 60000/60 = 1000` ms (60 BPM), `Time = 0`, 4/4, no omit — `osu/osu.Game/Beatmaps/ControlPoints/TimingControlPoint.cs:27,31-40`.
  `EffectControlPoint.DEFAULT`: kiai off — `EffectControlPoint.cs:13-17`.
- `MISTIMED_ALLOWANCE = 16` ms; `MinimumBeatLength` defaults to **0** in 2026.1005 (`BeatSyncedContainer.cs:69`; master later changed the default to 50).
  No menu component sets it, so a beat length is never doubled in the menu (only `OsuTextBox` sets 300).
- Early activation per component: OsuLogo 60 ms (`OsuLogo.cs:103,111`), MenuSideFlashes 65 ms (`MenuSideFlashes.cs:41,52`), MainMenuButton 0, KiaiMenuFountains 0.
  The event fires `early` ms before the beat. Transforms are back-dated by `timeSinceLastBeat` so they start exactly `early` ms before the beat.
- The beat sequence restarts per timing point (`lastTimingPoint` reference change ⇒ new event even if the index repeats).
- Offline-first port: the `ControlPointInfo` comes from the parsed `.osu` file of the current beatmap (the theme intro beatmap `res/Tracks/triangles.osz`
  or a user beatmap). The clock = the `HTMLAudioElement` currentTime in ms (plus user offset).

### 7.3 Amplitudes (web mapping)

Framework source: `fw/Audio/BassAmplitudeProcessor.cs:32-52`, `fw/Audio/Track/ChannelAmplitudes.cs`.
- `LeftChannel`/`RightChannel` = BASS `ChannelGetLevel` over the last **1/60 s**, stereo, 0..1 (peak level). `Maximum = max(L, R)`. If the channel is not playing, `Empty` (all zero).
- `FrequencyAmplitudes` = BASS `FFT512` → 256 magnitude bins (linear, 0..~1, ≈86 Hz each at 44.1 kHz; the comment says ~78 Hz).
- **Measured against BASS 2.4 (2026-10-20, libbass.so with known test signals; max error 2e-8):** `FFT512[k] = |rfft(x · w)[k]| · 4/512` for k = 1…255
  and `· 2/512` for k = 0. Here `w[n] = 0.5 − 0.5·cos(2πn/512)` (periodic Hann) and `x` = the mono mix `(L+R)/2` of the 512 samples at the channel
  position. A full-scale sine at a bin centre reads exactly 1.0 (neighbours 0.5); DC 0.5 reads 0.5 in bin 0 and 0.5 in bin 1. Levels are per-channel
  peak `|x|` (not RMS) over 1/60 s: a 0.5-amplitude sine reads 0.5.
- WebAudio: `ChannelSplitterNode` → two `AnalyserNode`s (fftSize 1024 ≥ 1/60 s). Use the last `round(sampleRate/60)` samples of
  `getFloatTimeDomainData`, peak `|x|`, for L/R. A mono-mix `AnalyserNode` (its input is down-mixed to (L+R)/2) with `fftSize = 512`:
  `getFloatTimeDomainData` → our own FFT with the formula above. Don't use `getFloatFrequencyData`: it uses a Blackman window, 1/N scaling and
  smoothing. No calibration factor is needed.

---

## 8. MenuSideFlashes

`osu/osu.Game/Screens/Menu/MenuSideFlashes.cs` (BeatSyncedContainer, RelativeSizeAxes.Both, Anchor/Origin Centre, `EarlyActivation = 65`).

| Name | Value | Source |
|---|---|---|
| `Intensity` | 2 | `:29` |
| `amplitude_dead_zone` | 0.25 | `:36` |
| `alpha_multiplier` | (1 − 0.25) / 0.55 = 1.363636 | `:37` |
| `kiai_multiplier` | (1 − 0.25×0.95) / 0.8 = 0.953125 | `:38` |
| `box_max_alpha` | 200 (unused) | `:40` |
| `box_fade_in_time` | 65 ms | `:41` |
| `box_width` | 200 → actual width `200 × Intensity` = **400** | `:42,74,86` |

Boxes — `:69-91`:
- Left: Anchor/Origin CentreLeft, `RelativeSizeAxes.Y`, Height 1.5 (150% of the screen height, centred), Width 400, **X = −200** (half off-screen, so parallax never shows its edge), Alpha 0, Additive.
- Right: mirror (CentreRight, X = +200).
- Visible on screen: 200 units on each side.

Colour — `:123-142`:
- Base `OsuColour.Blue` = `#66ccff` (rgba 102,204,255) — `OsuColour.cs:325`. For supporters, the skin `MenuGlow` replaces it.
- `gradientLight = base.Opacity(0.6).ToLinear()`, `gradientDark = base.Opacity(0).ToLinear()`.
  Left box = horizontal gradient light → dark (bright at the screen edge). Right box = dark → light.
- `ToLinear()` converts the sRGB channels to linear values, which are then used as ordinary colour: (0.4, 0.8, 1.0) → (0.1329, 0.5954, 1.0) ≈ **`#2298FF` at α0.6**.
  The source comment says "linear colour looks better in this case". Port: use rgba(34,152,255,0.6) → rgba(34,152,255,0), additive (`mix-blend-mode: plus-lighter` or canvas `lighter`).

Trigger and animation — `:101-121`:

```ts
onNewBeat(beatIndex, tp, ep, amps) {
  if (beatIndex < 0) return;
  const n = tp.timeSignature.numerator;
  if (ep.kiaiMode ? beatIndex % 2 === 0 : beatIndex % n === 0) flash(leftBox,  tp.beatLength, ep.kiaiMode, amps);
  if (ep.kiaiMode ? beatIndex % 2 === 1 : beatIndex % n === 0) flash(rightBox, tp.beatLength, ep.kiaiMode, amps);
}
flash(d, beatLength, kiai, amps) {
  const ch = d === leftBox ? amps.leftChannel : amps.rightChannel;
  const a = clamp(0.1 + (ch - 0.25) / (kiai ? 0.953125 : 1.363636), 0.1, 1);
  d.fadeTo(a, 65).then().fadeOut(beatLength, Easing.In);         // fade-in: None
}
```

- Outside kiai, both sides flash together on every downbeat (every 4 beats in 4/4). In kiai they alternate left/right on every beat.
- With the track paused the default 60 BPM still fires, with amplitudes 0 → alpha 0.1 every 4 s.
- `MainMenu` fades the whole component out (64 ms OutQuint) on suspend and back in (delay 300, 64 ms InQuint) on resume — `MainMenu.cs:296,370`.

---

## 9. KiaiMenuFountains, StarFountain, StarFountainSounds

### 9.1 Trigger

`osu/osu.Game/Screens/Menu/KiaiMenuFountains.cs`
- Left fountain: Anchor/Origin BottomLeft, X = +250. Right: BottomRight, X = −250 — `:30-41`. A fountain has zero size, so its emitter point is
  (250, H) and (W − 250, H).
- `Update` — `:48-60`: `if (EffectPoint.KiaiMode && !isTriggered && |clock.currentTime − EffectPoint.Time| < 500) Shoot(); isTriggered = EffectPoint.KiaiMode;`
  It shoots only when a kiai section *starts* (within 500 ms of its effect point, so seeking into the middle of a kiai does not shoot).
- `Shoot` — `:62-87`: `direction = RNG.Next(-1, 2)` ∈ {−1, 0, 1}:
  - −1 → left shoots +1 (rightward), right shoots −1;
  - 0 → both shoot straight;
  - +1 → left −1, right +1 (both outward).
  `sounds.Play()` only if the window is active (web: `document.visibilityState === 'visible' && document.hasFocus()`).

### 9.2 Spewer

`osu/osu.Game/Screens/Menu/StarFountain.cs`, `osu/osu.Game/Graphics/ParticleSpewer.cs`
- Texture `Menu/fountain-star` → `res/Textures/Menu/fountain-star.png` (66×68 → 33×34 display). Additive — `StarFountain.cs:34,66`, `ParticleSpewer.cs:43`.
- Rate 240 particles/s, max duration 1000 ms, pool size 240 (ring buffer, oldest overwritten) — `StarFountain.cs:39-40,53-61`, `ParticleSpewer.cs:45-48`.
- `ParticleGravity = 800`, `ShootDuration = 800` ms (active window) — `StarFountain.cs:46-48`.
- `Shoot(dir)`: `Active = true`, cancel any pending deactivate, deactivate after 800 ms, `lastShootTime = now`, `LastShootDirection = dir` — `:92-101`.
- Spawning — `ParticleSpewer.cs:63-96`: when active, the first particle spawns immediately, then one every 1000/240 ms of elapsed time (catch-up loop; a reset happens if more than 1000 ms elapsed).
- Particle — `StarFountain.cs:69-88`:
  - `StartPosition = (0, 50)` (50 below the emitter = below the screen edge);
  - `Duration = rand[300, 1000)`;
  - `StartAngle = rand(−4, 4)` and `EndAngle = rand(−2, 2)` (**radians**, used directly in cos/sin);
  - `EndScale = 2.2 + rand(−0.4, 0.4)`;
  - `Velocity = (dir × 500 × (1 − 2(t_spawn − lastShootTime)/800) + rand(−60, 60), −1400 + rand(−100, 100))`.
    The x velocity sweeps linearly from +500·dir to −500·dir across the 800 ms shot (a fan sweep).
- Particle at age `a` — `ParticleSpewer.cs:220-243`:
  ```
  p = clamp(a / Duration, 0, 1)
  alpha = 1 − p ; scale = lerp(1, EndScale, p) ; angle = lerp(StartAngle, EndAngle, p)
  pos = StartPosition + (Velocity + (0, 800 × Duration/1000 × p)) × a / 1000
  quad = texture rect 33×34 × scale, centred at pos, rotated by angle about its centre
  ```

### 9.3 Sounds

`osu/osu.Game/Screens/Menu/StarFountainSounds.cs`
- `shoot` = `Gameplay/fountain-shoot`; `loop` = `Gameplay/fountain-loop` (Looping, pausable). The default Argon skin resolves these to
  `res/Samples/Gameplay/Argon/fountain-shoot.wav` / `fountain-loop.wav` (`osu/osu.Game/Skinning/ArgonSkin.cs:76-82`).
- `Play()` — `:36-69`:
  - cancel pending fade/stop;
  - if more than 500 ms since the last `Play()` (or the first time): `loop.Stop(); shoot.Play()`;
  - else: start the loop at volume 1 (if not already playing); after 500 ms, volume → 0 over 500 ms, then stop;
  - always `lastPlayback = now`.
- `MainMenu.samplePlaybackDisabled` (true while suspended) mutes/stops the pausable loop — `MainMenu.cs:89-91,379,401`.

---

## 10. SongTicker

`osu/osu.Game/Screens/Menu/SongTicker.cs` (AutoSizeAxes.Both, placed TopRight with Margin {Right 15, Top 5}).

- Shadow backdrop: Container (TopRight, `Position (5, −5)`, `Padding −5`, RelativeSizeAxes.Both) → CircularContainer (masking, invisible AlwaysPresent box) with EdgeEffect
  Shadow radius 75, colour `Gray(0.04)` α0.3 = rgba(10,10,10,0.3) — `:35-65`. A soft dark pill-shaped glow behind the text, extended by 5 on each side and offset (+5, −5).
- FillFlow vertical, spacing (0, 3) — `:66-86`:
  - title: Torus **Light 24**, TopRight-aligned (`italics: true` is ignored — `OsuFont.cs:96-101`);
  - artist: Torus Regular 16 (Medium → Regular).
  - Both white with the default text shadow (black α0.2, offset 0.06×size).
- Text: `RomanisableString(TitleUnicode, Title)` / `(ArtistUnicode, Artist)` (unicode unless the "prefer original metadata" setting is off — localisation spec).
- On every beatmap change (and at load, `Scheduler.AddOnce`) — `:90-107`:
  ```ts
  this.fadeInFromZero(400).delay(4000).then().fadeOut(800);   // visible 0..400 fade-in, hold, fade out 4000..4800 (all None)
  ```
  A new change mid-sequence restarts it from alpha 0 (FadeInFromZero sets alpha 0 instantly).
- `IsPresent = base || Scheduler.HasPendingTasks` — `:28`. `MainMenu` calls `songTicker.Hide()` (alpha 0 instantly) on exit — `MainMenu.cs:442`.

---

## 11. MenuTipDisplay

`osu/osu.Game/Screens/Menu/MenuTipDisplay.cs` (AutoSizeAxes.Both; first child of `bottomElementsFlow`, TopCentre).

Layout — `:43-71`:
- Background: Container (RelativeSizeAxes.Both, Masking, `CornerRadius 10`, `CornerExponent 2.5` = squircle-ish corners) → Box `#171A1C` α0.75 (rgba(23,26,28,0.75)).
- `LinkFlowContainer`: Width 600, AutoSize Y, `TextAnchor = TopCentre` (every line centred), Spacing (0, 2), Margin 10 → total width 620.
- Content (`ShowNextTip`, `:90-108`):
  1. FontAwesome Solid **Lightbulb** icon, size 16, colour `Pink0` `#ff99c7` (rgba 255,153,199) — `OsuColour.cs:409`.
  2. `" "`
  3. `"A tip for you:"` (`MenuTipStrings.MenuTipTitle` `"a tip for you:"` `.ToSentence()`) in **Torus-Alternate SemiBold 16**, colour Pink0.
  4. New paragraph (paragraph spacing 0.5 × 16 = 8 — `fw/Graphics/Containers/TextFlowContainer.cs:386`): the tip in Torus Regular 16, white.
- With `TextAnchor TopCentre` the title line and the wrapped tip lines are centred within 600.

Animation — `:110-118`:

```ts
const L = tip.toString().length;
this.fadeOut().scaleTo(0.9)                      // instant
    .delay(600)
    .fadeInFromZero(800, Easing.OutQuint)        // 600..1400
    .scaleTo(1, 800, Easing.OutElasticHalf)      // 600..1400
    .delay(1000 + 80 * L)                        // cursor = 1600 + 80L
    .then()                                      // = max(1600+80L, 1400)
    .fadeOutFromOne(2000, Easing.OutQuint);      // 1600+80L .. 3600+80L
```

- Called at load (via the `MenuTips` setting bind, default true — `OsuConfigManager.cs:110`) and on every resume (`MainMenu.cs:395`).
- If `MenuTips` is false: `FadeOut(100, OutQuint)` — `:84-88`. The tip shows once per menu visit and is not re-shown on state changes.
- Tip choice: `RNG.Next(0, 30)`, uniform over 30 tips — `:121-229`. Texts: `osu/osu.Game/Localisation/MenuTipStrings.cs:15-160`. Tips with `{0}`
  substitute the user's current key binding (or "None"). Defaults to substitute:
  - ToggleToolbar = Ctrl+T, ToggleSettings = Ctrl+O, ToggleBeatmapListing = Ctrl+D, TogglePauseReplay = Space, HoldForHUD = Ctrl, ToggleSkinEditor = Ctrl+Shift+S,
    RandomSkin = Ctrl+Shift+R, Previous/Next skin = Ctrl+Shift+[ / ] — verify in the input-bindings spec.
  - The web port may also replace desktop-only tips (FPS counter, multithreading) with neutral ones (product decision; see §17).

---

## 12. SupporterDisplay

`osu/osu.Game/Screens/Menu/SupporterDisplay.cs` (TopLeft, Margin 5). Visible to everyone, including offline/guest users (guest = not a supporter).

- Size: `Height 40`, AutoSize X with `AutoSizeDuration 1000`, `AutoSizeEasing OutQuint`. Masking, `CornerRadius 15`, `CornerExponent 2.5` — `:49-57`.
- Background box: Alpha 0.6. Colour animates from the default white to `Pink4` `#6b2e49` (rgba 107,46,73) for non-supporters (`Pink` `#ff66aa` for supporters)
  over 250 ms — `:61-65,114-121`, `OsuColour.cs:319,413`. Hover: alpha 0.8 (500 OutQuint); unhover 0.6 (500 OutQuint) — `:148-158`.
- Text flow: Padding 10, Spacing (0,2), CentreLeft — `:66-73`. Font **Torus SemiBold 14** (`:104-106`):
  - non-supporter: `"Consider becoming an [osu!supporter](https://osu.ppy.sh/home/support) to help support osu!'s development"` (markdown link → link text
    `osu!supporter` in `OsuColour.Blue` `#66ccff`, hover `Yellow` `#ffcc22` 500 OutQuint — `osu/osu.Game/Online/Chat/DrawableLinkCompiler.cs:59`,
    `osu/osu.Game/Graphics/Containers/OsuHoverContainer.cs:16,72-84`);
  - supporter: `"Eternal thanks to you for supporting osu!"` — `osu/osu.Game/Localisation/SupporterDisplayStrings.cs:15-20`.
- Heart: FontAwesome Solid Heart, size 14, Padding {Left 5, Top 1}, colour `Pink` `#ff66aa`. Loop: `FlashColour(White, 750, OutQuint).Loop()`
  (snap to white, return to pink over 750 ms, repeat) — `:124-136`.
- Timeline — `:94-99,160-183`:
  ```ts
  this.fadeOut().delay(rng.next(800, 4000)).fadeInFromZero(800, Easing.OutQuint);
  dismissal = scheduler.addDelayed(function dismiss() {
    if (isHovered) { dismissal = scheduler.addDelayed(dismiss, 8000); return; }   // re-arm while hovered
    autoSizeEasing = Easing.In;
    supportFlow.bypassAutoSizeAxes = Axes.X;            // width collapses to 0 over 1000 ms (In) while…
    this.delay(200).fadeOut(750, Easing.Out);
  }, 8000);                                              // 8000 ms after LoadComplete
  onClick() { dismissal.cancel(); supportFlow.bypassAutoSizeAxes = Axes.X; this.fadeOut(500, Easing.OutQuint); }   // width collapses with OutQuint
  ```
- `MainMenu` fades it out (500 OutQuint) on suspend and on exit. It never comes back during the session (a new `MainMenu` would be needed).

---

## 13. OnlineMenuBanner (online-only; stub visually)

`osu/osu.Game/Screens/Menu/OnlineMenuBanner.cs` (VisibilityContainer, second child of `bottomElementsFlow`).
- Content source: `GET https://assets.ppy.sh/menu-content.json` (re-polled every 5 min) — `osu/osu.Game/Online/API/Requests/GetMenuContentRequest.cs:11`, `:67-98`.
  Images come from `LargeTextureStore`. Names containing `@2x` get `ScaleAdjust ×2` — `:203-205`.
- AutoSize Both with `AutoSizeDuration 500`, OutQuint. `PopIn: content.FadeInFromZero(500, OutQuint)`, `PopOut: content.FadeOut(500, OutQuint)` — `:31,43-57`.
  Shown in every state except Initial/Exit (§2.1).
- Rotation every `DelayBetweenRotation = 7500` ms. It pauses while an image is hovered or dragged. The start index is random. When an image changes:
  the new one's `Show()` is delayed 300 ms if a previous one exists, and the previous one does `FadeOut(400, OutQuint)` — `:133-175`.
- `MenuImage` (BottomCentre, AutoSize) — `:191-264`:
  - a sprite plus an additive copy (`flash`);
  - `Show()`: `FadeInFromZero(500, OutQuint)` + `flash.FadeOutFromOne(4000, OutQuint)` (it appears over-bright and settles);
  - hover: `ScaleTo(1.05, 2000, OutQuint)`; unhover: `ScaleTo(1, 500, OutQuint)`;
  - mouse down: `ScaleTo(0.95, 500, OutQuint)`; mouse up: `ScaleTo(0.95).ScaleTo(1, 500, OutElastic)`;
  - click: `flash.FadeInFromZero(50).Then().FadeOut(500, OutQuint)`, then open the URL after 250 ms.
- Web (offline-first): `FetchOnlineContent = false` → empty, zero size. The flow spacing still puts the tip 5 units above the bottom edge.
  Optionally show static portfolio "banner" images through the same `MenuImage` behaviour.

---

## 14. HoldToExitGameOverlay and ConfirmExitDialog

### 14.1 Hold to exit

`osu/osu.Game/Screens/Menu/HoldToExitGameOverlay.cs`, `osu/osu.Game/Overlays/HoldToConfirmOverlay.cs`, `osu/osu.Game/Graphics/Containers/HoldToConfirmContainer.cs`
- Full-screen black `Box`, `finalFillAlpha = 0.7` — `HoldToExitGameOverlay.cs:17-20`, `HoldToConfirmOverlay.cs:42-50`.
- `Progress` → `box.Alpha = progress × 0.7` and a global **track + sample volume** adjustment `1 − progress × 0.7` — `HoldToConfirmOverlay.cs:52-61`.
- Back pressed (not repeat) → `BeginConfirm()`. Back released while not fired → `AbortConfirm()` — `HoldToExitGameOverlay.cs:22-43`.
  `ButtonSystem` sees Back first and swallows it in TopLevel/Play/Multi/Edit, so this only happens at **Initial** (§0.7, §3.9).
- `BeginConfirm`: `TransformBindableTo(progress, 1, holdDelay × (1 − progress), Easing.Out).OnComplete(Confirm)` — `HoldToConfirmContainer.cs:91-98`.
  `holdDelay = UIHoldActivationDelay` default **200 ms** (range 0..500) — `OsuConfigManager.cs:197`.
- `AbortConfirm`: `TransformBindableTo(progress, progress.Value).Delay(200).TransformBindableTo(progress, 0, 200, InSine)` — `HoldToConfirmContainer.cs:103-114`.
- `AllowMultipleFires = true` — `HoldToExitGameOverlay.cs:13`. `Confirm` → `Action` → `MainMenu.Exit()` (§2.7).
  The dialog's cancel calls `holdToExitGameOverlay.Abort()`, which fades the dim back.

### 14.2 ConfirmExitDialog

`osu/osu.Game/Screens/Menu/ConfirmExitDialog.cs` (a `PopupDialog`; its visuals belong to the dialog spec):
- Icon `FontAwesome.Solid.ExclamationTriangle`. Header `"Are you sure you want to exit osu!?"`.
- Normal: body `"Last chance to turn back"`; buttons `PopupDialogOkButton "Let me out!"` and `PopupDialogCancelButton "Just a little more..."`.
- With ongoing operations: the body lists up to 10 operations (`Text (xx%)`), then two blank lines and "Last chance to turn back"; buttons
  `PopupDialogDangerousButton "Let me out!"` and Cancel `"back"` — `:32-85`, `osu/osu.Game/Localisation/DialogStrings.cs:70-107`.

---

## 15. ParallaxContainer (buttons 0.01; background 0.02)

`osu/osu.Game/Graphics/Containers/ParallaxContainer.cs`

```ts
// ParallaxContainer.cs:59-93; parallaxScale = config MenuParallaxScale (default 1.0, range 0..2 — OsuConfigManager.cs:141)
update() {
  const amount = parallaxAmount * parallaxScale;
  if (amount === 0 && content.position == 0 && content.scale == 1) return;
  let offset = {x:0, y:0};
  const scale = 1 + Math.abs(amount);                         // 1.01 for the button layer (scales about the centre)
  if (mouse) {
    const half = drawSize / 2;
    const rel = toLocalSpace(mouse) - half;                   // pixels from centre (osu units)
    rel.x = Math.sign(rel.x) * (1 - Math.pow(0.999, Math.abs(rel.x)));   // Damp(0,1,0.999,|x|)
    rel.y = Math.sign(rel.y) * (1 - Math.pow(0.999, Math.abs(rel.y)));
    offset = rel * half * amount;                             // content moves TOWARD the cursor
  }
  const e = clamp(clock.elapsedFrameTime, 0, 100);
  content.position = almostEq(content.position, offset) ? offset : valueAt(e, content.position, offset, 0, 100,  Easing.OutQuint);
  content.scale    = almostEq(content.scale, scale)     ? scale  : valueAt(e, content.scale,    scale,  0, 1000, Easing.OutQuint);
}
```

- `content` is an inner Container (RelativeSizeAxes.Both, Anchor/Origin Centre), so the scale is about the screen centre — `:34-39`.
- Example (W = 1229): the cursor at the right edge (rel.x = 614) → `1 − 0.999^614 ≈ 0.459` → button offset ≈ 0.459 × 614 × 0.01 ≈ 2.8 units right.
  The background moves twice as far.
- `MainMenu` animates the **ParallaxContainer's own** Position (0 ↔ −800) on suspend/resume. That is separate from the inner content offset.
- `valueAt(e, cur, target, 0, d, OutQuint)` = `cur + (target − cur) × outQuint(e/d)`. This is a frame-rate-dependent exponential follow; port it literally.

---

## 16. Assets used

All under `_reference/osu-resources/osu.Game.Resources/` (copy to `public/assets/` with the same relative paths).

Textures (load at 2× scale, §0.8):

| Asset | Used by |
|---|---|
| `Textures/Menu/logo.png` (1024², shows 512) | logo sprite + ripple |
| `Textures/Menu/fountain-star.png` (66×68) | kiai fountains |
| `Textures/Menu/menu-background-1.jpg` … `-8.jpg` | default background rotation |
| `Textures/Icons/settings.png`, `prev-circle.png`, `player.png`, `online.png`, `tournament.png`, `daily-challenge.png`, `beatmap.png`, `skin-b.png`, `Logo.png`, `EditCircle.png`, `cross-circle.png` (100², white on alpha) | button icons |
| FontAwesome 5 Solid: Couch, Crown, Lightbulb, Heart, ExclamationTriangle (and SmileBeam for the mobile disclaimer) | lounge/ranked buttons, tip, supporter, exit dialog |

Samples:

| Asset | When |
|---|---|
| `Samples/Menu/button-hover.wav` | hover on an expanded menu button |
| `Samples/Menu/button-play-select.wav` | play, edit click |
| `Samples/Menu/button-default-select.wav` | browse, solo, multi, playlists, lounge, beatmap/skin editor click |
| `Samples/Menu/button-daily-select.wav` | daily challenge, ranked play click |
| `Samples/Menu/back-to-top.wav` | back button (Esc in sub-menus) |
| `Samples/UI/button-select.wav` | settings, exit click |
| `Samples/Menu/back-to-logo.wav` | Esc at TopLevel |
| `Samples/Menu/osu-logo-swoosh.wav` | any TopLevel → Initial/Exit (Esc or idle) |
| `Samples/Menu/osu-logo-select.wav` | logo click Initial → TopLevel |
| `Samples/Menu/osu-logo-heartbeat.wav` | each non-downbeat while hovering the logo (rate 0.95–1.05) |
| `Samples/Menu/osu-logo-downbeat.wav` | each downbeat while hovering the logo |
| `Samples/Menu/reappear-swoosh.wav` | MainMenu.OnResuming |
| `Samples/Gameplay/Argon/fountain-shoot.wav`, `fountain-loop.wav` | kiai start |
| `Samples/Intro/seeya.mp3` (`Intro/Welcome/seeya.mp3` for the Welcome intro) | exit outro |

Fonts: Torus Regular / Light / SemiBold, Torus-Alternate SemiBold (BMFont `.bin` in `Fonts/` — the font spec covers the mapping to woff2).

Shader reference: `Shaders/sh_TriangleBorder.fs` (port to Canvas/WebGL).

---

## 17. Web-port notes, stubs and open questions

Online-only pieces that are visible on screen. Stub them visually:
- The login overlay after the first logo click (500 ms delay) and for online buttons (multi/playlists/lounge/ranked/daily).
- The daily challenge button: contracted offline (§4.9), so it does not show. Leave it hidden unless a fake challenge is wanted.
- The online banner: empty offline (§13).
- The supporter display shows the non-supporter text offline (§12). The supporter-only skin `MenuGlow` tint for the visualiser and side flashes does not apply.
- The toolbar user avatar / online state is not part of this screen (toolbar spec).

Portfolio-specific (from `docs/ARCHITECTURE.md`): the `edit` top-level button is replaced by a **portfolio** button with a sub-menu. Reuse the `Edit` state machinery
(VisibleState Edit, back button range Play..Edit, the `onOsuLogo` Edit branch triggers the first sub-button). Keep the colour/icon/sample slots or replace them per the product spec.

Open questions / uncertainties:
1. **Exit on the web.** `host.CanExit` decides whether the `exit` button and `HoldToExitGameOverlay` exist. A browser tab cannot close itself. Options: (a) keep both and play
   the full outro (§2.7), ending on a black "see ya" screen with a click-to-restart; (b) behave like mobile (`CanExit = false`: no exit button, Esc at Initial does nothing).
   Option (a) matches the user's desktop client visually.
2. **Logo proxy z-order in the DOM** (§1.1). The logo must be drawn between the button layer and the side flashes, without inheriting `MainMenu`'s alpha (it fades separately).
3. **`buttonArea.Alpha * 150`** (§3.7) is always 150 in practice. `ButtonArea` itself is never faded (its inner container is). Port it as written.
4. ~~Amplitude calibration~~ **Resolved (2026-10-20):** BASS's FFT/level formulas were measured exactly (§7.3). Computing them from WebAudio
   time-domain data needs no gain factor.
5. **Linear-colour side flashes** (§8). Whether the framework blends vertex colours in linear space affects the exact on-screen hue. `#2298FF` α0.6 is the literal value.
6. **Tip length** for the display duration uses `LocalisableString.ToString()` of the formatted English tip (with keybind names substituted). Small differences only shift timing by 80 ms per character.
7. **Exit outro overlap**: the delayed (150 ms) `ButtonSystem` logo move to the centre (800 OutExpo) and `IntroScreen.LogoArriving` (350 OutQuint + rotate/fade) both act on the logo after
   `MainMenu` exits. `LogoExiting` clears transforms first. Port both in that order; the visual result is a logo drifting to the centre, rotating 20° and fading.
