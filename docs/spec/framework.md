# osu!framework port (spec)

Area owner: `src/framework/**`. Citations are relative to `_reference/` (`osu-framework/osu.Framework/…`, `osu/osu.Game/…`).

**Versions:** the user's client is **osu! 2026.1005.0-lazer**, whose `osu.Game.csproj` references **ppy.osu.Framework 2026.921.1** and
**ppy.osu.Game.Resources 2026.918.0**. `_reference/` and `scripts/prepare-assets.mjs` are pinned to exactly these tags. Code that differs on
master must be ported as it is in these versions, bugs included. For example, in 2026.921.1 `Interpolation.ValueAt(RectangleF)` lerps the height
toward `val2.X` (`Utils/Interpolation.cs:390`). Port that as-is when RectangleF transforms are needed.
The ported TS files carry `// Ported from <path>.cs` headers. The C# source is the real spec; this file records the facts that are
easy to get wrong, the DOM mapping decisions, and known limitations.

---

## 0. TL;DR

1. **Transforms are osu!framework transforms, including their quirks** (§2). A new transform on the same member removes later-starting ones immediately, and removes earlier ones only once it is first applied.
2. **Colours multiply and interpolate in linear space** (§5). White is a fast path. Eased `t` is clamped to [0, 1] for colours, but **not** for numbers or vectors, so `OutBack`/`OutElastic` overshoot works on position, scale and alpha.
3. **Alpha is per leaf, never CSS `opacity` on containers** (§5). A half-alpha container shows its overlapping children through each other, as osu! does.
4. **The game's draw size is preserved at 1024×768 with the `Minimum` strategy** (§6). At 1440×900 the game sees 1228.8×768 osu units.
5. **Textures from `TextureStore` display at half their pixel size** (`scaleAdjust = 2`, §7).

---

## 1. Port status

| Area | Status | Files |
|---|---|---|
| Easing (all 36), Transform, TransformCustom, TargetGroupingTransformTracker, TransformSequence, Transformable | done, tested | `transforms/*` |
| Colour4 (+141 named colours), SRGBColour ops, ColourInfo | done, tested | `graphics/Colour4.ts`, `graphics/ColourInfo.ts` |
| Vector2, Matrix3 (+MatrixExtensions), RectangleF, Quad, Precision, MarginPadding, enums | done | `layout/*` |
| LayoutMember/LayoutValue, InvalidationList, Invalidation propagation | done | `layout/Layout.ts`, `graphics/Drawable.ts` |
| Drawable, CompositeDrawable, Container, Sprite, Box, Texture | done (input handlers pending) | `graphics/**` |
| Scheduler/ScheduledDelegate, StopwatchClock, FramedClock, ManualClock | done | `timing/*` |
| DependencyContainer (no reflection) | done | `allocation/*` |
| DrawSizePreservingFillContainer, Game, GameHost (rAF loop) | done | `graphics/containers/…`, `Game.ts`, `platform/GameHost.ts` |
| Bindables (Bindable, Leased, Bool, WithCurrent, Number/Float/Double/Int/Long) | done, tested | `bindables/*` |
| InputManager, PassThrough/UserInputManager, mouse/key event managers, events, DOM handler, KeyBindingContainer | done, tested | `input/**` |
| Fonts (BMFont atlases → JSON), FontStore/GlyphStore, TextBuilder (+multiline/truncating), SpriteText | done, tested | `text/*`, `graphics/sprites/SpriteText.ts` |
| FlowContainer, FillFlowContainer, GridContainer (+GridContainerContent, ObservableArray, Cached) | done, tested | `graphics/containers/*`, `lists/ObservableArray.ts`, `caching/Cached.ts` |
| ScrollContainer (+BasicScrollContainer), PlatformAction/PlatformActionContainer (per-OS bindings via RuntimeInfo), FrameworkColour | done, tested | `graphics/containers/ScrollContainer.ts`, `input/PlatformAction*.ts`, `platform/MacOSGameHost.ts`, `RuntimeInfo.ts` |
| BufferedContainer (blur, cached frame buffers, group colour), Utils/Blur | done, tested (DrawOriginal/grayscale throw) | `graphics/containers/BufferedContainer.ts`, `utils/Blur.ts` |
| Screen, ScreenStack, IScreen/ScreenExtensions, screen events | done, tested | `screens/*` |
| Audio, ProxyDrawable, DecouplingFramedClock/InterpolatingFramedClock | **not started** | |

Verification: `npm test` (transforms, primitives, layout: 43 tests) and `tests/visual/framework-scene.html`, a scene that exercises masking, borders, edge effects, additive blending and per-leaf alpha.

---

## 2. Transform semantics (`Graphics/Transforms/*`)

- `TransformTo` uses `TransformStartTime = Clock.CurrentTime + TransformDelay`. `TransformDelay` is reset to 0 at the start of each `UpdateTransforms` (`Transformable.cs`).
- **Adding** a transform removes, and aborts, every transform of the same *member* that starts after it (`TargetGroupingTransformTracker.AddTransform`).
- **First application** of a transform removes earlier transforms of the same member. Before that, the earlier transform is re-applied at the new transform's `StartTime` if it hadn't reached its end (`TargetGroupingTransformTracker.cs:121-137`). The new transform reads its start value only after this.
  - Quirk (faithfully ported): if one frame step crosses the old transform's `EndTime`, the old one is applied to its end *first*, so the new one starts from the old end value. With ~16 ms frames this only matters right at the end of the old transform.
- A transform added with `StartTime < now` or `EndTime <= now` is applied immediately (`Transformable.AddTransform`). This is why zero-duration transforms take effect at once.
- Without a clock, a transform jumps to its end value and completes.
- `Then(delay)` continues from `max(currentTime, lastEndTime)`. `Delay(d)` only offsets later appends.
- `Loop(pause)` repeats forever with `LoopDelay = sequence duration + pause`. `Loop(pause, n)` repeats n times. Already-elapsed iterations are skipped forward (`TransformSequence.makeTransformsLooping`).
- `OnComplete` fires immediately if the sequence has already completed. `Finally` = OnComplete + OnAbort. `FinishTransforms` applies end values and fires completion.
- Containers propagate `AddDelay` (so `BeginDelayedSequence`), `BeginAbsoluteSequence`, `FinishTransforms(true)`, `ClearTransformsAfter(…, true)` and `RemoveCompletedTransforms` to all children (`CompositeDrawable.cs` Transforms region).
- Groupings: `MoveToX`/`MoveToY` use member `X`/`Y` in grouping `Position`. `ResizeWidthTo`/`ResizeHeightTo` use `Width`/`Height` in grouping `Size`. A `MoveTo` therefore interrupts a running `MoveToX`.
- TS: `using _ = d.beginDelayedSequence(200);` replaces C#'s `using (BeginDelayedSequence(200)) { … }`. `TransformSequenceExtensions` (`fadeIn`, `moveToX`, `expire`, `schedule`, `spin`, …) are installed on `TransformSequence.prototype` by `Drawable.ts`.

## 3. Easing

Port of `DefaultEasingFunction.cs`, with identical constants (elastic `2π/0.3`, back `1.70158` and `×1.525`, bounce `1/2.75`, expo and elastic end-point offsets). Every easing maps 0→0 and 1→1 (tested). Numeric interpolation is **unclamped** `val1 + t·(val2 − val1)`; with `time ≥ EndTime` the value is exactly `EndValue` (`TransformCustom.valueAt`).

## 4. Layout

- `DrawInfo = parent.DrawInfo` followed by `ApplyTransform(pos, DrawScale, Rotation, Shear, OriginPosition)`, where `pos = DrawPosition + AnchorPosition + parent.ChildOffset`. In row-vector order a point is moved by −origin, then scaled, sheared (−shear), rotated (degrees) and translated. Zero scale is clamped to ±`FLOAT_EPSILON` (1e-3).
- `AnchorPosition = RelativeAnchorPosition × parent.ChildSize`. `ChildSize = DrawSize − padding`. `OriginPosition` is computed from `LayoutSize` (DrawSize + margin) minus `(margin.Left, margin.Top)`.
- `RelativeSizeAxes` of Both with `FillMode.Fill`/`Fit` uses `max`/`min(v.X, v.Y × FillAspectRatio)`, then divides Y by the ratio. A `Sprite` sets `FillAspectRatio` from its texture.
- Setting `RelativeSizeAxes` converts the current size to keep it visually equal, and a zero size becomes 1 on newly relative axes.
- Autosize: `Size = max over present, alive children of RequiredParentSizeToFit + Padding.Total`, skipping `BypassAutoSizeAxes` (which always includes the child's relative axes). With `AutoSizeDuration > 0` it tweens through a non-rewindable transform on member `baseSize` (`CompositeDrawable.autoSizeResizeTo`).
- `IsPresent = AlwaysPresent || (Alpha > 0.0001 && DrawScale.X != 0 && DrawScale.Y != 0)` (`Drawable.cs:1336`). Non-present drawables are not updated (only their transforms are), and are not drawn.
- `IsMaskedAway` (the AABB doesn't touch the parent's masking bounds) skips **updating children** of composites with ≥2 alive children (`RequiresChildrenUpdate`). This is behaviour, not just a draw optimisation, and it is ported.
- Child order (draw order) is depth descending, then `ChildID` ascending. The DOM order mirrors it.

## 5. Colour

- `Colour` is a `ColourInfo` (four sRGB corners). `DrawColourInfo = parent.DrawColourInfo.ApplyChild(Colour × Alpha)`.
- SRGBColour `*`: if either side is pure white it only multiplies alpha. Otherwise both sides go to linear (gamma 2.4 with the 0.04045 knee), are multiplied, and go back to sRGB. Alpha is never gamma-converted (`SRGBColour.cs`).
- Colour transforms (`FadeColour`, `FlashColour`) interpolate in **linear** space, and the eased `t` is clamped to [0, 1] (`Interpolation.cs:273,296`).
- DOM: leaves (Box, Sprite, later SpriteText) draw with `DrawColourInfo`. Containers never use CSS `opacity`, which matches osu!'s per-vertex alpha.
  Sprites: a white tint draws the texture with `opacity`; any other tint multiplies (`background-blend-mode: multiply` + `mask` with the texture's own alpha). Gradients map to `linear-gradient`; horizontal and vertical gradients are exact.

## 6. Scaling (osu! units ↔ CSS pixels)

- `osu.Game` wraps the game in `ScalingContainer` → `ScalingDrawSizePreservingFillContainer`. It is a `DrawSizePreservingFillContainer` with `TargetDrawSize = OsuGame.ScalingContainerTargetDrawSize = (1024, 768)` (`osu/osu.Game/OsuGame.cs:947`, `ScalingContainer.cs:121`) and the default `Strategy = Minimum` (`DrawSizePreservingFillContainer.cs`).
- `content.Scale = min(parent.ChildSize / (1024, 768))` and `content.Size = 1/scale` (relative). UI scale (`OsuSetting.UIScale`, default 1) multiplies on top (`Scale = CurrentScale`, `Size = 1/CurrentScale`), tweened over 500 ms `OutQuart` when changed.
- Examples: a 1440×900 window gives scale 1.171875 and a game space of 1228.8×768. The 1389×868 reference screenshots give scale 1.1302 and 1229.0×768. Height is always 768 when the window is wider than 4:3.
- The framework's own overlays (`Game.overlayContent`) use 1280×960 (`Game.cs:122`).
- DOM: the scale is just the content container's DrawInfo scale (one CSS `matrix()`). Window size is read in CSS px. The ratio is unit-free, so device pixel ratio doesn't affect layout.

## 7. Textures

- `TextureStore(..., scaleAdjust = 2)` is the default (`Graphics/Textures/TextureStore.cs:50`). `DisplayWidth = Width / ScaleAdjust`, so a 1024 px `Menu/logo.png` lays out as 512 units. `LargeTextureStore` (used for backgrounds, `OsuGameBase.cs:292`) derives from it.
- A Sprite whose `Size` is zero takes the texture's display size when the texture is set.
- `Box` = Sprite with `WhitePixel`, and starts with `Size = (1, 1)`.

## 8. Masking, borders, edge effects (`CompositeDrawable.DrawNode.cs`, `Resources/Shaders/sh_Masking.h`)

- Only active when `Masking` is true. Setting a border or edge effect without masking throws, as in osu!.
- `effectiveCornerRadius = CornerRadius × 0.8 × CornerExponent / 2 + 0.2 × CornerRadius`, which equals `CornerRadius` for exponent 2.
- Border: drawn *inside* the masked area, *over* the children, colour = `BorderColour × DrawColourInfo` (full multiply). DOM: an overlay `div` with `border` + the same radius, kept as the last child of the mask element.
- Edge effect (`drawEdgeEffect`): the masking rect is inflated by `Radius` and offset by `Offset`. Its corner radius is `effective + Radius + Roundness` (`:130`), with blend range = `Radius` and alpha exponent 2 (`:135`). Glow draws additively, Shadow with normal alpha. The colour's **alpha only** is multiplied by the draw alpha.
  Solving the shader (`sh_Masking.h:111`): at distance `d` outside the (offset) draw rect, **alpha = (1 − d/Radius)²**. The solid shape's corners have radius `effective + Roundness`. `Hollow` discards the interior.
  DOM: one element over the inflated rect, with 9 gradient regions (radial corners, linear edges) using sampled `(1−t)²` stops (`EdgeEffectStyle.ts`). This is deliberately not `box-shadow`, whose gaussian has 50% alpha at the edge.
- DOM structure of a masking composite: `element` holds `[edgeEffect, mask(overflow:hidden, border-radius) holding [children…, border]]`.

## 9. Blending

osu! uses `Additive` (most common), `Inherit`, `Mixture` and `None` (once). Inherit takes the parent's resolved mode, and the root is Mixture. DOM: `Additive` → `mix-blend-mode: plus-lighter`.
Limitation: CSS stacking contexts isolate blending. To keep that rare, drawables with a pure-translation local matrix are positioned with `left/top`, and only rotated, scaled or sheared ones get `transform`. Additive children of a scaled parent (e.g. inside the logo) blend only within that parent. Check against the references when a case matters.

## 10. Loading, scheduling, life

- `load(dependencies)` replaces `[BackgroundDependencyLoader]`. Overrides call `super.load()` first, which keeps osu!'s base-to-derived loader order. A composite's own loader loads existing children before derived loaders add more.
  `load` may return a Promise (textures etc.): the drawable becomes `Ready` when it resolves, and its parent's load waits for children loaded during its own load.
- `LoadComponentAsync` never runs inline. `onLoaded` runs on the scheduler, so at the earliest in the next update, as in osu!.
- `Schedule` inside a delayed sequence becomes `AddDelayed(TransformDelay)`. `Scheduler.Update` runs the tasks queued at the start of the update. Tasks with equal execution times keep FIFO order (`ScheduledDelegate.CompareTo` returns −1 when equal).
- `AddOnce` dedupes by function identity, so pass a stable (bound) function.
- Children: `LifetimeStart/End` decide `ShouldBeAlive`. Dead children are removed when `RemoveWhenNotAlive` (default: `Time > LifetimeStart`) and disposed when `RemoveCompletedTransforms`. `Expire()` sets `LifetimeEnd = LatestTransformEndTime` (last end + 1 ms).

## 11. Known DOM deviations

- `CornerExponent ≠ 2` (squircle corners): CSS radius is circular. Only `effectiveCornerRadius` and hit-testing (`Contains`) honour the exponent.
- Bilinear four-corner gradients (neither horizontal nor vertical) are approximated by a vertical gradient through the column midpoints.
- Values are JS doubles; osu! uses float32. Differences are sub-pixel.
- `MaskingSmoothness` (1 px anti-alias) is the browser's own edge AA.
- C# indexers become methods: `ObservableArray[i]` → `.get(i)` / `.set(i, v)`, so `grid.Content[0][1] = d` is `grid.content!.get(0)!.set(1, d)`.
  `GridContainer.content` accepts a plain `(Drawable | null)[][]`, matching C#'s implicit conversion to `GridContainerContent`.
- Case-only overloads are renamed: ScrollContainer's private `scrollTo` is `scrollToInternal`. `ScrollbarContainer.ResizeTo(float, int, Easing)`
  (abstract) is `resizeScrollbarTo`; `resizeTo(number)` on a scrollbar forwards to it, as C# overload resolution does.
- BufferedContainer has no framebuffer. Its element is an isolated group clipped to `ScreenSpaceDrawQuad.AABBFloat`, filled with
  `BackgroundColour` and drawn with the frame-buffer colour (`opacity`; a grey tint is `brightness()`, any other tint an SVG `feColorMatrix`) and
  `DrawEffectBlending`. Children draw white (osu!'s `DrawColourInfo` override). A cached frame buffer stops updating and re-rendering its
  children until the draw version changes, as in osu!.
  Blur: osu! renders at full pixel density (SDL `HIGH_PIXEL_DENSITY`), so `BlurSigma` is in device pixels × `FrameBufferScale`. The CSS sigma is
  `effectiveKernelSigma(KernelSize(σ), σ) / FrameBufferScale / devicePixelRatio / (local→screen scale)`. Here `effectiveKernelSigma` (≈0.9σ) is the
  second moment of sh_Blur.fs's truncated, linearly-tapped kernel. Deviations: CSS blur fades to transparent at the edges, while osu! clamps to
  the edge texel (it only shows on blurred full-bleed content; song-select blur defaults off in 2026.1005). It is also isotropic: anisotropic σ
  and BlurRotation use max(σx, σy). DrawOriginal and GrayscaleStrength are not ported and throw.
- `IScreen` extension methods (`this.Push`, `this.Exit`, `this.MakeCurrent`, `this.IsCurrentScreen`, …) are methods on `Screen`, backed by
  `ScreenExtensions.*`. ScreenStack's internal `Push(source, screen)` and `Exit(source)` are `pushFrom` and `exitScreen`. Its C# events are
  `screenPushed` and `screenExited` (Signals carrying `[last, next]`). ScreenStack logging is omitted.
- `RuntimeInfo.OS` comes from `navigator` (iPadOS reports Mac + touch → iOS). It picks `GameHost.platformKeyBindings`: macOS/iOS use
  `MacOSGameHost.KeyBindings` (Cmd = Super), Windows adds Alt+F4 → Exit, and everything else uses the base list. FrameworkActionContainer
  (debug overlays) is not ported.

## 12. Text (`IO/Stores/GlyphStore.cs`, `FontStore.cs`, `Text/TextBuilder*.cs`, `Graphics/Sprites/SpriteText*.cs`)

- Fonts are the same BMFont atlases osu! uses. They are generated from osu-resources/osu-framework by `scripts/build-fonts.mjs`, which writes JSON
  metrics plus the PNG pages. All fonts are rendered at **size 100 px** (`FontStore` `scaleAdjust = 100`, the raw pixel height). A glyph of w px is
  `w / 100 × FontUsage.Size` units wide.
- Store order sets the fallback lookups: FontAwesome (Solid, Regular, Brands), Torus, Torus-Alternate, Inter, Noto (Basic, Bopomofo, CJK-Basic,
  CJK-Compatibility, Hangul, Thai), Venera. Roboto and RobotoCondensed sit in a nested store and are searched last. A lookup tries `FontName`
  (e.g. `Torus-Bold`), then `FontNameNoFamily` (`-Bold`, any family), then any font, then the fallback character.
  SpriteText's fallback character is `•`; TextBuilder's default is `?`.
- Quirk (ported): kerning is scaled by 1/100 but **not by the font size** (`TextBuilderGlyph.GetKerning` doesn't multiply by `textSize`), so kerning
  is effectively a fixed few hundredths of a unit.
- Height: with `UseFullGlyphHeight` (default) a line is `FontUsage.Size` tall and glyphs sit at `YOffset × size`. Otherwise the line is as tall as
  its tallest glyph.
- Shadow (`SpriteText.DrawNode`): drawn per glyph right before the glyph. It is offset by `ShadowOffset × Font.Size` (default (0, 0.06)).
  Its colour is `DrawColour.ApplyChild(ShadowColour (default black α0.2) × α·max(r,g,b)²)`, where the max is taken from the average draw colour.
- Gradient colours apply **per glyph quad** (each glyph gets the full ColourInfo), not across the whole text.
- Strings are processed per UTF-16 code unit, as C#'s `foreach (char c in text)` does.
- Some osu-resources `.bin` files (Noto) declare a BMFont info block one byte too long. SharpFNT reads sequentially, and so does the converter.
