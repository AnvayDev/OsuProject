# osu!lazer web portfolio

Read `docs/ARCHITECTURE.md` before writing code. Specs with exact constants live in `docs/spec/`; real-client screenshots in `docs/reference/real/`.
Source of truth for behaviour: `_reference/osu`, `_reference/osu-framework`, `_reference/osu-resources` (read-only).

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
