# Spec: common UI controls, sounds and generic overlays

Source: osu!lazer master (2026-10-19) at `_reference/osu`, osu!framework at `_reference/osu-framework`, assets at
`_reference/osu-resources/osu.Game.Resources/`. The real client is 2026.1005.0-lazer.

Citation format:
- `osu.Game/...cs:N` is relative to `_reference/osu/`.
- `fw:osu.Framework/...cs:N` is relative to `_reference/osu-framework/`.
- `res:Samples/UI/x.wav` is relative to `_reference/osu-resources/osu.Game.Resources/`.

All sizes are in osu units (pre-`ScalingContainer`). Durations are in ms. Easing names are osu!framework `Easing` enum
names. "Port note" marks a decision the web port has to make. "UNVERIFIED" marks a value that is not in this repository.

---

## 0. Shared semantics you must reproduce exactly

### 0.1 Colour math

| Operation | Formula | Cite |
|---|---|---|
| `Color4.Lighten(a)` | `rgb * (1 + a)`, each channel clamped to 1, alpha kept. Done in **sRGB space**, not linear. | fw:osu.Framework/Extensions/Color4Extensions/Color4Extensions.cs:106,120-126 |
| `Color4.Darken(a)` | `rgb / (1 + a)`, alpha kept. `Darken(1)` halves the RGB. | fw:.../Color4Extensions.cs:113 |
| `Colour4.Lighten(a)` / `Darken(a)` | Same, but `scalar = max(1, 1 + a)`. | fw:osu.Framework/Graphics/Colour4.cs:124-138 |
| `Opacity(float a)` | Sets alpha to `a`. | fw:.../Color4Extensions.cs:50 |
| `Opacity(byte a)` | Sets alpha to `a / 255`. **C# picks this overload for integer literals.** So `Color4.Black.Opacity(40)` gives alpha 40/255 = 0.157, and `Opacity(50)` gives 0.196. | fw:.../Color4Extensions.cs:52 |
| Colour transforms (`FadeColour`, `FlashColour`, `TransformTo(BorderColour…)`) | Interpolated in **linear space**: `toLinear(start)`, lerp by `easing(t)`, then `toSRGB`. Alpha is lerped in the same pass. | fw:osu.Framework/Utils/Interpolation.cs:259-280 |
| `ColourUtils.SampleFromLinearGradient(stops, p)` | Below the first stop it returns the first colour. Otherwise it finds the first stop with `p < stop[i+1].pos` and interpolates linearly with `Interpolation.ValueAt`, which also works in linear space. Above the last stop it returns the last colour. | osu.Game/Utils/ColourUtils.cs:18-35 |
| `OverlayColourProvider.getColour(s, l)` | `Colour4.FromHSL(hue/360, s, l)` (standard HSL). | osu.Game/Overlays/OverlayColourProvider.cs:70; fw:osu.Framework/Graphics/Colour4.cs:457 |
| `OsuColour.ForegroundTextColourFor(bg)` | `Y = 0.299R + 0.587G + 0.114B`. Returns `Gray(0.2)` if `Y > 0.5`, else `Gray(0.9)`. | osu.Game/Graphics/OsuColour.cs:297-303 |

### 0.2 Transform helpers used everywhere

```ts
// fw:osu.Framework/Graphics/TransformableExtensions.cs:528-531, 573-579
fadeInFromZero(d, e)  = fadeTo(0).fadeIn(d, e)          // alpha snaps to 0, then fades in
fadeOutFromOne(d, e)  = fadeTo(1).fadeOut(d, e)         // alpha snaps to 1, then fades out
flashColour(c, d, e)  = { end = lastColourTransform?.endValue ?? colour; fadeColour(c /*instant*/).fadeColour(end, d, e) }
```

`Interpolation.DampContinuously(cur, target, halfTime, dt) = lerp(cur, target, 1 - 0.5^(dt/halfTime))`
(fw:osu.Framework/Utils/Interpolation.cs:27-51). Several components use it every frame.

### 0.3 Sample playback

- `SamplePlaybackHelper.PlayWithRandomPitch(sample, v)`: `frequency = rand(1 - v, 1 + v)`, then play
  (osu.Game/Audio/SamplePlaybackHelper.cs:17-27). Port: `AudioBufferSourceNode.playbackRate = frequency`. Pitch and
  speed change together, like BASS frequency.
- All UI samples are at `res:Samples/UI/<name>.wav`. Every UI sample is `.wav`. Keyboard samples are a mix of
  `.mp3` and `.wav` (§5.1).
- `OsuGameBase.SAMPLE_DEBOUNCE_TIME = 20` (osu.Game/OsuGameBase.cs:100).
- `OsuGameBase.SFX_STEREO_STRENGTH = 0.6` (osu.Game/OsuGameBase.cs:95). The notification overlay uses it as the
  pop-in/out balance, so its sound pans right by 0.6.

### 0.4 Fonts and text defaults

- `OsuSpriteText` defaults: `Font = OsuFont.Default` (Torus, size 16, weight Medium, which maps to **Regular** because
  Torus has no Medium) and `Shadow = true` (osu.Game/Graphics/Sprites/OsuSpriteText.cs:19-20;
  osu.Game/Graphics/OsuFont.cs:16,62,134-141).
- SpriteText shadow (framework default): colour `rgba(0,0,0,0.2)`, offset `(0, 0.06 × fontSize)`
  (fw:osu.Framework/Graphics/Sprites/SpriteText.cs:191,210,506).
- A plain framework `SpriteText` or `TextFlowContainer` (not the Osu* version) has **no shadow**. The tooltip text is
  one of these.
- `OsuFont.Style`: Title = TorusAlternate 32 Regular, Subtitle = Torus 28 Regular, Heading1 = Torus 22 Bold,
  Heading2 = Torus 18 SemiBold, Body = Torus 16 Regular, Caption1 = Torus 14 Regular, Caption2 = Torus 12 Regular
  (osu.Game/Graphics/OsuFont.cs:24-56). `OsuFont.Numeric` = Venera Bold (:67).
- Font files are BMFont `.bin` + `_0.png` pages at `res:Fonts/Torus/Torus-{Light,Regular,SemiBold,Bold}`,
  `res:Fonts/Torus-Alternate/...` and `res:Fonts/Venera/Venera-{Light,Bold,Black}`.
- There is no Torus italic. Code that asks for `italics: true` (the `OsuTextBox` placeholder and `DrawableDate`) falls
  back. UNVERIFIED how the framework resolves the missing italic glyphs. Port note: render upright Torus Regular.
- `FontAwesome.*` icons come from the framework's bundled Font Awesome 5 (Solid/Regular/Brands).
- `OsuIcon.*` glyphs are **textures**: `res:Textures/Icons/<Description>.png`
  (osu.Game/Graphics/OsuIcon.cs:19,208,743-747). Examples: `OsuIcon.LeftCircle` is `Icons/LeftCircle.png`,
  `OsuIcon.RulesetOsu` is `Icons/RulesetOsu.png`, `OsuIcon.Notification` is `Icons/notification.png`.

### 0.5 Shear

`OsuGame.SHEAR = (0.2, 0)` (osu.Game/OsuGame.cs:116). That is a horizontal shear of x' = x + 0.2·y, about 11.31°.
Sheared controls counter-shear their text/icon content with `-SHEAR`. `OsuGame.SCREEN_EDGE_MARGIN = 12`
(osu.Game/OsuGame.cs:121).

### 0.6 Colour reference

OsuColour constants used in this area (osu.Game/Graphics/OsuColour.cs:309-475):

| Name | Hex | Name | Hex |
|---|---|---|---|
| Yellow | `#ffcc22` | YellowDark | `#eeaa00` |
| Pink | `#ff66aa` | PinkLight | `#ff99cc` |
| PinkLighter | `#ffddee` | PinkDark | `#cc5288` |
| PinkDarker | `#bb1177` | Blue | `#66ccff` |
| BlueDark | `#44aadd` | BlueDarker | `#2299bb` |
| BlueLighter | `#ddffff` | Green | `#88b300` |
| GreenLight | `#b3d944` | GreenDark | `#668800` |
| Red | `#ed1121` | Red1 | `#ff6666` |
| Red3 | `#cc3333` | Pink3 (= DangerousButtonColour) | `#cc3378` |
| Blue3 | `#3399cc` | Gray1 | `#111111` |
| Gray3 | `#333333` | Gray4 | `#444444` |
| Gray8 | `#888888` | Gray9 | `#999999` |
| GrayF | `#ffffff` | GreySeaFoamLight | `#4d7365` |
| GreySeaFoamLighter | `#9ebab1` | GreySeaFoamDarker | `#1e2422` |
| ContextMenuGray | `#223034` | `OsuColour.Gray(x)` | `rgb(x,x,x)` |

`Color4.Gray` (System.Drawing) is `#808080`.

`OverlayColourProvider` shades for the schemes this area uses. Hue values come from
osu.Game/Overlays/OverlayColourScheme.cs:31-56 (Red 0, Orange 45, Lime 90, Green 125, Aquamarine 160, Blue 200,
Purple 255, Plum 320, Pink 333). The (saturation, lightness) pairs come from osu.Game/Overlays/OverlayColourProvider.cs:29-54.
Hex values below were computed with the framework's `FromHSL`.

| Name (s,l) | Purple 255 (Notifications) | Blue 200 (Footer, song select) | Aquamarine 160 | Pink 333 |
|---|---|---|---|---|
| Colour0 (1,.8) | #b399ff | #99ddff | #99ffdd | #ff99c7 |
| Colour1 (1,.7) | #8c66ff | #66ccff | #66ffcc | #ff66ab |
| Colour2 (.8,.6) | #7047eb | #47b4eb | #47ebb4 | #eb4791 |
| Colour3 (.6,.5) | #5933cc | #3399cc | #33cc99 | #cc3378 |
| Colour4 (.4,.3) | #3d2e6b | #2e576b | #2e6b57 | #6b2e49 |
| Highlight1 (1,.7) | #8c66ff | #66ccff | #66ffcc | #ff66ab |
| Content1 (.4,1) | #ffffff | #ffffff | #ffffff | #ffffff |
| Content2 (.4,.9) | #e0dbf0 | #dbe9f0 | #dbf0e9 | #f0dbe4 |
| Light1 (.4,.8) | #c2b8e0 | #b8d3e0 | #b8e0d3 | #e0b8ca |
| Light3 (.4,.7) | #a394d1 | #94bdd1 | #94d1bd | #d194af |
| Light4 (.4,.5) | #664cb2 | #4c90b2 | #4cb290 | #b24c7a |
| Dark1 (.2,.35) | #50476b | #475f6b | #476b5f | #6b4757 |
| Dark3 (.2,.25) | #39334d | #33444d | #334d44 | #4d333e |
| Dark4 (.2,.2) | #2e293d | #29363d | #293d36 | #3d2932 |
| Foreground1 (.1,.6) | #948fa3 | #8f9ca3 | #8fa39c | #a38f98 |
| Background1 (.1,.4) | #615c70 | #5c6970 | #5c7069 | #705c65 |
| Background2 (.1,.3) | #494554 | #454f54 | #45544f | #54454c |
| Background3 (.1,.25) | #3d3946 | #394246 | #394642 | #46393f |
| Background4 (.1,.2) | #302e38 | #2e3538 | #2e3835 | #382e32 |
| Background5 (.1,.15) | #24222a | #22282a | #222a28 | #2a2226 |
| Background6 (.1,.1) | #18171c | #171a1c | #171c1a | #1c1719 |

Many controls read an *optional* `OverlayColourProvider` from DI. Each one documents its fallback for when no
provider is cached; the fallbacks are listed with each control.

---

## 1. Sounds: HoverSampleSet, HoverSounds, HoverClickSounds

`HoverSampleSet` maps to a resource prefix (osu.Game/Graphics/UserInterface/HoverSampleSet.cs:9-63):
`Default→"default"`, `Button→"button"`, `ButtonSidebar→"button-sidebar"`, `TabSelect→"tabselect"`,
`DialogCancel→"dialog-cancel"`, `DialogOk→"dialog-ok"`, `MenuOpen→"menu-open"`.

| Component | Behaviour | Cite |
|---|---|---|
| `HoverSounds(set)` | Loads `UI/{set}-hover`, falling back to `UI/default-hover`. Plays with random pitch ±0.02 when `Enabled`. | osu.Game/Graphics/UserInterface/HoverSounds.cs:36-46 |
| `HoverClickSounds(set, buttons=[Left])` | Also loads `UI/{set}-select` (fallback `UI/default-select`) and `UI/{set}-select-disabled` (fallback `UI/default-select-disabled`). On `OnClick` with a listed button it plays select (or select-disabled when `Enabled` is false) with pitch ±0.01. It does **not** consume the click. | osu.Game/Graphics/UserInterface/HoverClickSounds.cs:33-58 |
| `HoverSampleDebounceComponent` | Hover input is the parent's area (`ReceivePositionalInputAt` → parent). On hover it skips if any mouse button is pressed. It plays only if `now - lastHoverSoundPlaybackTime >= 20`. That timestamp is a **single global** (`SessionStatics.LastHoverSoundPlaybackTime`) shared by all hover sounds and the OSD toast (§17). `OnHover` returns false, so it never blocks. | osu.Game/Graphics/UserInterface/HoverSampleDebounceComponent.cs:22-45 |

Resolved files (res:Samples/UI/):

| Set | hover | select | select-disabled |
|---|---|---|---|
| Default | default-hover.wav | default-select.wav | default-select-disabled.wav |
| Button | button-hover.wav | button-select.wav | default-select-disabled.wav (fallback) |
| ButtonSidebar | button-sidebar-hover.wav | button-sidebar-select.wav | fallback |
| TabSelect | **default-hover.wav** (no tabselect-hover file) | tabselect-select.wav | fallback |
| DialogOk | default-hover.wav (fallback) | dialog-ok-select.wav | fallback |
| DialogCancel | default-hover.wav (fallback) | dialog-cancel-select.wav | fallback |
| MenuOpen | menu-open.wav (exists as `menu-open-hover`? **no**: hover falls back to default-hover.wav) | menu-open-select.wav | fallback |

(`menu-open.wav` exists but is the OsuMenu open sound, not a hover sample. The hover lookup is `UI/menu-open-hover`,
which does not exist.)

```ts
// HoverSampleDebounceComponent.onHover
onHover(e) {
  if (e.anyButtonPressed) return false;
  const last = statics.lastHoverSoundPlaybackTime;           // shared, nullable
  if (last == null || time.current - last >= 20) { playHoverSample(); statics.lastHoverSoundPlaybackTime = time.current; }
  return false;
}
```

---

## 2. Clickable bases

### 2.1 OsuClickableContainer (osu.Game/Graphics/Containers/OsuClickableContainer.cs)
- `ClickableContainer` + `IHasTooltip`. Constructor sample set defaults to `HoverSampleSet.Default` (:33).
- At load it adds `[HoverClickSounds(set) bound to Enabled, content]` as internal children (:31,57-61). Content is
  `RelativeSizeAxes.Both`. If the container auto-sizes, content gets `RelativeSizeAxes = Both & ~AutoSizeAxes` and the
  same `AutoSizeAxes` (:51-55).
- Hit test = own rect **AND** `Content` rect, so corner masking on content is respected (:23-27).
- `TriggerClickWithSound()` = `TriggerClick()` + play click sample (:38-44).

### 2.2 OsuHoverContainer (osu.Game/Graphics/Containers/OsuHoverContainer.cs)
- `FADE_DURATION = 500` (:16). Fallbacks: hover `colours.Yellow`, idle `White` (:72-73).
- At load-complete it snaps targets to the idle colour (:79). Hover fades them to `HoverColour` over 500 with
  OutQuint; hover-lost fades back to idle over 500 with OutQuint (:82-84).
- Re-entrancy: tracks `isHovered`. If disabled, hover is recorded but no fade happens. Toggling `Enabled` while
  hovered fades in or out (:29-38,43-67).

### 2.3 OsuAnimatedButton (osu.Game/Graphics/UserInterface/OsuAnimatedButton.cs)
- Sample set default `Button` (:51).
- Inner content: centred, `RelativeSizeAxes.Both`, `CornerRadius 10`, `CornerExponent 2.5`, masked, edge shadow
  `rgba(0,0,0,0.04)` radius 5 (:54-78).
- Hover box: additive white α0.1 (`hoverColour`), initial Alpha 0 (:26,70-76).
- `FlashColour = White α0.3` (:24). `ScaleOnMouseDown = 0.75` (:28).
- Enabled → content colour White; disabled → `Gray9 #999999` over 200 with OutQuint, finished at load (:95-99).

```ts
onHover()     { hover.fadeIn(500, OutQuint) }
onHoverLost() { hover.fadeOut(500, OutQuint) }
onClick()     { if (!isHovered) hover.fadeOutFromOne(1600); hover.flashColour(white(0.3), 800, OutQuint) }
onMouseDown() { content.scaleTo(0.75, 2000, OutQuint) }   // very slow squeeze, interrupted by mouse up
onMouseUp()   { content.scaleTo(1, 1000, OutElastic) }
```

### 2.4 IconButton (osu.Game/Graphics/UserInterface/IconButton.cs)
- Extends OsuAnimatedButton. `DEFAULT_BUTTON_SIZE = 30` (size 30×30). Icon: centred `SpriteIcon` 18×18 (:14,64-71).
- `IconColour` defaults to White, `IconHoverColour` defaults to `IconColour`. Hover fades the icon colour over 500 with
  OutQuint, and back on hover lost (:21-40,74-84).

### 2.5 GrayButton (osu.Game/Graphics/UserInterface/GrayButton.cs)
- OsuAnimatedButton with a background Box `Gray4 #444444` (depth max) and a centred icon 13×13 (:34-46).

---

## 3. Buttons

### 3.1 OsuButton (osu.Game/Graphics/UserInterface/OsuButton.cs)
Layout (:76-120):
- `Height = 40`. Width is set by the caller.
- Content container: centred, `RelativeSizeAxes.Both`, `Masking`, `CornerRadius = 5`. Children, back to front:
  1. `Background` Box (depth +max).
  2. `SpriteText`, depth -1, centred, `OsuFont.GetFont(weight: Bold)` = Torus Bold 16 (:179-185).
  3. `Hover` Box: white, additive, Alpha 0, depth -max.
  4. `flashLayer`: white α0.5, additive, Alpha 0.
- `HoverClickSounds(Button)` is added when a sample set is given. The default set is `Button` (:76,118-119).
- Default background `colours.BlueDark #44aadd` (:125). A custom `BackgroundColour` fades the background with
  duration 0 (:35-43).
- The whole button `Colour` is White when enabled and `#808080` when disabled, fading over 200 with OutQuint (:132-136).

```ts
onClick()     { if (enabled) flashLayer.fadeOutFromOne(500, OutQuint) }
onHover()     { if (enabled) hover.fadeTo(0.2, 40, OutQuint).then().fadeTo(HoverLayerFinalAlpha /*0.1*/, 800, OutQuint) }
onHoverLost() { hover.fadeOut(800, OutQuint) }
onMouseDown() { content.scaleTo(0.9, 4000, OutQuint) }
onMouseUp()   { content.scaleTo(1, 1000, OutElastic) }
```

### 3.2 RoundedButton (osu.Game/Graphics/UserInterfaceV2/RoundedButton.cs)
- OsuButton with `HoverLayerFinalAlpha = 0`, so the hover box only does the 40 ms flash to 0.2 and back to 0 over
  800 (:25).
- Default background is `overlayColourProvider?.Colour3 ?? colours.Blue3 #3399cc` (:44).
  `triangleGradientSecondColour = background.Lighten(0.2)` (:35,45).
- At load-complete: `Content.CornerRadius = 5`, `CornerExponent = 2.5` (squircle). Adds `TrianglesV2 { Thickness 0.02,
  SpawnRatio 0.6, RelativeSizeAxes.Both, Depth max }` coloured
  `GradientVertical(top: lighten(bg,0.2), bottom: bg)` (:52-73). See the backgrounds spec for TrianglesV2.
- Hover: `Background.FadeColour(lighten(bg,0.2), 300, OutQuint)`. Hover lost: fade back to bg over 300 with OutQuint
  (:76-88).
- `DangerousRoundedButton` sets `BackgroundColour = colours.DangerousButtonColour` (Pink3 `#cc3378`)
  (osu.Game/Graphics/UserInterface/DangerousRoundedButton.cs:14).

### 3.3 ShearedButton (osu.Game/Graphics/UserInterface/ShearedButton.cs)
Constants (:20-22): `DEFAULT_HEIGHT 50`, `CORNER_RADIUS 7`, `BORDER_THICKNESS 2`. Width is set per use.
- The whole drawable is sheared by `SHEAR` (:89). Content is centred, `CornerRadius 7`, masked (:91-93).
- Children (:95-127):
  - `backgroundLayer`: `RelativeSizeAxes.Both`, CornerRadius 7, masked, `BorderThickness 2`, containing the
    `background` Box.
  - `ButtonContent`: centred, autosize, counter-sheared, containing the text `TorusAlternate 17`, margin horizontal 15.
    `TextSize` setter sets the TorusAlternate size.
  - `flashLayer`: white α0.9, additive, Alpha 0.
- Samples: `HoverClickSounds(Default)` = default-hover / default-select (:130).
- Colour defaults need an `OverlayColourProvider`: dark = `Background3`, light = `Background1`, text = `Content1`
  (:176-178).

```ts
// ShearedButton.updateState (scheduled AddOnce on hover/hoverlost/enabled/colour setters) :174-198
let dark = darkerColour ?? cp.Background3, light = lighterColour ?? cp.Background1, text = textColour ?? cp.Content1;
if (!enabled) { dark = darken(dark, 1); light = darken(light, 1); }
else if (isHovered) { dark = lighten(dark, 0.2); light = lighten(light, 0.2); }
background.fadeColour(dark, 150, OutQuint);
backgroundLayer.transformTo('BorderColour', gradientVertical(dark, light), 150, OutQuint);   // border: top dark, bottom light
if (!enabled) text = withAlpha(text, 0.6);
buttonContent.fadeColour(text, 150, OutQuint);
// at LoadComplete: updateState(); finishTransforms(true)  (no animation on first show)

onClick()     { if (enabled) flashLayer.fadeOutFromOne(800, OutQuint) }
onMouseDown() { content.scaleTo(0.9, 2000, OutQuint); return true }
onMouseUp()   { content.scaleTo(1, 1000, OutElastic) }
```

Footer appear/disappear (IScreenFooterButton, :202-250). These animate `Content` (the masked inner container), not the
button itself:

```ts
appearFromLeft(delay)    { enabled = action != null; content.finishTransforms();
                           content.moveToX(-300).fadeOut().delay(delay).moveToX(0, 240, OutCubic).fadeIn(240, OutCubic) }
appearFromBottom(delay)  { enabled = action != null; content.finishTransforms();
                           content.moveToY(100).fadeOut().delay(delay).moveToY(0, 240, OutCubic).fadeIn(240, OutCubic) }
disappearToRight(delay, expire)  { enabled = false; content.finishTransforms();
                           content.delay(delay).fadeOut(240, InOutCubic).moveToX(300, 360, InOutCubic);
                           if (expire) this.delay(content.latestTransformEndTime - now).expire() }
disappearToBottom(delay, expire) { enabled = false; content.finishTransforms();
                           content.delay(delay).fadeOut(240, InOutCubic).moveToY(100, 240, InOutCubic); if (expire) ... }
```

Interruption: every call starts with `Content.FinishTransforms()`, which snaps any running sequence to its end
before the new sequence starts.

### 3.4 ShearedToggleButton (osu.Game/Graphics/UserInterface/ShearedToggleButton.cs)
- `Active: BindableBool`. `Action = Active.Toggle` unless Active is disabled (:38).
- Uses `HoverSounds` only, so there is **no click sample** (:34). On an Active change it plays `UI/check-on`
  (res:Samples/UI/check-on.wav) when true, else `UI/check-off` (:30-31,56-65).
- Colours (:49-54): active → dark `Highlight1`, light `Colour0`, text `Background6`. Inactive → `Background3` /
  `Background1` / `Content1`. These then go through ShearedButton.updateState (150 ms fades).

### 3.5 DialogButton (osu.Game/Graphics/UserInterface/DialogButton.cs)
The wide sheared bar used in popup dialogs (and, in other areas, the pause menu).
- `RelativeSizeAxes.X`. Height is set by the subclass (PopupDialogButton = 50). Constants: `idle_width 0.8`,
  `hover_width 0.9`, `hover_duration 400`, `click_duration 200`. Text hover spacing is `(1.4, 0)` (:25-29,85).
- Children (:92-190):
  - `glowContainer`: centred, `RelativeSizeAxes.Both`, sheared `SHEAR`, Width 0.8, Alpha 0. Three boxes:
    `leftGlow` (TopLeft, width 0.125, horizontal gradient transparent→col), `centerGlow` (centre, width 0.75, col),
    `rightGlow` (TopRight, width 0.125, col→transparent) (:288-295).
  - A masked full-size container holding `ColourContainer`: centred, `RelativeSizeAxes.Both`, Width 0.8,
    CornerRadius 5, masked, edge shadow `rgba(0,0,0,0.05)` radius 6, sheared `SHEAR`, `Colour = ButtonColour`.
    Inside: a white Box (EdgeSmoothness (2,0)) and a masked container with `TrianglesV2 { Alpha 0.1, Velocity 0.7,
    additive, Shear -SHEAR, ClampAxes Y }`.
  - `spriteText`: centred, `Torus Bold 28` (PopupDialogButton sets 18), `ShadowColour rgba(0,0,0,0.1)`, White.
- Disabled: `ColourContainer.Colour = darken(buttonColour, 0.8)` (:204).
- Samples: `HoverClickSounds(sampleSet)`. The default set is `Button`.

```ts
// :210-286
onClick() {
  if (enabled) {
    const flash = new Box({ rel: Both, colour: buttonColour, additive: true, alpha: 0.05 });
    colourContainer.add(flash); flash.fadeOutFromOne(100).expire();
    clickAnimating = true;
    colourContainer.resizeWidthTo(colourContainer.width * 1.05, 100, OutQuint)
      .onComplete(() => { clickAnimating = false; stateChanged(state); });   // re-applies the hover/idle state
  }
  return base.onClick();
}
onMouseDown() { colourContainer.resizeWidthTo(0.9 * 0.98, 800, OutQuad) }
onMouseUp()   { if (state == Selected) colourContainer.resizeWidthTo(0.9, 200, In) }
onHover()     { state = Selected }        onHoverLost() { state = NotSelected }
selectionChanged(s) {
  if (clickAnimating) return;
  if (s == Selected) {
    spriteText.transformSpacingTo((1.4,0), 400, OutQuint); spriteText.scaleTo(1.02, 400, OutQuint);
    colourContainer.resizeWidthTo(0.9, 400, OutQuint);
    glowContainer.resizeWidthTo(0.9 * 1.08, 400, OutQuint); glowContainer.fadeIn(400, OutQuint);
  } else {
    colourContainer.resizeWidthTo(0.8, 200, OutQuint); glowContainer.resizeWidthTo(0.8 * 1.08, 400, OutQuint);
    spriteText.transformSpacingTo((0,0), 200, OutQuint); spriteText.scaleTo(1, 200, OutQuint);
    glowContainer.fadeOut(200, OutQuint);
  }
}
```

### 3.6 TwoLayerButton (osu.Game/Graphics/UserInterface/TwoLayerButton.cs) and legacy BackButton
- Constants (:29-38): `transform_time 600`, `pulse_length 250` (unused), `shear_width 5`, `HEIGHT 50`,
  shear `(5/50 = 0.1, 0)`, `SIZE_EXTENDED (140,50)`, `SIZE_RETRACTED (100,50)`. Initial size is retracted.
- Structure (:81-157):
  - `c2` (icon side): width 0.4. Masked inner box `IconLayer` (EdgeSmoothness (2,0)), `MaskingSmoothness 2`, shadow
    `rgba(0,0,0,0.2)` offset (2,0) radius 2. `BouncingIcon` centred, counter-sheared, icon 25×25.
  - `c1` (text side): width 0.6, TopRight. Masked `TextLayer` box with the same shadow. Text centred, counter-sheared,
    OsuSpriteText default font (Torus Regular 16).
- With an `Origin` containing x2 (right-aligned) the layers swap sides and depth, and
  `X = 100 × 0.1 × 0.5 = 5` (:55-73).
- Hit test = `IconLayer ∪ TextLayer` (:170).
- Sample set default `Default`.

```ts
onHover()     { this.resizeTo((140,50), 600, OutElastic); iconLayer.fadeColour(hoverColour, 300, OutQuint); bouncingIcon.scaleTo(1.1, 600, OutElastic); return true }
onHoverLost() { this.resizeTo((100,50), 600, Out); iconLayer.fadeColour(textLayer.colour, 600, Out); bouncingIcon.scaleTo(1, 600, Out) }
onMouseDown() { return true }
onClick()     { const f = new Box({ rel: Both, colour: white(0.5) }); add(f); f.alpha = 1; f.fadeOut(500, OutQuint); f.expire(); return base }
// BouncingIcon (BeatSyncedContainer, EarlyActivationMilliseconds = 60) :209-250
onNewBeat(i, tp, ep, amps) {
  const adj = Math.min(1, 0.4 + amps.maximum);
  if (i < 0) return;
  icon.scaleTo(1 - 0.1 * adj, 60, Out).then().scaleTo(1, tp.beatLength * 2, OutQuint);
}
```

Legacy `BackButton` (osu.Game/Graphics/UserInterface/BackButton.cs):
- A `VisibilityContainer` of size (140,50) holding a TwoLayerButton with text `"back"`
  (`CommonStrings.Back.ToLower()`) and icon `OsuIcon.LeftCircle` (res:Textures/Icons/LeftCircle.png) (:23-32).
- Colours: background `Pink #ff66aa`, hover `PinkDark #cc5288` (:46-47).
- `PopIn`: `button.MoveToX(0, 400, OutQuint)` and `FadeIn(150, OutQuint)`. `PopOut`: `MoveToX(-70, 400, OutQuint)`
  and `FadeOut(400, OutQuint)` (:50-60).
- Global Back is routed through `ScreenFooter.BackReceptor` → `button.TriggerClick()` (:34-40).

### 3.7 ShowMoreButton, LoadingButton, ExternalLinkButton (online UI, stub visually)
- `LoadingButton`: OsuHoverContainer(Button). It has a 12×12 LoadingSpinner at depth -1. A click sets
  `IsLoading = true`, which disables the button and shows the spinner (osu.Game/Graphics/UserInterface/LoadingButton.cs:44-50,72-86).
- `ShowMoreButton`: a pill (CircularContainer). Idle `Background2`, hover `Background1` (OsuHoverContainer fades over
  500 OutQuint). Text "SHOW MORE" Torus SemiBold 12 between two 7.5 ChevronDown icons coloured `Foreground1`, spacing
  10, margin h20 v5. While loading, the text flow fades out over 200 OutQuint (osu.Game/Graphics/UserInterface/ShowMoreButton.cs:24-116).
- `ExternalLinkButton`: 12×12 `ExternalLinkAlt` icon. Hover fades to Yellow over 500 OutQuint. Tooltip
  "View in browser" (osu.Game/Graphics/UserInterface/ExternalLinkButton.cs:30-70).

---

## 4. (reserved: see §5 text input)

---
