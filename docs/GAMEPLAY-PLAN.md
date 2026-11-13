# Gameplay and settings: plan, decisions, status

This file is the working plan for porting osu!standard gameplay and the settings overlay. It survives context resets: read it first, update
it at every milestone. Decisions are recorded with their evidence; open questions are marked **OPEN**.

Source of truth is unchanged: `_reference/osu` 2026.1005.0-lazer, `_reference/osu-framework` 2026.921.1, `_reference/osu-resources`
2026.918.0. Port, don't redesign.

## 1. Scope (user decisions, 2026-11-12)

- Ruleset: **osu!standard only**. Skin: **the default (Argon) only**; skin loading comes later. Editor is out.
- In scope: Player with hit objects, input, judgement, scoring, health, HUD, pause, fail, retry, results; **local scores and local
  leaderboards**; **replays** (record, watch, export); **star rating and pp calculators**; the whole settings overlay; mod select.
- Mods: **core set first** (difficulty reduction, difficulty increase, automation columns). They may slip behind base gameplay if they get
  in the way. Autoplay is built early because deterministic comparisons need it.
- Online leaderboards stay placeholders (they need an osu! login, which a static site cannot do).
- The user's setup: M1 MacBook Air 16 GB, Chrome, built-in 60 Hz display, **mouse** to aim (not high polling rate), **keyboard keys** to
  click, **Bluetooth headphones**.
- Acceptance: the user plays and eye-checks; **hit-error parity** with the real client on the same map; **60 fps screen recordings** of both.
  **Audio/video sync is a priority alongside frame rate.**

## 2. Latency: what is claimed and how it is measured

"Latency" is split into stages. Every number reported must name its stage, the machine and the browser. Headless Chromium in the cloud
(software GL, about 12 to 15 fps compositor) gives **relative** numbers only.

| Stage | From → to | Who owns it | How it is measured |
|---|---|---|---|
| L0 | physical contact → OS event timestamp | keyboard/mouse hardware, OS | not measurable in a page (needs a high-speed camera) |
| L1 | `event.timeStamp` → first line of our listener | browser input pipeline, main-thread availability | `performance.now() - event.timeStamp` per event |
| L2 | listener entry → judgement and state change done | **our code** | `performance.now()` around the gameplay sub-frame run inside the listener |
| L3a | state change → next `requestAnimationFrame` callback | display refresh (vsync wait: 0 to 16.7 ms at 60 Hz, mean 8.3 ms) | rAF timestamp minus state-change time |
| L3b | rAF callback start → all draw commands submitted | **our code** (update + draw JS) | `performance.now()` at the end of the frame |
| L4 | submit → photons | GPU process, compositor, scanout, panel | not measurable in a page; the Event Timing API's `duration` gives the browser's own event → presentation estimate (8 ms granularity) |
| A1 | game clock vs the audio actually being rendered | **our code** + browser clock quality | jitter and drift of the clock against `AudioContext` time |
| A2 | sample start requested → audible | browser (`baseLatency`) + OS/device (`outputLatency`; Bluetooth is typically 100+ ms) | reported by `AudioContext`; true value needs a loopback recording |

What our code adds is **L2 + L3b + A1**. The target for that sum is well under the 4 to 10 ms budget; the budget's remainder is consumed by
the browser and the display (L1, L3a, L4), which no page can go below. At 60 Hz the vsync wait alone averages 8.3 ms. This is stated with
every report rather than hidden inside a single number.

Two design consequences (both decided, see §4):

1. **Judgement does not wait for a frame.** A press is judged at the gameplay time that corresponds to `event.timeStamp`, not at the time of
   the frame that happens to process it. Hit error is therefore independent of frame rate and of L1/L3. (The real client quantises to its
   update rate: 120 Hz with the default "2x refresh rate" limiter on a 60 Hz display, `GameHost.cs:1346`.)
2. **Hit sounds do not wait for a frame.** They are started from the input listener, so audio feedback is delayed by L1 + L2 + A2 only.

## 3. Research (2026-11-12)

Browser capabilities, checked against current documentation. Anything used must be feature-detected.

| Capability | Chromium | Firefox | Safari | Use |
|---|---|---|---|---|
| `pointerrawupdate` (unaligned pointer moves) | 77+, secure contexts | about 140+ (movementX/Y fixed in 148) | no | cursor position at press time; fall back to `pointermove` + `getCoalescedEvents()` |
| Discrete events (`keydown`, `pointerdown`) dispatched immediately, continuous ones aligned to rAF | yes | n/a | n/a | why judgement runs in the listener |
| Canvas `desynchronized` hint | ChromeOS/Windows only; **not on macOS** (crbug 41449024 open; Metal backing store cannot be read and written concurrently) | no | no | not available on the target machine; read back `getContextAttributes().desynchronized` and report it |
| WebGL2 | yes | yes | yes | candidate renderer |
| WebGPU | 113+ | 141 (Windows), 145 (Apple silicon macOS) | 26 | candidate renderer; measured in the bench |
| `OffscreenCanvas` + worker rAF | yes | yes | yes | candidate; measured in the bench |
| `AudioContext.baseLatency` / `outputLatency` | yes / 102+ | yes (base reports 0) / 70+ | yes / 18.4+ | A2 reporting, offset suggestion |
| `AudioContext.getOutputTimestamp()` | 57+ | 70+ | 14.1+ (reports of problems) | audio clock ↔ `performance.now()` mapping |
| Event Timing API (`PerformanceObserver` type `event`) | yes | yes | recent | browser's own event → presentation estimate |

Prior browser ports (the user asked for claims to be verified, not inherited):

- **webosu** (BlaNKtext): JavaScript + PixiJS + Web Audio. Not WebAssembly. An approximation of stable, not a port of lazer.
- **xc-osu** (kudasaixc): the only attempt found that compiles lazer's C# to WebAssembly (.NET 10 mixed AOT, multithreaded, WebGL2 on an
  OffscreenCanvas worker, BASS reimplemented in C feeding an AudioWorklet). Its own `PORTING.md` documents: key press → audible sample
  85 to 112 ms before tuning and about 50 to 63 ms after, of which "browser buffer + output" is 10 + 40 ms that "a page cannot lower";
  a Mono GC nursery that "fills several times per second" with pauses it cannot measure; the low-latency canvas hint disabled because it
  produced out-of-order frames; scroll stutter not established as fixed; a 135 MB resource download. So the claim "WASM ports lose to
  rendering, audio and GC latency" is **supported for this one project by its own notes**; no evidence was found for other WASM attempts.
- Conclusion: WASM does not buy latency here. The losses in that port come from running a second runtime (its GC, its thread model, its
  own audio mixer in front of the browser's). A TypeScript port that hands samples straight to Web Audio and draws with the browser's GPU
  API has fewer stages. WASM stays an option for isolated compute (for example a time-stretcher), not for the engine.

## 4. Architecture decisions

Status values: **decided** (with evidence), **hypothesis** (to be confirmed by the bench in `bench.html`), **OPEN**.

### 4.1 Rendering: the renderer draws everything (decided 2026-11-13; M1 numbers still pending)

Superseded on 2026-11-13: "the DOM renderer stays for menus". The user reported the menus lagging on the M1, and the cloud measurements
in §7.3 show why: in the beatmap listing the browser's own style, layout, paint and commit work was larger than all of our JavaScript,
and no DOM-side fix (layers, style caching, blob URLs for glyph masks, tried earlier) changed that. The whole game is now drawn by the
renderer, as the client is; details in `docs/spec/framework.md` §14 and §15.

The original text, which still describes the renderer: gameplay (playfield and HUD) is drawn by a port of osu!framework's own renderer: the scene graph is
walked every frame and drawables emit batched quads to WebGL2 through ports of the framework's shaders (`sh_Texture`, `sh_Masking`,
`sh_Path`, `sh_Blur`, `sh_CircularProgress`). Reasons:

- Fidelity by construction: masking, borders, edge effects, additive blending, slider paths and frame buffers use the same maths as the
  client instead of CSS approximations (see the "Known DOM deviations" in `docs/spec/framework.md` §11).
- The scene graph keeps osu!'s class structure, so `DrawableHitCircle`, `DrawableSlider` and the Argon pieces port one to one.
- Drawables under a GPU surface never create DOM elements (elements become lazy).

To be confirmed by measurement before committing: the cost of the scene-graph update itself at playfield density, and WebGL2 against
Canvas 2D, WebGPU and a worker-driven OffscreenCanvas on the user's GPU. First numbers are in §7.

Status: boxes, sprites, masking, borders, edge effects, blending, proxies, text, icons, frame buffers with blur, circular progress, the
logo animation, video, TrianglesV2, the logo visualisation and particles draw. Paths (slider bodies) do not yet.

### 4.2 Input: timestamped, judged in the listener (decided)

Input events keep `event.timeStamp`. Gameplay input is applied as a sub-frame of the frame-stable gameplay clock at the event's time, the
same mechanism osu! uses to play back replay frames exactly (`FrameStabilityContainer`). Replays recorded this way carry exact times.

### 4.3 Audio clock (hypothesis, bench pending)

Gameplay needs a clock that is tied to the samples being rendered. Candidate A: the existing `HTMLAudioElement` track with osu!'s
`InterpolatingFramedClock`. Candidate B: decode the track to an `AudioBuffer`, play it with an `AudioBufferSourceNode`, and derive time
from `AudioContext` time (sample-accurate start, no unknown element buffering). The bench measures the jitter of both. Rate-changing mods
need a time-stretcher for candidate B (BASS_FX uses SoundTouch; port its algorithm when mods are wired).

Offsets follow the client: `FramedBeatmapClock` applies the user's global audio offset, the per-beatmap offset and a platform offset
(0 on macOS). With Bluetooth headphones the device adds its latency in the real client too, so the same offset setting should give the same
sync, provided the track clock means what BASS's position means. The MP3 decoder delay difference noted in `docs/spec/framework.md` §13 is
to be measured, not guessed.

## 5. Milestones

| # | Milestone | State |
|---|---|---|
| M0 | Research, plan, questions, capture requests, measurement harness, rendering/audio spikes | done except the user's M1 bench run |
| M1 | GPU draw path in the framework, timestamped input, gameplay audio clock | renderer core done; text, paths, frame buffers, input and clock not started |
| M2 | osu! ruleset model: hit objects, beatmap conversion and processing, judgements, scoring, health (unit tests with exact values) | done except spinner spin history and legacy health (status and facts: `docs/spec/osu-ruleset.md`) |
| M3 | Drawable hit objects, playfield, Argon skin, cursor and trail, hit sounds | not started |
| M4 | Player, PlayerLoader, HUD, pause/fail, break and skip overlays, results, local scores, replays; connect song select | not started |
| M5 | Settings overlay: framework first, then Input, Audio, Gameplay, Skin, User Interface, Graphics, then the rest | not started |
| M6 | Mod select wiring, core mods in gameplay, difficulty and pp calculators | not started |

A milestone is done when the build and tests are green, behaviour is checked against the C# source, and latency and frame-time numbers
come from the harness with the environment stated.

## 6. Open questions

- **Audio offset basis.** `AudioContext.getOutputTimestamp()` gives the context time that is leaving the device now, so the game could
  follow the audio as it is *heard* and compensate a Bluetooth device's delay with no setting. The client does not do that: it follows
  BASS's position and leaves device delay to the "Audio offset" setting. Following the heard audio would double-compensate an offset
  copied from the client. Decide when the user's `game.ini` (their `AudioOffset`) and their bench numbers are in: either follow the client
  exactly, or add a web-only "compensate output latency" option and record it as a deviation.
- **Batching across masking.** In the client and in the port, every masked container ends the current batch (a draw call and a uniform
  upload each). The synthetic playfield issues 174 draw calls for 323 quads. If the M1 numbers show this matters, masking parameters can
  move into per-vertex data (same shader maths, same pixels) so the batch survives.

## 7. Bench results

`bench.html`, opened on the machine to be measured, exports JSON (what each field means is in the page's source, `src/bench/`).

### 7.1 Cloud, headless Chromium, software GL, no audio device (2026-11-12): relative numbers only

Our JavaScript per frame for the same synthetic playfield (16 hit circles shaped like `ArgonMainCirclePiece`, 4 sliders, 150 static HUD
drawables per density unit; every object animates every frame). Times are medians in ms; the timer steps in 0.1 ms.

| Variant | Drawables | Update | Draw | Total p50 | Total p99 |
|---|---|---|---|---|---|
| scene graph → DOM, 1x | 512 | 1.3 | 2.5 | 3.7 | 7.7 |
| scene graph → WebGL2, 1x | 512 | 1.0 | 0.8 | 1.8 | 4.2 |
| scene graph → DOM, 4x | 1592 | 4.6 | 9.9 | 14.6 | 36.9 |
| scene graph → WebGL2, 4x | 1592 | 2.6 | 2.2 | 4.7 | 6.6 |

- The DOM figure covers only our style writes; the browser's own style, layout and paint come on top and are not in it. The WebGL2
  figure covers generating the draw list and submitting it; rasterisation happens off the main thread.
- Raw baselines (400 quads per density unit, no scene graph): WebGL2 and WebGPU submit in about 0.1 ms at every density; Canvas 2D takes
  0.4 ms at 1x and 63 ms at 16x here (software canvas). Frame intervals and the worker's message delay are dominated by software
  rasterisation in this environment and say nothing about a GPU.
- Audio clocks read once per frame: `AudioContext.currentTime` advances in 20 ms steps here (read jitter 2.9 ms std, 7.9 ms max);
  extrapolating `getOutputTimestamp()` is smooth to 0.05 ms std, 0.13 ms max; `HTMLAudioElement.currentTime` jitters 2.1 ms std, 6.4 ms
  max and ran 0.8 ms behind the audio it delivered. The click-detection method reads 0.000 ms error for an `AudioBufferSourceNode`.

What this supports: the scene graph is not the bottleneck at playfield density, and drawing it with WebGL2 costs less of our JavaScript
than writing DOM styles while also removing the browser's style and paint work. What it cannot show: anything about the M1's GPU,
display, compositor or audio output. Those come from the user's run.

### 7.3 Menu lag (user report 2026-11-13): what was measured and what changed

Environment for every number here: cloud Linux VM, 4 cores, headless Chromium, no GPU (WebGL through SwiftShader), `scripts/perf.mjs`.
They rank causes and compare before with after. They are not the M1's numbers; nothing in this section measures a real GPU.

Before (DOM renderer, 1389x868), milliseconds per frame:

| State | Drawables | Our update | Our DOM writes | Browser, main thread besides script | Frame interval |
|---|---|---|---|---|---|
| Main menu | 1,229 | 2.7 | 1.5 | about 10 | 60 |
| Song select, idle | 2,416 | 5.7 | 1.9 | layerize 2.5 + commit 2.2 | 16.8 |
| Beatmap listing, idle | 8,757 | 10.1 | 3.6 | layerize 3.8 + commit 3.8 + paint 1.6 | 61 |
| Beatmap listing, scrolling | 23,359 | 27.5 | 9.6 | style 6.1, layout 2.5, paint 13.1, image decode 17.9, commit 7.9 | 94 |

Findings:

1. The browser's work per frame was as large as ours or larger, and grew with the number of elements (16,909 elements while scrolling the
   listing). That part cannot be fixed inside a DOM renderer.
2. Our own time was spent on megamorphic getter and method calls, not on arithmetic: 875 drawables are visited per frame in song select,
   6.5 µs each. Measured on the live objects: `isPresent` 133 ns, an `alpha` getter 56 ns, the `_alpha` field 16 ns, an empty loop 10 ns
   (242 classes, 81 to 169 fields per drawable). A micro-benchmark with 200 subclasses reproduced the factor (3.8 µs per drawable through
   getters against 0.05 to 0.19 µs through a shared-shape object).
3. Only 37 to 40% of the visited drawables have anything to do in a frame (an `update` override, a transform, a scheduled task, a bounded
   lifetime), so skipping idle subtrees would gain 2.5x at most; making each visit cheap gains more and helps scrolling and gameplay too.

Changes: the renderer draws everything (§4.1); per-frame passes without megamorphic calls and a kept local transform (framework.md §15);
draws recorded and executed once per frame; the logo visualisation, TrianglesV2 and particles as quads instead of canvases.

After (WebGL renderer). JavaScript measured at 348x217 so that the software GPU process competes less for the CPU; it still does, and
the same build measures about twice as fast on the DOM renderer's update pass at full size (song select idle update: 5.7 → 2.5 ms):

| State | Our update | Our draw (draw list, vertices, GL commands) | Draw calls | Quads |
|---|---|---|---|---|
| Song select, idle | 4.7 | 3.5 | 195 | 1,114 |
| Beatmap listing, idle | 4.8 | 4.5 | 243 | 3,005 |
| Beatmap listing, scrolling | 17.8 | 6.4 | 359 | 2,971 |

(taken before the kept local transform, the cheaper invalidation and the command list; to be re-measured.) The browser's per-frame work
is now one canvas: no style, layout, paint or layerize of game content.

Open after this round: the scroll frame's update pass (invalidation and DrawInfo recomputation for every visible drawable), batching
across masking changes (§6), the frame that adds 50 cards at once (about 350 ms, synchronous as in the client), and everything about the
M1's GPU, which only the user's run can show.

### 7.2 User's M1 (pending)

Ask: open `bench.html` on the dev URL in Chrome at the usual window size with the Bluetooth headphones connected, press "Run all", follow
the two input prompts, paste the JSON.

## 8. Decision log

- 2026-11-12: gameplay exclusion lifted (user). Scope as in §1.
- 2026-11-12: judgement and hit sounds run from the input listener at the event's timestamp (§4.2), because Chrome dispatches discrete
  input immediately but aligns rendering to vsync, and a 60 Hz frame would otherwise add up to 16.7 ms of quantisation to every hit.
- 2026-11-12: no WASM engine (§3). The engine stays TypeScript.
- 2026-11-12: reference beatmap for comparisons is **Soleily - Renatus [Insane]** (set 241526, beatmap 557821: 586 circles, 309 sliders,
  2 spinners, one break). Its `.osu` is in `tests/fixtures/osu-tests/`.
- 2026-11-13: the whole game is drawn by the WebGL renderer; the DOM renderer is kept behind `?renderer=dom` for comparison only (§4.1,
  §7.3). Reason: user report of menu lag on the M1, and measurements showing browser style/paint/commit work larger than our script.
- 2026-11-13: per-frame passes are static functions reading fields, with per-class override flags (`Drawable.overrides`); the structure of
  the client's methods is kept statement for statement, the dispatch is not ("performance wins on structure").
- 2026-11-13: a drawable's local transform is kept while only an ancestor moves. This is not how the client computes DrawInfo; the result
  differs in the last bits of a double. A verification mode guards it (`__osu.verifyLocalDrawInfo`).
- 2026-11-13: images from origins without CORS are shown by `<img>` underlays behind the canvas through holes punched by their sprites.
  Alternatives rejected: a proxy server (the site is static), mirror media endpoints with CORS (full-size backgrounds only, megabytes per
  card), dropping the images.
- 2026-11-13: draws are recorded and executed once per frame with one vertex upload and one uniform upload. The client issues batches
  immediately; on WebGL that updates buffers still in use by earlier draws, hundreds of times per frame.
- 2026-11-13: an animated `CanvasDrawable` must draw with the renderer. Found by the user: the logo visualisation's canvas, uploaded every
  frame, made the menu slower than the DOM renderer and showed as a blocky ring.
