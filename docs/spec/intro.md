# Startup + intro sequences (spec)

Area owner: startup path `OsuGame → Loader → IntroScreen (Triangles | Circles | Welcome | Christmas) → MainMenu`, plus the exit ("seeya") path back through the intro.

All citations are relative to `/Users/anvay/OSUWebProj/_reference/`. `osu/` = osu!lazer game, `osu-framework/` = framework, `osu-resources/` = assets (`osu-resources/osu.Game.Resources/…`).

Units: osu units (the ScalingContainer target space, see `docs/spec/framework.md`). Times in ms. Easing names are osu!framework `Easing` enum members.

---

## 0. TL;DR fidelity checklist

1. **Default intro on a fresh install is `Triangles`.** `SetDefault(OsuSetting.IntroSequence, IntroSequence.Triangles)` (`osu/osu.Game/Configuration/OsuConfigManager.cs:199`). The user's real-client screenshot `docs/reference/real/01-mainmenu-initial.jpg` shows "triangles / cYsmix" in the song ticker, which confirms it. `MenuVoice` and `MenuMusic` both default to `true` (`OsuConfigManager.cs:108-109`), so the **themed** path is the default: the intro beatmap's own track drives everything.
2. **The Triangles timeline runs on track time, not wall-clock time.** `TrianglesIntroSequence.Clock = new InterpolatingFramedClock(new DecouplingFramedClock(Track))` (`osu/osu.Game/Screens/Menu/IntroTriangles.cs:60-66`). Every constant (200, 400, 700, 900, 1060, 1450, 1650, 1850, 2080, 3000) is a position in `triangles.osz/audio.mp3`, because the vocals "welcome to osu!" are baked into that track. The flash and logo reveal at 3000 land 11.74 ms before the first timing point (3011.74), which is the first beat the logo pulses on.
3. **The logo handover state is fixed:** Origin=Centre, Anchor=TopLeft, RelativePositionAxes=Both, Position=(0.5,0.5), Scale=1, Alpha=1, Colour=White. Triangles and Ripple are turned **off** during the intro and back **on** (300 ms OutQuint fades) only when MainMenu's `LogoArriving` runs. So at the moment of the Triangles flash the logo shows as **a white ring with "osu!" text and no pink fill**, and the pink gradient and triangles fade in over 300 ms (§6).
4. **The track keeps playing into the menu.** The themed track is started with `Restart()` from 0 at full volume, and nothing stops it. Triangles and Circles are non-looping: when they finish, `MusicController` moves to the next track. Welcome sets `Looping = true` and loops its 48 s track forever (§7).
5. **The background is black during the intro.** `BackgroundScreenDefault { Colour = Black }` (`IntroScreen.cs:95-98`) only becomes visible through `FadeColour(White, d)`: Triangles uses d=0 at 3000 (under a 1000 ms additive white full-window flash), Welcome uses d=200 at 2142, and Circles uses d=200 when the intro is suspended (MainMenu push at 2900).

---

## 1. Assets

### 1.1 Archives (`osu-resources/osu.Game.Resources/Tracks/`)

| File | Contents (`unzip -l`) | Used by |
|---|---|---|
| `triangles.osz` (3 545 742 B) | `audio.mp3` (3 549 639 B, ≈126.07 s), `cYsmix - triangles (peppy) [peppy].osu` (988 B) | `IntroTriangles` (default) |
| `circles.osz` (2 919 959 B) | `circles.ogg` (2 927 664 B, ≈139.57 s), `nekodex - circles! (peppy).osu` (1 133 B) | `IntroCircles` |
| `welcome.osz` (1 249 234 B) | `welcome.ogg` (1 249 628 B, ≈48.00 s), `nekodex - welcome to osu! (peppy).osu` (958 B) | `IntroWelcome` |
| `christmas2024.osz` (2 968 837 B) | `audio.mp3` (2 863 470 B, ≈109.22 s), `bg.jpg` (104 130 B), `nekodex - circle the halls (pishifat) [laser show].osu` (50 814 B) | `IntroChristmas` (seasonal, disabled) |
| `rankedplay_bgm.ogg` | – | not intro (multiplayer) |

The durations were measured with `afinfo`.

### 1.2 `.osu` metadata and timing points

Timing-point columns are `time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects`. `effects & 1` means kiai.

**triangles** (`cYsmix - triangles (peppy) [peppy].osu`, format v14)
- Metadata: Title `triangles`, Artist `cYsmix`, Creator `peppy`, Version `peppy`. AudioFilename `audio.mp3`, PreviewTime `-1`, SampleSet Soft, BeatDivisor 3.
- Timing: `3011.74006797141,375,4,2,0,100,1,0` gives 160 BPM (375 ms/beat), 4/4, first beat at 3011.74.
- Kiai: on at 87011, off at 97511, on at 99011, off at 111011.
- One HitObject at 3011 (irrelevant).

**circles** (`nekodex - circles! (peppy).osu`, v14)
- Title `circles!`, Artist `nekodex`, Creator `peppy`, Version empty. AudioFilename `circles.ogg`, **PreviewTime 45199**.
- Timing: `2558.8215380251,326.086956521739,4,…,1,0` gives 184 BPM, first beat at 2558.82.
- Kiai on/off: 12993 on, 23102 off, 23428 on, 32558 off, 33863 on, 53428 off, 96471 on, 116037 off, 117341 on, 136906 off.

**welcome** (`nekodex - welcome to osu! (peppy).osu`, v13)
- Title `welcome to osu!`, Artist `nekodex`, Creator `peppy`. AudioFilename `welcome.ogg`, PreviewTime `-1`.
- Timing: `-40,500,4,…,1,0` gives 120 BPM with beat 0 at −40.
- Kiai: on at 5, off at 605. The track opens with a kiai flash on the logo.
- `[Events]` contains a legacy "Background Colour Transformations" line `3,100,163,162,255`, which lazer ignores.

**christmas2024** (`… [laser show].osu`, v128)
- Title `circle the halls`, Artist `nekodex`, Creator `pishifat`. BG `bg.jpg`.
- Timing: `5923,348.837…` gives 172 BPM, followed by many SV/kiai points (50574–84062). Seasonal only.

### 1.3 Samples (`osu-resources/osu.Game.Resources/Samples/`)

| Lookup name | File | Duration | Used by |
|---|---|---|---|
| `Intro/welcome` | `Samples/Intro/welcome.mp3` | 6.37 s | Circles voice (always when MenuVoice); Triangles voice only when **not** themed (`IntroCircles.cs:37`, `IntroTriangles.cs:49`) |
| `Intro/seeya` | `Samples/Intro/seeya.mp3` | 2.77 s | exit voice for Circles/Triangles (`IntroScreen.cs:69`) |
| `Intro/Welcome/welcome` | `Samples/Intro/Welcome/welcome.mp3` | 6.05 s | Welcome voice (`IntroWelcome.cs:47-49`) |
| `Intro/Welcome/welcome_piano` | `Samples/Intro/Welcome/welcome_piano.mp3` | **2.142 s** (= `delay_step_two`) | Welcome piano reverb, always played; also an amplitude source for the welcome visualiser (`IntroWelcome.cs:52,77-79`) |
| `Intro/Welcome/seeya` | `Samples/Intro/Welcome/seeya.mp3` | 3.03 s | exit voice for Welcome and Christmas (`IntroWelcome.cs:34`, `osu/osu.Game/Seasonal/IntroChristmas.cs:36`) |
| `Menu/osu-logo-select`, `Menu/osu-logo-heartbeat`, `Menu/osu-logo-downbeat` | `Samples/Menu/*.wav` | – | loaded by OsuLogo (`osu/osu.Game/Screens/Menu/OsuLogo.cs:280-283`); heartbeat only plays while hovered with an Action, so it never plays during the intro |
| `UI/screen-back` | – | – | OsuScreen exit sound; suppressed for intros (`IntroScreen.cs:71` `PlayExitSound => false`) |

Supporter users get `SkinnableSound` variants (`IntroScreen.cs:119-122`, `IntroWelcome.cs:46-49`). The port is offline and never a supporter, so it always uses plain samples.

### 1.4 Textures (`osu-resources/osu.Game.Resources/Textures/`)

The default `TextureStore` uses `scaleAdjust = 2` (`osu-framework/osu.Framework/Graphics/Textures/TextureStore.cs:51`), so **display size = pixel size / 2** unless the drawable is sized explicitly.

| Path | px | Display size | Used by |
|---|---|---|---|
| `Intro/Triangles/logo-highlight.png` | 1295×1295 RGB | drawn at 960×960 (LazerLogo size) | Triangles + Christmas LazerLogo highlight layer, colour White |
| `Intro/Triangles/logo-background.png` | 1295×1295 RGB | 960×960 | LazerLogo background layer, colour `OsuColour.Gray(0.6f)` = `#999999` |
| `Intro/Welcome/welcome_text.png` | 750×156 RGBA | 375×78 | Welcome "welcome" wordmark |
| `Intro/Welcome/menu-background.jpg` | 2732×1536 | fill | **the only menu background** whenever IntroSequence == Welcome (`osu/osu.Game/Screens/Backgrounds/BackgroundScreenDefault.cs:188-195`) |
| `Intro/Circles/menu-background-1..7.jpg` | 2732×1537 | – | **unused by current code** (no reference anywhere in `osu/osu.Game`). Do not ship them. |
| `Menu/logo.png` | 1024×1024 RGBA | 512×512 | OsuLogo sprite and ripple (`OsuLogo.cs:285-286`). A white ring plus "osu!" with a transparent interior; the pink comes from a separate Box. |
| `Menu/menu-background-1..8.jpg` | – | fill | default backgrounds (non-Welcome), random start index (`BackgroundScreenDefault.cs:66,194`) |
| `Icons/RulesetOsu.png`, `RulesetTaiko.png`, `RulesetCatch.png`, `RulesetMania.png` | – | constrained to 30×30 | Triangles ruleset flow (`OsuIcon` glyph textures, `osu/osu.Game/Graphics/OsuIcon.cs:22-25,745-746`) |

**LogoAnimation texture encoding** (`osu-resources/osu.Game.Resources/Shaders/sh_LogoAnimation.fs:21-28`):
- **R channel** holds the reveal threshold and **G channel** holds alpha. B is always 0 (verified by sampling).
- Output: `r < progress ? vec4(colour.rgb, colour.a * g) : vec4(0)`.
- Sampled R ranges: background 4..242 (median 39); highlight 5..216 (median 11).
- Port: use a WebGL quad with this fragment shader, or a Canvas2D `ImageData` pass that precomputes `thresh[i]=r/255`, `alpha[i]=g/255` and repaints whenever `progress` changes (920 ms only).

### 1.5 Fonts

- Text in all intros: `OsuFont.GetFont(weight: FontWeight.Light, size: 42)` gives **Torus Light 42** (default typeface Torus, `osu/osu.Game/Graphics/OsuFont.cs:90`; Light = 300 at `OsuFont.cs:180`). Asset: `osu-resources/osu.Game.Resources/Fonts/Torus/Torus-Light.bin` + `Torus-Light_0.png`.
- `OsuSpriteText` forces `Shadow = true` (`osu/osu.Game/Graphics/Sprites/OsuSpriteText.cs:19`). The shadow colour is `rgba(0,0,0,0.2)` and the offset is `(0, 0.06) × fontSize` = (0, 2.52) at size 42 (`osu-framework/osu.Framework/Graphics/Sprites/SpriteText.cs:191,210`).

---

## 2. Boot path and screen stack

### 2.1 OsuGame
- The logo is created hidden: `osuLogo = new OsuLogo { Alpha = 0 }` (`osu/osu.Game/OsuGame.cs:421-424`). When seasonal mode is on it is `OsuLogoChristmas` instead.
- Layer order inside `ScreenContainer` (a ScalingContainer, `OsuGame.cs:1115-1144`), bottom to top:
  1. `backReceptor`
  2. **`ScreenStack`**, which contains a ParallaxContainer → `BackgroundScreenStack` (`osu/osu.Game/Screens/OsuScreenStack.cs:28-32`)
  3. **`logoContainer`** (RelativeSizeAxes Both), so the logo sits above all screens
  4. `footerBasedOverlayContent` (Depth −1)
  5. PopoverContainer/footer (Depth −1)

  Overlays, toolbar and the `GameWideFlash` live outside this container, above it.
- After the logo loads: `osuLogo.SetupDefaultContainer(logoContainer)` adds the logo and a proxy, then `ScreenStack.Push(new Loader())` (`OsuGame.cs:1182-1188`).
- `ScreenChanged`: when the new screen is an IntroScreen, `introScreen = intro` is stored for the exit path (`OsuGame.cs:1805-1810`).

### 2.2 StartupScreen traits (`osu/osu.Game/Screens/StartupScreen.cs:13-19`)
Both Loader and the intros inherit:
- `AllowUserExit = false`
- `HideOverlaysOnEnter = true`
- `CursorVisible = false` (the cursor is hidden during the intro; `OsuGame.cs:1756`)
- `InitialOverlayActivationMode = Disabled` (no toolbar or overlays)

IntroScreen adds `AllowGlobalTrackControl => false` (`IntroScreen.cs:100`), which blocks music keys and the now-playing overlay.

**No input skips an intro.** IntroScreen has no click or key handlers. The only input handler is `ScrollAdjustsVolume`, so the wheel changes volume **without** Alt (`IntroScreen.cs:187`; `osu/osu.Game/Overlays/Volume/ScrollAdjustsVolume.cs:33-50`).

### 2.3 Loader (`osu/osu.Game/Screens/Loader.cs`)
- `ValidForResume = false` (`:28`).
- Intro choice (`:40-63`):
  - If `SeasonalUIConfig.ENABLED` (currently `false`, `osu/osu.Game/Seasonal/SeasonalUIConfig.cs:14`), use `IntroChristmas`.
  - If the setting is `Random`, pick `(IntroSequence)RNG.Next(0, 3)`: Circles=0, Welcome=1, Triangles=2 (`osu/osu.Game/Configuration/IntroSequence.cs:9-17`).
  - `Circles` → `IntroCircles`, `Welcome` → `IntroWelcome`, any other value → `IntroTriangles`.
- `OnEntering` (`:67-87`):
  - Starts async loads of a ShaderPrecompiler (GL-only, skip in the port) and of the intro screen.
  - Loads `LoadingSpinner(withBox: true, inverted: true)` at Anchor/Origin BottomRight with Margin 40, and calls `spinner.Show()` **only after 200 ms** (`Scheduler.AddDelayed(spinner.Show, 200)`).
- `checkIfLoaded` (`:89-106`) polls every frame. When the intro is Ready:
  - Cancel the pending spinner show.
  - If the spinner is visible: `spinner.Hide()`, then push the intro after `LoadingSpinner.TRANSITION_DURATION` = 500 ms.
  - Otherwise push immediately.
- Loader has no background (`CreateBackground` returns null). Its LogoArriving is the OsuScreen base (§6.1).

**LoadingSpinner (Loader variant)** (`osu/osu.Game/Graphics/UserInterface/LoadingSpinner.cs`):
- Size 60×60 (`:53`).
- `MainContents` is masked. Its CornerRadius is overwritten every frame to `DrawWidth/4` = 15 (`:164`).
  - Box: **White**, alpha 0.7 (inverted).
  - TrianglesV2: White, alpha 0.2, ScaleAdjust 0.4, Velocity 0.8, SpawnRatio 2.
  - SpriteIcon FontAwesome `CircleNotch`: **Black**, Scale 0.6, custom origin `DrawSize × 0.4963333` (`:160`).
- The icon spins continuously, 3150 ms per clockwise revolution (`:42,151`).
- `MainContents` also rotates +90° per beat over `beatLength`, InOutQuart. With no track the default timing point applies (1000 ms, `osu/osu.Game/Beatmaps/ControlPoints/TimingControlPoint.cs:60`). Beat lengths below 600 are doubled until ≥ 600 (`:219-235`).
- Starts hidden.
- PopIn: `MainContents.ScaleTo(1, 500, OutQuint)` and `FadeTo(0.01, 50).Then().FadeIn(500, OutQuint)`. If alpha < 0.5, the rotation resets first.
- PopOut: `MainContents.ScaleTo(0.6, 500, OutQuint)` and `FadeOut(250, OutQuint)` (`:174-196`).
- Port note: map Loader to "assets preloaded (fonts, intro textures/samples, intro track decoded)", showing the spinner only if that takes more than 200 ms.

### 2.4 Intro beatmap selection/import (`IntroScreen.cs:110-188`)
1. `beatmap = Beatmap.BeginLease(false)` (`:114`): the global beatmap is locked until `LoadMenu()` returns the lease (`:376`).
2. If `!MenuMusic` (default is true, so this is skipped): pick a random non-protected user set `usableBeatmapSets[RNG.Next(0, setCount - 1)]`. The upper bound is exclusive, so the last set can never be picked; port this literally. Use its first difficulty.
3. If nothing was picked, `loadThemedIntro()` queries a **Protected** set with `Hash == BeatmapHash` and checks that all of its files exist. If that fails (first run), import `Tracks/{BeatmapFile}`, mark it `Protected = true`, and retry. `UsingThemedIntro` is true exactly when the themed set was used.
   - Hashes (reference only; the port can use its own key):
     - Triangles `a1556d0801b3a6b175dda32ef546f0ec812b400499f575c44fccbe9c67f9b1e5` (`IntroTriangles.cs:29`)
     - Circles `3c8b1fcc9434dbb29e2fb613d3b9eada9d7bb6c125ceb32396c3b53437280c83` (`IntroCircles.cs:18`)
     - Welcome `64e00d7022195959bfa3109d09c2e2276c8f12f486b91fcf6175583e973b48f2` (`IntroWelcome.cs:26`)
     - Christmas `7e26183e72a496f672c3a21292e6b469fdecd084d31c259ea10a31df5b46cd77` (`IntroChristmas.cs:27`)
   - Only the archive of the **selected** intro is imported. A fresh install therefore has only `triangles.osz` imported, which becomes the only "song" in the music player until the user adds maps.
4. Protected sets are skipped by user-requested next/prev in the music controller. Automatic advancement on track completion includes them (`osu/osu.Game/Overlays/MusicController.cs:459-464,544-548`).
5. The Christmas set is excluded from all music navigation unless seasonal mode is on (`MusicController.cs:464`).
6. Offline port: ship `triangles.osz` (and optionally the others) as a built-in, protected, pre-imported set in IndexedDB on first boot.

### 2.5 Watchdog (`IntroScreen.cs:190-236`)
`OnEntering` schedules a check 8000 ms later. If `!DidLoadMenu` at that point, it calls `PrepareMenuLoad(); LoadMenu();` and posts a `SimpleErrorNotification` with the text:

> osu! doesn't seem to be able to play audio correctly.
>
> Please try changing your audio device to a working setting.

Source: `osu/osu.Game/Localisation/NotificationsStrings.cs:52-54`.

`PrepareMenuLoad` and `LoadMenu` are idempotent (`nextScreen != null` and `DidLoadMenu` guards, `:360-381`). Port this, because a blocked AudioContext produces exactly this situation.

---

## 3. Shared IntroScreen behaviour

### 3.1 Background
- `CreateBackground() => new BackgroundScreenDefault { Colour = Color4.Black }` (`IntroScreen.cs:95-98`).
- This is the first background on the stack, so `AnimateEntry = false` and it gets no slide or fade (`osu/osu.Game/Screens/BackgroundScreenStack.cs:31`).
- MainMenu creates another `BackgroundScreenDefault`. The stack compares by type, so the push is refused and **the intro's background instance is reused** by the menu (`BackgroundScreenStack.cs:33`).
- `BackgroundScreenDefault.LoadComplete`:
  - `currentDisplay = RNG.Next(0, 8)`, then `Next()`.
  - `Next` loads the new `Background` after a 500 ms delay. `displayNext` fades the old one out over 800 ms OutQuint and adds the new one with no fade-in (`BackgroundScreenDefault.cs:66,105-135`).
  - Texture: `Menu/menu-background-{(currentDisplay % 8) + 1}`, or `Intro/Welcome/menu-background` when the setting is Welcome (`:186-195`).
- `BackgroundScreen.Update`: `Scale = 1 + 50 / DrawSize.X * 2`, which leaves room for x-parallax (`osu/osu.Game/Screens/BackgroundScreen.cs:18,50`).
- `FadeInBackground(d)` (`IntroScreen.cs:288-292`) calls `ApplyToBackground(b => b.FadeColour(White, d))` and sets `backgroundFaded = true`. `ApplyToBackground` is `Schedule`d on the background (`BackgroundScreen.cs`, ApplyToBackground).
- `OnSuspending` (`IntroScreen.cs:294-301`): clears `initialBeatmap`; if the background was never faded, calls `FadeInBackground(200)`.

### 3.2 Base logo setup: `IntroScreen.LogoArriving` (`IntroScreen.cs:321-358`)
This runs after OsuScreen's base (§6.1).

```ts
// Ported from osu/osu.Game/Screens/Menu/IntroScreen.cs:321
logoArriving(logo, resuming) {
  super.logoArriving(logo, resuming);     // OsuScreen: Action=null, FadeOut(300,OutQuint), Origin=Centre, ChangeAnchor(TopLeft), RelPosAxes=Both, Triangles=true, Ripple=true
  logo.colour = WHITE;
  logo.triangles = false;                 // colourAndTriangles.FadeTo(0, 300, OutQuint)
  logo.ripple = false;                    // rippleContainer.FadeTo(0, 300, OutQuint)
  if (!resuming) {
    if (initialBeatmap) beatmapLease.value = initialBeatmap;   // MusicController swaps track (vol 0 → Delay 30 → 1 over 220)
    this.track = beatmapLease.value.track;
    musicController.currentTrack.finishTransforms();          // skip that 220ms fade: track at volume 1 immediately
    logo.moveTo({x:.5, y:.5});  logo.scaleTo(1);  logo.hide(); // hide() = FadeOut(0): supersedes the base FadeOut(300) (same start time, later id)
  } else { /* exit path, §8 */ }
}
```

`musicController.CurrentTrack.FinishTransforms()` exists because `changeTrack` creates the queued track at volume 0 and adds `Delay(DELAY_BEFORE_FADE=30).VolumeTo(1, 220)` (`MusicController.cs:41,519-532`).

### 3.3 `StartTrack()` (`IntroScreen.cs:303-319`)
```ts
startTrack() {
  const t = musicController.currentTrack;
  if (!usingThemedIntro) {               // only when MenuMusic=false and a user map was chosen
    initialBeatmap?.prepareTrackForPreview(false, -2600); // RestartPoint = clamp(preview - 2600); if preview<0 or >len → 0.4*len first
    t.volumeTo(0); t.restart(); t.volumeTo(1, 2600, 'InCubic');
  } else t.restart();                    // themed: from 0, volume already 1, Looping as set by the intro (default false)
}
```
`PrepareTrackForPreview` is at `osu/osu.Game/Beatmaps/WorkingBeatmap.cs:123-140`.

### 3.4 Menu loading
- `PrepareMenuLoad()` creates `new MainMenu()` and calls `LoadComponentAsync` on it.
- `LoadMenu()` returns the beatmap lease, sets `DidLoadMenu = true`, then `this.Push(mainMenu)` (`IntroScreen.cs:360-381`).
- On push the framework calls `OnSuspending` on the intro screen and then `Expire()`s it. The screen drawable disappears once its latest transform ends (`osu-framework/osu.Framework/Screens/ScreenStack.cs:175-180`). The logo is not part of the screen and persists.

---

## 4. Framework semantics these timelines depend on (port exactly)

- **`BeginDelayedSequence(d)` / `BeginAbsoluteSequence(t)` on a CompositeDrawable are recursive.** They shift the transform start time of the container **and all its descendants** (`osu-framework/osu.Framework/Graphics/Containers/CompositeDrawable.cs:1317`). `TransformDelay` is the container's own accumulated delay, which the circles sequence uses through `remainingTime() = length - TransformDelay`.
- **`Then(delay=0)`** continues from the latest end time of all transforms in that sequence (`osu-framework/osu.Framework/Graphics/Transforms/TransformSequence.cs:367-376`). **`Delay(x)`** offsets from the current sequence cursor.
- **Adding a transform** removes every already-queued transform on the same member that sorts after it (sorted by start time, then id) (`osu-framework/osu.Framework/Graphics/Transforms/TargetGroupingTransformTracker.cs:242-253`).
- **When a transform first applies,** earlier still-running transforms on the same member are applied at the new transform's `StartTime` and then removed (aborted). The new transform reads its StartValue at that moment (`TargetGroupingTransformTracker.cs:121-156`). This is the "interruption" rule used throughout this spec.
- **`Hide()` = `FadeOut()`, `Show()` = `FadeIn()`** with duration 0 (`osu-framework/osu.Framework/Graphics/Drawable.cs:2580,2585`). A zero-duration transform with an `OnComplete` fires its callback on the first frame whose clock time is ≥ its start time.
- **Non-present drawables do not run `Update()` or their Scheduler.** Their transforms still advance. `IsPresent = AlwaysPresent || (Alpha > 0.0001 && DrawScale ≠ 0)` (`Drawable.cs:484-495,1342`).
  - OsuLogo overrides `IsPresent => base.IsPresent || Scheduler.HasPendingTasks` (`OsuLogo.cs:107`).
  - `LogoAnimation.IsPresent => true`.
- **Setting `RelativeSizeAxes` turns a zero dimension into 1** (`Drawable.cs:815-816`). For example, `foregroundFill { Size = Zero, RelativeSizeAxes = Both, Width = 0 }` ends up as relative (0, 1), not (0, 0).
- **`Opacity(intLiteral)` resolves to the `byte` overload**, giving `a/255` (`osu-framework/osu.Framework/Extensions/Color4Extensions/Color4Extensions.cs:52`). Examples: `Opacity(180)` = 0.706, `Opacity(160)` = 0.627.
- **`Easing.In` ≡ `InQuad` and `Easing.Out` ≡ `OutQuad`** (`osu-framework/osu.Framework/Graphics/Transforms/DefaultEasingFunction.cs:46-52`).
- **`Triangle` shape:** the vertices are (top-centre, bottom-left, bottom-right) of the draw quad (`osu-framework/osu.Framework/Graphics/Shapes/Triangle.cs:35-38`).
- **`OsuLogo.AppendAnimatingAction(action, waitForPrevious: true)`** runs `this.DelayUntilTransformsFinished().Schedule(action)`, counting only the logo's **own** transforms, not its children's. With `waitForPrevious: false` it runs `ClearTransforms(); action()`. If the logo is not loaded yet, it is `Schedule`d (`OsuLogo.cs:258-275`). Every `LogoArriving`, `LogoSuspending` and `LogoExiting` goes through this (`osu/osu.Game/Screens/OsuScreen.cs:277-300`), and the arriving callback is skipped if the screen is no longer current.

---

## 5. The intros

Timeline origin **t=0** is the frame where the intro's `LogoArriving(logo, resuming:false)` runs. That is the frame after Loader pushes the intro and the logo has no running transforms of its own.

### 5.1 IntroTriangles (DEFAULT) — `osu/osu.Game/Screens/Menu/IntroTriangles.cs`

#### 5.1.1 Screen logic (`:52-100`)
```ts
// Ported from osu/osu.Game/Screens/Menu/IntroTriangles.cs:52
logoArriving(logo, resuming) {
  super.logoArriving(logo, resuming);          // §3.2 (logo hidden at centre, scale 1)
  if (resuming) return;
  prepareMenuLoad();
  const decoupling = new DecouplingFramedClock(usingThemedIntro ? this.track : null);
  intro = new TrianglesIntroSequence(logo, () => fadeInBackground() /*duration 0*/);
  intro.relativeSizeAxes = Both;
  intro.clock = new InterpolatingFramedClock(decoupling);    // ← all intro times are TRACK time
  intro.loadMenu = () => loadMenu();
  loadComponentAsync(intro, () => {
    addInternal(intro);
    if (didLoadMenu) return;                   // watchdog already fired → no voice, no track start
    if (!usingThemedIntro) {                   // only MenuMusic=false
      welcomeSample?.play();                   // Samples/Intro/welcome.mp3
      scheduler.addDelayed(startTrack, 600);   // IntroCircles.TRACK_START_DELAY
    } else startTrack();                       // track.restart() at 0
    decoupling.start();                        // free-running if no source; follows track if themed
  });
}
onSuspending() { super.onSuspending(); intro.expire(); }   // :94-100
```

- **Clock for the port:**
  - Themed: `introTime = track.currentTime` (interpolated between audio updates). If the track cannot play, the decoupling clock keeps counting in real time from `start()` (`osu-framework/osu.Framework/Timing/DecouplingFramedClock.cs:38`, `AllowDecoupling = true`).
  - Non-themed: `introTime = performance.now() - startedAt` from the moment of `start()`.
- **Voice:** the vocal "welcome to osu!" is inside `triangles.osz/audio.mp3`, so no voice sample plays in the themed path.

#### 5.1.2 TrianglesIntroSequence layout (`:126-169`)
Children, bottom to top (z):

| # | Drawable | Props |
|---|---|---|
| 1 | `triangles: GlitchingTriangles` | Alpha 0, Anchor/Origin Centre, RelativeSizeAxes Both, **Size (0.4, 0.16)**, i.e. 40 % × 16 % of the screen draw size (`:131-137,354-357`) |
| 2 | `welcomeText: OsuSpriteText` | Anchor/Origin Centre, Padding Bottom 10, Torus Light 42, Alpha 1, **Spacing (5,5)**, Text "" (`:138-146`) |
| 3 | `rulesetsScale: Container` | RelativeSizeAxes Both, Anchor/Origin Centre (scale pivot = screen centre) |
|   | ↳ `rulesets: RulesetFlow` | FillFlowContainer (Full direction), AutoSize Both, Anchor/Origin Centre. One `ConstrainedIconContainer { Size 30×30 }` per ruleset, ordered by OnlineID: osu, taiko, catch, mania (`osu/osu.Game/Rulesets/RealmRulesetStore.cs:73`). Icons are `Icons/Ruleset*.png`, colour white (`:322-350`) |
| 4 | `logoContainerSecondary: Container` | RelativeSizeAxes Both, Anchor/Origin Centre |
|   | ↳ `lazerLogo: LazerLogo` | Anchor/Origin Centre, **Size 960×960**. Children, bottom to top: `highlight` (LogoAnimation, `Intro/Triangles/logo-highlight`, White) then `background` (LogoAnimation, `Intro/Triangles/logo-background`, `#999999`). Both RelativeSizeAxes Both. `Progress` sets both layers' `AnimationProgress` (`:282-320`) |

`Padding Bottom 10` with Origin Centre places the text glyphs 5 units above true centre.

#### 5.1.3 Timeline (all inside `BeginAbsoluteSequence(0)`, intro clock = track ms) (`:171-262`)

Constants:

| Name | Value | Cite |
|---|---|---|
| `text_1` | 200 | `:171` |
| `text_2` | 400 | `:172` |
| `text_3` | 700 | `:173` |
| `text_4` | 900 | `:174` |
| `text_glitch` | 1060 | `:175` |
| `rulesets_1` | 1450 | `:177` |
| `rulesets_2` | 1650 | `:178` |
| `rulesets_3` | 1850 | `:179` |
| `logo_scale_duration` | 920 | `:181` |
| `logo_1` | 2080 | `:182` |
| `logo_2` | 3000 | `:183` |
| `scale_start` | 1.2 | `:189` |
| `scale_adjust` | 0.8 | `:190` |

```ts
// Ported from osu/osu.Game/Screens/Menu/IntroTriangles.cs:185
loadComplete() {
  rulesets.hide(); lazerLogo.hide();
  this.beginAbsoluteSequence(0, () => {
    this.beginDelayedSequence(200,  () => welcomeText.fadeIn().onComplete(t => t.text = 'wel'));
    this.beginDelayedSequence(400,  () => welcomeText.fadeIn().onComplete(t => t.text = 'welcome'));
    this.beginDelayedSequence(700,  () => welcomeText.fadeIn().onComplete(t => t.text = 'welcome to'));
    this.beginDelayedSequence(900,  () => {
      welcomeText.fadeIn().onComplete(t => t.text = 'welcome to osu!');
      welcomeText.transformTo('spacing', {x:50, y:0}, 5000);          // Easing.None; from (5,5)
    });
    this.beginDelayedSequence(1060, () => triangles.fadeIn());           // instant
    this.beginDelayedSequence(1450, () => {
      rulesetsScale.scaleTo(0.8, 1000);                                  // None, 1450→2450 (interrupted at 1850)
      rulesets.fadeIn().scaleTo(1).transformSpacingTo({x:200, y:0});      // all instant
      welcomeText.fadeOut().expire();                                    // instant hide + removal
      triangles.fadeOut().expire();
    });
    this.beginDelayedSequence(1650, () => rulesets.scaleTo(2).transformSpacingTo({x:30, y:0}));
    this.beginDelayedSequence(1850, () => {
      rulesets.scaleTo(4).transformSpacingTo({x:10, y:0});
      rulesetsScale.scaleTo(1.3, 1000);                                  // None, 1850→2850; starts from 0.92 (see below)
    });
    this.beginDelayedSequence(2080, () => {
      rulesets.fadeOut();
      // "matching flyte curve y = 0.25x^2 + (max(0, x - 0.7) / 0.3) ^ 5"
      lazerLogo.fadeIn().scaleTo(1.2).then().delay(920 * 0.7 /*644*/).scaleTo(1.2 - 0.8 /*0.4*/, 920 * 0.3 /*276*/, 'InQuint'); // 2724→3000
      lazerLogo.transformTo('progress', 1, 920);                          // None, 2080→3000, from 0
      logoContainerSecondary.scaleTo(1.2).then().scaleTo(1.2 - 0.8 * 0.25 /*1.0*/, 920, 'InQuad');               // 2080→3000
    });
    this.beginDelayedSequence(3000, () => {
      lazerLogo.fadeOut().onComplete(() => {
        logoContainerSecondary.remove(lazerLogo, /*dispose*/ true);
        logo.fadeIn();                       // instant, on the game clock
        showBackgroundAction();              // FadeInBackground(0): bg colour → white instantly
        game.add(new GameWideFlash());       // §5.1.6
        loadMenu();                          // push MainMenu (preloaded at t=0)
      });
    });
  });
}
```

Derived values:
- **Text spacing:** at 1450 (expiry) the spacing is `5 + 45 × (550/5000) = 9.95` horizontally. Y goes 5 → 0, which does not matter for a single line.
- **`rulesetsScale` interruption:** at 1850 the 1450 transform has value `1 + (0.8−1) × 0.4 = 0.92`. The new transform runs 0.92 → 1.3 over 1850–2850. At 2080 (when rulesets hide) it is `0.92 + 0.38 × 0.23 = 1.0074`.
- **Ruleset flow width** (before `rulesetsScale`): 4 icons of 30 plus 3 gaps.

  | Time | Gap | Unscaled width | Flow scale | Width |
  |---|---|---|---|---|
  | 1450 | 200 | 720 | 1 | 720 |
  | 1650 | 30 | 210 | 2 | 420 |
  | 1850 | 10 | 150 | 4 | 600 |

  The flow pivots on its centre (Anchor/Origin Centre).
- **LazerLogo effective scale** = `logoContainerSecondary.scale × lazerLogo.scale`. Displayed size = 960 × that.

  | Time | Container | Logo | Product | Displayed |
  |---|---|---|---|---|
  | 2080 | 1.2 | 1.2 | 1.44 | 1382 |
  | 2724 | 1.2 − 0.2·InQuad(0.7) = 1.102 | 1.2 | 1.322 | 1269 |
  | 3000 | 1.0 | 0.4 | 0.4 | 384 |

- **Reveal:** a pixel is shown once `R/255 < progress`, with `progress = (t−2080)/920`. The highlight layer is drawn under the gray background layer.
- `lazerLogo.hide()` sets alpha 0 at load. `fadeIn()` at 2080 makes it fully opaque, but nothing shows until progress passes each pixel's threshold.

#### 5.1.4 GlitchingTriangles (`:352-413`)
```ts
// Ported from osu/osu.Game/Screens/Menu/IntroTriangles.cs:363 — Update() only runs while present (alpha>0) ⇒ 1060..1450
update() {
  const now = this.time.current;                                   // intro (track) clock
  if (lastGenTime == null || now - lastGenTime > 22) {
    lastGenTime = (lastGenTime ?? now) + 22;                       // at most ONE triangle per frame; catches up over frames
    const tri = new OutlineTriangle(rng.nextBool(), (rng.nextSingle() + 0.2) * 80);   // size 16..96 units, square
    tri.relativePositionAxes = Both; tri.position = {x: rng.nextSingle(), y: rng.nextSingle()};  // Origin TopLeft (default) → may overflow right/bottom
    addInternal(tri);
    tri.fadeOutFromOne(120);                                       // alpha 1 → 0, None, 120 ms (never expired; container expires at 1450)
  }
}
```
**OutlineTriangle** (`:386-411`) is a `BufferedContainer(cachedFrameBuffer: true)` of `Size(s)`. The whole buffer is drawn with **Additive** blending.
- It contains a white `Triangle` filling the buffer.
- If `outlineOnly`, a **black** `Triangle` of `Size(s−5)` is added on top, Anchor/Origin Centre, with `Blending.None` (it overwrites the buffer).
- Because black adds nothing, the visible result is a white outline: 2.5 units at the bottom and thinner on the slanted sides (the inner triangle is a centred, shrunk quad).
- With the 50/50 `RNG.NextBool()`, half the triangles are filled white and half are outlines.
- Canvas port: draw the filled triangle, punch the inner one with `destination-out`, then composite the canvas with `globalCompositeOperation='lighter'` (or CSS `mix-blend-mode: plus-lighter`).

#### 5.1.5 Track and logo beat at the end of the intro
- Track time at the handover is 3000. The first timing point is 3011.74.
- `OsuLogo.OnNewBeat` returns early for `beatIndex < 0` (`OsuLogo.cs:301`), so the logo's first pulse and ripple is beat 0 at ≈3011.74. With `EarlyActivationMilliseconds = 60` (`OsuLogo.cs:103,111`) the event fires about 60 ms early and is delayed internally (`osu/osu.Game/Graphics/Containers/BeatSyncedContainer.cs:96-160`).
- Kiai starts only at 87011.

#### 5.1.6 GameWideFlash (`:264-280`)
- A `Box` with Colour White, RelativeSizeAxes Both, **Additive** blending, added to the **game root**, so it covers the whole window including the toolbar area.
- `LoadComplete: FadeOutFromOne(1000, Easing.Out)`, i.e. alpha 1 → 0 over 1000 ms (OutQuad). It is never expired (alpha stays 0).
- Port: a full-window div above everything, `background:#fff; mix-blend-mode: plus-lighter; pointer-events:none`, driven by the transform system on the **game** clock (not the intro clock).

#### 5.1.7 Triangles timeline summary (themed)

| Track ms | Event |
|---|---|
| 0 | `track.restart()`, intro clock starts; logo hidden at centre |
| 200 | text "wel" |
| 400 | "welcome" |
| 700 | "welcome to" |
| 900 | "welcome to osu!", spacing 5 → 50 over 5000 (linear) |
| 1060 | glitch triangles box visible, 1 triangle per ≥22 ms, each fades over 120 |
| 1450 | text and triangles removed; ruleset icons appear (spacing 200, scale 1); rulesetsScale 1 → 0.8 over 1000 |
| 1650 | icons scale 2, spacing 30 |
| 1850 | icons scale 4, spacing 10; rulesetsScale 0.92 → 1.3 over 1000 |
| 2080 | icons hidden; lazer logo reveal: progress 0 → 1 (920, linear), container 1.2 → 1.0 (920, InQuad), logo 1.2 → hold → 0.4 (2724–3000, InQuint) |
| 3000 | lazer logo removed; osu! logo alpha 1 (white ring and text only); background colour → white (0 ms); additive white flash 1 → 0 (1000, Out); **MainMenu pushed** → triangles/ripple fade in 300 ms OutQuint (§6.2) |
| 3011.74 | first beat: logo pulse and ripple |

---

### 5.2 IntroCircles — `osu/osu.Game/Screens/Menu/IntroCircles.cs`

Constants: `TRACK_START_DELAY = 600` (`:22`), `delay_for_menu = 2900` (`:24`).

```ts
// Ported from osu/osu.Game/Screens/Menu/IntroCircles.cs:40
logoArriving(logo, resuming) {
  super.logoArriving(logo, resuming);          // §3.2
  if (resuming) return;
  welcomeSample?.play();                       // Samples/Intro/welcome.mp3, if MenuVoice (default on)
  scheduler.addDelayed(() => {                 // game clock
    startTrack();                              // themed: circles.ogg from 0 (first beat at track 2558.82)
    prepareMenuLoad();
    scheduler.addDelayed(loadMenu, 2900 - 600); // ⇒ MainMenu push at t=2900
  }, 600);
  logo.scaleTo(1); logo.fadeIn();              // logo alpha 1 (its content is hidden by playIntro)
  logo.playIntro();
}
onSuspending(e) { this.fadeOut(300); super.onSuspending(e); }   // :63-67 (+ FadeInBackground(200) from base)
```

#### 5.2.1 `OsuLogo.PlayIntro()` (`OsuLogo.cs:350-359`)
```ts
playIntro() {
  const length = 3150, fade = 200;
  logoHoverContainer.fadeOut().delay(length).fadeIn(fade);   // the real logo (incl. visualiser) appears 3150→3350, linear
  intro.show();                                              // IntroSequence alpha 1
  intro.start(length);
  intro.delay(length + fade).fadeOut();                      // instant hide at 3350
}
```
`intro` is an `IntroSequence { RelativeSizeAxes = Both }`. It is the **first** (bottom) child of OsuLogo, so it fills the logo's 512×512 autosize box, with **Anchor/Origin TopLeft** (defaults) (`OsuLogo.cs:119-122`). See open question Q1 for what the TopLeft origin implies.

#### 5.2.2 IntroSequence layout (`osu/osu.Game/Screens/Menu/IntroSequence.cs:44-176`)
Container-level: RelativeSizeAxes Both, Alpha 0 (ctor), **Scale 0.5** (set in `load`). Constants: `logo_size = 460` ("todo: should probably be 480", `:21`), `line_offset = 80`, `circle_offset = 250`.

Children, bottom to top (z):

| # | Drawable | Initial props | Colour |
|---|---|---|---|
| 1 | `lines` Container<Box> (Centre/Centre, AutoSize) | each line Size **(105, 1.5)**, Alpha 0 (`:169-173`) | – |
|   | lineTopLeft | Origin CentreLeft, Pos (−80, −80), Rot 45 | White α 180/255 = **0.706** |
|   | lineTopRight | Origin CentreRight, Pos (80, −80), Rot −45 | White α 80/255 = **0.314** |
|   | lineBottomLeft | Origin CentreLeft, Pos (−80, 80), Rot −45 | White α 230/255 = **0.902** |
|   | lineBottomRight | Origin CentreRight, Pos (80, 80), Rot 45 | White α 130/255 = **0.510** |
| 2 | `bigRing` Ring(#B6C5E9, fg 0.85) | size 0 | `#B6C5E9` = rgba(182,197,233,1) |
| 3 | `mediumRing` Ring(White.Opacity(130), fg 0.7) | size 0 | rgba(255,255,255,0.510) |
| 4 | `smallRing` Ring(White, fg 0.6) | size 0 | #FFFFFF |
| 5 | `welcomeText` OsuSpriteText "welcome" | Centre/Centre, Padding Bottom 10, Torus Light 42, Alpha 0, Spacing (5,5) | white (shadow on) |
| 6 | CircularContainer Size **460**, Masking, Centre/Centre | | |
|   | ↳ `backgroundFill` Box | Centre/Centre, Rel Both → (1, **0**) | `#C6D8FF` α 160/255 = rgba(198,216,255,0.627) |
|   | ↳ `foregroundFill` Box | Centre/Centre, Rel Both → (**0**, 1) (§4 zero→1 rule) | White |
| 7 | `purpleCircle` Circle | Anchor Centre, **Origin TopCentre**, Pos (0, 250), size 0 | `#AA92FF` |
| 8 | `blueCircle` | Origin **CentreRight**, Pos (−250, 0) | `#8FE5FE` |
| 9 | `yellowCircle` | Origin **BottomCentre**, Pos (0, −250) | `#FFD64C` |
| 10 | `pinkCircle` | Origin **CentreLeft**, Pos (250, 0) | `#E967A1` |

**Ring** (`:269-297`) is an Anchor/Origin Centre container (absolute size, initially 0) with two children:
- A coloured `Circle` (Rel Both, Scale 0.98).
- `Foreground`: a **Black** `Circle` (Rel Both, size = fgSize, centred), which produces the annulus.

The line geometry points inward: each line starts at a corner 80√2 = 113 from the centre and extends 105 units toward the centre.

#### 5.2.3 `IntroSequence.Start(length = 3150)` timeline (`:178-267`)
`s` is the IntroSequence. Times are relative to the call (t=0 = logo arrival).

```ts
// Ported from osu/osu.Game/Screens/Menu/IntroSequence.cs:178
start(length) {
  if (this.children.length) { this.finishTransforms(true); this.load(); }   // ALWAYS rebuilds children (restart-safe)
  smallRing.resizeTo(460 * 0.086 /*39.56*/, 400, 'InOutQuint');
  mediumRing.resizeTo(130, 340, 'OutQuad');
  mediumRing.foreground.resizeTo(1, 880, 'Out');
  const remaining = () => length - this.transformDelay;
  this.beginDelayedSequence(250, () => {                                    // t=250
    welcomeText.fadeIn(700);
    welcomeText.transformSpacingTo({x:20, y:0}, remaining() /*2900*/, 'Out');
    for (const line of lines) line.fadeIn(40).resizeWidthTo(0, 700 - 150 /*550*/, 'OutQuint');
    smallRing.foreground.resizeTo(1, 700, 'OutQuint');
    smallRing.delay(400).fadeColour(BLACK, 300);                            // 650→950
    lineTopLeft    .moveTo({x:-120, y:-120}, 700, 'OutQuint');
    lineTopRight   .moveTo({x: 120, y:-120}, 700, 'OutQuint');
    lineBottomLeft .moveTo({x:-120, y: 120}, 700, 'OutQuint');
    lineBottomRight.moveTo({x: 120, y: 120}, 700, 'OutQuint');
    this.beginDelayedSequence(length * 0.56 /*1764*/, () => {               // t=2014
      bigRing.resizeTo(460, 500, 'InOutQuint');                             // 2014→2514
      bigRing.foreground.delay(250).resizeTo(1, 850, 'OutQuint');           // 2264→3114
      this.beginDelayedSequence(250, () => {                                // t=2264, remaining()=886
        backgroundFill.resizeHeightTo(1, remaining(), 'InOutQuart');
        backgroundFill.rotateTo(-90, remaining(), 'InOutQuart');
        this.beginDelayedSequence(50, () => {                               // t=2314, remaining()=836
          foregroundFill.resizeWidthTo(1, remaining(), 'InOutQuart');
          foregroundFill.rotateTo(-90, remaining(), 'InOutQuart');
        });
        this.scaleTo(1, remaining() /*886*/, 'InOutCubic');                 // whole sequence 0.5→1, ends 3150
        const D = 460 * 0.9 /*414*/, ROT = 110, APPEAR = 80;
        purpleCircle.moveToY(D/2, remaining(), 'InOutQuart');
        purpleCircle.delay(ROT).rotateTo(-180, remaining() - ROT, 'InOutQuart');
        purpleCircle.resizeTo(D, remaining(), 'InOutQuart');
        this.beginDelayedSequence(APPEAR, () => {                           // t=2344, rem 806
          yellowCircle.moveToY(-D/2, remaining(), 'InOutQuart');
          yellowCircle.delay(ROT).rotateTo(-180, remaining() - ROT, 'InOutQuart');
          yellowCircle.resizeTo(D, remaining(), 'InOutQuart');
          this.beginDelayedSequence(APPEAR, () => {                         // t=2424, rem 726
            blueCircle.moveToX(-D/2, remaining(), 'InOutQuart');
            blueCircle.delay(ROT).rotateTo(-180, remaining() - ROT, 'InOutQuart');
            blueCircle.resizeTo(D, remaining(), 'InOutQuart');
            this.beginDelayedSequence(APPEAR, () => {                       // t=2504, rem 646
              pinkCircle.moveToX(D/2, remaining(), 'InOutQuart');
              pinkCircle.delay(ROT).rotateTo(-180, remaining() - ROT, 'InOutQuart');
              pinkCircle.resizeTo(D, remaining(), 'InOutQuart');
            });
          });
        });
      });
    });
  });
}
```

Resolved table (t = ms after logo arrival):

| Drawable | Property | From → To | Start → End | Easing |
|---|---|---|---|---|
| smallRing | size | 0 → 39.56 | 0 → 400 | InOutQuint |
| mediumRing | size | 0 → 130 | 0 → 340 | OutQuad |
| mediumRing.fg | rel size | 0.7 → 1 | 0 → 880 | Out |
| welcomeText | alpha | 0 → 1 | 250 → 950 | None |
| welcomeText | spacing | (5,5) → (20,0) | 250 → 3150 | Out |
| lines ×4 | alpha | 0 → 1 | 250 → 290 | None |
| lines ×4 | width | 105 → 0 | 250 → 800 | OutQuint |
| lines ×4 | position | ±80 → ±120 | 250 → 950 | OutQuint |
| smallRing.fg | rel size | 0.6 → 1 | 250 → 950 | OutQuint |
| smallRing | colour | white → black | 650 → 950 | None |
| bigRing | size | 0 → 460 | 2014 → 2514 | InOutQuint |
| bigRing.fg | rel size | 0.85 → 1 | 2264 → 3114 | OutQuint |
| backgroundFill | rel height, rotation | 0 → 1, 0 → −90° | 2264 → 3150 | InOutQuart |
| foregroundFill | rel width, rotation | 0 → 1, 0 → −90° | 2314 → 3150 | InOutQuart |
| IntroSequence | scale | 0.5 → 1 | 2264 → 3150 | InOutCubic |
| purple | y / size / rot | 250 → 207 / 0 → 414 / 0 → −180 (rot 2374 → 3150) | 2264 → 3150 | InOutQuart |
| yellow | y / size / rot | −250 → −207 / 0 → 414 / → −180 (2454 → 3150) | 2344 → 3150 | InOutQuart |
| blue | x / size / rot | −250 → −207 / 0 → 414 / → −180 (2534 → 3150) | 2424 → 3150 | InOutQuart |
| pink | x / size / rot | 250 → 207 / 0 → 414 / → −180 (2614 → 3150) | 2504 → 3150 | InOutQuart |
| logoHoverContainer (real logo) | alpha | 0 → 1 | 3150 → 3350 | None |
| IntroSequence | alpha | 1 → 0 | 3350 (instant) | – |

Geometry check: each circle ends with its **edge-origin** at distance 207 from centre and is rotated 180° about that origin. The 414-diameter body therefore flips over the origin and ends **exactly centred**: four concentric circles, with pink on top, under the real logo (whose visible disc is 0.94 × 512 ≈ 481).

Wall-clock alignment:
- The track starts at 600, so its first beat (2558.82) is at t ≈ 3158.8, which matches the logo appearing at 3150.
- MainMenu is pushed at 2900, while the sequence is still running.
- The intro screen fades out over 300 (it has nothing visible) and the background colour fades black → white over 200 (2900 → 3100).
- The IntroSequence lives on the logo, so it keeps running through the menu push.
- MainMenu's `LogoArriving` runs at about 2900 (the logo itself has no running transforms), and the triangles/ripple fades (300) finish under the still-hidden `logoHoverContainer`.

---

### 5.3 IntroWelcome — `osu/osu.Game/Screens/Menu/IntroWelcome.cs`

Constant: `delay_step_two = 2142` (`:28`). This equals the length of `welcome_piano.mp3`.

```ts
// Ported from osu/osu.Game/Screens/Menu/IntroWelcome.cs:55
logoArriving(logo, resuming) {
  super.logoArriving(logo, resuming);          // §3.2 → logo hidden at centre
  if (resuming) return;
  this.track.looping = true;
  loadComponentAsync(new WelcomeIntroSequence({ relativeSizeAxes: Both }), intro => {
    prepareMenuLoad();
    addInternal(intro);
    welcomeSample?.play();                     // Samples/Intro/Welcome/welcome.mp3 (MenuVoice)
    const reverb = pianoReverb.play();         // Samples/Intro/Welcome/welcome_piano.mp3 (always)
    if (reverb) intro.logoVisualisation.addAmplitudeSource(reverb);
    if (!usingThemedIntro) startTrack();
    scheduler.addDelayed(() => {               // t≈2142 (+async load time)
      if (usingThemedIntro) { startTrack(); this.track.looping = true; }   // "this classic intro loops forever"
      logo.scaleTo(1);
      logo.fadeIn(200);
      fadeInBackground(200);                   // Intro/Welcome/menu-background
      loadMenu();
    }, 2142);
  });
}
```

#### 5.3.1 WelcomeIntroSequence (`:106-168`)
- Anchor/Origin Centre, RelativeSizeAxes Both (full screen).
- `scaleContainer`: AutoSize Both, Anchor/Origin Centre. It sizes to 480×480 from the circle. Children, bottom to top:
  1. `LogoVisualisation`: Rel Both, **Size 0.94** (`OsuLogo.SCALE_ADJUST`), giving 451.2 units. Anchor/Origin Centre. Colour **`Color4.DarkBlue` = #00008B**, additive (class default).
  2. `Circle`: Size **480**, Colour **Black**, Centre.
  3. `welcomeText`: Sprite `Intro/Welcome/welcome_text` (375×78), Centre.

```ts
// :156-167
loadComplete() {
  scaleContainer.scaleTo(0.9).scaleTo(1, 2142).onComplete(() => this.expire());   // None; self-removes at 2142
  scaleContainer.fadeInFromZero(1800);                                             // None
  welcomeText.scaleTo({x:1, y:0}).scaleTo({x:1, y:1}, 400, 'Out');                 // vertical "unfold"
}
```

#### 5.3.2 Welcome timeline

| ms | Event |
|---|---|
| 0 (load complete) | welcome voice and piano reverb start; sequence fades in over 1800 while scaling 0.9 → 1 linearly over 2142; wordmark unfolds vertically 0 → 1 over 400 (OutQuad) |
| 0–2142 | dark-blue additive bars around the black 480 disc, driven by the piano reverb's FFT (plus track amplitudes, which are zero because the track has not started). Not kiai, so the bars are multiplied by 0.5 |
| 2142 | the sequence expires; the track starts at 0 and loops; logo fades in over 200 (it was already moved to (0.5,0.5), scale 1); background black → white over 200; MainMenu pushed |
| 2142 + 0..605 track ms | kiai 5–605: kiai flash and visualiser boost on the logo (main-menu spec); beats every 500 ms |

The sequence's 480 disc and the logo (visible disc ≈481) roughly match, so the logo replaces the black disc in place.

#### 5.3.3 LogoVisualisation (used here; the main-menu spec owns the menu instance) — `osu/osu.Game/Screens/Menu/LogoVisualisation.cs`
Constants:

| Name | Value | Cite |
|---|---|---|
| `index_change` | 5 | `:31` |
| `bar_length` | 600 | `:36` |
| `bars_per_visualiser` | 200 | `:41` |
| `visualiser_rounds` | 5 | `:46` |
| `decay_per_millisecond` | 0.0024 | `:51` |
| `time_between_updates` | 50 ms (repeating, no catch-up) | `:56,126-127` |
| dead zone | 1/600 | `:61` |
| blending | Additive | `:77` |

Every 50 ms:
```
temporal[0..255] = Σ_sources src.frequencyAmplitudes[i]
k = kiai ? 1 : 0.5
for i in 0..199: target = temporal[(i + indexOffset) % 200] * k; if target > freq[i] → freq[i] = target
indexOffset = (indexOffset + 5) % 200
```
Sources are the beat-sync provider (global track) plus any added channels (`:99-120`).

Every frame: `freq[i] -= elapsed × 0.0024 × (freq[i] + 0.03)`, clamped ≥ 0 (`:130-145`).

Draw: for j in 0..4 and i in 0..199 with `freq[i] ≥ 1/600`:
- `angle = deg(i/200 × 360 + j × 72)`
- Bar base is at the circle edge, `pos = (cos/2 + 0.5, sin/2 + 0.5) × size`, where `size = DrawSize.X`.
- Width = `size × √(2(1 − cos 1.8°)) / 2` ≈ `size × 0.015707`.
- Length = `600 × freq[i]`, extending outward.
- Colour = drawable colour × white α0.2 (`:172,194-245`).

---

### 5.4 IntroChristmas (seasonal; disabled in this build) — `osu/osu.Game/Seasonal/IntroChristmas.cs`
- Selected only if `SeasonalUIConfig.ENABLED`, which is `static readonly false` (`osu/osu.Game/Seasonal/SeasonalUIConfig.cs:14`). Colours: PRIMARY_1 `#D32F2F`, PRIMARY_2 `#388E3C`, AMBIENT_1 `#FFFFCC`, AMBIENT_2 `#FFE4B5`.
- Same structure as Triangles (track-clocked). Beat helper: `getTimeForBeat(n) = 5924 + n × 60000/172` (348.837 ms) (`:33-34,151`).
- Text sequence, in beats:

  | Beat | Track ms | Text |
  |---|---|---|
  | −16 | 342.6 | "welcome to osu!" |
  | −15 | 691.4 | "" |
  | −14 | 1040.3 | "welcome to osu!" |
  | −13 | 1389.1 | "" |
  | −12 | 1738.0 | "merry christmas!" |
  | −11 | 2086.8 | "" |
  | −10 | 2435.6 | "merry osumas!" |
  | −9 | 2784.5 | "" |

- Beats −8..−1: a masked 960 circle of beat-synced red/green triangles. LazerLogo and triangles scale `0.2 + (i+1)/8 × 0.3` (one beat, OutQuint), logo alpha `(i+1) × 0.06`, progress `(i+1)/10`.
- Beat −2 (5226.3): logo alpha 1, then a GameWideFlash that goes 0 → 0.5 over 2 beats (In). At completion (≈ beat 0) it reveals the logo, shows the background and calls `LoadMenu`; then `FadeOutFromOne(3000, OutQuint)`.
- Uses `Intro/Welcome/seeya` on exit.
- Related seasonal classes exist (`OsuLogoChristmas`, `SeasonalMenuLogoVisualisation`, `SeasonalMenuSideFlashes`, `MainMenuSeasonalLighting`). **Recommendation: do not port** unless a seasonal toggle is wanted.

---

## 6. Logo handover → MainMenu

### 6.1 OsuScreen base `LogoArriving` (`osu/osu.Game/Screens/OsuScreen.cs:263-275`)
```ts
logo.action = null;
logo.fadeOut(300, 'OutQuint');
logo.origin = Centre; logo.changeAnchor(TopLeft);   // ChangeAnchor keeps the visual position: Position -= newAnchorPos - oldAnchorPos (OsuLogo.cs:497-502)
logo.relativePositionAxes = Both;
logo.triangles = true;   // colourAndTriangles.FadeTo(1, 300, OutQuint)  (OsuLogo.cs:84-87)
logo.ripple = true;      // rippleContainer.FadeTo(1, 300, OutQuint)      (OsuLogo.cs:91-95)
```
This is invoked through `applyArrivingDefaults` → `AppendAnimatingAction(…, waitForPrevious: true)`, guarded by `IsCurrentScreen()` (`OsuScreen.cs:277-283`).

### 6.2 State at the moment MainMenu.LogoArriving runs (end of every intro)

| Property | Value |
|---|---|
| Origin / Anchor | Centre / TopLeft, RelativePositionAxes Both |
| Position | (0.5, 0.5) (screen centre of `logoContainer`) |
| Scale | 1, so the logo box is 512×512 (`Menu/logo.png` 1024 px / 2) |
| Rotation | 0 |
| Alpha | 1 (Triangles: instant at 3000; Welcome: fading 0 → 1 over 200 from 2142; Circles: 1, but `logoHoverContainer` alpha 0 until 3150 → 3350) |
| Colour | White |
| Triangles (pink gradient `#ff66ab → #cc5289` + TrianglesV2) | **0**, set false by the intro (`IntroScreen.cs:326`) |
| Ripple | 0 |
| Action | null |
| Track | intro track playing from ≈0 (Circles from t=600) at volume 1 |

MainMenu then runs (`osu/osu.Game/Screens/Menu/MainMenu.cs:254-308`):
1. `OnEntering`:
   - `Buttons.FadeInFromZero(500)`.
   - If the previous screen was an IntroScreen, the track is loaded and **not running**: `Beatmap.Value.PrepareTrackForPreview(false); track.Restart()`. This is a safety net; normally the track is already running (`:259-269`).
2. `LogoArriving(logo, false)`:
   - The base (§6.1) runs: `FadeOut(300)`, then immediately overridden by `logo.FadeColour(White, 100, OutQuint); logo.FadeIn(100, OutQuint)`. The FadeIn has the same start time and a later id, so it wins, and alpha stays 1.
   - **Triangles and Ripple fade in over 300 ms OutQuint.**
   - `Buttons.SetOsuLogo(logo)` sets `logo.Action = onOsuLogo` and calls `updateLogoState()` (`osu/osu.Game/Screens/Menu/ButtonSystem.cs:63-82`).
   - `logoProxy = logo.ProxyToContainer(logoTarget)`.
   - `logo.Action` is wrapped: `() => onLogoClick(previousAction)` (shows the login overlay once; online-only, so stub it).
3. ButtonSystem `Initial` state (`ButtonSystem.cs:462-479`):
   - After `buttonArea.Alpha × 150` ms (= 0 because the area is hidden): `Toolbar.Hide()`, `logo.ClearTransforms(Position)`, `MoveTo(0.5, 800, OutExpo)`, `ScaleTo(1, 800, OutExpo)`.
   - This produces no visible motion, since the logo is already there.
   - The menu now idles in Initial, with the logo beating to the track. The first click goes to TopLevel (scale 0.5, 200 In, tracking, and `Impact()` because scale > 0.6) — see the main-menu spec.
4. Background: `ButtonSystemState.Initial/Exit` causes `FadeColour(Gray(1) = white, 500, OutSine)` (`MainMenu.cs:221-231`). The colour is already white from the intro.

**Logo visualiser during the intro:** OsuLogo's own `MenuLogoVisualisation` (White, alpha 0.5, size 0.94) lives inside `logoHoverContainer` (`OsuLogo.cs:159-166`).
- Triangles and Welcome: hidden because the whole logo is alpha 0.
- Circles: hidden because `logoHoverContainer` is alpha 0 until 3150.
- It only becomes visible at the handover. Its colour is white for non-supporters (`osu/osu.Game/Screens/Menu/MenuLogoVisualisation.cs:28-34`).
- The only visualiser shown *during* an intro is the Welcome one (DarkBlue, piano-fed, §5.3.3).

**First-run setup:** `ShowFirstRunSetup` defaults to true (`OsuConfigManager.cs:176`), and `FirstRunSetupOverlay` shows itself once MainMenu is current (`osu/osu.Game/Overlays/FirstRunSetupOverlay.cs:54-69`). The portfolio should keep this false (out of scope).

---

## 7. Track lifecycle after the intro

- **Triangles / Circles:** the track is non-looping. `IntroScreen.StartTrack` (themed) only calls `Restart()`, and `PrepareTrackForPreview` is never called, so `RestartPoint` stays 0.
  - On completion, `onTrackCompleted` → `NextTrack(allowProtectedTracks: true)`, unless the beatmap is disabled or track control is disallowed (`MusicController.cs:544-548`).
  - If the intro set is the only set, it is replayed: "if there is only one possible set left, play it" (`MusicController.cs:384-387`). Otherwise a random other set plays (Shuffle default true, `MusicController.cs:53`).
  - The track swap fades the old track out over 150 (Out) and the new one in over 220 after a 30 ms delay (`MusicController.cs:519-532`).
- **Welcome:** `Looping = true`, so the 48 s track loops forever (`IntroWelcome.cs:61,90`).
- During the intro, `AllowGlobalTrackControl = false` and the beatmap lease is held. In the menu, `AllowGlobalTrackControl = true` (`MainMenu.cs:62`).

---

## 8. Exit path ("seeya")

Trigger: the game exits from the menu. `OsuGame.OnExiting` → if `introScreen.DidLoadMenu` and the current screen is not the intro → `Scheduler.Add(introScreen.MakeCurrent)` (`OsuGame.cs:1733-1745`). This exits MainMenu (with its own fades: `Buttons.State = Exit`, `this.FadeOut(3000)`, bottom elements `FadeOut(500, OutQuint)`; `MainMenu.cs:439-452`) and resumes the IntroScreen:

```ts
// Ported from osu/osu.Game/Screens/Menu/IntroScreen.cs:238
onResuming(e) {
  this.fadeIn(300);
  applyToBackground(b => b.fadeColour(BLACK, 100));
  let fadeOutTime = 3000;                               // exit_delay (:64)
  const track = musicController.currentTrack;
  track.looping = false; beatmap.disabled = true;
  if (menuVoice.value) {
    seeya.play();                                       // Intro/seeya or Intro/Welcome/seeya
    track.volumeTo(0.03, 200).then().volumeTo(0, 3000 - 200, 'In');
  } else {
    fadeOutTime = 500;
    track.volumeTo(0, 500, 'Out');
  }
  game.fadeTo(0.01, fadeOutTime).onComplete(() => this.exit());   // "don't fade out completely else we will stop running updates"
  super.onResuming(e);                                  // → LogoArriving(logo, resuming: true)
}
// LogoArriving resuming branch (:344-357)
const quick = 350, move = logo.alpha > 0.2 ? quick : 0;
logo.moveTo({x:.5, y:.5}, move, 'OutQuint');
logo.scaleTo(1, move, 'OutQuint').fadeIn(quick, 'OutQuint').then().rotateTo(20, 4500).fadeOut(3000);   // rotate 350→4850, fade 350→3350
```

The base runs first, so triangles and ripple fade **out** (300). For a web port the "exit" button can run this sequence, ending on a black screen instead of closing the window.

---

## 9. Interruption / re-entry summary

| Situation | Behaviour (port literally) |
|---|---|
| Watchdog (8000 ms) fires before the intro calls `LoadMenu` | MainMenu is pushed immediately and an error notification is posted. Triangles' load callback sees `DidLoadMenu` and skips the voice and track start (`IntroTriangles.cs:75-76`). Later `LoadMenu` calls are no-ops. |
| `IntroSequence.Start` called twice | `FinishTransforms(true)` then rebuild all children (`IntroSequence.cs:180-185`). |
| Intro screen suspended mid-sequence | Triangles: `intro.Expire()`, and the screen `Expire()`s (content vanishes). Circles: the screen fades out over 300, but the logo-owned IntroSequence keeps running to 3350. Welcome: the sequence expires itself at 2142. |
| Logo transforms pending when a screen arrives | `LogoArriving` waits for the logo's own transforms (`DelayUntilTransformsFinished`); suspend/exit actions clear them (`OsuLogo.cs:258-275`). |
| Same-property transforms overlapping (e.g. `rulesetsScale` at 1850) | The new transform starts from the current interpolated value; the old one is aborted (§4). |
| Audio cannot start | The intro clock decouples and runs in real time (Triangles); the scheduler-based intros run in real time anyway. |

---

## 10. Port notes (web)

- **Autoplay gate:** WebAudio needs a user gesture, and osu! has no such screen. Proposal: before Loader, a plain black screen with no osu! UI. Start the AudioContext on the first gesture, then push Loader. Do **not** start the intro clock before `track.play()` resolves, because Triangles is track-clocked.
- **Intro clock** = `audio.currentTime × 1000`, interpolated with `performance.now()` deltas between `timeupdate`s, as InterpolatingFramedClock does.
- **Blending:** use `mix-blend-mode: plus-lighter` (DOM) or `'lighter'` (canvas) for the additive pieces: GameWideFlash, OutlineTriangle buffers, LogoVisualisation, logo ripple and flash layer.
- **Sizes** are in osu units inside the ScalingContainer, except GameWideFlash, which is full-window.
- **Ruleset icons** (four PNG glyphs) are visible for 630 ms. Keep them for fidelity even though the portfolio has no gameplay.
- **Do not ship** `Textures/Intro/Circles/*`; they are unused.

---

## 11. Open questions / uncertainties

- **Q1 — Circles IntroSequence origin.** `IntroSequence` keeps the default Origin/Anchor **TopLeft** while `Scale = 0.5 → 1` (`OsuLogo.cs:119-122`, `IntroSequence.cs:175,233`). Read literally, the whole circles animation is centred 128 units up-left of the logo centre until 2264 and slides to centre during the InOutCubic scale (2264 → 3150). Port it literally, and check against a recording of the real client; there are no intro screenshots in `docs/reference/real/`.
- **Q2 —** FFT amplitude scaling (BASS vs WebAudio `AnalyserNode`) affects the welcome visualiser and the logo beat amplitude. Defer to the audio/visualiser spec.
- **Q3 —** Async load latency: Welcome's 2142 ms starts at load complete, not at LogoArriving. Assume ≈0 in the port.
- **Q4 —** The LogoAnimation shader samples with LOD bias −0.9 (`sh_LogoAnimation.fs:21`), a slight sharpening at mip level. It is negligible; ignore it.
