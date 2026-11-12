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

### 4.1 Rendering: a GPU draw path for gameplay (hypothesis, bench pending)

The DOM renderer stays for menus. Gameplay (playfield and HUD) is drawn by a port of osu!framework's own renderer: the scene graph is
walked every frame and drawables emit batched quads to WebGL2 through ports of the framework's shaders (`sh_Texture`, `sh_Masking`,
`sh_Path`, `sh_Blur`, `sh_CircularProgress`). Reasons:

- Fidelity by construction: masking, borders, edge effects, additive blending, slider paths and frame buffers use the same maths as the
  client instead of CSS approximations (see the "Known DOM deviations" in `docs/spec/framework.md` §11).
- The scene graph keeps osu!'s class structure, so `DrawableHitCircle`, `DrawableSlider` and the Argon pieces port one to one.
- Drawables under a GPU surface never create DOM elements (elements become lazy).

To be confirmed by measurement before committing: the cost of the scene-graph update itself at playfield density, and WebGL2 against
Canvas 2D, WebGPU and a worker-driven OffscreenCanvas on the user's GPU.

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
| M0 | Research, plan, questions, capture requests, measurement harness, rendering/audio spikes | in progress |
| M1 | GPU draw path in the framework, timestamped input, gameplay audio clock | not started |
| M2 | osu! ruleset model: hit objects, beatmap conversion and processing, judgements, scoring, health (unit tests with exact values) | not started |
| M3 | Drawable hit objects, playfield, Argon skin, cursor and trail, hit sounds | not started |
| M4 | Player, PlayerLoader, HUD, pause/fail, break and skip overlays, results, local scores, replays; connect song select | not started |
| M5 | Settings overlay: framework first, then Input, Audio, Gameplay, Skin, User Interface, Graphics, then the rest | not started |
| M6 | Mod select wiring, core mods in gameplay, difficulty and pp calculators | not started |

A milestone is done when the build and tests are green, behaviour is checked against the C# source, and latency and frame-time numbers
come from the harness with the environment stated.

## 6. Decision log

- 2026-11-12: gameplay exclusion lifted (user). Scope as in §1.
- 2026-11-12: judgement and hit sounds run from the input listener at the event's timestamp (§4.2), because Chrome dispatches discrete
  input immediately but aligns rendering to vsync, and a 60 Hz frame would otherwise add up to 16.7 ms of quantisation to every hit.
- 2026-11-12: no WASM engine (§3). The engine stays TypeScript.
- 2026-11-12: reference beatmap for comparisons is **Soleily - Renatus [Insane]** (set 241526, beatmap 557821: 586 circles, 309 sliders,
  2 spinners, one break). Its `.osu` is in `tests/fixtures/osu-tests/`.
