# osu!lazer web port: architecture contract

This is the shared contract for everyone working on this repo (humans and agents). If something here contradicts a
spec in `docs/spec/`, the spec wins for *visual/behavioural* facts and this file wins for *code structure*.

## Goal

A browser port of osu!lazer's (2026.1005-lazer) non-gameplay UI that serves as a personal portfolio. Fidelity first: same
layout, proportions, colours, typography, timings, easings, samples and interaction behaviour as the real client.
The main menu's **edit** button (beatmap editor / skin editor = osu!'s "customise" entry point) is replaced by a
**portfolio** button with a sub-menu; everything else behaves like lazer.

Ground truth, in priority order:
1. Source: `_reference/osu` (game), `_reference/osu-framework`, `_reference/osu-resources` (assets). Never edit `_reference`.
2. Real client screenshots: `docs/reference/real/*.jpg` (1389x868, scaled from a 1440x900 window of the user's 2026.1005 client).
3. Web references: `docs/reference/web/` + `docs/spec/web-visual-references.md`.
4. Specs extracted from source: `docs/spec/*.md` (constants with file:line citations).

## Stack

- TypeScript (strict) + Vite 8, no UI framework. Path aliases: `@fw/*` → `src/framework/*`, `@game/*` → `src/game/*`, `@/*` → `src/*`.
- Rendering: **DOM retained scene graph** driven by our own TS port of osu!framework's layout and transform model.
  Every `Drawable` owns one absolutely-positioned `HTMLElement`; the framework computes layout itself (anchor/origin,
  relative sizing, autosize, fill flows) and writes `transform`/`width`/`height`/`opacity`/colour styles only when they change.
  CSS layout (flexbox/grid) is NOT used for osu! UI; it may be used inside leaf "HTML content" drawables (e.g. resume PDF viewer,
  long-form portfolio text) where osu! itself would use a TextFlowContainer.
- Canvas 2D is used inside specific drawables where the original is procedural (Triangles/TrianglesV2 backgrounds, LogoVisualisation bars,
  logo ripple/flash may stay DOM).
- Audio: WebAudio. One `AudioContext`, created/resumed on the first user gesture.
  Track = `HTMLAudioElement` (object URL) → `MediaElementAudioSourceNode` → track gain → `AnalyserNode` (FFT 512 → 256 bins, smoothing 0, used as `CurrentAmplitudes`) → master gain → destination.
  Samples = decoded `AudioBuffer`s played through `AudioBufferSourceNode`s → effect gain → master gain.
- Storage: IndexedDB (via `idb`) for imported beatmaps (content-addressed file blobs + set records). `localStorage` only for config (`OsuConfigManager`).
- Archives: `fflate` (unzip), parsing: our port of `LegacyBeatmapDecoder` (`src/game/beatmaps/formats`), star rating: `osu-standard-stable` / `osu-taiko-stable` / `osu-catch-stable` / `osu-mania-stable`. Heavy work runs in a Web Worker.
- Online: beatmap search + download from community mirrors with CORS (`https://catboy.best` primary, `https://osu.direct` fallback). Same-origin proxy fallbacks
  exist at `/mirror/catboy/*` and `/mirror/osudirect/*` (vercel.json rewrites + vite dev proxy). Covers from `assets.ppy.sh`, previews from `b.ppy.sh` (no CORS: use `<img>`/`<audio>` only, never canvas/WebAudio analysis on them).
- Hosting: Vercel static build (`npm run build` → `dist/`).

## Coordinate system & scaling

osu! wraps the game in `DrawSizePreservingFillContainer` (see `docs/spec/framework.md` §6 for the exact target size/strategy).
We do the same: the root `ScalingContainer` computes `s` from the window size and applies one CSS `transform: scale(s)` to the root
element whose size is set to `windowSize / s`. **All layout code works in osu units**, never in CSS pixels.

## Source layout and ownership

```
src/
  main.ts                    boot: fonts → asset preload → OsuGame
  framework/                 TS port of the osu!framework subset (no osu.Game knowledge)
    graphics/                Drawable, CompositeDrawable, Container, Box, Sprite, SpriteText, Circle, FillFlowContainer,
                             GridContainer, BufferedContainer(blur), MaskingContainer bits, EdgeEffect, Colour4/ColourInfo
    transforms/              Easing (all of osu!framework's), Transform, TransformSequence, interpolation helpers
    layout/                  Anchor, Axes, MarginPadding, Vector2, FillMode, Direction
    bindables/               Bindable<T>, BindableNumber, BindableBool, BindableList
    timing/                  Clock (game clock), FramedClock, Scheduler
    audio/                   AudioManager, Track (+TrackVirtual for missing audio), Sample, SampleStore, amplitudes
    input/                   InputManager: pointer → hover/click/drag/scroll dispatch with osu! semantics; keyboard + key bindings; focus
    screens/                 Screen, ScreenStack (push/exit/makeCurrent with OnEntering/OnExiting/OnSuspending/OnResuming)
    containers/              ScrollContainer (osu!framework physics), DrawSizePreservingFillContainer
    Game.ts                  host: rAF loop, root element, update → layout → DOM write
  game/                      port of osu.Game (mirrors its folder names where practical)
    OsuGame.ts               layering of screen stack, backgrounds, overlays, toolbar, cursor, notifications, volume, OSD
    config/                  OsuConfigManager (localStorage), defaults copied from osu.Game/Configuration/OsuConfigManager.cs
    graphics/                OsuColour, OsuFont, OsuIcon, cursor/, containers/ (ParallaxContainer, BeatSyncedContainer,
                             OsuScrollContainer…), backgrounds/ (Background, Triangles, TrianglesV2), userinterface/ (controls)
    resources/               asset manifest + loaders (textures, samples, fonts)
    beatmaps/                DATA LAYER (see below): storage, importer, worker, decoder glue, difficulty, downloader, WorkingBeatmap
    overlays/                toolbar/, music/ (NowPlayingOverlay, PlaylistOverlay), settings/, beatmapListing/, notifications/,
                             volume/, dialog/, osd/
    screens/                 loader/, intro/, menu/, select/ (song select + carousel), footer/, backgrounds/, portfolio/
    portfolio/               portfolio data model glue reading `portfolio.config.ts`
portfolio.config.ts          THE single user-editable file for all personal content (repo root)
public/
  assets/                    copied from osu-resources (samples, textures, tracks) — paths mirror osu-resources
                             e.g. public/assets/Samples/UI/default-hover.wav, public/assets/Textures/Menu/logo.png
  fonts/                     Torus (OTF), Venera, Inter, Font Awesome 5 (woff2)
  portfolio/                 resume.pdf, avatar, project images
scripts/                     dev scripts (asset copy, screenshot capture, compare)
tests/unit/                  vitest
tests/e2e/                   playwright
```

Each build stage gets explicit file ownership in its brief. Do not edit files owned by another concurrent task; if you need a
change there, write it down in your final report instead.

## Porting rules

1. **Port, don't redesign.** Find the C# class, keep its structure, names, constants and ordering. Put a comment
   `// Ported from osu.Game/Screens/Menu/OsuLogo.cs` at the top of each ported file. Keep constants identical (ms, units, colours).
2. **Transforms are osu!framework transforms.** Never use CSS transitions/animations or `element.animate` for anything osu!
   animates with transforms. Use `drawable.fadeTo(v, ms, Easing.OutQuint)` etc. Interruption semantics must match osu!framework.
3. **Sizes are osu units.** Never read `getBoundingClientRect` for layout except to measure text (and prefer canvas `measureText`).
4. **Samples:** play the same sample at the same moment as the original (HoverSounds/HoverClickSounds sets, pitch randomisation).
5. **Keyboard:** global key bindings follow `GlobalActionContainer` defaults where they make sense in a browser.
6. **Performance:** no per-frame allocations in hot paths, dirty-flag style writes, pool carousel panels like lazer does.
7. **Accessibility basics:** real `<input>` for text boxes, `aria-label`s on clickable drawables where cheap, honour `prefers-reduced-motion` only for the parallax.

## Framework API (summary; the implementation in src/framework is authoritative)

Names mirror osu!framework in camelCase: `anchor`, `origin`, `relativeSizeAxes`, `autoSizeAxes`, `x/y/position`, `width/height/size`,
`scale`, `rotation`, `alpha`, `colour`, `depth`, `masking`, `cornerRadius`, `borderThickness`, `edgeEffect`, `padding`, `margin`, `alwaysPresent`.
Transforms: `fadeTo/fadeIn/fadeOut/fadeInFromZero/fadeOutFromOne/moveTo/moveToX/moveToY/moveToOffset/scaleTo/resizeTo/resizeWidthTo/resizeHeightTo/rotateTo/fadeColour/flashColour/transformTo/delay/then/loop/schedule/finishTransforms/clearTransforms`.
Lifecycle: `load()` (once, when added to a loaded parent), `loadComplete()`, `update()` (every frame), `dispose()`.
Input hooks: `onHover/onHoverLost/onClick/onDoubleClick/onMouseDown/onMouseUp/onDragStart/onDrag/onDragEnd/onScroll/onKeyDown/onKeyUp/onPressed/onReleased(action)`; return `true` to block propagation.

## Data layer contract (src/game/beatmaps)

```ts
// Records stored in IndexedDB
interface StoredFile { hash: string; blob: Blob }                      // store 'files', key = sha256 hex
interface BeatmapSetInfo {
  id: string;                    // local uuid
  onlineID: number | null;       // BeatmapSetID or null
  dateAdded: number;             // ms epoch
  protected: boolean;            // bundled intro tracks etc. — cannot be deleted
  files: { filename: string; hash: string }[];
  beatmaps: BeatmapInfo[];
  hash: string;                  // hash of all .osu hashes (dedupe)
  status: 'local' | 'ranked' | 'approved' | 'qualified' | 'loved' | 'pending' | 'wip' | 'graveyard' | 'unknown';
}
interface BeatmapInfo {
  id: string; onlineID: number | null; setID: string;
  rulesetID: 0 | 1 | 2 | 3;      // osu, taiko, catch, mania
  difficultyName: string;
  metadata: { title: string; titleUnicode: string; artist: string; artistUnicode: string; author: string; source: string; tags: string;
              audioFile: string; backgroundFile: string | null; videoFile: string | null; previewTime: number /* ms, -1 = none */ };
  difficulty: { cs: number; ar: number; od: number; hp: number; sliderMultiplier: number; sliderTickRate: number };
  starRating: number;            // computed (stable SR via kionell ports) or from online data
  bpm: number;                   // lazer rule (most common beat length) — see docs/spec/assets-formats.md
  bpmMin: number; bpmMax: number;
  length: number;                // ms, hit object span
  drainLength: number;
  maxCombo: number; circleCount: number; sliderCount: number; spinnerCount: number;
  timing: { time: number; beatLength: number; meter: number; kiai: boolean; uninherited: boolean; omitFirstBarLine: boolean }[]; // compact, for BeatSync
  firstObjectTime: number; lastObjectTime: number;
  hash: string;                  // sha256 of .osu
  countdown: number; audioLeadIn: number;
}

class BeatmapManager {
  static instance: BeatmapManager;
  init(): Promise<void>;                                  // opens DB, loads all sets into memory
  getAllSets(): BeatmapSetInfo[];
  getSet(id: string): BeatmapSetInfo | undefined;
  import(files: File[] | FileList, opts?: { onProgress?(p: ImportProgress): void }): Promise<ImportResult[]>; // .osz, .osu (+assets), folders, images ignored
  importFromArrayBuffer(name: string, data: ArrayBuffer, opts?): Promise<ImportResult>;
  delete(setId: string): Promise<void>;                   // refuses protected
  deleteAll(): Promise<void>;
  getWorkingBeatmap(beatmap: BeatmapInfo): WorkingBeatmap; // cached LRU, lazily creates object URLs
  // events
  onSetAdded: Signal<BeatmapSetInfo>; onSetUpdated: Signal<BeatmapSetInfo>; onSetRemoved: Signal<string /*setId*/>;
}
interface WorkingBeatmap {
  beatmapInfo: BeatmapInfo; setInfo: BeatmapSetInfo;
  getTrackUrl(): Promise<string | null>;      // object URL, null if audio missing → caller uses TrackVirtual(length)
  getBackgroundUrl(): Promise<string | null>; // object URL or null
  getFileUrl(name: string): Promise<string | null>;
  release(): void;                             // revoke object URLs
}
class BeatmapDownloader {
  search(q: SearchQuery): Promise<SearchResult>;        // catboy → osu.direct → proxies
  download(setId: number, opts: { noVideo?: boolean; onProgress?(loaded: number, total: number): void; signal?: AbortSignal }): Promise<ArrayBuffer>;
  // track per-set state for card buttons
  getState(setId: number): 'none' | 'downloading' | 'importing' | 'local';
  onStateChanged: Signal<{ setId: number; state: string; progress?: number }>;
}
```

A tiny `Signal<T>` (add/remove/emit) lives in `src/framework/bindables/Signal.ts`.

## Verification tools

- `npm run typecheck`, `npm test` (vitest, jsdom + fake-indexeddb), `npm run e2e` (Playwright, Chromium headless shell installed).
- `npm run shot -- --state <name> --out <file.png>` renders a named app state at 1389x868 (same as the real references) for side-by-side comparison.
  States are driven through the debug hook `window.__osu` (exposed in dev builds only): `__osu.goto('mainmenu-initial' | 'mainmenu-toplevel' | 'mainmenu-play' | 'songselect' | ...)`,
  `__osu.selectBeatmap(index)`, `__osu.importUrl(url)`, `__osu.ready` (promise).
- Compare screenshots by viewing both images (Read tool shows images) and by `scripts/compare.mjs` (pixel diff + side-by-side composite).

## Licensing notes (for the final README)

- osu! and osu!framework code are MIT; ported code keeps the ppy Pty Ltd copyright notice in a NOTICE file.
- osu-resources assets are CC-BY-NC 4.0: non-commercial use with attribution. This site is a personal, non-commercial portfolio; credit ppy and link the licence in the About/credits.
- Torus and Venera are commercial fonts licensed to ppy. They are self-hosted from osu.ppy.sh for fidelity; the README must flag this and `portfolio.config.ts` offers a fallback font switch.
- "osu!" is a trademark of ppy Pty Ltd. Not affiliated with or endorsed by ppy.
