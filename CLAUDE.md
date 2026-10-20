# osu!lazer web portfolio

Read `docs/ARCHITECTURE.md` before writing code. Specs with exact constants live in `docs/spec/`; real-client screenshots in `docs/reference/real/`.
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
only mixer effects remain, to port when first needed. Game layer: beatmap model + .osu decoder (control points, hit objects, slider paths)
done and tested (docs/spec/assets-formats.md §3); import/storage, star rating, downloads and all UI are next.
Cloud screenshots: `PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/shot.mjs ...` (dev server running). Recordings: docs/reference/recordings/web/*.mp4 (ffmpeg available).
