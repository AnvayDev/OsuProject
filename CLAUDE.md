# osu!lazer web portfolio

Read `docs/ARCHITECTURE.md` before writing code, and `docs/GAMEPLAY-PLAN.md` before gameplay or settings work. Specs with exact constants live in `docs/spec/`; real-client screenshots in `docs/reference/real/`.
Source of truth for behaviour: `_reference/osu`, `_reference/osu-framework`, `_reference/osu-resources` (read-only), pinned to the user's
client: osu **2026.1005.0-lazer** → osu-framework **2026.921.1**, osu-resources **2026.918.0** (versions from osu.Game.csproj). Never use master.

## Coding guidelines (Karpathy, required)

**1. Think before coding.** State assumptions explicitly. If something has multiple interpretations, write them down and pick the one the
source code supports; if the source doesn't settle it, report the ambiguity instead of guessing silently. Push back when a simpler approach exists.

**2. Simplicity first.** Minimum code that solves the problem. No features beyond what was asked, no abstractions for single-use code,
no speculative configurability, no error handling for impossible cases. If 200 lines could be 50, rewrite it. Porting osu! faithfully is the
requirement — that is not over-engineering, but inventing extra systems osu! doesn't have is.

**3. Surgical changes.** Touch only what your task owns. Don't reformat or "improve" adjacent code. Match existing style. Remove only the
orphans your own change created; mention (don't delete) other dead code.

**4. Goal-driven execution.** Turn each task into verifiable checks (a unit test, a typecheck, a Playwright assertion, a screenshot compared
against `docs/reference/real/`). Loop until they pass. Report honestly what was verified and what wasn't.

## Project rules

- Port, don't redesign: keep osu!'s class structure, names, constants, ordering. Header comment `// Ported from <path>.cs`.
- Animations use the framework's osu!framework-style transforms, never CSS transitions/animations.
- Layout is in osu units; the root ScalingContainer is the only place that converts to CSS pixels.
- Never edit `_reference/`. Never commit secrets. Don't touch files owned by another concurrent task.

## Setup (fresh clone / cloud)

```bash
npm install
npx playwright install chromium
mkdir -p _reference && cd _reference && git clone --depth 1 --branch 2026.1005.0-lazer https://github.com/ppy/osu.git && git clone --depth 1 --branch 2026.921.1 https://github.com/ppy/osu-framework.git && git clone --depth 1 --branch 2026.918.0 https://github.com/ppy/osu-resources.git
```

No computer use / real-client access in cloud sessions: use `docs/reference/real/` screenshots and the source.
Status (2026-10-20): specs done = carousel, intro, main-menu, framework, assets-formats; partial = controls-overlays-common. Not started:
game-shell, song-select, toolbar-music, settings-listing, web-visual-references. src/framework is done and tested (docs/spec/framework.md §1);
only mixer effects remain, to port when first needed. Game layer: .osu decoder, beatmap import into IndexedDB, WorkingBeatmap
(tracks, backgrounds, decoding), BeatmapManager and the dummy beatmap are done and tested (docs/spec/assets-formats.md §1-6). Shell done and
tested: OsuGameBase/OsuGame (index.html + src/main.ts), OsuConfigManager, OsuScreen/OsuScreenStack, background screens (default rotation,
beatmap), Parallax/Scaling/UserDim containers, MusicController, OsuColour/OsuFont/OsuSpriteText. Dev states via window.__osu (src/dev/).
Main menu done and tested (docs/spec/main-menu.md): MainMenu, ButtonSystem/MainMenuButton, OsuLogo + TrianglesV2 + LogoVisualisation,
side flashes, kiai fountains (KiaiMenuFountains/StarFountain/ParticleSpewer on a canvas, StarFountainSounds), song ticker, tips, supporter display,
idle return; framework TextFlowContainer. Not yet: hold-to-exit.
Toolbar done (osu.Game/Overlays/Toolbar): all buttons, ruleset selector, clock, guest user button; buttons of unported overlays show
their names/icons but do nothing. Now playing done: NowPlayingOverlay + PlaylistOverlay (framework VirtualisedListContainer), VolumeOverlay
(VolumeMeter/MasterVolumeMeter/MuteButton; framework GlowEffect via BufferedContainer.drawOriginal) and OsuGame's volume key actions. Intro done (docs/spec/intro.md): Loader + LoadingSpinner, IntroScreen (theme import, watchdog, "see ya" exit), IntroTriangles;
boot = AudioUnlockScreen (web autoplay gate, src/) → Loader. Not yet: IntroCircles, IntroWelcome. Song select in progress (no spec md): carousel +
filter pipeline + panels, SongSelect/SoloSongSelect, footer, title wedge, details area (Details/Ranking tabs, metadata wedge with the online
stats (success rate, user rating, rating spread, points of failure; lookup via catboy.best GetBeatmapSetRequest), offline leaderboard placeholder), framework TabControl, framework TextBox (web text input via hidden textarea) + search box + FilterQueryParser.
framework Menu/Dropdown/SearchContainer + OsuDropdown/ShearedDropdown (sort/group/collection/scope), framework SliderBar + star rating DifficultyRangeSlider.
Carousel context menus done (framework ContextMenuContainer, OsuContextMenu/OsuMenu items + samples; hide/restore,
mark played, copy link, delete via DialogOverlay + PopupDialog/DangerousActionDialog hold-to-confirm). Tooltips done (framework TooltipContainer +
OsuTooltipContainer in OsuGameBase; IHasTooltip/IHasCustomTooltip duck-typed; DateTooltip). Collections done (BeatmapCollection in IndexedDB
'collections' via RealmAccess + Live; CollectionDropdown filter with +/- button, group by collection, panel context menu toggles
(Stateful/Toggle/TernaryState menu items), ManageCollectionsDialog with framework RearrangeableListContainer; realm's name sort approximated
with an English collator). Not yet: popovers, mod select, editor/scores (menu entries do nothing). Song select video background (web addition, user request):
the selected set's .osu Video event plays muted, synced to the track (BeatmapBackgroundVideo, framework web Video); H.264 AVIs are
remuxed to MP4 in the browser (AviRemuxer + mp4-muxer); every other format (FLV, WMV, MPEG-1/2, Xvid AVI, MPEG-4 Part 2 MP4) is converted by
ffmpeg.wasm (VideoTranscoder: core loaded on first use, H.264 copied, else x264 superfast CRF 16 at source resolution; conversions stored in
IndexedDB 'convertedVideos' by source hash, deleted with the file by RealmFileStore.cleanup); starting a beatmap (Enter/logo) pushes VideoPlayer (Player stand-in:
no UI, song from 0, undimmed background/video; back or song end exits). Mirror metadata lookup done (status, dates, star ratings at import). Downloads done (BeatmapModelDownloader +
BeatmapDownloadTracker, shared mirror rate limiter). Beatmap listing overlay done (main menu "browse"; mirror search (keyword results fetched once and sorted client-side), Normal/Extra cards,
previews, downloads, PresentBeatmap): overlay base classes (WaveOverlayContainer/FullscreenOverlay/OnlineOverlay, OverlayHeader,
OverlayScrollContainer), IOverlayManager dim, framework CircularProgress/DelayedLoadWrapper/ModelBackedDrawable. No beatmap set overlay.
Gameplay (2026-11-12): the gameplay exclusion is lifted (user decision). osu!standard gameplay, results, local scores, replays, the
difficulty/pp calculators, the whole settings overlay and mod select are in scope; the plan, the latency definitions, the research and the
decision log are in `docs/GAMEPLAY-PLAN.md` (read it before touching gameplay, update it at every milestone). What to ask the user to capture
from the real client: `docs/reference/CAPTURE-REQUESTS.md`. Decisions so far: judgement and hit sounds run from the input listener at
`event.timeStamp` (never quantised to a frame); the engine stays TypeScript (no WASM engine); the whole game is drawn by a WebGL2 port of
osu!framework's renderer (2026-11-13, after the user reported menu lag on the DOM renderer; `?renderer=dom` keeps the old renderer for
comparison only); reference beatmap for comparisons is Soleily - Renatus [Insane] (set 241526). User setup: M1 Air, Chrome, built-in 60 Hz
display, mouse + keyboard keys, Bluetooth headphones.
Gameplay status (2026-11-12): M0 done (plan, research, `bench.html`, `scripts/pixeldiff.mjs`, `scripts/stalecheck.mjs`); the user's M1 bench
run is still owed (GAMEPLAY-PLAN §7.2). Renderer (`src/framework/graphics/rendering/`, `GLContainer`, `Drawable.draw`; spec framework.md
§14) draws everything the game has: boxes, sprites, masking, borders, edge effects, blending, proxies, text and icons (glyph atlas),
BufferedContainer (frame buffers, blur), CircularProgress, LogoAnimation, Video, TrianglesV2, LogoVisualisation, ParticleSpewer; not yet
Path. Draws are recorded and executed once per frame. An image from an origin without CORS (assets.ppy.sh, a.ppy.sh) cannot become a
texture: it is an `<img>` behind the canvas, seen through a hole its sprite punches ("underlay"). A new drawable type needs `draw(renderer)`;
a `CanvasDrawable` that animates must implement `drawWithRenderer` (a canvas is uploaded whenever it is redrawn). Still on canvases:
Triangles (v1), GhostIcon, the intro's OutlineTriangle, the fail/retry graph. osu! ruleset model done and tested against the client's own test data
(`docs/spec/osu-ruleset.md`): hit objects, beatmap conversion and stacking, judgements, score/health processors, score multipliers.
Rulesets register themselves (`registerRuleset`); tests calling `RulesetInfo.createInstance()` import `@game/rulesets/osu/OsuRuleset`.
Not yet: drawable hit objects, playfield, input, gameplay clock, Player, HUD, results, settings overlay, mod select wiring, calculators.
Performance (2026-11-13, user report: menus lag). Rules that came out of it, in `docs/spec/framework.md` §14-15: the per-frame passes
(UpdateSubTree, child life, UpdateSubTreeMasking, draw node walk, input queues, invalidation) are static functions that read fields and
only make a virtual call for classes that override it (`Drawable.overrides`); a getter or method call on "any drawable" costs about 50 ns
(240 classes), a field read about 5 ns, so don't add getter chains to those passes. A drawable's local transform is kept while only an
ancestor moves (`Drawable.computeDrawInfo`; check with `__osu.verifyLocalDrawInfo()` after touching layout or invalidation).
Measure with `scripts/perf.mjs` (per-frame update/draw, CPU profile, timeline, renderer statistics) and state the environment.
Cloud Chromium renders WebGL in software, about 10 fps at 695x434 and 1 fps at full size: take screenshots with
`PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/shot.mjs --state songselect --w 695 --h 434 --frames 150 --out x.png` (dev server
running), measure JavaScript with `scripts/perf.mjs --w 348 --h 217`, and compare renderers with `tests/visual/gl-scene.html?gl=0|1`
(`&scene=2` for text, blur, progress, underlays). Nothing here measures the user's GPU: say so, and ask for their numbers.
Recordings: docs/reference/recordings/web/*.mp4 (ffmpeg available).
